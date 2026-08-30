# Hlasovátko

Živé hlasování pro workshopy. Lektor promítá otázku, účastníci hlasují na mobilech,
výsledky naskakují v reálném čase.

## Jednorázové nastavení Firebase

Potřebuješ Google účet. Zabere to asi pět minut.

1. Otevři <https://console.firebase.google.com> a dej **Create a project**.
   Název třeba `hlasovatko`. Google Analytics klidně vypni, není potřeba.

2. V levém menu **Build → Realtime Database → Create Database**.
   Lokalitu vyber **europe-west1** (Belgie). Na dotaz ohledně pravidel zvol
   **Start in locked mode** – správná pravidla nahrajeme za chvíli.

3. V levém menu **Build → Authentication → Get started**.
   V záložce **Sign-in method** najdi **Anonymous**, zapni ho a ulož.

4. Nahoře **Project Overview** → ikonka `</>` (Add app → Web).
   Přezdívku dej `hlasovatko`, **Firebase Hosting nezaškrtávej**. Po potvrzení
   uvidíš blok `const firebaseConfig = { ... }`. Ten zkopíruj.

5. Hodnoty z něj přepiš do souboru `js/firebase-config.js`.
   Klíč `databaseURL` v tom bloku někdy chybí – najdeš ho v Realtime Database
   nahoře, vypadá jako `https://hlasovatko-xxxx-default-rtdb.europe-west1.firebasedatabase.app`.

Tyhle údaje nejsou tajné, v prohlížeči je vidí každý návštěvník. Bezpečnost
stojí na pravidlech v `database.rules.json`.

## Nasazení

```bash
npx firebase-tools login
npx firebase-tools use --add        # vyber svůj projekt
npx firebase-tools deploy
```

Deploy nahraje web i pravidla databáze. Adresa bude `https://<projekt>.web.app`.

## Nasazení na Netlify

Repozitář jde připojit v Netlify přes **Add new site → Import an existing project**.
Build command nech prázdný, publish directory `.` – konfigurace už je v `netlify.toml`.

Anonymní přihlášení funguje i z vlastní domény bez dalšího nastavování
(ověřeno na `ted.inspiruj.se`). Kdyby se někdy přidávalo přihlášení přes Google
nebo e-mail, je potřeba tu doménu doplnit ve Firebase konzoli do
**Authentication → Settings → Authorized domains**.

Pravidla databáze se přes Netlify nenasazují – ta jedou pořád přes Firebase:

```bash
npx firebase-tools deploy --only database
```

## Jak se to používá

- Lektor otevře `/host.html` a založí session. Na plátně se ukáže velký QR kód
  a čtyřznakový kód pro ty, co QR nezvládnou.
- Účastníci naskenují kód a zadají jméno. Session jim vydrží celý workshop.
- Lektor dole napíše otázku, vybere typ hlasování a dá **Spustit hlasování**
  (nebo jen Enter).

### Typy hlasování

| Typ | Co zadáš | Co se ukáže na plátně |
|---|---|---|
| **A / B / C** | otázku a 2–6 možností | sloupce s procenty a počty |
| **Ano / Ne** | jen otázku | dva sloupce, zelený a červený |
| **Škála 1–5** | jen otázku | rozložení a velké číslo průměru |

### Koncepty a historie

**Uložit koncept** odloží otázku na později – objeví se jako čárkovaný štítek
v pruhu nad spodní lištou a spustíš ji jedním klikem. Ve stejném pruhu jsou
i všechny odehrané otázky; kliknutím se vrátí na plátno i s výsledky.

### Jména hlasujících

Na plátně jsou standardně skrytá, aby se výsledky vždy vešly na jednu
obrazovku. Tlačítkem **Zobrazit jména** se u každé možnosti vypíše, kdo ji
zvolil – hodí se, když chceš o výsledku diskutovat.

## Lokální vyzkoušení

```bash
python3 -m http.server 8000
```

Pak otevři <http://localhost:8000/host.html>. Firebase funguje i z localhostu.
