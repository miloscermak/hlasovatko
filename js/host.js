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
  participants: {},
  questions: {},
  type: 'choice',
  showNames: localStorage.getItem('hlasovatko.host.names') === 'on'
};
var questionListeners = [];

if (requireConfig()) init();

function init() {
  renderTypes();
  renderOptionInputs(2);
  $('btn-create').onclick = createSession;
  $('btn-start').onclick = startQuestion;
  $('btn-draft').onclick = saveDraft;
  $('btn-close').onclick = closeQuestion;
  $('btn-names').onclick = toggleNames;
  $('btn-export-one').onclick = exportQuestion;
  $('btn-export-all').onclick = exportAll;
  applyNames();
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
  $('out-url').textContent = joinUrlPretty(code);
  renderQr($('qr-mini'), joinUrl(code), 3);
  show('screen-stage');

  var base = db.ref('sessions/' + code);
  base.child('participants').on('value', function (snap) {
    state.participants = snap.val() || {};
    $('out-count').textContent = Object.keys(state.participants).length;
    render();
  });
  base.child('questions').on('value', function (snap) {
    state.questions = snap.val() || {};
    renderStrip();
  });
  base.child('activeQuestionId').on('value', function (snap) {
    watchQuestion(snap.val());
  });
  $('in-question').focus();
}

function joinUrl(code) {
  return location.href.replace(/host\.html.*$/, '') + '#' + code;
}

function joinUrlPretty(code) {
  return joinUrl(code).replace(/^https?:\/\//, '');
}

/* ---------- otázky ---------- */

function watchQuestion(qid) {
  if (qid === state.activeQid) return;
  detachQuestion();
  state.activeQid = qid || null;
  state.question = null;
  state.votes = {};
  renderStrip();
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

// Posbírá obsah spodní lišty. Vrací null, když něco chybí.
function composeQuestion(questionState) {
  var text = $('in-question').value.trim();
  if (!text) { $('in-question').focus(); return null; }

  var def = TYPES[state.type];
  var options = def.ownOptions
    ? optionValues().filter(function (v) { return v !== ''; })
    : def.options.slice();
  if (def.ownOptions && options.length < 2) { focusFirstEmptyOption(); return null; }

  return {
    text: text,
    type: state.type,
    options: options,
    state: questionState,
    createdAt: TS
  };
}

function startQuestion() {
  var question = composeQuestion('open');
  if (!question) return;
  var qid = db.ref('sessions/' + state.code + '/questions').push().key;
  var updates = closePrevious();
  updates['questions/' + qid] = question;
  updates['activeQuestionId'] = qid;
  db.ref('sessions/' + state.code).update(updates).then(clearComposer).catch(fail);
}

// Naráz běží vždycky jen jedno hlasování – to předchozí se zavře samo.
function closePrevious() {
  var updates = {};
  var current = state.questions[state.activeQid];
  if (current && current.state === 'open') {
    updates['questions/' + state.activeQid + '/state'] = 'closed';
  }
  return updates;
}

function saveDraft() {
  var question = composeQuestion('draft');
  if (!question) return;
  db.ref('sessions/' + state.code + '/questions').push(question)
    .then(clearComposer).catch(fail);
}

function closeQuestion() {
  if (!state.activeQid) return;
  db.ref('sessions/' + state.code + '/questions/' + state.activeQid + '/state')
    .set('closed').catch(fail);
}

// Spustí připravený koncept.
function publishDraft(qid) {
  var updates = closePrevious();
  updates['questions/' + qid + '/state'] = 'open';
  updates['activeQuestionId'] = qid;
  db.ref('sessions/' + state.code).update(updates).catch(fail);
}

// Vrátí na plátno starší otázku i s jejími výsledky.
function replayQuestion(qid) {
  db.ref('sessions/' + state.code + '/activeQuestionId').set(qid).catch(fail);
}

function deleteDraft(qid) {
  db.ref('sessions/' + state.code + '/questions/' + qid).remove().catch(fail);
}

/* ---------- vykreslování plátna ---------- */

function render() {
  var q = state.question;
  $('btn-close').disabled = !(q && q.state === 'open');
  $('btn-export-one').disabled = !q;
  $('board').innerHTML = q ? resultsHtml(q) : waitingHtml();
  applyNames();
  if (!q) renderQr($('qr-big'), joinUrl(state.code), 6);
}

function waitingHtml() {
  var names = Object.keys(state.participants).map(nameOf).sort();
  return '<div class="waiting">' +
    '<div class="qr-big" id="qr-big"></div>' +
    '<strong>' + esc(joinUrlPretty(state.code)) + '</strong>' +
    '<p>Naskenuj kód, nebo ho zadej ručně: <b>' + state.code + '</b></p>' +
    (names.length
      ? '<div class="voters names">' + names.map(function (n) {
          return '<span>' + esc(n) + '</span>';
        }).join('') + '</div>'
      : '') +
    '</div>';
}

function resultsHtml(q) {
  var options = q.options || [];
  var byOption = options.map(function () { return []; });
  Object.keys(state.votes).forEach(function (uid) {
    var idx = state.votes[uid].value;
    if (byOption[idx]) byOption[idx].push(nameOf(uid));
  });

  var total = 0;
  var weighted = 0;
  byOption.forEach(function (list, i) {
    total += list.length;
    weighted += list.length * (i + 1);
  });

  var html = '<h1 class="question">' + esc(q.text) + '</h1>';
  if (q.type === 'scale' && total) {
    html += '<p class="average">Průměr <strong>' +
      (weighted / total).toFixed(1).replace('.', ',') + '</strong></p>';
  }

  html += '<div class="results">' + options.map(function (label, i) {
    var count = byOption[i].length;
    var pct = total ? Math.round(count / total * 100) : 0;
    var marker = markerFor(q.type, i);
    return '<div class="bar-row" style="--c: ' + colorFor(q.type, i) + '">' +
      '<div class="bar-head">' +
        (marker ? '<span class="letter">' + marker + '</span>' : '') +
        '<span class="text">' + esc(label) + '</span>' +
        '<span class="num">' + count + ' &middot; ' + pct + ' %</span>' +
      '</div>' +
      '<div class="bar-track"><div class="bar-fill" style="width:' + pct + '%"></div></div>' +
      '<div class="voters">' + byOption[i].sort().map(function (n) {
        return '<span>' + esc(n) + '</span>';
      }).join('') + '</div>' +
    '</div>';
  }).join('') + '</div>';

  // Hlasů může být teoreticky víc než připojených (starý hlas bez účastníka),
  // ať to na plátně nevypadá jako rozbité počítání.
  var people = Object.keys(state.participants).length;
  var tally = total > people ? 'Hlasovalo ' + total : 'Hlasovalo ' + total + ' z ' + people;
  html += '<p class="status">' + tally +
    (q.state === 'open' ? '' : ' &middot; hlasování uzavřeno') + '</p>';
  return html;
}

function nameOf(uid) {
  var p = state.participants[uid];
  return p && p.name ? p.name : 'Neznámý';
}

function toggleNames() {
  state.showNames = !state.showNames;
  localStorage.setItem('hlasovatko.host.names', state.showNames ? 'on' : 'off');
  applyNames();
}

function applyNames() {
  $('board').classList.toggle('hide-names', !state.showNames);
  $('btn-names').textContent = state.showNames ? 'Skrýt jména' : 'Zobrazit jména';
}

/* ---------- export výsledků ---------- */

// Export čte data načerstvo z databáze, ne z paměti obrazovky – hlasy
// neaktivních otázek totiž v paměti nemáme.
function loadSession() {
  return db.ref('sessions/' + state.code).once('value').then(function (snap) {
    return snap.val() || {};
  });
}

function exportQuestion() {
  if (!state.activeQid) return;
  var qid = state.activeQid;
  loadSession().then(function (data) {
    var order = sortedQuestionIds(data).indexOf(qid) + 1;
    var question = questionExport(data, qid);
    download(
      'hlasovatko-' + state.code + '-' + pad(order) + '-' + slug(question.text) + '.json',
      { session: state.code, exportedAt: nowIso(), question: question }
    );
  }).catch(fail);
}

function exportAll() {
  loadSession().then(function (data) {
    var people = data.participants || {};
    download(
      'hlasovatko-' + state.code + '-' + nowIso().slice(0, 10) + '.json',
      {
        session: state.code,
        createdAt: isoTime(data.createdAt),
        exportedAt: nowIso(),
        participants: Object.keys(people).map(function (uid) {
          return { uid: uid, name: people[uid].name, joinedAt: isoTime(people[uid].joinedAt) };
        }).sort(function (a, b) { return a.name.localeCompare(b.name, 'cs'); }),
        questions: sortedQuestionIds(data).map(function (qid) {
          return questionExport(data, qid);
        })
      }
    );
  }).catch(fail);
}

function sortedQuestionIds(data) {
  var questions = data.questions || {};
  return Object.keys(questions).sort(function (a, b) {
    return (questions[a].createdAt || 0) - (questions[b].createdAt || 0);
  });
}

function questionExport(data, qid) {
  var q = (data.questions || {})[qid] || {};
  var votes = (data.votes || {})[qid] || {};
  var people = data.participants || {};
  var options = q.options || [];
  var buckets = options.map(function () { return []; });
  var list = [];

  Object.keys(votes).forEach(function (uid) {
    var vote = votes[uid];
    var name = people[uid] && people[uid].name ? people[uid].name : 'Neznámý';
    if (buckets[vote.value]) buckets[vote.value].push(name);
    list.push({
      uid: uid,
      name: name,
      value: vote.value,
      label: options[vote.value] === undefined ? null : options[vote.value],
      at: isoTime(vote.at)
    });
  });

  var total = list.length;
  var out = {
    id: qid,
    text: q.text || '',
    type: q.type || '',
    state: q.state || '',
    createdAt: isoTime(q.createdAt),
    totalVotes: total,
    options: options.map(function (label, i) {
      return {
        index: i,
        label: label,
        count: buckets[i].length,
        percent: total ? Math.round(buckets[i].length / total * 100) : 0,
        voters: buckets[i].sort(function (a, b) { return a.localeCompare(b, 'cs'); })
      };
    }),
    votes: list.sort(function (a, b) { return a.name.localeCompare(b.name, 'cs'); })
  };

  if (q.type === 'scale' && total) {
    var weighted = 0;
    buckets.forEach(function (bucket, i) { weighted += bucket.length * (i + 1); });
    out.average = Math.round(weighted / total * 100) / 100;
  }
  return out;
}

function download(filename, payload) {
  var blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  var url = URL.createObjectURL(blob);
  var link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
}

function nowIso() { return new Date().toISOString(); }

function isoTime(ms) { return ms ? new Date(ms).toISOString() : null; }

function pad(n) { return n < 10 ? '0' + n : String(n); }

// Z textu otázky udělá použitelný název souboru bez diakritiky.
function slug(text) {
  var base = (text || 'otazka').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/, '');
  return base || 'otazka';
}

/* ---------- pruh s otázkami ---------- */

function renderStrip() {
  var strip = $('strip');
  var chips = $('chips');
  var ids = Object.keys(state.questions);
  if (!ids.length) { strip.hidden = true; chips.innerHTML = ''; return; }

  ids.sort(function (a, b) {
    return (state.questions[a].createdAt || 0) - (state.questions[b].createdAt || 0);
  });

  strip.hidden = false;
  chips.innerHTML = ids.map(function (qid) {
    var q = state.questions[qid];
    var draft = q.state === 'draft';
    var cls = 'chip' + (draft ? ' is-draft' : '') + (qid === state.activeQid ? ' is-active' : '');
    return '<span class="' + cls + '" data-qid="' + qid + '" title="' + esc(q.text) + '">' +
      '<span class="mark">' + (draft ? '▶' : '↺') + '</span>' +
      '<span class="chip-text">' + esc(q.text) + '</span>' +
      (draft ? '<span class="del" data-del="' + qid + '" title="Smazat koncept">×</span>' : '') +
    '</span>';
  }).join('');

  chips.querySelectorAll('[data-qid]').forEach(function (chip) {
    chip.onclick = function () {
      var qid = chip.dataset.qid;
      if (state.questions[qid].state === 'draft') publishDraft(qid);
      else replayQuestion(qid);
    };
  });
  chips.querySelectorAll('[data-del]').forEach(function (x) {
    x.onclick = function (e) { e.stopPropagation(); deleteDraft(x.dataset.del); };
  });
}

/* ---------- spodní lišta ---------- */

function renderTypes() {
  var wrap = $('in-types');
  wrap.innerHTML = '';
  Object.keys(TYPES).forEach(function (key) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'type' + (key === state.type ? ' is-on' : '');
    b.textContent = TYPES[key].label;
    b.onclick = function () { setType(key); };
    wrap.appendChild(b);
  });
}

function setType(key) {
  state.type = key;
  renderTypes();
  $('in-options').hidden = !TYPES[key].ownOptions;
  $('in-question').focus();
}

function clearComposer() {
  $('in-question').value = '';
  renderOptionInputs(2);
  $('in-question').focus();
}

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
