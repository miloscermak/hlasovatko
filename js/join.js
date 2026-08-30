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
  me.rendered = null;
  me.touched = false;
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
    me.rendered = null;
    return;
  }

  if (q.type === 'open') { renderOpen(q); return; }
  me.rendered = null;

  var open = q.state === 'open';
  var scale = q.type === 'scale';
  var html = '<h2 class="vote-question">' + esc(q.text) + '</h2>' +
    '<div class="' + (scale ? 'scale-row' : 'choices') + '">';

  (q.options || []).forEach(function (label, i) {
    var marker = markerFor(q.type, i);
    html += '<button class="choice" data-i="' + i + '"' +
      ' style="--c: ' + colorFor(q.type, i) + '"' +
      ' aria-pressed="' + (me.myVote === i) + '"' +
      (open ? '' : ' disabled') + '>' +
      (scale
        ? '<span class="big">' + esc(label) + '</span>'
        : (marker ? '<span class="letter">' + marker + '</span>' : '') +
          '<span>' + esc(label) + '</span>') +
      '</button>';
  });
  html += '</div>';

  if (!open) {
    html += '<p class="status">Hlasování je uzavřené.</p>';
  } else if (me.myVote === null) {
    html += '<p class="status">' + (scale ? 'Vyber číslo.' : 'Vyber jednu možnost.') + '</p>';
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

/* ---------- otevřená odpověď ---------- */

// Textové pole se překresluje jen při změně otázky – jinak by uživateli
// mizelo rozepsané pod rukama pokaždé, když přijde snapshot z databáze.
function renderOpen(q) {
  var key = me.activeQid + '|' + q.state;
  if (me.rendered !== key) {
    me.rendered = key;
    var editable = q.state === 'open';
    $('vote-body').innerHTML =
      '<h2 class="vote-question">' + esc(q.text) + '</h2>' +
      '<textarea id="in-answer" rows="7" maxlength="' + MAX_ANSWER + '"' +
        (editable ? '' : ' disabled') +
        ' placeholder="Napiš svoji odpověď…"></textarea>' +
      '<div class="answer-bar">' +
        '<span class="counter" id="out-counter"></span>' +
        '<button id="btn-send">Odeslat</button>' +
      '</div>' +
      '<p class="status" id="out-answer-status"></p>';
    $('in-answer').addEventListener('input', function () {
      me.touched = true;
      updateOpen();
    });
    $('btn-send').onclick = sendAnswer;
  }
  updateOpen();
}

function updateOpen() {
  var field = $('in-answer');
  if (!field) return;

  // Uloženou odpověď doplníme jen dokud do pole člověk sám nesáhl.
  var saved = typeof me.myVote === 'string' ? me.myVote : null;
  if (!me.touched && saved !== null && field.value !== saved) field.value = saved;

  var text = field.value.trim();
  var editable = me.question.state === 'open';
  var unchanged = saved !== null && saved === text;

  $('out-counter').textContent = field.value.length + ' / ' + MAX_ANSWER;
  $('btn-send').textContent = unchanged ? 'Odesláno' : (saved === null ? 'Odeslat' : 'Uložit změnu');
  $('btn-send').disabled = !editable || !text || unchanged;
  $('out-answer-status').textContent = !editable
    ? 'Hlasování je uzavřené.'
    : (saved === null
        ? 'Napiš odpověď a odešli ji.'
        : 'Odpověď uložena. Můžeš ji ještě upravit.');
}

function sendAnswer() {
  var text = $('in-answer').value.trim().slice(0, MAX_ANSWER);
  if (!text) return;
  db.ref('sessions/' + me.code + '/votes/' + me.activeQid + '/' + me.uid).set({
    value: text,
    at: TS
  }).then(function () {
    me.touched = false;
    updateOpen();
  }).catch(function (e) { console.error(e); });
}
