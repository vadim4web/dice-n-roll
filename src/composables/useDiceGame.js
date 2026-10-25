import { computed, onMounted, onBeforeUnmount, reactive, ref, watch } from 'vue';
import { bustProbability } from '../game/engine.js';
import { initialGame, restoreGame, selectionScore, isExpired, finishGame, toggleDie as selectDie, rollGame, bankGame } from '../game/session.js';

const storage = {
  get(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } },
  set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* Storage is optional. */ } },
};
const format = n => new Intl.NumberFormat('ru-RU').format(n);
const riskCache = new Map();
const probability = count => { if (!riskCache.has(count)) riskCache.set(count, bustProbability(count)); return riskCache.get(count); };

export function useDiceGame() {
  const game = reactive(restoreGame(storage.get('dnr-game-v1', null)));
  const existingRecords = storage.get('dnr-records-v1', []);
  const records = ref((Array.isArray(existingRecords) ? existingRecords : []).filter(r => Number.isFinite(r.score) && r.score >= 0 && ['classic', 'blitz'].includes(r.mode) && !Number.isNaN(Date.parse(r.date))).sort((a, b) => b.score - a.score));
  const muted = ref(storage.get('dnr-muted', true) !== false);
  const busy = ref(false);
  const modal = ref('');
  const toastMessage = ref('');
  const confetti = ref([]);
  const clock = ref(Date.now());
  const bustFlash = ref(false);
  const newRecord = ref(false);
  const pendingMode = ref('classic');
  const visualDice = ref(null);
  const rollingHeld = ref([]);
  const heldDice = computed(() => busy.value ? rollingHeld.value : game.held);
  let soundContext, toastTimer, clockTimer, animationTimer, finishAnimation, disposed = false;
  const timeouts = new Set();
  function later(fn, delay) {
    const timer = setTimeout(() => { timeouts.delete(timer); if (!disposed) fn(); }, delay);
    timeouts.add(timer); return timer;
  }
  const persist = () => storage.set('dnr-game-v1', game);
  watch(game, persist, { deep: true, flush: 'sync' });
  watch(muted, value => storage.set('dnr-muted', value));
  const selection = computed(() => selectionScore(game));
  const validSelection = computed(() => game.phase === 'rolled' && selection.value.valid);
  const prospective = computed(() => game.turn + (validSelection.value ? selection.value.points : 0));
  const recordList = computed(() => records.value.filter(r => r.mode === game.mode).slice(0, 5));
  const bestRecord = computed(() => recordList.value[0]?.score || 0);
  const nextDiceCount = computed(() => 6 - game.held.length - game.selected.length || 6);
  const chance = computed(() => game.phase === 'rolled' ? probability(nextDiceCount.value) : 0);
  const goal = computed(() => game.total < 1000 ? 1000 : game.total < 3000 ? 3000 : game.total < 5000 ? 5000 : Math.ceil((game.total + 1) / 5000) * 5000);
  const progress = computed(() => Math.min(100, Math.round(game.total / goal.value * 100)));
  const time = computed(() => {
    const seconds = game.deadline ? Math.max(0, Math.ceil((game.deadline - clock.value) / 1000)) : 90;
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  });
  const urgent = computed(() => game.mode === 'blitz' && game.deadline && game.deadline - clock.value < 15000);
  const allDice = computed(() => game.held.length + game.selected.length === 6);
  const rollLabel = computed(() => busy.value ? 'Лови удачу…' : game.phase === 'finished' ? 'Сыграть ещё' : game.phase === 'bust' ? 'Следующий раунд' : game.phase === 'rolled' ? `Рискнуть ещё${allDice.value ? '' : ' · ' + nextDiceCount.value}` : 'Бросить кости');
  const riskText = computed(() => game.phase === 'finished' ? 'Вот это был перерыв!' : game.phase === 'bust' ? 'Удача взяла паузу' : game.phase === 'rolled' ? `Риск пустого броска: ${chance.value}%` : 'Всё начинается с броска');
  const messages = computed(() => {
    if (busy.value) return { title: 'Кости решают…', text: 'Пусть выпадет что-нибудь красивое.', selection: 'Бросаем!' };
    if (game.phase === 'ready') return { title: game.started ? 'Новый раунд. Новая возможность.' : 'Большие комбо начинаются с малого', text: game.started ? 'Сохранённые очки уже в безопасности. Поехали дальше?' : 'Бросай кости. Удаче тоже нужен повод.', selection: 'Кликни по костям, чтобы оставить комбинацию' };
    if (game.phase === 'bust') return { title: 'Ой. Удача ушла за кофе.', text: 'Очки раунда сгорели. Общий счёт в безопасности.', selection: 'Ни одной комбинации. Следующий точно будет лучше?' };
    if (game.phase === 'finished') return { title: 'Красиво сыграно!', text: 'Рекорд сам себя не побьёт. Может, ещё одну?', selection: 'Игра завершена' };
    return {
      title: validSelection.value ? allDice.value ? 'Горячие кости! Вот это разгон.' : selection.value.points >= 500 ? `${selection.value.label} Удача на твоей стороне.` : 'Уже неплохо. Но можно больше.' : game.selected.length ? 'Не все кости дают очки' : 'Выбери свою удачную комбинацию',
      text: validSelection.value ? allDice.value ? 'Все кости дают очки — можешь бросить все шесть снова.' : 'Забрать своё или проверить удачу ещё раз?' : 'Единицы, пятёрки или от трёх одинаковых.',
      selection: validSelection.value ? `Выбрано костей: ${game.selected.length}${allDice.value ? ' · Все шесть снова в игре' : ''}` : game.selected.length ? 'Убери лишние кости или собери тройку' : 'Кликни по костям с очками',
    };
  });
  const tip = computed(() => game.phase === 'rolled' && chance.value >= 40 ? `Осталось ${nextDiceCount.value} ${nextDiceCount.value === 1 ? 'кость' : 'кости'}. Вероятность потерять очки раунда — ${chance.value}%. Забрать своё тоже красивый ход.` : 'Но иногда лучше забрать своё. После пустого броска очки раунда сгорят.');

  function sound(type) {
    if (muted.value) return;
    try {
      soundContext ||= new (window.AudioContext || window.webkitAudioContext)();
      soundContext.resume();
      const notes = type === 'bank' ? [440, 554, 659, 880] : type === 'bust' ? [220, 165, 110] : type === 'select' ? [540] : [220, 310, 260, 420];
      notes.forEach((frequency, i) => {
        const oscillator = soundContext.createOscillator(), gain = soundContext.createGain(), start = soundContext.currentTime + i * .06;
        oscillator.type = type === 'roll' ? 'triangle' : 'sine';
        oscillator.frequency.setValueAtTime(frequency, start);
        gain.gain.setValueAtTime(.0001, start); gain.gain.exponentialRampToValueAtTime(.045, start + .01); gain.gain.exponentialRampToValueAtTime(.0001, start + .14);
        oscillator.connect(gain); gain.connect(soundContext.destination); oscillator.start(start); oscillator.stop(start + .16);
      });
    } catch { /* Audio is optional. */ }
  }
  function toast(message) { toastMessage.value = message; clearTimeout(toastTimer); toastTimer = later(() => { toastMessage.value = ''; }, 2800); }
  function celebrate() {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    confetti.value = Array.from({ length: 50 }, (_, i) => ({ id: i, style: { left: `${Math.random() * 100}%`, background: ['#d1f88b', '#f1eed8', '#e9b77f', '#4f9570'][i % 4], '--drift': `${Math.random() * 260 - 130}px`, animationDelay: `${Math.random() * .55}s`, animationDuration: `${1.8 + Math.random()}s` } }));
    later(() => { confetti.value = []; }, 3600);
  }
  function complete() {
    newRecord.value = game.total > bestRecord.value;
    finishGame(game);
    if (!game.saved) {
      if (game.started) {
        records.value = [...records.value, { score: game.total, mode: game.mode, date: new Date().toISOString(), bestRound: game.bestRound }].sort((a, b) => b.score - a.score).slice(0, 30);
        storage.set('dnr-records-v1', records.value);
      }
      game.saved = true;
    }
    modal.value = 'results';
    if (newRecord.value) { celebrate(); sound('bank'); }
  }
  function expire() {
    if (game.phase !== 'finished' && isExpired(game)) { complete(); return true; }
    return false;
  }
  async function roll() {
    if (busy.value) return;
    if (game.phase === 'finished') { newGame(game.mode); return; }
    if (expire()) return;
    if (game.phase === 'rolled' && !validSelection.value) { toast('Сначала выбери кости с очками'); return; }
    // Start the clock on the first action; opening a dialog never pauses blitz.
    if (game.mode === 'blitz' && !game.deadline) game.deadline = Date.now() + 90000;
    const kept = game.phase === 'rolled' ? [...game.held, ...game.selected] : [];
    rollingHeld.value = kept.length === 6 ? [] : kept;
    busy.value = true;
    sound('roll');
    animationTimer = setInterval(() => { visualDice.value = game.dice.map((v, i) => rollingHeld.value.includes(i) ? v : Math.floor(Math.random() * 6) + 1); }, 75);
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    await new Promise(resolve => { finishAnimation = resolve; later(resolve, reducedMotion ? 80 : 680); });
    clearInterval(animationTimer); finishAnimation = null;
    if (disposed) return;
    visualDice.value = null;
    busy.value = false;
    if (expire()) return;
    const result = rollGame(game);
    if (result.type === 'finished') { complete(); return; }
    if (result.type === 'bust') { sound('bust'); bustFlash.value = true; later(() => { bustFlash.value = false; }, 800); }
    if (result.hotDice) toast('Горячие кости! Все шесть снова в игре 🔥');
    if (result.points >= 1000) { sound('bank'); toast(`${result.label} +${format(result.points)} очков ✦`); }
  }
  function bank() {
    if (busy.value || expire()) return;
    const result = bankGame(game);
    if (result.earned) { sound('bank'); toast(`+${format(result.earned)} в копилку. ${result.earned >= 1000 ? 'Это было красиво!' : 'Твои очки в безопасности.'}`); if (result.earned >= 1000) celebrate(); }
    if (result.type === 'finished') complete();
  }
  function toggleDie(index) {
    if (busy.value || expire()) return;
    if (selectDie(game, index)) sound('select');
  }
  function newGame(mode = game.mode) {
    if (busy.value) return;
    Object.assign(game, initialGame(mode));
    visualDice.value = null; newRecord.value = false; bustFlash.value = false;
    modal.value = ''; clock.value = Date.now();
  }
  function requestNewGame(mode = game.mode) {
    if (busy.value) return;
    if (!game.started || game.phase === 'finished') { newGame(mode); return; }
    pendingMode.value = mode; modal.value = 'confirm';
  }
  function toggleSound() { muted.value = !muted.value; sound('select'); toast(muted.value ? 'Играем тихо' : 'Звук включён ♪'); }
  function keydown(event) {
    if (modal.value || event.ctrlKey || event.metaKey || event.altKey || event.repeat || ['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target?.tagName)) return;
    if (event.target?.closest?.('button') && (event.code === 'Space' || event.key === 'Enter')) return;
    if (event.code === 'Space') { event.preventDefault(); roll(); }
    else if (event.key === 'Enter') { event.preventDefault(); bank(); }
    else if (/^[1-6]$/.test(event.key)) toggleDie(Number(event.key) - 1);
    else if (['m', 'ь'].includes(event.key.toLowerCase())) toggleSound();
  }
  function visibility() { if (!document.hidden) { clock.value = Date.now(); expire(); } }
  onMounted(() => {
    clockTimer = setInterval(() => { clock.value = Date.now(); if (!busy.value) expire(); }, 250);
    document.addEventListener('keydown', keydown);
    document.addEventListener('visibilitychange', visibility);
    expire();
  });
  onBeforeUnmount(() => {
    disposed = true;
    clearInterval(clockTimer); clearInterval(animationTimer);
    timeouts.forEach(clearTimeout); timeouts.clear(); finishAnimation?.();
    document.removeEventListener('keydown', keydown);
    document.removeEventListener('visibilitychange', visibility);
    soundContext?.close();
  });
  return { game, muted, busy, modal, toastMessage, confetti, bustFlash, newRecord, pendingMode, visualDice, heldDice, selection, validSelection, prospective, recordList, bestRecord, nextDiceCount, chance, goal, progress, time, urgent, rollLabel, riskText, messages, tip, format, roll, bank, toggleDie, newGame, requestNewGame, toggleSound };
}
