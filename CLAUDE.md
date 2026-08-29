# Hlasovátko

Živé hlasování pro workshopy. Lektor (Miloš) promítá otázku na plátno, účastníci
hlasují na mobilech, výsledky naskakují okamžitě.

## Kontext použití

Reálná situace: workshop, 10–40 lidí, tři hodiny. Lektor dostane během výkladu
nápad na otázku, během ~15 sekund ji musí naformulovat a spustit. Účastníci se
přihlašují jednou na začátku (QR kód + jméno) a session jim vydrží celý workshop.

Z toho plyne priorita číslo jedna: **rychlost a spolehlivost v den D**.
Nic, co může selhat před publikem. Žádná funkce nestojí za riziko, že se
hlasování zasekne.

## Technologie

- Čisté HTML + CSS + vanilla JavaScript, žádný framework, žádný build krok
- Firebase Realtime Database pro živá data
- Firebase Anonymous Auth pro identitu (lektor i účastníci)
- Firebase Hosting pro nasazení
- Knihovny jen minimálně a vždy lokálně (žádné CDN – wifi na workshopu je loterie)

## Struktura

```
index.html        rozcestník + připojení účastníka (mobil)
host.html         ovládání + projekce (notebook lektora)
css/style.css
js/firebase.js    inicializace a konfigurace Firebase
js/join.js        logika účastníka
js/host.js        logika lektora
js/qrcode.js      generování QR kódu (lokální knihovna)
database.rules.json  bezpečnostní pravidla databáze
```

## Datový model

```
sessions/{kod}/
  title, createdAt, hostUid, activeQuestionId
  participants/{uid}/  name, joinedAt
  questions/{qid}/     text, type, options[], state, createdAt
  votes/{qid}/{uid}/   value, at
```

`kod` je krátký čitelný kód session (např. AB7K) – jde opsat z plátna i naskenovat.
`type` je jeden z: `choice` | `scale` | `yesno` | `open`.
`state` je jeden z: `draft` | `open` | `closed`.

## Zásady

- Hlasy jsou vázané na jméno – lektor musí vidět, kdo co hlasoval
- Účastník smí přepsat svůj hlas, dokud je otázka otevřená
- Ztráta spojení nesmí shodit rozhlasovanou otázku: stav se čte z databáze,
  ne z paměti prohlížeče
- Obrazovka lektora se promítá – musí být čitelná z posledních řad
  (velké písmo, vysoký kontrast, žádné drobné popisky)
