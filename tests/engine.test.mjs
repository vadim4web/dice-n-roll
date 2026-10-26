import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateHand, evaluateBoard, pairKey, probability, ardorIndex, economy, rewardFor, fifoStep, hasCombination } from '../src/game/engine.js';

const tile = (a, b = a, suit = 0, id = `${a}-${b}-${suit}`) => ({ id, a, b, suit, lockRemaining: 0 });
const hand = (ranks, sameSuit = false) => ranks.map((rank, i) => tile(rank, 1, sameSuit ? 0 : i % 4, `h${i}`));
const state = () => ({ phase: 'active', upper: Array.from({ length: 6 }, (_, i) => tile(6, 6, i % 4, `u${i}`)), lower: Array.from({ length: 6 }, (_, i) => tile(1, 1, i % 4, `l${i}`)), awardedUpperIds: [], target: 'any', rollsLeft: 50, diceCredits: 12 });
const near = (actual, expected, tolerance = 1e-10) => assert(Math.abs(actual - expected) < tolerance, `${actual} != ${expected}`);

test('cross-row unordered matching counts each upper only once', () => {
  assert.equal(pairKey(tile(2, 5)), pairKey(tile(5, 2)));
  const board = evaluateBoard([tile(2, 5), tile(6, 6)], [tile(5, 2), tile(2, 5)]);
  assert.equal(board.matches.length, 1);
  assert.deepEqual(board.matches[0].lowerIndices, [0, 1]);
  assert.equal(board.cards.length, 1);
});

test('all card-style and dice-specific combinations are recognized', () => {
  const examples = [
    ['pair', [2, 2]], ['two-pair', [2, 2, 3, 3]], ['trips', [3, 3, 3]],
    ['straight', [1, 2, 3, 4, 5]], ['full-house', [2, 2, 2, 3, 3]], ['quads', [4, 4, 4, 4]],
    ['five-kind', [2, 2, 2, 2, 2]], ['full-straight', [1, 2, 3, 4, 5, 6]], ['six-kind', [3, 3, 3, 3, 3, 3]],
  ];
  examples.forEach(([name, ranks]) => assert.equal(evaluateHand(hand(ranks)).id, name));
  assert.equal(evaluateHand(hand([1, 1, 2, 3, 4], true)).id, 'flush');
  assert.equal(evaluateHand(hand([1, 2, 3, 4, 5], true)).id, 'straight-flush');
  assert.equal(evaluateHand(hand([2, 3, 4, 5, 6], true)).id, 'royal');
  assert.equal(evaluateHand([]).id, 'none');
});

test('FIFO preserves pinned screen slots and the order of all free survivors', () => {
  const lower = Array.from({ length: 6 }, (_, i) => tile(i + 1, 1, 0, `l${i}`));
  lower[1].lockRemaining = 3;
  lower[4].lockRemaining = 2;
  const result = fifoStep(lower, tile(2, 3, 0, 'new'));
  assert.deepEqual(result.lower.map(t => t.id), ['l2', 'l1', 'l3', 'l5', 'l4', 'new']);
  assert.equal(result.removed.id, 'l0');
});

test('exact any-match and pair probabilities ignore duplicate lower targets', () => {
  const game = state();
  near(probability(game, 'roll', 'any'), 1 - (35 / 36) ** 6);
  near(probability(game, 'roll', 'pair'), 1 - (35 / 36) ** 6 - 6 / 36 * (35 / 36) ** 5);
  near(ardorIndex(game), 100);
  game.lower = Array.from({ length: 6 }, (_, i) => tile(1, 2, 0, `l${i}`));
  near(probability(game, 'roll', 'any'), 1 - (34 / 36) ** 6);
});

test('one wallet: lock count lowers Ardor, raises Roll price and sets Drop price', () => {
  const game=state(); game.diceCredits=120;
  assert.equal(economy(game).rollCost,6);
  assert.equal(economy(game).dropCost,1);
  assert.equal(economy(game).availableRolls,20);
  for(let i=0;i<3;i++)game.lower[i].lockRemaining=3;
  const locked=economy(game);
  assert.equal(locked.dropCost,3);
  assert.equal(locked.ardor,75);
  assert.equal(locked.rollCost,8);
  assert.equal(locked.availableRolls,15);
  assert.equal(locked.prizes.royal,488);
  game.upper[0]={...tile(1,1,0,'held0'),lockRemaining:1};
  const protectedQuote=economy(game);
  assert(protectedQuote.ardor<locked.ardor);
  assert(protectedQuote.rollCost>locked.rollCost);
  assert(protectedQuote.prizes.royal<locked.prizes.royal);
  assert.equal(rewardFor({id:'pair'},2,locked),2*locked.prizes.single+locked.prizes.pair);
  game.target='royal';
  assert.deepEqual(economy(game),protectedQuote); // Browsing a target cannot inflate rewards.
  game.diceCredits=0;
  assert.equal(economy(game).availableRolls,0);
  assert(probability(game,'roll','any')>0); // Physical odds are separate from affordability.
});

test('held matches count toward a target but cannot alone create new winnings', () => {
  const game = state();
  game.upper.forEach(t => { t.lockRemaining = 1; });
  game.upper[0] = { ...tile(1, 1, 0, 'held'), lockRemaining: 1 };
  game.awardedUpperIds = ['held'];
  game.upper[5].lockRemaining = 0;
  near(probability(game, 'roll', 'pair'), 1 / 36);
  near(probability(game, 'roll', 'any'), 1 / 36);
  game.upper[5].lockRemaining = 1;
  assert.equal(probability(game, 'roll', 'any'), 0);
});

test('suit probabilities are exact, including a new completion of a held flush', () => {
  const game = state();
  for (let i = 0; i < 4; i++) game.upper[i] = { ...tile(1, 1, 0, `held${i}`), lockRemaining: 1 };
  game.awardedUpperIds = game.upper.slice(0, 4).map(t => t.id);
  // Two random free cards: at least one must match lower 1:1 and have suit0.
  near(probability(game, 'roll', 'flush'), 1 - (143 / 144) ** 2);
  game.upper[4] = { ...tile(1, 1, 0, 'held4'), lockRemaining: 1 };
  game.awardedUpperIds.push('held4');
  // Flush is already held; a new matching card of ANY suit still makes a new event.
  near(probability(game, 'roll', 'flush'), 1 / 36);
});

test('next Drop exact enumeration reflects FIFO survivors and scored-card ledger', () => {
  const game = state();
  game.lower = Array.from({ length: 6 }, (_, i) => tile(1, 1, 0, `l${i}`));
  game.upper = Array.from({ length: 6 }, (_, i) => tile(2, 3, i % 4, `u${i}`));
  near(probability(game, 'drop', 'any'), 2 / 36);
  near(probability(game, 'drop', 'six-kind'), 2 / 36);
  game.awardedUpperIds = game.upper.map(t => t.id);
  assert.equal(probability(game, 'drop', 'any'), 0);
});

test('rank DP and suit formula agree with exhaustive two-free-card enumeration', () => {
  const game = state();
  game.lower = [tile(1, 1), tile(2, 2), tile(3, 3), tile(4, 4), tile(5, 5), tile(6, 6)];
  [1, 2, 3, 4].forEach((rank, i) => { game.upper[i] = { ...tile(rank, rank, 0, `h${i}`), lockRemaining: 1 }; });
  game.awardedUpperIds = game.upper.slice(0, 4).map(t => t.id);
  const targets = ['any', 'pair', 'straight', 'flush', 'straight-flush', 'royal', 'full-straight'];
  const counts = Object.fromEntries(targets.map(target => [target, 0]));
  const outcomes = [];
  for (let a = 1; a <= 6; a++) for (let b = 1; b <= 6; b++) for (let suit = 0; suit < 4; suit++) outcomes.push(tile(a, b, suit));
  for (const first of outcomes) for (const second of outcomes) {
    const board = evaluateBoard([...game.upper.slice(0, 4), { ...first, id: 'new1' }, { ...second, id: 'new2' }], game.lower);
    if (!board.cards.some(card => card.id.startsWith('new'))) continue;
    targets.forEach(target => { if (hasCombination(board.cards, target)) counts[target]++; });
  }
  targets.forEach(target => near(probability(game, 'roll', target), counts[target] / (144 ** 2)));
});
