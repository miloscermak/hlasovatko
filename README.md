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

## Jak se to používá

- Lektor otevře `/host.html`, založí session, na plátně se ukáže čtyřznakový kód.
- Účastníci jdou na hlavní adresu, zadají kód a jméno. Session jim vydrží celý workshop.
- Lektor dole napíše otázku a možnosti, dá **Spustit hlasování**.

## Lokální vyzkoušení

```bash
python3 -m http.server 8000
```

Pak otevři <http://localhost:8000/host.html>. Firebase funguje i z localhostu.
