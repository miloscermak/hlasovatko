// Sdílený základ pro obě obrazovky: inicializace Firebase, přihlášení, drobné pomůcky.

var LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];
var TS = firebase.database.ServerValue.TIMESTAMP;

var configured = !!(window.FIREBASE_CONFIG && window.FIREBASE_CONFIG.databaseURL);
var db = null;
var auth = null;

if (configured) {
  firebase.initializeApp(window.FIREBASE_CONFIG);
  db = firebase.database();
  auth = firebase.auth();
}

// Anonymní přihlášení. UID slouží jako identita lektora i účastníka a prohlížeč
// si ho pamatuje, takže po refreshi zůstává hlasování i session platná.
function signIn() {
  return new Promise(function (resolve, reject) {
    auth.onAuthStateChanged(function (user) {
      if (user) resolve(user.uid);
    });
    auth.signInAnonymously().catch(reject);
  });
}

function $(id) { return document.getElementById(id); }

function show(id) {
  var screens = document.querySelectorAll('[data-screen]');
  for (var i = 0; i < screens.length; i++) {
    screens[i].hidden = screens[i].id !== id;
  }
}

// Bez vyplněné konfigurace nemá smysl nic spouštět – radši srozumitelná hláška
// než tichá bílá stránka.
function requireConfig() {
  if (configured) return true;
  document.body.innerHTML =
    '<div class="setup-warning">' +
    '<h1>Chybí konfigurace Firebase</h1>' +
    '<p>Otevři soubor <code>js/firebase-config.js</code> a vlož do něj údaje ' +
    'ze své Firebase konzole.</p></div>';
  return false;
}

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
