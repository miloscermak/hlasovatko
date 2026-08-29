// Obrazovka účastníka: připojení do session, jméno a vlastní hlasování.

var KEY_SESSION = 'hlasovatko.session';
var KEY_NAME = 'hlasovatko.name';

var me = {
  uid: null,
  code: null,
  name: null,
  activeQid: null,
  question: null,
  myVote: null
};
var questionListeners = [];

if (requireConfig()) init();

function init() {
  $('btn-code').onclick = submitCode;
  $('btn-name').onclick = submitName;
  $('btn-leave').onclick = leave;
  $('in-code').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') submitCode();
  });
  $('in-name').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') submitName();
  });

  signIn().then(function (uid) {
    me.uid = uid;
    var fromUrl = (location.hash || '').replace('#', '').trim().toUpperCase();
    var code = fromUrl || localStorage.getItem(KEY_SESSION);
    if (code) tryEnter(code); else show('screen-code');
  }).catch(function (e) {
    show('screen-code');
    setCodeError('Nepodařilo se připojit: ' + e.message);
  });
}

/* ---------- připojení ---------- */

function submitCode() {
  var code = $('in-code').value.trim().toUpperCase();
  if (code.length !== 4) { setCodeError('Kód má čtyři znaky.'); return; }
  tryEnter(code);
}

function tryEnter(code) {
  db.ref('sessions/' + code + '/hostUid').once('value').then(function (snap) {
    if (!snap.exists()) {
      localStorage.removeItem(KEY_SESSION);
      show('screen-code');
      setCodeError('Session s kódem ' + code + ' neexistuje.');
      return;
    }
    me.code = code;
    localStorage.setItem(KEY_SESSION, code);
    return db.ref('sessions/' + code + '/participants/' + me.uid + '/name')
      .once('value').then(function (nameSnap) {
        // Jméno máme buď v databázi (vrátil se), nebo si ho vyžádáme.
        var known = nameSnap.val() || localStorage.getItem(KEY_NAME);
        if (nameSnap.exists()) { enterSession(known); return; }
        if (known) $('in-name').value = known;
        show('screen-name');
        $('in-name').focus();
      });
  }).catch(function (e) {
    show('screen-code');
    setCodeError('Připojení selhalo: ' + e.message);
  });
}

function submitName() {
  var name = $('in-name').value.trim();
  if (!name) { $('in-name').focus(); return; }
  db.ref('sessions/' + me.code + '/participants/' + me.uid).set({
    name: name,
    joinedAt: TS
  }).then(function () {
    localStorage.setItem(KEY_NAME, name);
    enterSession(name);
  }).catch(function (e) {
    setCodeError('Přihlášení selhalo: ' + e.message);
    show('screen-code');
  });
}

function enterSession(name) {
  me.name = name;
  $('out-name').textContent = name;
  show('screen-vote');
  db.ref('sessions/' + me.code + '/activeQuestionId').on('value', function (snap) {
    watchQuestion(snap.val());
  });
}

function leave() {
  localStorage.removeItem(KEY_SESSION);
  location.hash = '';
  location.reload();
}

function setCodeError(msg) {
  var el = $('code-error');
  el.textContent = msg;
  el.hidden = !msg;
}

/* ---------- hlasování ---------- */

function watchQuestion(qid) {
  if (qid === me.activeQid) return;
  detachQuestion();
  me.activeQid = qid || null;
  me.question = null;
  me.myVote = null;
  if (!qid) { renderVote(); return; }

  var qRef = db.ref('sessions/' + me.code + '/questions/' + qid);
  var vRef = db.ref('sessions/' + me.code + '/votes/' + qid + '/' + me.uid);
  questionListeners = [
    [qRef, qRef.on('value', function (s) { me.question = s.val(); renderVote(); })],
    [vRef, vRef.on('value', function (s) {
      me.myVote = s.exists() ? s.val().value : null;
      renderVote();
    })]
  ];
}

function detachQuestion() {
  questionListeners.forEach(function (pair) { pair[0].off('value', pair[1]); });
  questionListeners = [];
}

function vote(index) {
  db.ref('sessions/' + me.code + '/votes/' + me.activeQid + '/' + me.uid).set({
    value: index,
    at: TS
  }).catch(function (e) {
    console.error(e);
  });
}

function renderVote() {
  var body = $('vote-body');
  var q = me.question;

  if (!q) {
    body.innerHTML = '<p class="status">Čekej, lektor za chvíli položí otázku.</p>';
    return;
  }

  var open = q.state === 'open';
  var html = '<h2 class="vote-question">' + esc(q.text) + '</h2><div class="choices">';
  (q.options || []).forEach(function (label, i) {
    html += '<button class="choice" data-i="' + i + '"' +
      ' style="--c: var(--opt-' + (i % 6) + ')"' +
      ' aria-pressed="' + (me.myVote === i) + '"' +
      (open ? '' : ' disabled') + '>' +
      '<span class="letter">' + LETTERS[i] + '</span>' +
      '<span>' + esc(label) + '</span></button>';
  });
  html += '</div>';

  if (!open) {
    html += '<p class="status">Hlasování je uzavřené.</p>';
  } else if (me.myVote === null) {
    html += '<p class="status">Vyber jednu možnost.</p>';
  } else {
    html += '<p class="status">Hlas zaznamenán. Můžeš ho ještě změnit.</p>';
  }

  body.innerHTML = html;
  if (open) {
    body.querySelectorAll('.choice').forEach(function (btn) {
      btn.onclick = function () { vote(Number(btn.dataset.i)); };
    });
  }
}
