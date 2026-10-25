import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import * as engine from '../dist/engine.js';

// A minimal DOM lets us exercise real game transitions without a browser.
class Element {
  constructor() { this.style = {}; this.dataset = {}; this.open = false; this.classList = { add() {}, remove() {}, toggle() {} }; this.children = new Map(); }
  addEventListener() {}
  setAttribute() {}
  querySelector(key) { if (!this.children.has(key)) this.children.set(key, new Element()); return this.children.get(key); }
  querySelectorAll() { return []; }
  showModal() { this.open = true; }
  close() { this.open = false; }
  focus() {}
}
const elements = new Map();
const getElement = id => { if (!elements.has(id)) elements.set(id, new Element()); return elements.get(id); };
const values = [];
let now = 100000;
const context = vm.createContext({
  ...engine,
  randomDie: () => Math.floor((values.length ? values.shift() : 0) * 6) + 1,
  document: { getElementById: getElement, querySelectorAll: () => [], addEventListener() {}, hidden: false },
  localStorage: { getItem: () => null, setItem() {} },
  window: {},
  Math: Object.assign(Object.create(Math), { random: () => values.length ? values.shift() : 0 }),
  Date: class extends Date { static now() { return now; } },
  Intl, console,
  setInterval: () => 1, clearInterval() {}, clearTimeout() {},
  setTimeout: fn => { fn(); return 1; },
  matchMedia: () => ({ matches: true }),
  requestAnimationFrame: fn => fn()
});
const source = readFileSync(new URL('../dist/app.js', import.meta.url), 'utf8').replace(/^import .*?;\s*/, '');
vm.runInContext(source + '\nglobalThis.api = { roll, bank, newGame, toggleDie, requestNewGame, finishGame, get game() { return game; } };', context);
const { api } = context;
assert.equal(api.game.phase, 'ready');
await api.roll();
assert.equal(api.game.phase, 'rolled');
assert.equal(api.game.selected.length, 6);
api.bank();
assert.equal(api.game.total, 8000);
assert.equal(api.game.round, 2);
assert.equal(api.game.phase, 'ready');
await api.roll();
await api.roll(); // All scoring dice return to play; points remain at risk.
assert.equal(api.game.turn, 8000);
assert.equal(api.game.held.length, 0);
values.push(...[2,3,4,6,2,3].map(v => (v - .5) / 6));
await api.roll();
assert.equal(api.game.phase, 'bust');
assert.equal(api.game.turn, 0);
assert.equal(api.game.total, 8000);
assert.equal(api.game.history.length, 2);
await api.roll();
assert.equal(api.game.round, 3);
assert.equal(api.game.phase, 'rolled');
api.toggleDie(0);
assert.equal(api.game.selected.length, 5);
api.toggleDie(0);
api.bank();
for (let round = 4; round <= 10; round++) { await api.roll(); api.bank(); }
assert.equal(api.game.phase, 'finished');
assert.equal(api.game.history.length, 10);
assert.equal(api.game.total, 72000);
assert.equal(api.game.saved, true);
const savedTotal = api.game.total;
api.bank();
assert.equal(api.game.total, savedTotal);
api.newGame('blitz');
assert.equal(api.game.deadline, null);
await api.roll();
assert.equal(api.game.deadline, now + 90000);
api.bank();
await api.roll();
now += 90001;
api.bank();
assert.equal(api.game.phase, 'finished');
assert.equal(api.game.total, 8000); // Unbanked points do not count at expiry.
assert.equal(api.game.turn, 0);
api.newGame('classic');
assert.equal(api.game.total, 0);
assert.equal(api.game.history.length, 0);
console.log('Game integration checks passed: bank, hot dice, bust, next round, selection, 10-round finish, duplicate bank, blitz expiry, reset.');
