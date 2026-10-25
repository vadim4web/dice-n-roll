export const SUITS = [
  { id: 0, symbol: '♠', name: 'Пики', color: '#34483c' },
  { id: 1, symbol: '♥', name: 'Червы', color: '#bf5647' },
  { id: 2, symbol: '♣', name: 'Трефы', color: '#365443' },
  { id: 3, symbol: '♦', name: 'Бубны', color: '#bd7245' },
];
export const COMBINATIONS = [
  { id: 'single', label: 'Совпадение', bonus: 0, rank: 0, description: 'Одна совпавшая верхняя фишка: 25 очков. Совпадает пара чисел в любом порядке; масть на совпадение не влияет.' },
  { id: 'pair', label: 'Пара', bonus: 100, rank: 1, description: 'Две совпавшие верхние фишки с одинаковым верхним числом.' },
  { id: 'two-pair', label: 'Две пары', bonus: 250, rank: 2, description: 'Две разные пары одинаковых верхних чисел среди совпавших фишек.' },
  { id: 'trips', label: 'Тройка', bonus: 400, rank: 3, description: 'Три совпавшие фишки с одинаковым верхним числом.' },
  { id: 'straight', label: 'Стрит', bonus: 600, rank: 4, description: 'Пять последовательных верхних чисел: 1–5 или 2–6. Порядок ячеек не важен.' },
  { id: 'flush', label: 'Флеш', bonus: 800, rank: 5, description: 'Пять совпавших верхних фишек одной масти. Числа могут повторяться.' },
  { id: 'full-house', label: 'Фулл-хаус', bonus: 1100, rank: 6, description: 'Три одинаковых верхних числа и пара другого числа.' },
  { id: 'quads', label: 'Каре', bonus: 1500, rank: 7, description: 'Четыре совпавшие верхние фишки с одинаковым верхним числом.' },
  { id: 'straight-flush', label: 'Стрит-флеш', bonus: 2200, rank: 8, description: 'Пять последовательных верхних чисел одной масти.' },
  { id: 'royal', label: 'Роял-стрит', bonus: 3000, rank: 9, description: 'Костяной аналог роял-флеша: 2–3–4–5–6 одной масти. Карточные номиналы 10–A здесь заменены числами костей.' },
  { id: 'five-kind', label: 'Покер', bonus: 3500, rank: 10, description: 'Пять одинаковых верхних чисел. Для костей повторяющиеся номиналы возможны.' },
  { id: 'full-straight', label: 'Полный стрит', bonus: 4000, rank: 11, description: 'Все шесть верхних чисел 1–2–3–4–5–6 среди совпавших фишек.' },
  { id: 'six-kind', label: 'Шесть одинаковых', bonus: 6000, rank: 12, description: 'Все шесть совпавших верхних фишек имеют одинаковое верхнее число.' },
];
export const PROBABILITY_TARGETS = [
  { id: 'any', label: 'Любое совпадение', description: 'Хотя бы одна новая верхняя фишка совпадёт с нижним рядом.' },
  ...COMBINATIONS.filter(c => c.id !== 'single').map(c => ({ id: c.id, label: c.label, description: `${c.description} Обязательно хотя бы одно новое, ещё не оплаченное совпадение.` })),
];
const combinations = Object.fromEntries(COMBINATIONS.map(c => [c.id, c]));
export function randomDie(random = Math.random) { return Math.min(6, Math.max(1, Math.floor(random() * 6) + 1)); }
export function pairKey(tile) { return tile.a <= tile.b ? `${tile.a}:${tile.b}` : `${tile.b}:${tile.a}`; }
export function tilesMatch(left, right) { return pairKey(left) === pairKey(right); }
export function matchBoard(upper, lower) {
  const matches = [];
  upper.forEach((tile, upperIndex) => {
    const lowerIndices = lower.map((other, i) => tilesMatch(tile, other) ? i : -1).filter(i => i >= 0);
    if (lowerIndices.length) matches.push({ upperIndex, lowerIndices, upperId: tile.id });
  });
  return { matches, cards: matches.map(match => upper[match.upperIndex]) };
}
function rankCounts(cards) { const counts = Array(7).fill(0); cards.forEach(card => counts[card.a]++); return counts; }
function hasRun(counts, start, length) { return Array.from({ length }, (_, i) => counts[start + i]).every(Boolean); }
function rankTarget(counts, target) {
  const groups = counts.slice(1);
  const total = groups.reduce((sum, n) => sum + n, 0);
  switch (target) {
    case 'any': return total > 0;
    case 'single': return total > 0;
    case 'pair': return groups.some(n => n >= 2);
    case 'two-pair': return groups.filter(n => n >= 2).length >= 2;
    case 'trips': return groups.some(n => n >= 3);
    case 'straight': return hasRun(counts, 1, 5) || hasRun(counts, 2, 5);
    case 'full-house': return groups.some((n, i) => n >= 3 && groups.some((m, j) => i !== j && m >= 2));
    case 'quads': return groups.some(n => n >= 4);
    case 'five-kind': return groups.some(n => n >= 5);
    case 'six-kind': return groups.some(n => n >= 6);
    case 'full-straight': return hasRun(counts, 1, 6);
    default: return false;
  }
}
export function hasCombination(cards, target) {
  if (target === 'flush') return SUITS.some(suit => cards.filter(card => card.suit === suit.id).length >= 5);
  if (target === 'straight-flush' || target === 'royal') return SUITS.some(suit => {
    const counts = rankCounts(cards.filter(card => card.suit === suit.id));
    return hasRun(counts, 2, 5) || (target !== 'royal' && hasRun(counts, 1, 5));
  });
  return rankTarget(rankCounts(cards), target);
}
export function evaluateHand(cards) {
  let best = combinations.single;
  for (const combination of COMBINATIONS) if (hasCombination(cards, combination.id) && combination.rank > best.rank) best = combination;
  if (!cards.length) return { id: 'none', label: 'Пока без совпадений', bonus: 0, rank: -1, indices: [], description: 'Совпадение — одинаковая пара чисел сверху и снизу, в любом порядке.' };
  return { ...best, indices: cards.map((_, i) => i) };
}
export function evaluateBoard(upper, lower) { const board = matchBoard(upper, lower); return { ...board, combo: evaluateHand(board.cards) }; }
export function fifoStep(lower, inserted) {
  const free = lower.map((tile, index) => tile.lockRemaining > 0 ? -1 : index).filter(index => index >= 0);
  if (!free.length) return null;
  const result = [...lower];
  for (let i = 0; i < free.length - 1; i++) result[free[i]] = lower[free[i + 1]];
  result[free.at(-1)] = inserted;
  return { lower: result, removed: lower[free[0]], inserted };
}
const probabilityCache = new Map();
function probabilityKey(game, action, target) {
  const awarded = new Set(game.awardedUpperIds || []);
  return `${action}|${target}|${game.upper.map(t => `${t.a},${t.b},${t.suit},${t.lockRemaining},${awarded.has(t.id) ? 1 : 0}`).join(';')}|${game.lower.map(t => `${t.a},${t.b},${t.lockRemaining}`).join(';')}|${game.rollsLeft}|${game.diceCredits}`;
}
function rollSlots(game) {
  const keys = new Set(game.lower.map(pairKey));
  const awarded = new Set(game.awardedUpperIds || []);
  const ranks = Array(7).fill(0);
  for (let a = 1; a <= 6; a++) for (let b = 1; b <= 6; b++) if (keys.has(pairKey({ a, b }))) ranks[a] += 1 / 36;
  const q = ranks.reduce((sum, value) => sum + value, 0);
  return game.upper.map(tile => tile.lockRemaining > 0
    ? { fixed: true, matched: keys.has(pairKey(tile)), rank: tile.a, suit: tile.suit, isNew: !awarded.has(tile.id) }
    : { fixed: false, ranks, q });
}
function rankProbability(slots, target) {
  let states = new Map([['000000|0', { counts: Array(7).fill(0), fresh: false, p: 1 }]]);
  for (const slot of slots) {
    const next = new Map();
    const outcomes = slot.fixed ? [{ rank: slot.matched ? slot.rank : 0, fresh: slot.matched && slot.isNew, p: 1 }]
      : [{ rank: 0, fresh: false, p: 1 - slot.q }, ...slot.ranks.slice(1).map((p, i) => ({ rank: i + 1, fresh: true, p }))];
    for (const state of states.values()) for (const outcome of outcomes) {
      if (outcome.p <= 0) continue;
      const counts = [...state.counts]; if (outcome.rank) counts[outcome.rank]++;
      const fresh = state.fresh || outcome.fresh;
      const key = counts.slice(1).join('') + '|' + Number(fresh);
      if (!next.has(key)) next.set(key, { counts, fresh, p: 0 });
      next.get(key).p += state.p * outcome.p;
    }
    states = next;
  }
  let result = 0;
  for (const state of states.values()) if (state.fresh && rankTarget(state.counts, target)) result += state.p;
  return result;
}
function completeWindow(slots, suit, start, length) {
  let result = 0;
  // Inclusion–exclusion: all ranks in the chosen same-suit window occur.
  for (let mask = 0; mask < 1 << length; mask++) {
    let p = 1, bits = 0;
    for (let i = 0; i < length; i++) if (mask & 1 << i) bits++;
    for (const slot of slots) {
      let excluded = 0;
      for (let i = 0; i < length; i++) if (mask & 1 << i) {
        const rank = start + i;
        excluded += slot.fixed ? Number(slot.matched && slot.suit === suit && slot.rank === rank) : slot.ranks[rank] / 4;
      }
      p *= 1 - excluded;
    }
    result += (bits % 2 ? -1 : 1) * p;
  }
  return result;
}
function suitProbability(slots, target) {
  let probability = 0;
  for (const suit of SUITS) {
    if (target === 'flush') {
      let distribution = [1];
      for (const slot of slots) {
        const p = slot.fixed ? Number(slot.matched && slot.suit === suit.id) : slot.q / 4;
        const next = Array(distribution.length + 1).fill(0);
        distribution.forEach((mass, count) => { next[count] += mass * (1 - p); next[count + 1] += mass * p; });
        distribution = next;
      }
      probability += (distribution[5] || 0) + (distribution[6] || 0);
    } else if (target === 'royal') probability += completeWindow(slots, suit.id, 2, 5);
    else probability += completeWindow(slots, suit.id, 1, 5) + completeWindow(slots, suit.id, 2, 5) - completeWindow(slots, suit.id, 1, 6);
  }
  // No-new outcomes contain only already-awarded fixed cards; subtract them.
  const fixedCards = slots.filter(s => s.fixed && s.matched).map(s => ({ a: s.rank, suit: s.suit }));
  const noNew = slots.some(s => s.fixed && s.matched && s.isNew) ? 0 : slots.reduce((p, s) => p * (s.fixed ? 1 : 1 - s.q), 1);
  if (hasCombination(fixedCards, target)) probability -= noNew;
  return probability;
}
export function probability(game, action = 'roll', target = game.target || 'any') {
  if (game.phase === 'finished' || !PROBABILITY_TARGETS.some(item => item.id === target)) return 0;
  if (action === 'roll' && (game.rollsLeft <= 0 || game.upper.every(tile => tile.lockRemaining > 0))) return 0;
  if (action === 'drop' && (game.diceCredits <= 0 || game.lower.every(tile => tile.lockRemaining > 0))) return 0;
  const key = probabilityKey(game, action, target);
  if (probabilityCache.has(key)) return probabilityCache.get(key);
  let result = 0;
  if (action === 'drop') {
    const awarded = new Set(game.awardedUpperIds || []);
    for (let a = 1; a <= 6; a++) for (let b = 1; b <= 6; b++) {
      const next = fifoStep(game.lower, { id: 'probability-only', a, b, suit: 0, lockRemaining: 0 });
      const board = matchBoard(game.upper, next.lower);
      if (board.cards.some(card => !awarded.has(card.id)) && hasCombination(board.cards, target)) result += 1 / 36;
    }
  } else {
    const slots = rollSlots(game);
    result = ['flush', 'straight-flush', 'royal'].includes(target) ? suitProbability(slots, target) : rankProbability(slots, target);
  }
  result = Math.min(1, Math.max(0, result));
  if (probabilityCache.size > 500) probabilityCache.clear();
  probabilityCache.set(key, result);
  return result;
}
export function ardorIndex(chance) { return Math.min(100, Math.max(0, (1 - chance) * 100)); }
