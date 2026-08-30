# Hlasovátko

Živé hlasování pro workshopy. Lektor (Miloš) promítá otázku na plátno, účastníci
hlasují na mobilech, výsledky naskakují okamžitě.

Ostrá adresa <https://ted.inspiruj.se> (Netlify), záložní
<https://hlasovatko-5d8b1.web.app> (Firebase Hosting). Obě nad stejnou databází.
Administrace je na `/host.html`.

Podrobnosti, návod k obsluze a historii rozhodnutí má README.md. Tenhle soubor
je jen to, co je potřeba vědět před sáhnutím do kódu.

## Kontext použití

Workshop, 10–40 lidí, tři hodiny. Lektor dostane během výkladu nápad na otázku
a má ~15 sekund ji naformulovat a spustit. Účastníci se přihlásí jednou na
začátku (QR kód + jméno) a session jim vydrží celý workshop.

Z toho plyne priorita číslo jedna: **rychlost a spolehlivost v den D**.
Nic, co může selhat před publikem. Žádná funkce nestojí za riziko, že se
hlasování zasekne. Když se rozhoduje mezi funkcí navíc a jistotou, vyhrává
jistota.

## Technologie

- Čisté HTML + CSS + vanilla JavaScript, žádný framework, **žádný build krok**
- Firebase Realtime Database pro živá data
- Firebase Anonymous Auth pro identitu (lektor i účastníci)
- Firebase Hosting i Netlify pro nasazení
- Knihovny jen minimálně a **vždy lokálně v `js/vendor/`** – žádné CDN,
  wifi na workshopu je loterie

## Struktura

```
index.html             hlasování účastníka (mobil)
host.html              ovládání + projekce (notebook lektora)
css/style.css
js/firebase-config.js  klíče k Firebase projektu (veřejné, viz Bezpečnost)
js/common.js           init, přihlášení, definice typů otázek (TYPES), pomůcky
js/join.js             logika účastníka
js/host.js             logika lektora
js/vendor/             Firebase SDK a qrcode-generator (nikdy z CDN)
database.rules.json    bezpečnostní pravidla databáze
firebase.json          hosting + hlavičky (striktní JSON, viz Pasti)
netlify.toml           totéž pro Netlify
```

## Datový model

```
sessions/{kod}/
  hostUid              UID zakladatele – na něm stojí celá bezpečnost
  createdAt
  activeQuestionId     která otázka je právě na plátně
  participants/{uid}/  name, joinedAt
  questions/{qid}/     text, type, options[], state, createdAt
  votes/{qid}/{uid}/   value, at, [hidden]
```

`kod` je čtyřznakový kód z abecedy bez `O`/`0` a `I`/`1`, aby se dal opsat
z plátna. Kolize se řeší opakováním losu.

`type`: `choice` | `yesno` | `scale` | `open`
`state`: `draft` | `open` | `closed`

Ano/Ne i škála jsou uvnitř **obyčejný výběr z možností** – Ano/Ne má napevno
`["Ano","Ne"]`, škála `["1"…"5"]`, hlas je index. Existuje tedy jediný
hlasovací mechanismus a typy se liší jen tím, co se účastníkovi nabídne a jak
se výsledek vykreslí. Nové typy přidávej stejným způsobem přes `TYPES`
v `js/common.js`, ne jako samostatnou větev logiky.

Výjimkou je `open`, kde je hlas text (max 1800 znaků, hlídáno i v pravidlech
databáze) a lektor ho může skrýt příznakem `hidden`.

## Zásady

- Hlasy jsou vázané na jméno – lektor musí vidět, kdo co hlasoval
- Účastník smí přepsat svůj hlas, dokud je otázka otevřená
- Ztráta spojení nesmí shodit rozhlasovanou otázku: stav se čte z databáze,
  ne z paměti prohlížeče
- Obrazovka lektora se promítá – musí být čitelná z posledních řad
  (velké písmo, vysoký kontrast, žádné drobné popisky)
- Plátno se nikdy nescrolluje: výsledky se musí vejít na jednu obrazovku.
  Jména hlasujících jsou proto defaultně skrytá a lektor si je vyvolá tlačítkem
- Naráz běží vždy jen jedno hlasování – spuštění nové otázky zavře předchozí
- Export čte data načerstvo z databáze: v paměti obrazovky jsou hlasy jen
  k právě zobrazené otázce

## Bezpečnost

Firebase klíče v `js/firebase-config.js` jsou veřejné ze své podstaty – vidí je
každý návštěvník v prohlížeči. Utajovat je nemá smysl, bezpečnost stojí
výhradně na `database.rules.json`.

Pravidla drží: session zakládá kdokoli přihlášený, ale musí se v ní hned
podepsat jako `hostUid`; účastník zapisuje jen sám sebe a jen svůj hlas; hlas
projde jen do otázky ve stavu `open`; text nejvýš 1800 znaků. Sada testovaných
pokusů o obejití je v README.

Po každé změně pravidel: `npx firebase-tools deploy --only database`.

## Pasti

- **`firebase.json` je striktní JSON.** Klíče typu `"//"` jako komentáře
  nevyhodí chybu – jen se tiše ignoruje celá sekce, ve které jsou.
  `database.rules.json` naopak řádkové `//` komentáře snáší.
- **Cache.** HTML, CSS i JS se servírují s `Cache-Control: no-cache`. Stará
  verze aplikace v telefonu účastníka je horší než pár set bajtů navíc.
  Knihovny v `js/vendor/` se cachují na týden. `?v=2` u skriptů byl jednorázový
  proplach staré cache, bumpovat ho netřeba.
- **Hosting ignore.** `**/.*` vyloučí tečkové soubory, ale ne obsah tečkových
  složek – proto je v `firebase.json` i `**/.*/**`. Bez toho se deployne `.git`.
- **Dvě záložky ve stejném prohlížeči sdílí jednu anonymní identitu.**
  Na test cizí identity (a na simulaci víc účastníků) je potřeba druhá instance
  Firebase bez persistence:

  ```js
  var app = firebase.initializeApp(window.FIREBASE_CONFIG, 'cizi');
  var auth2 = firebase.auth(app);
  await auth2.setPersistence(firebase.auth.Auth.Persistence.NONE);
  var cred = await auth2.signInAnonymously();   // jiné UID
  var db2 = firebase.database(app);
  ```

- **Textové pole u otevřených odpovědí** se překresluje jen při změně otázky
  nebo jejího stavu. Kdyby reagovalo na každý snapshot z databáze, mizelo by
  lidem rozepsané pod rukama.

## Provoz

```bash
npx firebase-tools deploy                  # web i pravidla
npx firebase-tools deploy --only database  # jen pravidla
python3 -m http.server 8000                # lokální test proti ostré databázi
```

Netlify deployuje samo při pushi na `main`. **Pravidla databáze přes Netlify
nasadit nejdou**, ta jedou vždycky přes Firebase.

Testovací data po sobě uklízej – v databázi jsou i reálné session z workshopů:

```bash
npx firebase-tools database:get /sessions --shallow
npx firebase-tools database:remove /sessions/KOD --force
```
