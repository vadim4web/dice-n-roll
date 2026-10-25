import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import { COMBINATIONS, PROBABILITY_TARGETS, SUITS, evaluateBoard, probability, ardorIndex } from '../game/engine.js';
import { initialGame, restoreGame, rollGame, dropGame, lockTile, unlockTile, analyzeSession, finishGame, setTarget, checkpointGame } from '../game/session.js';

export const STORAGE_KEYS = { current: 'dnr-domino-session-v3', history: 'dnr-domino-history-v3', logs: 'dnr-domino-logs-v3', sound: 'dnr-domino-sound-v3', flow: 'dnr-domino-flow-v3' };
const format = value => new Intl.NumberFormat('ru-RU').format(value || 0);
const percent = value => `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: value > 0 && value < .001 ? 4 : 2 }).format(value * 100)}%`;

export function useDiceGame() {
  const storageAvailable = ref(true);
  function read(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } }
  function write(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; } }
  const game = reactive(restoreGame(read(STORAGE_KEYS.current, null)));
  const existing = read(STORAGE_KEYS.history, []);
  const history = ref((Array.isArray(existing) ? existing : []).filter(item => item && typeof item.sessionId === 'string' && Number.isFinite(item.score)).slice(0, 20));
  const storedLogs = read(STORAGE_KEYS.logs, []);
  const archivedLogs = ref((Array.isArray(storedLogs) ? storedLogs : []).filter(item => item && typeof item.sessionId === 'string' && item.session?.schema === 3).slice(0, 3));
  const soundOn = ref(read(STORAGE_KEYS.sound, false) === true);
  const autoFlow = ref(read(STORAGE_KEYS.flow, false) === true);
  const busy = ref('');
  const modal = ref('');
  const selectedCell = ref(null);
  const probabilityAction = ref('roll');
  const toastMessage = ref('');
  const visualUpper = ref(null);
  const lastGain = ref(game.lastResult?.points || 0);
  const savedAt = ref(null);
  const confetti = ref([]);
  const analysis = ref(null);
  const hasAnalysisLog = computed(() => analysis.value?.sessionId === game.id || archivedLogs.value.some(item => item.sessionId === analysis.value?.sessionId));
  let cosmeticTimer, flowTimer, resolveAnimation, audio, toastTimer, disposed = false;
  const timers = new Set();
  function later(fn, ms) { const id = setTimeout(() => { timers.delete(id); if (!disposed) fn(); }, ms); timers.add(id); return id; }
  const board = computed(() => evaluateBoard(game.upper, game.lower));
  const selectedTarget = computed(() => PROBABILITY_TARGETS.find(target => target.id === game.target) || PROBABILITY_TARGETS[0]);
  const rollProbability = computed(() => probability(game, 'roll', game.target));
  const dropProbability = computed(() => probability(game, 'drop', game.target));
  const chosenProbability = computed(() => probabilityAction.value === 'roll' ? rollProbability.value : dropProbability.value);
  const rawProbability = computed(() => probability(game, probabilityAction.value, 'any'));
  const ardor = computed(() => ardorIndex(chosenProbability.value));
  const canRoll = computed(() => game.phase === 'active' && !busy.value && game.rollsLeft > 0 && game.upper.some(tile => !tile.lockRemaining));
  const canDrop = computed(() => game.phase === 'active' && !busy.value && game.diceCredits > 0 && game.lower.some(tile => !tile.lockRemaining));
  const bestScore = computed(() => history.value.reduce((best, item) => Math.max(best, item.score), 0));
  const activeTile = computed(() => selectedCell.value ? game[selectedCell.value.row]?.[selectedCell.value.index] : null);
  const lockOptions = computed(() => selectedCell.value?.row === 'upper' ? [{ duration: 1, cost: 1, label: 'На 1 Roll' }, { duration: 3, cost: 3, label: 'На 3 Roll' }] : [{ duration: 3, cost: 2, label: 'На 3 Drop' }, { duration: 6, cost: 4, label: 'На 6 Drop' }]);
  const lastResult = computed(() => game.lastResult);
  const rollTitle = computed(() => !game.rollsLeft ? 'Roll закончились. Можно использовать оставшиеся дайсы или завершить сессию.' : !game.upper.some(tile => !tile.lockRemaining) ? 'Все барабаны зафиксированы. Сними хотя бы одну фиксацию бесплатно.' : `Прокрутить все незакреплённые верхние пары. Цена: 1 Roll. Даёт 6 дайсов для Drop и фиксаций. Шанс цели «${selectedTarget.value.label}»: ${percent(rollProbability.value)}.`);
  const dropTitle = computed(() => !game.diceCredits ? 'Нет дайсов. Один Roll добавит 6 дайсов.' : !game.lower.some(tile => !tile.lockRemaining) ? 'Все нижние ячейки зафиксированы. Освободи одну бесплатно.' : `Drop the Dice: за 1 дайс первая незакреплённая нижняя пара уходит влево, остальные сдвигаются по FIFO, новая пара появляется справа. Закреплённые ячейки остаются на своих местах. Шанс цели «${selectedTarget.value.label}»: ${percent(dropProbability.value)}.`);

  function persist(reason = 'action') {
    const now = Date.now();
    let success = write(STORAGE_KEYS.current, game);
    if (game.rolls + game.drops + game.locksPurchased > 0 || game.phase === 'finished') {
      const summary = { ...analyzeSession(game, now), final: game.phase === 'finished', savedAt: now, snapshotReason: reason };
      history.value = [summary, ...history.value.filter(item => item.sessionId !== game.id)].slice(0, 20);
      success = write(STORAGE_KEYS.history, history.value) && success;
      if (game.phase === 'finished') {
        archivedLogs.value = [{ sessionId: game.id, savedAt: now, session: JSON.parse(JSON.stringify(game)), analysis: summary }, ...archivedLogs.value.filter(item => item.sessionId !== game.id)].slice(0, 3);
        let archived = write(STORAGE_KEYS.logs, archivedLogs.value);
        while (!archived && archivedLogs.value.length > 1) { archivedLogs.value = archivedLogs.value.slice(0, -1); archived = write(STORAGE_KEYS.logs, archivedLogs.value); }
        success = archived && success;
      }
    }
    storageAvailable.value = success;
    savedAt.value = now;
  }
  function checkpoint(reason) {
    if (disposed) return;
    if (game.phase === 'active' && game.rolls + game.drops > 0) {
      checkpointGame(game, reason);
    }
    persist(reason);
  }
  function toast(message) { toastMessage.value = message; clearTimeout(toastTimer); toastTimer = later(() => { toastMessage.value = ''; }, 3500); }
  function sound(type) {
    if (!soundOn.value) return;
    try {
      audio ||= new (window.AudioContext || window.webkitAudioContext)();
      audio.resume();
      const notes = type === 'win' ? [440, 554, 659, 880] : type === 'drop' ? [330, 440] : type === 'lock' ? [610] : [170, 240, 190, 320];
      notes.forEach((frequency, i) => {
        const oscillator = audio.createOscillator(), gain = audio.createGain(), time = audio.currentTime + i * .065;
        oscillator.type = type === 'roll' ? 'triangle' : 'sine';
        oscillator.frequency.setValueAtTime(frequency, time);
        gain.gain.setValueAtTime(.0001, time); gain.gain.exponentialRampToValueAtTime(.035, time + .01); gain.gain.exponentialRampToValueAtTime(.0001, time + .15);
        oscillator.connect(gain); gain.connect(audio.destination); oscillator.start(time); oscillator.stop(time + .17);
      });
    } catch { /* Audio is optional. */ }
  }
  function celebrate() {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    confetti.value = Array.from({ length: 36 }, (_, id) => ({ id, style: { left: `${Math.random() * 100}%`, background: ['#ffd47e', '#7edbb2', '#e8a6a0'][id % 3], '--drift': `${Math.random() * 200 - 100}px`, animationDelay: `${Math.random() * .4}s` } }));
    later(() => { confetti.value = []; }, 3000);
  }
  function errorMessage(reason) {
    return { 'finished': 'Сессия завершена. Начни новую.', 'no-rolls': 'Roll закончились. Остались Drop и фиксации.', 'no-dice': 'Не хватает дайсов. Roll добавляет 6.', 'all-locked': 'Все ячейки закреплены. Одну можно освободить бесплатно.', 'invalid-lock': 'Такая фиксация недоступна.', 'already-locked': 'Ячейка уже зафиксирована.' }[reason] || 'Этот ход сейчас недоступен.';
  }
  async function perform(action, { automatic = false } = {}) {
    if (busy.value || game.phase !== 'active') return;
    selectedCell.value = null;
    probabilityAction.value = action;
    const previousUpper = game.upper.map(tile => ({ ...tile }));
    const result = action === 'roll' ? rollGame(game) : dropGame(game, { automatic });
    if (result.type === 'blocked') { toast(errorMessage(result.reason)); return; }
    persist('action');
    busy.value = action;
    lastGain.value = 0;
    sound(action);
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (action === 'roll') {
      visualUpper.value = previousUpper;
      if (!reduced) cosmeticTimer = setInterval(() => { visualUpper.value = previousUpper.map(tile => tile.lockRemaining ? tile : { ...tile, a: Math.floor(Math.random() * 6) + 1, b: Math.floor(Math.random() * 6) + 1 }); }, 65);
    }
    await new Promise(resolve => { resolveAnimation = resolve; later(resolve, reduced ? 30 : action === 'roll' ? 850 : 540); });
    clearInterval(cosmeticTimer); resolveAnimation = null;
    if (disposed) return;
    visualUpper.value = null; busy.value = '';
    lastGain.value = result.points || 0;
    if (result.points > 0) { sound('win'); toast(`${result.combo?.label || 'Совпадение'} · +${format(result.points)} очков`); if (result.points >= 500) celebrate(); }
    else toast('Новых совпадений пока нет. Закрепи пару или смени нижний ряд.');
    if (game.phase === 'finished') showAnalysis();
  }
  function selectCell(cell) {
    if (busy.value || game.phase !== 'active') return;
    selectedCell.value = selectedCell.value?.row === cell.row && selectedCell.value.index === cell.index ? null : cell;
  }
  function purchaseLock(duration) {
    if (!selectedCell.value || busy.value) return;
    const result = lockTile(game, selectedCell.value.row, selectedCell.value.index, duration);
    if (result.type === 'blocked') { toast(errorMessage(result.reason)); return; }
    sound('lock'); persist('lock'); selectedCell.value = null;
    toast(`Фишка зафиксирована. Цена и срок учтены.`);
    if (game.phase === 'finished') showAnalysis();
  }
  function releaseLock() {
    if (!selectedCell.value || busy.value) return;
    unlockTile(game, selectedCell.value.row, selectedCell.value.index);
    persist('unlock'); selectedCell.value = null; toast('Фишка освобождена. Дайсы за фиксацию не возвращаются.');
  }
  function changeTarget(value) { setTarget(game, value); persist('target'); }
  function showAnalysis() { analysis.value = analyzeSession(game); modal.value = 'analysis'; }
  function finish() {
    if (busy.value) return;
    finishGame(game, 'manual'); persist('finish'); selectedCell.value = null; showAnalysis();
  }
  function requestFinish() { if (!busy.value) modal.value = game.phase === 'finished' ? 'analysis' : 'finish'; if (game.phase === 'finished') showAnalysis(); }
  function requestNew() { if (!busy.value) { if (!game.rolls && !game.drops && !game.locksPurchased) startNew(); else modal.value = 'new'; } }
  function startNew() {
    if (busy.value) return;
    if (game.phase === 'active' && game.rolls + game.drops + game.locksPurchased > 0) { finishGame(game, 'restart'); persist('restart'); }
    Object.assign(game, initialGame()); selectedCell.value = null; modal.value = ''; lastGain.value = 0; analysis.value = null; persist('new');
  }
  function toggleSound() { soundOn.value = !soundOn.value; if (!write(STORAGE_KEYS.sound, soundOn.value)) storageAvailable.value = false; sound('lock'); }
  function toggleAutoFlow() {
    autoFlow.value = !autoFlow.value;
    if (!write(STORAGE_KEYS.flow, autoFlow.value)) storageAvailable.value = false;
    toast(autoFlow.value ? 'Автопоток включён: 1 Drop каждые 5 секунд за 1 дайс.' : 'Автопоток остановлен. Теперь нижний ряд меняется только по Drop.');
  }
  function exportLog() {
    const archived = modal.value === 'analysis' && analysis.value?.sessionId !== game.id ? archivedLogs.value.find(item => item.sessionId === analysis.value?.sessionId) : null;
    if (modal.value === 'analysis' && analysis.value?.sessionId !== game.id && !archived) { toast('Подробный журнал этой сессии уже заменён более новыми. Анализ сохранён.'); return; }
    const source = archived?.session || game;
    const data = JSON.stringify({ version: 3, session: source, analysis: archived?.analysis || analyzeSession(game) }, null, 2);
    const url = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = `dice-n-roll-${source.id}.json`; link.click(); later(() => URL.revokeObjectURL(url), 1000);
  }
  function keydown(event) {
    if (modal.value || event.ctrlKey || event.metaKey || event.altKey || event.repeat || ['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target?.tagName)) return;
    if (event.target?.closest?.('button') && (event.code === 'Space' || event.key === 'Enter')) return;
    if (event.code === 'Space' || event.key.toLowerCase() === 'r') { event.preventDefault(); perform('roll'); }
    else if (event.key.toLowerCase() === 'd') { event.preventDefault(); perform('drop'); }
    else if (event.key === 'Escape') selectedCell.value = null;
  }
  function visibility() { if (document.hidden) checkpoint('hidden'); }
  function pagehide() { checkpoint('pagehide'); }
  onMounted(() => {
    document.addEventListener('keydown', keydown); document.addEventListener('visibilitychange', visibility); window.addEventListener('pagehide', pagehide); window.addEventListener('beforeunload', pagehide);
    flowTimer = setInterval(() => { if (autoFlow.value && canDrop.value && !modal.value && !selectedCell.value && !document.hidden) perform('drop', { automatic: true }); }, 5000);
    persist('open');
  });
  onBeforeUnmount(() => { checkpoint('unmount'); disposed = true; clearInterval(cosmeticTimer); clearInterval(flowTimer); timers.forEach(clearTimeout); timers.clear(); resolveAnimation?.(); audio?.close(); document.removeEventListener('keydown', keydown); document.removeEventListener('visibilitychange', visibility); window.removeEventListener('pagehide', pagehide); window.removeEventListener('beforeunload', pagehide); });
  return { game, history, busy, modal, selectedCell, probabilityAction, toastMessage, visualUpper, lastGain, savedAt, storageAvailable, soundOn, autoFlow, confetti, analysis, hasAnalysisLog, board, selectedTarget, rollProbability, dropProbability, chosenProbability, rawProbability, ardor, canRoll, canDrop, bestScore, activeTile, lockOptions, lastResult, rollTitle, dropTitle, COMBINATIONS, PROBABILITY_TARGETS, SUITS, format, percent, perform, selectCell, purchaseLock, releaseLock, changeTarget, showAnalysis, finish, requestFinish, requestNew, startNew, toggleSound, toggleAutoFlow, exportLog };
}
