import { scoreDice, bestSelection, randomDie } from './engine.js';

export function initialGame(mode = 'classic') {
  return { mode, phase: 'ready', round: 1, total: 0, turn: 0, dice: [3, 1, 5, 2, 6, 4], held: [], selected: [], history: [], successful: 0, rolls: 0, deadline: null, bestRound: 0, saved: false, started: false };
}

export function restoreGame(saved) {
  const validIndices = indices => Array.isArray(indices) && new Set(indices).size === indices.length && indices.every(i => Number.isInteger(i) && i >= 0 && i < 6);
  if (!saved || !['classic', 'blitz'].includes(saved.mode) || !['ready', 'rolled', 'bust', 'finished'].includes(saved.phase)
    || !Array.isArray(saved.dice) || saved.dice.length !== 6 || !saved.dice.every(v => Number.isInteger(v) && v >= 1 && v <= 6)
    || !validIndices(saved.held) || !validIndices(saved.selected) || saved.selected.some(i => saved.held.includes(i))
    || !Array.isArray(saved.history) || !saved.history.every(r => Number.isInteger(r.round) && r.round >= 1 && Number.isFinite(r.points) && r.points >= 0 && typeof r.bust === 'boolean')
    || !['total', 'turn', 'successful', 'rolls', 'bestRound'].every(key => Number.isFinite(saved[key]) && saved[key] >= 0)
    || !Number.isInteger(saved.round) || saved.round < 1 || (saved.mode === 'classic' && saved.round > 10)
    || (saved.mode === 'blitz' && saved.started && !Number.isFinite(saved.deadline))) return initialGame();
  return { ...initialGame(saved.mode), ...saved };
}

export function selectionScore(game) { return scoreDice(game.selected.map(i => game.dice[i])); }
export function isExpired(game, now = Date.now()) { return game.mode === 'blitz' && game.deadline !== null && now >= game.deadline; }
export function finishGame(game) { game.phase = 'finished'; game.selected = []; game.held = []; game.turn = 0; }
function addHistory(game, points, bust = false) {
  game.history.push({ round: game.round, points, bust });
  game.bestRound = Math.max(game.bestRound, points);
}
function advanceRound(game) {
  if (game.mode === 'classic' && game.round >= 10) { finishGame(game); return false; }
  game.round++;
  game.turn = 0; game.held = []; game.selected = []; game.phase = 'ready';
  return true;
}

export function toggleDie(game, index, now = Date.now()) {
  if (game.phase !== 'rolled' || game.held.includes(index) || index < 0 || index > 5) return false;
  if (isExpired(game, now)) { finishGame(game); return false; }
  game.selected = game.selected.includes(index) ? game.selected.filter(i => i !== index) : [...game.selected, index];
  return true;
}

export function rollGame(game, { random = Math.random, now = Date.now() } = {}) {
  if (game.phase === 'finished') return { type: 'noop' };
  if (isExpired(game, now)) { finishGame(game); return { type: 'finished' }; }
  if (game.phase === 'bust' && !advanceRound(game)) return { type: 'finished' };
  let hotDice = false;
  if (game.phase === 'rolled') {
    const score = selectionScore(game);
    if (!score.valid) return { type: 'invalid' };
    game.turn += score.points;
    game.held.push(...game.selected);
    if (game.held.length === 6) { game.held = []; hotDice = true; }
  }
  game.started = true;
  if (game.mode === 'blitz' && game.deadline === null) game.deadline = now + 90000;
  game.selected = [];
  game.dice = game.dice.map((value, i) => game.held.includes(i) ? value : randomDie(random));
  game.rolls++;
  const available = game.dice.map((_, i) => i).filter(i => !game.held.includes(i));
  const best = bestSelection(available.map(i => game.dice[i]));
  if (!best.points) {
    game.phase = 'bust'; game.turn = 0;
    addHistory(game, 0, true);
    if (game.mode === 'classic' && game.round === 10) { finishGame(game); return { type: 'finished', bust: true }; }
    return { type: 'bust' };
  }
  game.phase = 'rolled'; game.selected = best.indices.map(i => available[i]); game.successful++;
  return { type: 'rolled', hotDice, points: best.points, label: best.label };
}

export function bankGame(game, now = Date.now()) {
  if (game.phase !== 'rolled') return { type: 'noop' };
  if (isExpired(game, now)) { finishGame(game); return { type: 'finished' }; }
  const score = selectionScore(game);
  if (!score.valid) return { type: 'invalid' };
  const earned = game.turn + score.points;
  game.total += earned;
  addHistory(game, earned);
  return { type: advanceRound(game) ? 'banked' : 'finished', earned };
}
