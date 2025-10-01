const $ = (id) => document.getElementById(id);

const state = {
  problems: [],
  results: [],
  index: 0,
  startedAt: 0,
  tts: 'off',
  voice: null
};

function getRandomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function generateNumberWithDigits(digits) {
  const min = Math.pow(10, digits - 1);
  const max = Math.pow(10, digits) - 1;
  return getRandomInt(min, max);
}

function generateProblems(count, digitsA, digitsB) {
  const problems = [];
  for (let i = 0; i < count; i++) {
    problems.push({
      a: generateNumberWithDigits(digitsA),
      b: generateNumberWithDigits(digitsB)
    });
  }
  return problems;
}

function formatProblem(p) {
  return `${p.a} × ${p.b}`;
}

function expectedAnswer(p) {
  return p.a * p.b;
}

function show(elId) {
  ['screen-config','screen-practice','screen-summary'].forEach(id => {
    const el = $(id);
    if (!el) return;
    el.classList.toggle('hidden', id !== elId);
  });
}

function startTimer() {
  state.startedAt = performance.now();
}

function stopTimer() {
  const ms = performance.now() - state.startedAt;
  return ms;
}

let rafId = null;
function tickTimer() {
  cancelAnimationFrame(rafId);
  const loop = () => {
    const ms = performance.now() - state.startedAt;
    $('timer').textContent = (ms/1000).toFixed(2) + 's';
    rafId = requestAnimationFrame(loop);
  };
  rafId = requestAnimationFrame(loop);
}

function stopTick() { cancelAnimationFrame(rafId); }

function speak(text) {
  if (state.tts !== 'on' || !('speechSynthesis' in window)) return;
  const utter = new SpeechSynthesisUtterance(text.replace('×', ' times '));
  if (state.voice) utter.voice = state.voice;
  utter.rate = 0.95;
  speechSynthesis.cancel();
  speechSynthesis.speak(utter);
}

function persistSession(session) {
  const key = 'mm.sessions';
  const existing = JSON.parse(localStorage.getItem(key) || '[]');
  existing.unshift(session);
  localStorage.setItem(key, JSON.stringify(existing.slice(0, 200)));
}

function loadHistory() {
  const key = 'mm.sessions';
  const sessions = JSON.parse(localStorage.getItem(key) || '[]');
  const container = $('history');
  if (!sessions.length) {
    container.innerHTML = '<div class="muted">No sessions yet.</div>';
    return;
  }
  container.innerHTML = sessions.map((s, idx) => {
    const correct = s.results.filter(r => r.correct).length;
    const total = s.results.length;
    const avg = (s.results.reduce((acc, r) => acc + r.ms, 0) / total / 1000).toFixed(2);
    const date = new Date(s.startedAt).toLocaleString();
    return `<div style="padding:8px 0;border-bottom:1px solid #1f2937">
      <div><strong>#${sessions.length - idx}</strong> • ${date}</div>
      <div>${s.config.digitsA}×${s.config.digitsB}, ${total} problems • Correct: ${correct}/${total} • Avg: ${avg}s</div>
    </div>`;
  }).join('');
}

function showProblem() {
  const p = state.problems[state.index];
  $('problemText').textContent = formatProblem(p);
  $('progress').textContent = String(state.index + 1);
  $('total').textContent = String(state.problems.length);
  $('answer').value = '';
  $('answer').focus();
  startTimer();
  tickTimer();
  if (state.tts === 'on') speak(`${p.a} times ${p.b}`);
}

function endSession() {
  stopTick();
  const session = {
    startedAt: state.sessionStartedAt,
    endedAt: Date.now(),
    config: state.config,
    results: state.results
  };
  persistSession(session);
  renderSummary(session);
  loadHistory();
  show('screen-summary');
}

function renderSummary(session) {
  const correct = session.results.filter(r => r.correct).length;
  const total = session.results.length;
  const avg = (session.results.reduce((acc, r) => acc + r.ms, 0) / total / 1000).toFixed(2);
  $('summaryStats').innerHTML = `
    <div><strong>${correct}/${total}</strong> correct • Avg: <strong>${avg}s</strong></div>
  `;
  $('summaryDetails').innerHTML = session.results.map((r, i) => `
    <div style="padding:6px 0;border-bottom:1px solid #1f2937">
      <div>${formatProblem(r.problem)} = ${expectedAnswer(r.problem)}</div>
      <div>Your: ${r.answer ?? '—'} • ${r.correct ? '✅' : '❌'} • ${(r.ms/1000).toFixed(2)}s</div>
    </div>
  `).join('');
}

function recordAnswer(answer, skipped=false) {
  stopTick();
  const ms = stopTimer();
  const p = state.problems[state.index];
  const correct = !skipped && Number(answer) === expectedAnswer(p);
  state.results.push({ problem: p, answer: skipped ? null : Number(answer), correct, ms });
  state.index += 1;
  if (state.index >= state.problems.length) {
    endSession();
  } else {
    showProblem();
  }
}

function populateVoices() {
  const select = $('voiceSelect');
  const voices = speechSynthesis.getVoices();
  select.innerHTML = '<option value="">System default</option>' + voices.map((v, i) => `<option value="${i}">${v.name} (${v.lang})</option>`).join('');
}

function init() {
  loadHistory();
  if ('speechSynthesis' in window) {
    populateVoices();
    window.speechSynthesis.onvoiceschanged = populateVoices;
  } else {
    $('ttsMode').value = 'off';
    $('ttsMode').disabled = true;
    $('voiceSelect').disabled = true;
  }

  $('startBtn').addEventListener('click', () => {
    const count = Math.max(1, Math.min(200, Number($('numProblems').value || 10)));
    const digitsA = Math.max(1, Math.min(6, Number($('digitsA').value || 2)));
    const digitsB = Math.max(1, Math.min(6, Number($('digitsB').value || 2)));
    state.tts = $('ttsMode').value;
    const voices = speechSynthesis.getVoices();
    const idx = Number($('voiceSelect').value);
    state.voice = Number.isInteger(idx) && voices[idx] ? voices[idx] : null;

    state.problems = generateProblems(count, digitsA, digitsB);
    state.results = [];
    state.index = 0;
    state.sessionStartedAt = Date.now();
    state.config = { count, digitsA, digitsB, tts: state.tts };
    show('screen-practice');
    showProblem();
  });

  $('submitBtn').addEventListener('click', () => {
    recordAnswer($('answer').value, false);
  });
  $('skipBtn').addEventListener('click', () => recordAnswer(null, true));
  $('endBtn').addEventListener('click', endSession);
  $('againBtn').addEventListener('click', () => {
    show('screen-config');
  });
  $('homeBtn').addEventListener('click', () => show('screen-config'));

  $('answer').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      recordAnswer($('answer').value, false);
    }
  });
}

document.addEventListener('DOMContentLoaded', init);

