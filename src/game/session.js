import { randomDie, evaluateBoard, matchBoard, fifoStep, probability, ardorIndex, PROBABILITY_TARGETS } from './engine.js';

export const GAME_VERSION = 3;
export const LOCK_OPTIONS = {
  upper: [{ duration: 1, cost: 1, label: '1 Roll' }, { duration: 3, cost: 3, label: '3 Roll' }],
  lower: [{ duration: 3, cost: 2, label: '3 Drop' }, { duration: 6, cost: 4, label: '6 Drop' }],
};
const validNumber = value => Number.isFinite(value) && value >= 0;
function makeTile(game, random = Math.random, values = null) {
  return { id: `${game.id}-t${game.nextTileId++}`, a: values?.[0] ?? randomDie(random), b: values?.[1] ?? randomDie(random), suit: values?.[2] ?? Math.min(3, Math.floor(random() * 4)), lockRemaining: 0 };
}
export function initialGame({ random = Math.random, now = Date.now() } = {}) {
  const game = { schema: GAME_VERSION, id: `dnr-${now}-${Math.floor(random() * 1e8)}`, phase: 'active', upper: [], lower: [], nextTileId: 0, nextEventId: 0, eventsDropped: 0, rollsLeft: 50, diceCredits: 12, total: 0, rolls: 0, drops: 0, locksPurchased: 0, spentOnLocks: 0, startedAt: now, updatedAt: now, endedAt: null, events: [], awardedUpperIds: [], target: 'any', lastResult: null, finishReason: null, metrics: { actions: 0, wins: 0, probabilitySum: 0, ardorSum: 0, dryStreak: 0, longestDryStreak: 0, automaticDrops: 0, combinationCounts: {} } };
  // A demonstration of cross-row links; real actions use independent fair draws.
  const top = [[3, 1, 0], [5, 1, 1], [6, 4, 2], [1, 5, 0], [2, 6, 3], [2, 5, 2]];
  const bottom = [[2, 3, 2], [1, 5, 1], [2, 3, 0], [2, 5, 3], [3, 4, 1], [5, 1, 2]];
  game.upper = top.map(values => makeTile(game, random, values));
  game.lower = bottom.map(values => makeTile(game, random, values));
  game.awardedUpperIds = matchBoard(game.upper, game.lower).cards.map(card => card.id);
  game.lastResult = { type: 'ready', points: 0, newMatches: [], combo: evaluateBoard(game.upper, game.lower).combo, probability: null, ardor: null };
  return game;
}
function validTile(tile) { return tile && typeof tile.id === 'string' && Number.isInteger(tile.a) && tile.a >= 1 && tile.a <= 6 && Number.isInteger(tile.b) && tile.b >= 1 && tile.b <= 6 && Number.isInteger(tile.suit) && tile.suit >= 0 && tile.suit < 4 && Number.isInteger(tile.lockRemaining) && tile.lockRemaining >= 0 && tile.lockRemaining <= 6; }
export function restoreGame(saved, options = {}) {
  // Compatible with schema3 sessions saved before optional automatic FIFO existed.
  if (saved?.schema === GAME_VERSION && saved.metrics && saved.metrics.automaticDrops === undefined) saved = { ...saved, metrics: { ...saved.metrics, automaticDrops: 0 } };
  if (!saved || saved.schema !== GAME_VERSION || typeof saved.id !== 'string' || !['active', 'finished'].includes(saved.phase)
    || !Array.isArray(saved.upper) || saved.upper.length !== 6 || !saved.upper.every(validTile)
    || !Array.isArray(saved.lower) || saved.lower.length !== 6 || !saved.lower.every(validTile)
    || new Set([...saved.upper, ...saved.lower].map(tile => tile.id)).size !== 12
    || !['nextTileId', 'nextEventId', 'eventsDropped', 'rollsLeft', 'diceCredits', 'total', 'rolls', 'drops', 'locksPurchased', 'spentOnLocks', 'startedAt', 'updatedAt'].every(key => validNumber(saved[key]))
    || !Number.isInteger(saved.nextTileId) || saved.nextTileId < 12 || !Number.isInteger(saved.rollsLeft) || saved.rollsLeft > 50
    || !Number.isInteger(saved.nextEventId) || !Number.isInteger(saved.eventsDropped)
    || !Number.isInteger(saved.diceCredits) || saved.diceCredits > 312 || !Array.isArray(saved.events) || saved.events.length > 500
    || saved.nextEventId !== saved.events.length + saved.eventsDropped
    || !saved.events.every((event, index) => event && event.id === `${saved.id}-e${saved.eventsDropped + index}` && typeof event.type === 'string' && validNumber(event.at))
    || !Array.isArray(saved.awardedUpperIds) || !saved.awardedUpperIds.every(id => typeof id === 'string') || saved.awardedUpperIds.length > 312
    || !PROBABILITY_TARGETS.some(target => target.id === saved.target)
    || !saved.metrics || !['actions', 'wins', 'probabilitySum', 'ardorSum', 'dryStreak', 'longestDryStreak'].every(key => validNumber(saved.metrics[key])) || !saved.metrics.combinationCounts || typeof saved.metrics.combinationCounts !== 'object'
    || !Number.isInteger(saved.metrics.automaticDrops) || saved.metrics.automaticDrops < 0 || saved.metrics.automaticDrops > saved.drops
    || (saved.endedAt !== null && !validNumber(saved.endedAt))) return initialGame(options);
  return saved;
}
function event(game, type, now, data = {}) {
  game.updatedAt = now;
  const entry = { id: `${game.id}-e${game.nextEventId++}`, type, at: now, target: game.target, points: data.points || 0, total: game.total, rollsLeft: game.rollsLeft, diceCredits: game.diceCredits, ...data };
  game.events.push(entry);
  if (game.events.length > 500) { const removed = game.events.length - 500; game.events.splice(0, removed); game.eventsDropped += removed; }
  return entry;
}
function blocked(reason) { return { type: 'blocked', reason, points: 0 }; }
function resolveOutcome(game, type, now, chance, details = {}) {
  const board = evaluateBoard(game.upper, game.lower);
  const awarded = new Set(game.awardedUpperIds);
  const newMatches = board.matches.filter(match => !awarded.has(match.upperId));
  newMatches.forEach(match => awarded.add(match.upperId));
  // Only IDs still on the board need retaining; replaced tiles can never return.
  game.awardedUpperIds = game.upper.filter(tile => awarded.has(tile.id)).map(tile => tile.id);
  const points = newMatches.length ? newMatches.length * 25 + board.combo.bonus : 0;
  game.total += points;
  game.metrics.actions++;
  game.metrics.probabilitySum += chance;
  game.metrics.ardorSum += ardorIndex(chance);
  if (type === 'drop' && details.automatic) game.metrics.automaticDrops++;
  if (points > 0) {
    game.metrics.wins++; game.metrics.dryStreak = 0;
    game.metrics.combinationCounts[board.combo.id] = (game.metrics.combinationCounts[board.combo.id] || 0) + 1;
  } else {
    game.metrics.dryStreak++;
    game.metrics.longestDryStreak = Math.max(game.metrics.longestDryStreak, game.metrics.dryStreak);
  }
  const result = { type, points, newMatches, combo: board.combo, probability: chance, ardor: ardorIndex(chance), ...details };
  game.lastResult = result;
  event(game, type, now, { points, probability: chance, ardor: result.ardor, details: { ...details, newMatchCount: newMatches.length, combination: board.combo.id, upper: game.upper.map(tile => ({ ...tile })), lower: game.lower.map(tile => ({ ...tile })) } });
  if (game.rollsLeft === 0 && game.diceCredits === 0) { finishGame(game, 'resources', now); result.finished = true; }
  return result;
}
export function rollGame(game, { random = Math.random, now = Date.now() } = {}) {
  if (game.phase === 'finished') return blocked('finished');
  if (game.rollsLeft <= 0) return blocked('no-rolls');
  if (game.upper.every(tile => tile.lockRemaining > 0)) return blocked('all-locked');
  const chance = probability(game, 'roll');
  game.upper = game.upper.map(tile => tile.lockRemaining > 0 ? { ...tile, lockRemaining: tile.lockRemaining - 1 } : makeTile(game, random));
  game.rollsLeft--; game.rolls++; game.diceCredits += 6;
  return resolveOutcome(game, 'roll', now, chance);
}
export function dropGame(game, { random = Math.random, now = Date.now(), automatic = false } = {}) {
  if (game.phase === 'finished') return blocked('finished');
  if (game.diceCredits <= 0) return blocked('no-dice');
  if (game.lower.every(tile => tile.lockRemaining > 0)) return blocked('all-locked');
  const chance = probability(game, 'drop');
  const next = fifoStep(game.lower, makeTile(game, random));
  game.lower = next.lower.map(tile => tile.lockRemaining > 0 ? { ...tile, lockRemaining: tile.lockRemaining - 1 } : tile);
  game.diceCredits--; game.drops++;
  return resolveOutcome(game, 'drop', now, chance, { removedId: next.removed.id, insertedId: next.inserted.id, automatic: Boolean(automatic) });
}
export function lockTile(game, row, index, duration, { now = Date.now() } = {}) {
  if (game.phase === 'finished') return blocked('finished');
  if (!['upper', 'lower'].includes(row) || !Number.isInteger(index) || index < 0 || index > 5) return blocked('invalid-lock');
  const option = LOCK_OPTIONS[row].find(item => item.duration === duration);
  if (!option) return blocked('invalid-lock');
  if (game[row][index].lockRemaining > 0) return blocked('already-locked');
  if (game.diceCredits < option.cost) return blocked('no-dice');
  game[row][index].lockRemaining = duration;
  game.diceCredits -= option.cost; game.locksPurchased++; game.spentOnLocks += option.cost;
  event(game, 'lock', now, { details: { row, index, duration, cost: option.cost, tileId: game[row][index].id } });
  if (game.rollsLeft === 0 && game.diceCredits === 0) finishGame(game, 'resources', now);
  return { type: 'lock', points: 0, row, index, duration, cost: option.cost, finished: game.phase === 'finished' };
}
export function unlockTile(game, row, index, { now = Date.now() } = {}) {
  if (game.phase === 'finished') return blocked('finished');
  if (!['upper', 'lower'].includes(row) || !Number.isInteger(index) || index < 0 || index > 5) return blocked('invalid-lock');
  if (!game[row][index].lockRemaining) return blocked('not-locked');
  game[row][index].lockRemaining = 0;
  event(game, 'unlock', now, { details: { row, index, cost: 0, tileId: game[row][index].id } });
  return { type: 'unlock', points: 0, row, index, cost: 0 };
}
export function setTarget(game, target, { now = Date.now() } = {}) {
  if (game.phase === 'finished') return blocked('finished');
  if (!PROBABILITY_TARGETS.some(item => item.id === target)) return blocked('invalid-target');
  if (game.target === target) return { type: 'noop', points: 0 };
  game.target = target;
  event(game, 'target', now, { details: { target } });
  return { type: 'target', points: 0, target };
}
export function checkpointGame(game, reason = 'pagehide', now = Date.now()) {
  if (game.phase === 'finished') return { type: 'noop', points: 0 };
  return event(game, 'checkpoint', now, { details: { reason } });
}
export function finishGame(game, reason = 'manual', now = Date.now()) {
  if (game.phase === 'finished') return analyzeSession(game, now);
  game.phase = 'finished'; game.endedAt = now; game.finishReason = reason;
  event(game, 'finish', now, { details: { reason } });
  return analyzeSession(game, now);
}
export function analyzeSession(game, now = Date.now()) {
  const metrics = game.metrics;
  const meanProbability = metrics.actions ? metrics.probabilitySum / metrics.actions : 0;
  const meanArdor = metrics.actions ? metrics.ardorSum / metrics.actions : 0;
  const dropShare = metrics.actions ? game.drops / metrics.actions : 0;
  const playStyle = !metrics.actions ? 'observer' : meanArdor >= 80 ? 'risk-taker' : game.locksPurchased >= Math.max(2, metrics.actions / 4) ? 'strategist' : dropShare >= .6 ? 'patient' : 'balanced';
  const styles = {
    observer: ['Наблюдатель', 'Сессия без ходов: пока недостаточно данных для описания стиля.'],
    'risk-taker': ['Охотник за редким', 'Ты чаще выбирал цели с низкой расчётной вероятностью на следующий ход.'],
    strategist: ['Стратег', 'Ты часто тратил дайсы на фиксацию, чтобы удерживать нужные фишки.'],
    patient: ['Мастер ожидания', 'Ты чаще двигал нижнюю карусель, чем полностью менял верхние барабаны.'],
    balanced: ['Свободный игрок', game.rolls && game.drops ? 'В этой сессии были и полные броски, и небольшие сдвиги карусели.' : game.rolls ? 'В этой сессии ты выбирал полные броски верхних барабанов.' : 'В этой сессии двигалась нижняя карусель.'],
  };
  return { sessionId: game.id, startedAt: game.startedAt, endedAt: game.endedAt, durationMs: Math.max(0, (game.endedAt ?? now) - game.startedAt), score: game.total, rolls: game.rolls, drops: game.drops, automaticDrops: metrics.automaticDrops || 0, manualDrops: game.drops - (metrics.automaticDrops || 0), actions: metrics.actions, lockCount: game.locksPurchased, spentOnLocks: game.spentOnLocks, wins: metrics.wins, hitRate: metrics.actions ? metrics.wins / metrics.actions : 0, meanProbability, meanArdor, longestDryStreak: metrics.longestDryStreak, dropShare, playStyle, label: styles[playStyle][0], description: styles[playStyle][1], combinationCounts: { ...metrics.combinationCounts }, eventsDropped: game.eventsDropped, reason: game.finishReason };
}
