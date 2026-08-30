# Hlasovátko

Živé hlasování pro workshopy. Lektor promítá otázku na plátno, účastníci hlasují
na mobilech, výsledky naskakují v reálném čase.

**Ostrá adresa:** <https://ted.inspiruj.se> (Netlify)
**Záložní adresa:** <https://hlasovatko-5d8b1.web.app> (Firebase Hosting)

Obě běží nad stejnou databází, takže když jedna vypadne, druhá funguje dál
i uprostřed rozjetého hlasování. Administrace je vždy na `/host.html`.

---

## Kontext použití

Tohle není obecný hlasovací nástroj, je to pomůcka pro jednu konkrétní situaci:
workshop, 10–40 lidí, tři hodiny. Lektor dostane během výkladu nápad na otázku
a má zhruba patnáct vteřin na to ji naformulovat a spustit. Účastníci se
přihlásí jednou na začátku a session jim vydrží celý den.

Z toho plyne priorita číslo jedna: **rychlost a spolehlivost v den D**.
Před publikem nesmí nic selhat. Když se rozhoduje mezi funkcí navíc a jistotou,
že se hlasování nezasekne, vyhrává jistota. Většina rozhodnutí níž se dá vysvětlit
tímhle jediným pravidlem.

---

## Jak se to používá

Lektor otevře `/host.html` a založí session. Na plátně se ukáže velký QR kód
a čtyřznakový kód pro ty, co QR nezvládnou. Účastníci naskenují, zadají jméno
a jsou uvnitř. Lektor pak dole napíše otázku, vybere typ a dá **Spustit hlasování**
(nebo prostě Enter).

Malý QR kód zůstává v rohu plátna po celou dobu, aby se mohl kdykoli připojit
i někdo, kdo přijde pozdě.

### Typy hlasování

| Typ | Co zadáš | Co se ukáže na plátně |
|---|---|---|
| **A / B / C** | otázku a 2–6 možností | sloupce s procenty a počty |
| **Ano / Ne** | jen otázku | dva sloupce, zelený a červený |
| **Škála 1–5** | jen otázku | rozložení a velké číslo průměru |
| **Otevřená odpověď** | jen otázku | odpovědi jako bublinky vedle sebe |

Účastník smí svůj hlas měnit, dokud je otázka otevřená. Spuštění nové otázky
automaticky zavře předchozí – naráz běží vždycky jen jedno hlasování.

### Otevřené odpovědi

Textové pole na 1800 znaků s počítadlem. Odpověď jde upravovat, dokud je
hlasování otevřené. Delší odpovědi se na plátně useknou po deseti řádcích,
v exportu jsou vždycky celé.

Kdyby někdo napsal blbost, najedeš na bublinu myší a křížkem ji skryješ.
Ve stavovém řádku se objeví *vrátit skryté*, kdyby sis to rozmyslel. Skryté
odpovědi se nemažou, jen se nepromítají – v exportu zůstávají s příznakem
`hidden`. Je to spolehlivější než automatický filtr sprostých slov, který
stejně vždycky někoho nachytá a někoho pustí.

### Koncepty a historie

**Uložit koncept** odloží otázku na později. Objeví se jako čárkovaný štítek
v pruhu nad spodní lištou a na workshopu ji spustíš jedním klikem. Praktické
je připravit si večer předem pět otázek, o kterých tušíš, že padnou.

Ve stejném pruhu jsou i všechny odehrané otázky. Kliknutím se kterákoli vrátí
na plátno i s výsledky, když se k ní chceš vrátit v diskuzi.

### Jména hlasujících

Na plátně jsou standardně **skrytá**. Tlačítkem **Zobrazit jména** se u každé
možnosti vypíše, kdo ji zvolil.

Proč skrytá: plátno se nesmí scrollovat a s vypsanými jmény se pětistupňová
škála nevejde na obrazovku ani na notebooku s rozlišením 1440×900. Bez jmen
si sloupce rozdělí výšku plátna a vejdou se vždycky. Se zapnutými jmény má
obsah přirozenou výšku a v krajním případě se posouvá – to už je ale vědomé
rozhodnutí lektora, ne past.

### Export výsledků

Dvě tlačítka v pruhu vpravo:

- **Stáhnout otázku** uloží JSON s právě zobrazenou otázkou. Chceš jinou?
  Klikni na její štítek v pruhu a stáhni ji pak.
- **Stáhnout vše** uloží celou session – účastníky a všechny otázky včetně hlasů.

Každá otázka je v souboru dvakrát, protože každý pohled se hodí na něco jiného.
Sečteno po možnostech (počet, procenta, jmenný seznam) se dá číst očima.
Plochý seznam jednotlivých hlasů s časem se dá nasypat do tabulky nebo poslat
modelu k analýze. U škály se přidá `average`, u otevřených odpovědí je text
zároveň jako `value` i jako `label`, takže se s ním pracuje stejně jako
s ostatními typy.

Časy jsou v ISO formátu, jména se řadí česky (Č za C, ne až za Z).

---

## Jak je to postavené

### Technologie a proč zrovna tyhle

Čisté HTML, CSS a vanilla JavaScript. **Žádný framework, žádný build krok** –
co je v repozitáři, to běží v prohlížeči. Když je potřeba něco opravit hodinu
před workshopem, nesmí mezi opravou a nasazením stát nic, co může selhat.

**Firebase Realtime Database** kvůli živým datům bez vlastního serveru.
Zvažovaly se i vlastní Node.js server na Renderu (odmítnut kvůli usínání na
free tarifu – padesát vteřin probouzení před publikem je nepřijatelné)
a Supabase (funkční, ale víc nastavování).

**Firebase Anonymous Auth** jako identita lektora i účastníka. Nikdo nezadává
heslo, ale každý má stabilní UID, na kterém stojí bezpečnostní pravidla.

**Všechny knihovny lokálně v `js/vendor/`, nikdy z CDN.** Wifi na workshopu je
loterie a výpadek CDN by shodil celou aplikaci.

### Struktura

```
index.html           rozcestník + hlasování účastníka (mobil)
host.html            ovládání + projekce (notebook lektora)
css/style.css
js/firebase-config.js  klíče k Firebase projektu (veřejné, viz Bezpečnost)
js/common.js           inicializace, přihlášení, definice typů otázek, pomůcky
js/join.js             logika účastníka
js/host.js             logika lektora
js/vendor/             Firebase SDK a knihovna na QR kódy
database.rules.json    bezpečnostní pravidla databáze
firebase.json          hosting + hlavičky (POZOR: striktní JSON, viz Pasti)
netlify.toml           totéž pro Netlify
```

### Datový model

```
sessions/{kod}/
  hostUid              UID zakladatele – na něm stojí celá bezpečnost
  createdAt
  activeQuestionId     která otázka je teď na plátně
  participants/{uid}/  name, joinedAt
  questions/{qid}/     text, type, options[], state, createdAt
  votes/{qid}/{uid}/   value, at, [hidden]
```

`kod` je čtyřznakový kód z abecedy `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` – bez
`O`/`0` a `I`/`1`, aby se dal opsat z plátna bez omylů. Kolize se řeší
jednoduchým opakováním losu.

`type`: `choice` | `yesno` | `scale` | `open`
`state`: `draft` | `open` | `closed`

**Klíčové zjednodušení:** Ano/Ne i škála jsou uvnitř obyčejný výběr z možností.
Ano/Ne má napevno `["Ano","Ne"]`, škála `["1"…"5"]`. Hlas je index možnosti,
takže existuje jediný hlasovací mechanismus a typy se liší jen tím, co se
účastníkovi nabídne a jak se výsledek vykreslí. Jedinou výjimkou je `open`,
kde je hlas text.

Hlasy jsou schválně mimo otázky – dá se tak číst jedna otázka bez jejích hlasů
a pravidla jdou napsat čistě.

### Bezpečnost

Firebase klíče v `js/firebase-config.js` jsou **veřejné ze své podstaty** –
každý návštěvník je vidí v prohlížeči. Utajovat je nemá smysl. Bezpečnost
stojí výhradně na `database.rules.json`.

Pravidla drží tři věci: session smí zakládat kdokoli přihlášený, ale musí se
v ní hned podepsat jako lektor. Účastník smí zapsat jen sám sebe a jen svůj
vlastní hlas. Hlas projde jen do otázky ve stavu `open`, a u textu maximálně
1800 znaků.

Otestováno z pozice cizího přihlášeného uživatele:

| Pokus | Výsledek |
|---|---|
| přečíst session, znám-li kód | prošlo (správně) |
| přihlásit se pod svým jménem | prošlo (správně) |
| zahlasovat za sebe | prošlo (správně) |
| zapsat účastníka pod cizím uid | zamítnuto |
| zahlasovat za někoho jiného | zamítnuto |
| založit vlastní otázku | zamítnuto |
| převzít session | zamítnuto |
| smazat cizí hlas | zamítnuto |
| vypsat si všechny session | zamítnuto |
| hlasovat po uzavření otázky | zamítnuto |
| odpověď delší než 1800 znaků | zamítnuto |

Co pravidla **neřeší** a řešit nemají: kdokoli s kódem session může hlasovat.
Na workshopu je to správně – kód je na plátně a nikdo cizí v místnosti není.

---

## Nastavení a nasazení

### Firebase projekt (jednorázově, ~5 minut)

1. <https://console.firebase.google.com> → **Create a project**. Analytics vypni.
2. **Build → Realtime Database → Create Database**, lokalita **europe-west1**,
   **Start in locked mode** (správná pravidla nahraje deploy).
3. **Build → Authentication → Get started** → **Sign-in method** → zapnout
   **Anonymous**.
4. **Project Overview** → `</>` (Add app → Web), Hosting nezaškrtávat.
   Zkopíruj blok `const firebaseConfig = { … }`.
5. Hodnoty přepiš do `js/firebase-config.js`. `databaseURL` v tom bloku často
   chybí – najdeš ho nahoře v Realtime Database.

### Nasazení

```bash
npx firebase-tools login
npx firebase-tools use --add        # vyber projekt
npx firebase-tools deploy           # web i pravidla databáze
```

Netlify se připojí přes **Add new site → Import an existing project**.
Build command nech prázdný, publish directory `.` – zbytek je v `netlify.toml`.
Deploy se pak spouští sám při každém pushi na `main`.

**Pravidla databáze přes Netlify nasadit nejdou.** Ta jedou vždycky přes Firebase:

```bash
npx firebase-tools deploy --only database
```

Anonymní přihlášení funguje i z vlastní domény bez dalšího nastavování
(ověřeno na `ted.inspiruj.se`). Doménu do **Authentication → Settings →
Authorized domains** by bylo potřeba doplnit až kdyby se přidávalo přihlášení
přes Google nebo e-mail.

### Lokální vyzkoušení

```bash
python3 -m http.server 8000
```

Pak <http://localhost:8000/host.html>. Firebase funguje i z localhostu, takže
se dá testovat proti ostré databázi.

---

## Na co jsme narazili

Tyhle věci stály čas a nejsou z kódu vidět. Kdo bude pokračovat, ať je nemusí
objevovat znovu.

**`firebase.json` je striktní JSON.** Klíče typu `"//"` použité jako komentáře
nezpůsobí chybu při deployi – jen se **tiše ignoruje celá sekce**, ve které
jsou. Přišli jsme na to, až když nefungovaly hlavičky s cache. Komentáře patří
do `database.rules.json` (ten je snáší jako řádkové `//`), ne do `firebase.json`.

**Firebase i Netlify by defaultně cachovaly HTML a JS na hodinu.** Pro tuhle
aplikaci je to špatně: oprava před workshopem by se účastníkům do telefonů
nedostala. Vlastní soubory se proto servírují s `Cache-Control: no-cache`
(revalidace proti ETagu, pár set bajtů navíc), knihovny v `js/vendor/` se
cachují na týden. Odkazy na skripty mají `?v=2` – to byl jednorázový proplach
staré cache, při dalších změnách ho bumpovat netřeba.

**První deploy nahrál na web celou složku `.git`** a byla veřejně čitelná.
Vzorec `**/.*` v `ignore` vyloučí tečkové soubory, ale ne obsah tečkových
složek. Je potřeba i `**/.*/**`. (Nic citlivého tam nebylo, ale příště pozor.)

**Dvě záložky ve stejném prohlížeči sdílí jednu anonymní identitu.** Při testu
bezpečnosti to vypadalo, že pravidla vůbec neplatí – ve skutečnosti byl
„účastník“ přihlášený jako lektor. Na test cizí identity je potřeba druhá
instance Firebase bez persistence:

```js
var app = firebase.initializeApp(window.FIREBASE_CONFIG, 'cizi');
var auth2 = firebase.auth(app);
await auth2.setPersistence(firebase.auth.Auth.Persistence.NONE);
var cred = await auth2.signInAnonymously();   // jiné UID
var db2 = firebase.database(app);
```

Stejným trikem se dá nasimulovat víc účastníků najednou a otestovat, jak
výsledky vypadají s reálným počtem lidí.

**Export musí číst z databáze, ne z paměti obrazovky.** V paměti jsou hlasy jen
k právě zobrazené otázce – posluchače na ostatní otázky se schválně nedrží.
`loadSession()` proto dělá jednorázové `once('value')` na celou session.

**Textové pole u otevřených odpovědí se nesmí překreslovat při každém snapshotu**
z databáze, jinak lidem mizí rozepsané pod rukama. Překresluje se jen při změně
otázky nebo jejího stavu; uloženou odpověď doplní jen dokud do pole člověk sám
nesáhl.

---

## Co je hotové a co ne

Hotové je všechno popsané výš: session s QR kódem, přihlášení jménem, čtyři
typy hlasování, živé výsledky se jmény, koncepty, historie otázek, moderace
otevřených odpovědí a JSON export.

**Co zatím není a nabízí se jako další krok:**

- **Ovládání z telefonu.** Teď se otázky píšou na notebooku, který se promítá,
  takže sál vidí, jak lektor píše. Řešilo by se tajným odkazem pro ovládání
  a oddělenou projekční obrazovkou.
- **Znovuotevření uzavřené otázky.** Kliknutí na starou otázku ji vrátí na
  plátno, ale nechá ji zavřenou.
- **Editace nebo smazání už spuštěné otázky.** Mazat jdou jen koncepty.
- **Úklid starých session.** Session zůstávají v databázi navždy. Při současném
  objemu to nevadí, ale někdy by se hodila možnost session ukončit a smazat.

**Vědomá omezení, která se měnit nemají:**

- Bez internetu to nefunguje. Je to podstata věci, ne chyba. Doporučený postup
  je mít v telefonu připravený hotspot.
- Účastník se z jiného prohlížeče může přihlásit znovu pod jiným jménem
  a hlasovat podruhé. Na workshopu s lidmi v jedné místnosti to není problém,
  který by stál za komplikaci přihlašování.
