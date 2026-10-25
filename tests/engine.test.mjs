import test from 'node:test';
import assert from 'node:assert/strict';
import { scoreDice, bestSelection, randomDie, bustProbability } from '../dist/engine.js';
test('single scoring dice and invalid mixed selections', () => {
  assert.equal(scoreDice([1, 5, 1]).points, 250);
  assert.equal(scoreDice([1, 2]).valid, false);
  assert.equal(scoreDice([2, 2]).valid, false);
  assert.equal(scoreDice([]).valid, false);
});
test('triples and higher combinations', () => {
  assert.equal(scoreDice([1, 1, 1]).points, 1000);
  assert.equal(scoreDice([4, 4, 4, 4]).points, 800);
  assert.equal(scoreDice([5, 5, 5, 5, 5]).points, 2000);
  assert.equal(scoreDice([2, 2, 2, 6, 6, 6]).points, 800);
  assert.equal(scoreDice([1, 2, 3, 4, 5, 6]).points, 1500);
  assert.equal(scoreDice([2, 2, 4, 4, 6, 6]).points, 1500);
});
test('automatic selection finds highest-scoring valid subset', () => {
  assert.deepEqual(bestSelection([2, 1, 2, 2, 5, 4]).indices, [1, 0, 2, 3, 4].sort((a,b)=>a-b));
  assert.equal(bestSelection([2, 1, 2, 2, 5, 4]).points, 350);
  assert.equal(bestSelection([2, 3, 4, 6]).points, 0);
  assert.equal(bestSelection([2, 2, 4, 4, 6, 6]).indices.length, 6);
});
test('risk probabilities and die boundaries', () => {
  assert.equal(bustProbability(1), 67);
  assert.equal(bustProbability(2), 44);
  assert.equal(bustProbability(6), 2);
  assert.equal(randomDie(() => 0), 1);
  assert.equal(randomDie(() => .999999), 6);
});
