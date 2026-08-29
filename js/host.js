// Obrazovka lektora: zakládá session, vypisuje otázky a promítá živé výsledky.

var STORAGE_KEY = 'hlasovatko.host.session';
var CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // bez O/0 a I/1, aby to šlo opsat
var MAX_OPTIONS = 6;

var state = {
  uid: null,
  code: null,
  activeQid: null,
  question: null,
  votes: {},
  participants: {}
};
var questionListeners = [];

if (requireConfig()) init();

function init() {
  renderOptionInputs(2);
  $('btn-create').onclick = createSession;
  $('btn-start').onclick = startQuestion;
  $('btn-close').onclick = closeQuestion;
  $('in-question').addEventListener('keydown', onComposerKey);

  signIn().then(function (uid) {
    state.uid = uid;
    var saved = localStorage.getItem(STORAGE_KEY);
    if (saved) offerResume(saved);
  }).catch(fail);
}

function onComposerKey(e) {
  if (e.key === 'Enter') { e.preventDefault(); startQuestion(); }
}

/* ---------- session ---------- */

function randomCode() {
  var buf = new Uint32Array(4);
  crypto.getRandomValues(buf);
  var out = '';
  for (var i = 0; i < 4; i++) out += CODE_ALPHABET[buf[i] % CODE_ALPHABET.length];
  return out;
}

function createSession() {
  var code = randomCode();
  db.ref('sessions/' + code + '/hostUid').once('value').then(function (snap) {
    if (snap.exists()) { createSession(); return; }  // kolize kódu, zkusíme jiný
    return db.ref('sessions/' + code).set({
      hostUid: state.uid,
      createdAt: TS
    }).then(function () {
      localStorage.setItem(STORAGE_KEY, code);
      enterSession(code);
    });
  }).catch(fail);
}

// Po refreshi prohlížeče nabídneme návrat do rozdělané session.
function offerResume(code) {
  db.ref('sessions/' + code + '/hostUid').once('value').then(function (snap) {
    if (snap.val() !== state.uid) { localStorage.removeItem(STORAGE_KEY); return; }
    var btn = $('btn-resume');
    btn.hidden = false;
    btn.textContent = 'Pokračovat v session ' + code;
    btn.onclick = function () { enterSession(code); };
  }).catch(function () { /* offline, prostě nenabídneme */ });
}

function enterSession(code) {
  state.code = code;
  $('out-code').textContent = code;
  $('out-url').textContent = joinUrl(code);
  show('screen-stage');

  var base = db.ref('sessions/' + code);
  base.child('participants').on('value', function (snap) {
    state.participants = snap.val() || {};
    $('out-count').textContent = Object.keys(state.participants).length;
    render();
  });
  base.child('activeQuestionId').on('value', function (snap) {
    watchQuestion(snap.val());
  });
  $('in-question').focus();
}

function joinUrl(code) {
  var base = location.href.replace(/host\.html.*$/, '').replace(/^https?:\/\//, '');
  return base + '#' + code;
}

/* ---------- otázky ---------- */

function watchQuestion(qid) {
  if (qid === state.activeQid) return;
  detachQuestion();
  state.activeQid = qid || null;
  state.question = null;
  state.votes = {};
  if (!qid) { render(); return; }

  var qRef = db.ref('sessions/' + state.code + '/questions/' + qid);
  var vRef = db.ref('sessions/' + state.code + '/votes/' + qid);
  questionListeners = [
    [qRef, qRef.on('value', function (s) { state.question = s.val(); render(); })],
    [vRef, vRef.on('value', function (s) { state.votes = s.val() || {}; render(); })]
  ];
}

function detachQuestion() {
  questionListeners.forEach(function (pair) { pair[0].off('value', pair[1]); });
  questionListeners = [];
}

function startQuestion() {
  var text = $('in-question').value.trim();
  var options = optionValues().filter(function (v) { return v !== ''; });
  if (!text) { $('in-question').focus(); return; }
  if (options.length < 2) { focusFirstEmptyOption(); return; }

  var qid = db.ref('sessions/' + state.code + '/questions').push().key;
  var updates = {};
  updates['questions/' + qid] = {
    text: text,
    type: 'choice',
    options: options,
    state: 'open',
    createdAt: TS
  };
  updates['activeQuestionId'] = qid;

  db.ref('sessions/' + state.code).update(updates).then(function () {
    $('in-question').value = '';
    renderOptionInputs(2);
    $('in-question').focus();
  }).catch(fail);
}

function closeQuestion() {
  if (!state.activeQid) return;
  db.ref('sessions/' + state.code + '/questions/' + state.activeQid + '/state')
    .set('closed').catch(fail);
}

/* ---------- vykreslování ---------- */

function render() {
  var q = state.question;
  $('btn-close').disabled = !(q && q.state === 'open');

  if (!q) {
    $('board').innerHTML =
      '<div class="waiting"><strong>Zatím žádná otázka</strong>' +
      '<p>Napiš ji dole a spusť hlasování.</p></div>';
    return;
  }

  var options = q.options || [];
  var byOption = options.map(function () { return []; });
  Object.keys(state.votes).forEach(function (uid) {
    var idx = state.votes[uid].value;
    if (byOption[idx]) byOption[idx].push(nameOf(uid));
  });

  var total = 0;
  byOption.forEach(function (list) { total += list.length; });

  var html = '<h1 class="question">' + esc(q.text) + '</h1>';
  html += options.map(function (label, i) {
    var count = byOption[i].length;
    var pct = total ? Math.round(count / total * 100) : 0;
    return '<div class="bar-row" style="--c: var(--opt-' + (i % 6) + ')">' +
      '<div class="bar-head">' +
        '<span class="letter">' + LETTERS[i] + '</span>' +
        '<span class="text">' + esc(label) + '</span>' +
        '<span class="num">' + count + ' &middot; ' + pct + ' %</span>' +
      '</div>' +
      '<div class="bar-track"><div class="bar-fill" style="width:' + pct + '%"></div></div>' +
      '<div class="voters">' + byOption[i].sort().map(function (n) {
        return '<span>' + esc(n) + '</span>';
      }).join('') + '</div>' +
    '</div>';
  }).join('');

  var people = Object.keys(state.participants).length;
  html += '<p class="status">Hlasovalo ' + total + ' z ' + people +
    (q.state === 'open' ? '' : ' &middot; hlasování uzavřeno') + '</p>';

  $('board').innerHTML = html;
}

function nameOf(uid) {
  var p = state.participants[uid];
  return p && p.name ? p.name : 'Neznámý';
}

/* ---------- pole pro možnosti ---------- */

function renderOptionInputs(count, values) {
  var wrap = $('in-options');
  wrap.innerHTML = '';
  for (var i = 0; i < count; i++) {
    var box = document.createElement('div');
    box.className = 'opt';
    box.innerHTML = '<span class="letter">' + LETTERS[i] + '</span>' +
      '<input type="text" data-opt="' + i + '" placeholder="Možnost ' + LETTERS[i] + '" autocomplete="off">';
    wrap.appendChild(box);
    var input = box.querySelector('input');
    if (values && values[i]) input.value = values[i];
    input.addEventListener('keydown', onComposerKey);
  }
  if (count < MAX_OPTIONS) {
    var plus = document.createElement('button');
    plus.type = 'button';
    plus.className = 'ghost';
    plus.textContent = '+ možnost';
    plus.onclick = function () { renderOptionInputs(count + 1, optionValues()); };
    wrap.appendChild(plus);
  }
}

function optionValues() {
  var inputs = $('in-options').querySelectorAll('input[data-opt]');
  return Array.prototype.map.call(inputs, function (el) { return el.value.trim(); });
}

function focusFirstEmptyOption() {
  var inputs = $('in-options').querySelectorAll('input[data-opt]');
  for (var i = 0; i < inputs.length; i++) {
    if (!inputs[i].value.trim()) { inputs[i].focus(); return; }
  }
}

function fail(err) {
  console.error(err);
  alert('Něco se pokazilo: ' + (err && err.message ? err.message : err));
}
