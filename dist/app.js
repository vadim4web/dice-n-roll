import { scoreDice, bestSelection, randomDie, bustProbability } from './engine.js';

const $ = id => document.getElementById(id);
const icon = name => `<svg aria-hidden="true"><use href="#i-${name}"/></svg>`;
const format = n => new Intl.NumberFormat('ru-RU').format(n);
const faces = { 1: ['center'], 2: ['tl', 'br'], 3: ['tl', 'center', 'br'], 4: ['tl', 'tr', 'bl', 'br'], 5: ['tl', 'tr', 'center', 'bl', 'br'], 6: ['tl', 'tr', 'ml', 'mr', 'bl', 'br'] };
const pips = n => `<span class="pips">${faces[n].map(p => `<span class="pip ${p}"></span>`).join('')}</span>`;
const storage = {
  get(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } },
  set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* Game works with storage disabled. */ } }
};
let records = storage.get('dnr-records-v1', []);
if (!Array.isArray(records)) records = [];
records = records.filter(r => Number.isFinite(r.score) && r.score >= 0 && ['classic', 'blitz'].includes(r.mode));
let muted = storage.get('dnr-muted', true) !== false;
let audio;
let busy = false;
let toastTimer;
let rollInterval;
let game;
let pendingAction;
let modalKind = '';
const risks = new Map();
const risk = n => { if (!risks.has(n)) risks.set(n, bustProbability(n)); return risks.get(n); };

function initialGame(mode = 'classic') {
  return { mode, phase: 'ready', round: 1, total: 0, turn: 0, dice: [3, 1, 5, 2, 6, 4], held: [], selected: [], history: [], successful: 0, rolls: 0, deadline: null, bestRound: 0, saved: false, started: false };
}
function restoreGame() {
  const saved = storage.get('dnr-game-v1', null);
  if (!saved || !['classic', 'blitz'].includes(saved.mode) || !['ready', 'rolled', 'bust', 'finished'].includes(saved.phase) || !Array.isArray(saved.dice) || saved.dice.length !== 6 || !saved.dice.every(v => Number.isInteger(v) && v > 0 && v < 7) || !Array.isArray(saved.selected) || !Array.isArray(saved.held) || !Array.isArray(saved.history) || !Number.isFinite(saved.total) || !Number.isFinite(saved.turn) || !Number.isInteger(saved.round) || saved.round < 1 || !Number.isFinite(saved.successful) || !Number.isFinite(saved.rolls) || !Number.isFinite(saved.bestRound) || ![...saved.held, ...saved.selected].every(i => Number.isInteger(i) && i >= 0 && i < 6) || (saved.mode === 'blitz' && saved.started && !Number.isFinite(saved.deadline))) return initialGame();
  return saved;
}
game = restoreGame();
function persist() { storage.set('dnr-game-v1', game); }
function selectionScore() { return scoreDice(game.selected.map(i => game.dice[i])); }
function bestRecord() { return records.filter(r => r.mode === game.mode).reduce((best, r) => Math.max(best, r.score), 0); }
function playSound(type) {
  if (muted) return;
  try {
    audio ||= new (window.AudioContext || window.webkitAudioContext)();
    audio.resume();
    const notes = type === 'bank' ? [440, 554, 659, 880] : type === 'bust' ? [220, 165, 110] : type === 'select' ? [540] : [220, 310, 260, 420];
    notes.forEach((frequency, i) => {
      const oscillator = audio.createOscillator();
      const gain = audio.createGain();
      const time = audio.currentTime + i * .06;
      oscillator.type = type === 'roll' ? 'triangle' : 'sine';
      oscillator.frequency.setValueAtTime(frequency, time);
      gain.gain.setValueAtTime(.0001, time);
      gain.gain.exponentialRampToValueAtTime(.045, time + .01);
      gain.gain.exponentialRampToValueAtTime(.0001, time + .14);
      oscillator.connect(gain); gain.connect(audio.destination);
      oscillator.start(time); oscillator.stop(time + .16);
    });
  } catch { /* Audio is optional. */ }
}
function toast(message) {
  $('toast').textContent = message;
  $('toast').classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('toast').classList.remove('show'), 2800);
}
function celebrate() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  for (let i = 0; i < 50; i++) {
    const piece = document.createElement('span');
    piece.className = 'confetto';
    piece.style.cssText = `left:${Math.random() * 100}%;background:${['#d1f88b', '#f1eed8', '#e9b77f', '#4f9570'][i % 4]};--drift:${Math.random() * 260 - 130}px;animation-delay:${Math.random() * .55}s;animation-duration:${1.8 + Math.random()}s;transform:rotate(${Math.random() * 180}deg)`;
    $('confetti').appendChild(piece);
    setTimeout(() => piece.remove(), 3600);
  }
}
function drawDice() {
  $('dice-stage').innerHTML = game.dice.map((face, i) => {
    const held = game.held.includes(i), selected = game.selected.includes(i);
    const canSelect = game.phase === 'rolled' && !held && !busy;
    return `<div class="die-wrap" style="--i:${i}"><button class="die${held ? ' held' : ''}${selected ? ' selected' : ''}" data-index="${i}" data-face="${face}" style="--tilt:${[-9, 6, -4, 8, -7, 5][i]}deg" aria-label="Кость ${i + 1}: ${face}${held ? ', сохранена' : ''}" aria-pressed="${selected}" ${canSelect ? '' : 'disabled'}>${pips(face)}</button><span class="die-label${!selected && !held ? ' empty' : ''}">${held ? icon('check') + ' В ИГРЕ' : selected ? icon('check') + ' ВЫБРАНА' : '0' + (i + 1)}</span></div>`;
  }).join('');
}
function setMessage(title, text) { $('message-title').textContent = title; $('message-text').textContent = text; }
function render() {
  const score = selectionScore();
  const rolled = game.phase === 'rolled';
  const valid = rolled && score.valid;
  const prospective = game.turn + (valid ? score.points : 0);
  const finished = game.phase === 'finished';
  drawDice();
  document.querySelectorAll('.mode-tab').forEach(b => { const active = b.dataset.mode === game.mode; b.classList.toggle('active', active); b.setAttribute('aria-pressed', active); });
  $('round-label').textContent = game.mode === 'blitz' ? 'НА ТАЙМЕРЕ' : 'РАУНД';
  $('round-number').textContent = game.mode === 'blitz' ? timeText() : String(game.round).padStart(2, '0');
  $('round-total').textContent = game.mode === 'blitz' ? '' : ' / 10';
  $('round-score').textContent = format(prospective);
  $('total-score').textContent = format(game.total);
  $('personal-best').textContent = format(bestRecord());
  $('best-round').textContent = game.bestRound ? format(game.bestRound) : '—';
  $('lucky-rolls').textContent = game.successful;
  const target = game.total < 1000 ? 1000 : game.total < 3000 ? 3000 : game.total < 5000 ? 5000 : Math.ceil((game.total + 1) / 5000) * 5000;
  const percent = Math.min(100, Math.round(game.total / target * 100));
  $('goal-label').textContent = `${game.total < 1000 ? 'Разогрев до' : 'Следующая цель:'} ${format(target)}`;
  $('goal-percent').textContent = percent + '%';
  $('score-progress').style.width = percent + '%';
  $('roll-count-label').textContent = game.rolls ? `Бросков за игру: ${game.rolls}` : 'Твой следующий любимый перерыв';
  $('bank-button').disabled = busy || !valid;
  $('bank-button').querySelector('span').textContent = valid ? `Забрать ${format(prospective)}` : 'Забрать очки';
  $('roll-button').disabled = busy || (rolled && !valid);
  $('restart').disabled = busy;
  $('roll-label').textContent = busy ? 'Лови удачу…' : finished ? 'Сыграть ещё' : game.phase === 'bust' ? 'Следующий раунд' : rolled ? `Рискнуть ещё${game.held.length + game.selected.length === 6 ? '' : ' · ' + (6 - game.held.length - game.selected.length)}` : 'Бросить кости';
  const riskCount = 6 - game.held.length - game.selected.length || 6;
  const chance = rolled ? risk(riskCount) : 0;
  const riskText = finished ? 'Вот это был перерыв!' : game.phase === 'bust' ? 'Удача взяла паузу' : rolled ? `Риск пустого броска: ${chance}%` : 'Всё начинается с броска';
  $('risk-status').innerHTML = `<span class="live-dot"></span><span>${riskText}</span>`;
  $('risk-status').style.color = rolled && chance >= 40 ? '#edc094' : '';
  if (busy) {
    setMessage('Кости решают…', 'Пусть выпадет что-нибудь красивое.');
    $('selection-text').textContent = 'Бросаем!'; $('selection-score').textContent = '';
  } else if (game.phase === 'ready') {
    setMessage(game.started ? 'Новый раунд. Новая возможность.' : 'Большие комбо начинаются с малого', game.started ? 'Сохранённые очки уже в безопасности. Поехали дальше?' : 'Бросай кости. Удаче тоже нужен повод.');
    $('selection-text').textContent = 'Кликни по костям, чтобы оставить комбинацию'; $('selection-score').textContent = '';
  } else if (game.phase === 'bust') {
    setMessage('Ой. Удача ушла за кофе.', 'Очки раунда сгорели. Общий счёт в безопасности.');
    $('selection-text').textContent = 'Ни одной комбинации. Следующий точно будет лучше?'; $('selection-score').textContent = '';
  } else if (finished) {
    setMessage('Красиво сыграно!', 'Рекорд сам себя не побьёт. Может, ещё одну?');
    $('selection-text').textContent = 'Игра завершена'; $('selection-score').textContent = '';
  } else {
    const all = game.held.length + game.selected.length === 6;
    setMessage(valid ? all ? 'Горячие кости! Вот это разгон.' : score.points >= 500 ? `${score.label} Удача на твоей стороне.` : 'Уже неплохо. Но можно больше.' : game.selected.length ? 'Не все кости дают очки' : 'Выбери свою удачную комбинацию', valid ? all ? 'Все кости дают очки — можешь бросить все шесть снова.' : 'Забрать своё или проверить удачу ещё раз?' : 'Единицы, пятёрки или от трёх одинаковых.');
    $('selection-text').textContent = valid ? `Выбрано костей: ${game.selected.length}${all ? ' · Все шесть снова в игре' : ''}` : game.selected.length ? 'Убери лишние кости или собери тройку' : 'Кликни по костям с очками';
    $('selection-score').textContent = valid ? `+${format(score.points)}` : '';
  }
  $('tip-text').textContent = rolled && chance >= 40 ? `Осталось ${riskCount} ${riskCount === 1 ? 'кость' : 'кости'}. Вероятность потерять очки раунда — ${chance}%. Забрать своё тоже красивый ход.` : 'Но иногда лучше забрать своё. После пустого броска очки раунда сгорят.';
  $('history-count').textContent = game.mode === 'classic' ? `${game.history.length} / 10` : `${game.history.length} раундов`;
  if (game.history.length) $('round-history').innerHTML = game.history.slice(-3).reverse().map(r => `<div class="history-row${r.bust ? ' bust' : ''}"><span class="history-index">${String(r.round).padStart(2, '0')}</span><span class="history-name">${r.bust ? 'Не в этот раз' : r.points >= 1000 ? 'Мощный раунд' : 'В копилку'}</span><strong>${r.bust ? '0' : '+' + format(r.points)}</strong></div>`).join('');
  else $('round-history').innerHTML = `<div class="history-empty"><div class="history-empty-dice">${icon('dice')}</div><p>Пока чистый лист</p><span>Самое интересное впереди</span></div>`;
  document.querySelectorAll('.sound-button').forEach(b => { b.innerHTML = icon(muted ? 'mute' : 'sound'); b.setAttribute('aria-label', muted ? 'Включить звук' : 'Выключить звук'); b.title = muted ? 'Включить звук' : 'Выключить звук'; });
}
function timeText() {
  const seconds = game.deadline ? Math.max(0, Math.ceil((game.deadline - Date.now()) / 1000)) : 90;
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
function expired() { return game.mode === 'blitz' && game.deadline && Date.now() >= game.deadline; }
function addHistory(points, bust = false) {
  game.history.push({ round: game.round, points, bust });
  game.bestRound = Math.max(game.bestRound, points);
}
function nextRound() {
  if (game.mode === 'classic' && game.round >= 10) { finishGame(); return false; }
  game.round++;
  game.turn = 0; game.held = []; game.selected = []; game.phase = 'ready';
  return true;
}
async function roll() {
  if (busy) return;
  if (game.phase === 'finished') { newGame(game.mode); return; }
  if (expired()) { finishGame(); return; }
  if (game.phase === 'bust' && !nextRound()) return;
  if (game.phase === 'rolled') {
    const score = selectionScore();
    if (!score.valid) { toast('Сначала выбери кости с очками'); return; }
    game.turn += score.points;
    game.held.push(...game.selected);
    if (game.held.length === 6) { game.held = []; toast('Горячие кости! Все шесть снова в игре 🔥'); }
  }
  game.started = true;
  if (game.mode === 'blitz' && !game.deadline) game.deadline = Date.now() + 90000;
  game.selected = [];
  busy = true;
  render();
  $('dice-stage').classList.add('rolling');
  playSound('roll');
  // Cosmetic values are separate from the final random draw.
  rollInterval = setInterval(() => {
    $('dice-stage').querySelectorAll('.die:not(.held)').forEach(el => { el.innerHTML = pips(randomDie()); });
  }, 75);
  await new Promise(resolve => setTimeout(resolve, matchMedia('(prefers-reduced-motion: reduce)').matches ? 80 : 680));
  clearInterval(rollInterval);
  $('dice-stage').classList.remove('rolling');
  game.dice = game.dice.map((v, i) => game.held.includes(i) ? v : randomDie());
  busy = false;
  if (expired()) { finishGame(); return; }
  const available = game.dice.map((_, i) => i).filter(i => !game.held.includes(i));
  const best = bestSelection(available.map(i => game.dice[i]));
  game.rolls++;
  if (!best.points) {
    game.phase = 'bust'; game.turn = 0; game.selected = [];
    addHistory(0, true);
    playSound('bust');
    $('game-table').classList.add('bust-flash');
    setTimeout(() => $('game-table').classList.remove('bust-flash'), 800);
    if (game.mode === 'classic' && game.round === 10) { finishGame(); return; }
  } else {
    game.phase = 'rolled'; game.selected = best.indices.map(i => available[i]); game.successful++;
    if (best.points >= 1000) { playSound('bank'); toast(`${best.label} +${format(best.points)} очков ✦`); }
  }
  persist(); render();
}
function toggleDie(i) {
  if (busy || game.phase !== 'rolled' || game.held.includes(i)) return;
  if (expired()) { finishGame(); return; }
  game.selected = game.selected.includes(i) ? game.selected.filter(v => v !== i) : [...game.selected, i];
  playSound('select'); persist(); render();
}
function bank() {
  if (busy || game.phase !== 'rolled') return;
  if (expired()) { finishGame(); return; }
  const score = selectionScore();
  if (!score.valid) return;
  const earned = game.turn + score.points;
  const previousTotal = game.total;
  game.total += earned;
  addHistory(earned);
  game.turn = 0; game.selected = []; game.held = [];
  playSound('bank');
  if (earned >= 1000) celebrate();
  toast(`+${format(earned)} в копилку. ${earned >= 1000 ? 'Это было красиво!' : 'Твои очки в безопасности.'}`);
  if (previousTotal < 3000 && game.total >= 3000) celebrate();
  if (nextRound()) { persist(); render(); }
  $('total-score').classList.remove('score-pulse');
  requestAnimationFrame(() => $('total-score').classList.add('score-pulse'));
}
function finishGame() {
  if (game.phase === 'finished') return;
  const wasRecord = game.total > bestRecord();
  game.phase = 'finished'; game.selected = []; game.turn = 0;
  if (!game.saved) {
    if (game.started) {
      records.push({ score: game.total, mode: game.mode, date: new Date().toISOString(), bestRound: game.bestRound });
      records.sort((a, b) => b.score - a.score);
      records = records.slice(0, 30);
      storage.set('dnr-records-v1', records);
    }
    game.saved = true;
  }
  persist(); render();
  showResults(wasRecord);
  if (wasRecord) { celebrate(); playSound('bank'); }
}
function newGame(mode) {
  game = initialGame(mode); busy = false;
  persist(); closeModal(); render();
}
function requestNewGame(mode) {
  if (busy) return;
  if (!game.started || game.phase === 'finished') { newGame(mode); return; }
  pendingAction = () => newGame(mode);
  openModal('confirm', `<h2>${mode !== game.mode ? 'Сменим темп?' : 'Начнём с чистого листа?'}</h2><p>Текущая игра завершится без сохранения в рекорды. Начать ${mode === 'classic' ? 'классическую игру на 10 раундов' : 'блиц на 90 секунд'}?</p><button class="modal-primary" id="confirm-new">Начать новую игру</button><button class="modal-secondary" id="cancel-new">Продолжить текущую</button>`);
  $('confirm-new').onclick = () => pendingAction?.();
  $('cancel-new').onclick = closeModal;
}
function openModal(kind, content) {
  modalKind = kind;
  $('modal-content').innerHTML = content;
  if (!$('modal').open) $('modal').showModal();
}
function closeModal() { $('modal').close(); modalKind = ''; }
function showRules() {
  openModal('rules', `<h2>Удача любит<br>ещё один бросок<span style="color:var(--lime)">.</span></h2><p>Собери больше очков за 10 раундов. Или выбери блиц и успей за 90 секунд.</p><div class="rules-steps"><div class="rule-step"><span class="step-number">1</span><div><strong>Бросай и выбирай</strong><p>Единицы, пятёрки и от трёх одинаковых приносят очки. Лучшая комбинация выделяется автоматически — её можно изменить кликом.</p></div></div><div class="rule-step"><span class="step-number">2</span><div><strong>Забрать или рискнуть?</strong><p>Забери очки в общий счёт и начни новый раунд. Или оставь выбранные кости и брось остальные, чтобы увеличить очки раунда.</p></div></div><div class="rule-step"><span class="step-number">3</span><div><strong>Пустой бросок = всё сгорело</strong><p>Нет комбинаций? Очки текущего раунда пропадают. Сохранённый общий счёт остаётся. Если все шесть костей дали очки, можно бросить их все снова!</p></div></div></div><div class="rules-table"><span>Каждая единица / пятёрка</span><b>100 / 50</b><span>Три одинаковых 2–6</span><b>число × 100</b><span>Три единицы</span><b>1 000</b><span>Каждая следующая одинаковая</span><b>удваивает тройку</b><span>Стрит 1–6 / три пары</span><b>1 500</b></div><p style="font-size:10px;margin-top:18px">Комбинации собираются в пределах одного броска. В блице таймер идёт и при открытых правилах; по окончании незабранные очки сгорают. Звук: кнопка динамика в меню или клавиша M.</p><button class="modal-primary" id="rules-done">Понятно. Погнали!</button>`);
  $('rules-done').onclick = closeModal;
}
function showRecords() {
  const entries = records.filter(r => r.mode === game.mode).slice(0, 5);
  openModal('records', `<h2>Твоя полоса удачи<span style="color:var(--lime)">.</span></h2><p>${game.mode === 'classic' ? 'Классика · 10 раундов' : 'Блиц · 90 секунд'} · Личные рекорды в этом браузере</p>${entries.length ? entries.map((r, i) => `<div class="record-item"><span class="rank">${i + 1}</span><div><p>${i === 0 ? 'Планка, которую стоит поднять' : 'Хорошая была игра'}</p><small>${new Date(r.date).toLocaleDateString('ru-RU')}</small></div><strong>${format(r.score)}</strong></div>`).join('') : `<div class="results-hero"><div class="results-icon">✧</div><p>Первый рекорд пока ждёт тебя.<br>Закончи игру — и он появится здесь.</p></div>`}<button class="modal-primary" id="records-done">Вернуться к костям</button>`);
  $('records-done').onclick = closeModal;
}
function showResults(wasRecord = false) {
  openModal('results', `<div class="results-hero"><div class="results-icon">${icon('cup')}</div><h2>${game.total >= 3000 ? 'Удача тебя запомнит.' : 'Ну как тут остановиться?'}</h2><p>${game.mode === 'blitz' ? 'Время вышло' : 'Все 10 раундов позади'}. Вот твой результат:</p><div class="results-score">${format(game.total)}</div><span class="eyebrow" style="justify-content:center">ОЧКОВ В КОПИЛКЕ</span>${wasRecord ? '<div class="new-record">✦ Новый личный рекорд!</div>' : ''}<div class="results-details"><div><strong>${format(game.bestRound)}</strong><span>ЛУЧШИЙ РАУНД</span></div><div><strong>${game.successful}</strong><span>УДАЧНЫХ БРОСКОВ</span></div></div></div><button class="modal-primary" id="play-again">Ну ещё один раз ${icon('arrow')}</button><button class="modal-secondary" id="result-records">Посмотреть рекорды</button>`);
  $('play-again').onclick = () => newGame(game.mode);
  $('result-records').onclick = showRecords;
}
function toggleSound() { muted = !muted; storage.set('dnr-muted', muted); playSound('select'); render(); toast(muted ? 'Играем тихо' : 'Звук включён ♪'); }

$('dice-stage').addEventListener('click', e => { const button = e.target.closest('[data-index]'); if (button) toggleDie(Number(button.dataset.index)); });
$('roll-button').onclick = roll;
$('bank-button').onclick = bank;
$('restart').onclick = () => requestNewGame(game.mode);
$('nav-play').onclick = () => { closeModal(); $('roll-button').focus(); };
$('close-modal').onclick = closeModal;
$('modal').addEventListener('click', e => { if (e.target === $('modal')) { const r = $('modal').getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) closeModal(); } });
$('modal').addEventListener('close', () => { modalKind = ''; });
document.querySelectorAll('[data-dialog]').forEach(b => b.onclick = () => b.dataset.dialog === 'rules' ? showRules() : showRecords());
document.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => { if (b.dataset.mode !== game.mode) requestNewGame(b.dataset.mode); });
document.querySelectorAll('.sound-button').forEach(b => b.onclick = toggleSound);
document.querySelectorAll('.tiny-die').forEach(d => { d.innerHTML = pips(Number(d.dataset.face)); });
document.addEventListener('keydown', e => {
  if ($('modal').open || e.ctrlKey || e.metaKey || e.altKey || e.repeat || ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
  // Preserve normal Enter/Space activation when a button has keyboard focus.
  if (e.target.closest('button') && (e.code === 'Space' || e.key === 'Enter')) return;
  if (e.code === 'Space') { e.preventDefault(); roll(); }
  else if (e.key === 'Enter') { e.preventDefault(); bank(); }
  else if (/^[1-6]$/.test(e.key)) toggleDie(Number(e.key) - 1);
  else if (e.key.toLowerCase() === 'm' || e.key.toLowerCase() === 'ь') toggleSound();
});
setInterval(() => {
  if (game.mode !== 'blitz' || !game.deadline || game.phase === 'finished') return;
  $('round-number').textContent = timeText();
  $('round-number').style.color = game.deadline - Date.now() < 15000 ? '#f0ba8f' : '';
  if (expired() && !busy) finishGame();
}, 250);
document.addEventListener('visibilitychange', () => { if (!document.hidden && expired() && !busy && game.phase !== 'finished') finishGame(); });
render();
if (expired() && game.phase !== 'finished') finishGame();
