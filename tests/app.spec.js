import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import App from '../src/App.vue';
import { ardorIndex, probability } from '../src/game/engine.js';
import { initialGame } from '../src/game/session.js';

const CURRENT = 'dnr-domino-session-v3';
const HISTORY = 'dnr-domino-history-v3';
const LOGS = 'dnr-domino-logs-v3';
const upper = '.domino-tile[data-row="upper"]';
const lower = '.domino-tile[data-row="lower"]';
let wrapper;
const saved = () => JSON.parse(localStorage.getItem(CURRENT));
const history = () => JSON.parse(localStorage.getItem(HISTORY) || '[]');
const ids = tiles => tiles.map(tile => tile.id);

function start() { wrapper = mount(App, { attachTo: document.body }); return wrapper; }
async function settleAction() { await vi.advanceTimersByTimeAsync(60); await nextTick(); }
async function roll() { await wrapper.get('#roll-button').trigger('click'); await settleAction(); }
async function drop() { await wrapper.get('.golden-drop').trigger('click'); await settleAction(); }
async function buyLock(row, index, offer = 0) {
  await wrapper.get(`.domino-tile[data-row="${row}"][data-index="${index}"]`).trigger('click');
  await wrapper.findAll('.lock-offers button')[offer].trigger('click');
}

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-26T10:00:00Z'));
  vi.spyOn(Math, 'random').mockReturnValue(0);
  vi.stubGlobal('matchMedia', () => ({ matches: true }));
});
afterEach(async () => {
  wrapper?.unmount(); wrapper = null;
  await nextTick();
  vi.useRealTimers(); vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('Domino poker Vue interface', () => {
  it('shows six upper reels and six FIFO pairs with contextual titles', () => {
    start();
    expect(wrapper.findAll(upper)).toHaveLength(6);
    expect(wrapper.findAll(lower)).toHaveLength(6);
    for (const tile of wrapper.findAll('.domino-tile')) {
      expect(tile.attributes('title')).toContain('Совпадает');
      expect(tile.attributes('title')).toContain('Фиксация');
    }
    expect(wrapper.get('#roll-button').attributes('title')).toContain('6 дайсов');
    expect(wrapper.get('.golden-drop').attributes('title')).toContain('FIFO');
    expect(wrapper.get('.ardor-reading').attributes('title')).toContain('Ardor = (1 − P) × 100');
    expect(saved().rollsLeft).toBe(50);
    expect(saved().diceCredits).toBe(12);
    expect(history()).toHaveLength(0);
  });

  it('spins all unpinned upper reels and exchanges one Roll for six Drop credits', async () => {
    start();
    const before = saved();
    await roll();
    const after = saved();
    expect(after.upper.every((tile, i) => tile.id !== before.upper[i].id)).toBe(true);
    expect(after.upper.every(tile => tile.a === 1 && tile.b === 1)).toBe(true);
    expect(ids(after.lower)).toEqual(ids(before.lower));
    expect(after.rolls).toBe(1);
    expect(after.rollsLeft).toBe(49);
    expect(after.diceCredits).toBe(18);
    expect(wrapper.get('#rolls-left').text()).toContain('49');
    expect(wrapper.get('#dice-credits').text()).toContain('18');
    expect(after.events.some(event => event.type === 'roll' && Number.isFinite(event.probability))).toBe(true);
    expect(history()[0].actions).toBe(1);
  });

  it('drops the oldest free lower pair, preserves five known pairs, and appends one new pair', async () => {
    start();
    const before = saved();
    await drop();
    const after = saved();
    expect(ids(after.lower).slice(0, 5)).toEqual(ids(before.lower).slice(1));
    expect(ids(before.lower)).not.toContain(after.lower[5].id);
    expect(after.lower[5]).toMatchObject({ a: 1, b: 1 });
    expect(ids(after.upper)).toEqual(ids(before.upper));
    expect(after.drops).toBe(1);
    expect(after.diceCredits).toBe(11);
    expect(after.rollsLeft).toBe(50);
  });

  it('shows a real poker payout and does not pay the same preserved matches twice', async () => {
    const game = initialGame();
    game.lower.forEach(tile => { tile.a = 1; tile.b = 1; });
    localStorage.setItem(CURRENT, JSON.stringify(game));
    start();
    await roll();
    expect(saved().total).toBe(6150);
    expect(saved().lastResult.combo.id).toBe('six-kind');
    expect(wrapper.get('#total-score').text().replace(/\s/g, '')).toBe('6150');
    expect(wrapper.get('.result-strip').text()).toContain('Шесть одинаковых');
    await drop();
    expect(saved().total).toBe(6150);
    expect(saved().lastResult.points).toBe(0);
    expect(saved().lastResult.newMatches).toHaveLength(0);
  });

  it('charges upper and lower locks differently and expires them only on the matching action', async () => {
    start();
    const initial = saved();
    await buyLock('upper', 0);
    expect(saved().upper[0].lockRemaining).toBe(1);
    expect(saved().diceCredits).toBe(11);
    await buyLock('lower', 2);
    expect(saved().lower[2].lockRemaining).toBe(3);
    expect(saved().diceCredits).toBe(9);
    expect(saved().spentOnLocks).toBe(3);
    await drop();
    expect(saved().upper[0].lockRemaining).toBe(1);
    expect(saved().lower[2]).toMatchObject({ id: initial.lower[2].id, lockRemaining: 2 });
    expect(saved().lower[0].id).toBe(initial.lower[1].id);
    expect(saved().lower[1].id).toBe(initial.lower[3].id);
    await roll();
    expect(saved().upper[0]).toMatchObject({ id: initial.upper[0].id, lockRemaining: 0 });
    expect(saved().lower[2].lockRemaining).toBe(2);
    expect(saved().upper.slice(1).every((tile, i) => tile.id !== initial.upper[i + 1].id)).toBe(true);
    const credits = saved().diceCredits;
    await wrapper.get(`${lower}[data-index="2"]`).trigger('click');
    expect(wrapper.get('.release-button').attributes('title')).toContain('не возвращаются');
    await wrapper.get('.release-button').trigger('click');
    expect(saved().lower[2].lockRemaining).toBe(0);
    expect(saved().diceCredits).toBe(credits);
  });

  it('recalculates Ardor for the selected poker target and next-action type', async () => {
    start();
    const first = Number(wrapper.get('#ardor-index').text());
    await wrapper.get('#probability-target').setValue('pair');
    const game = saved();
    expect(game.target).toBe('pair');
    expect(Number(wrapper.get('#ardor-index').text())).toBeCloseTo(ardorIndex(probability(game, 'roll', 'pair')), 1);
    expect(Number(wrapper.get('#ardor-index').text())).not.toBe(first);
    await wrapper.findAll('.probability-tabs button')[1].trigger('click');
    const dropArdor = Number(wrapper.get('#ardor-index').text());
    expect(dropArdor).toBeCloseTo(ardorIndex(probability(game, 'drop', 'pair')), 1);
    expect(dropArdor).toBeGreaterThanOrEqual(0);
    expect(dropArdor).toBeLessThanOrEqual(100);
    expect(wrapper.get('.ardor-reading').attributes('title')).toContain('следующий Drop');
    expect(game.events.at(-1).type).toBe('target');
  });

  it('finishes through confirmation and stores one final analysis with the event log', async () => {
    start();
    await roll();
    await drop();
    await wrapper.get('.hero-right .text-button').trigger('click');
    expect(wrapper.get('#confirm-finish').text()).toContain('Завершить');
    expect(saved().phase).toBe('active');
    await wrapper.get('#confirm-finish').trigger('click');
    const game = saved();
    expect(game.phase).toBe('finished');
    expect(game.finishReason).toBe('manual');
    expect(game.events.at(-1).type).toBe('finish');
    expect(history()).toHaveLength(1);
    expect(history()[0]).toMatchObject({ sessionId: game.id, final: true, actions: 2, rolls: 1, drops: 1 });
    expect(history()[0].meanArdor).toBeGreaterThanOrEqual(0);
    expect(history()[0].meanArdor).toBeLessThanOrEqual(100);
    expect(wrapper.get('.analysis-grid').text()).toContain('Средний Ardor');
    expect(wrapper.get('#roll-button').attributes('disabled')).toBeDefined();
    expect(wrapper.get('.golden-drop').attributes('disabled')).toBeDefined();
    wrapper.unmount(); wrapper = null;
    start();
    expect(saved().id).toBe(game.id);
    expect(saved().phase).toBe('finished');
    expect(history()).toHaveLength(1);
    expect(saved().events.filter(event => event.type === 'finish')).toHaveLength(1);
  });

  it('checkpoints a page exit and restores the same active session without duplicating history', async () => {
    start();
    await roll();
    window.dispatchEvent(new Event('pagehide'));
    const checkpoint = saved();
    expect(checkpoint.events.at(-1)).toMatchObject({ type: 'checkpoint', details: { reason: 'pagehide' } });
    expect(history()).toHaveLength(1);
    expect(history()[0]).toMatchObject({ final: false, snapshotReason: 'pagehide' });
    wrapper.unmount(); wrapper = null;
    start();
    expect(saved().id).toBe(checkpoint.id);
    expect(saved().rollsLeft).toBe(49);
    expect(saved().diceCredits).toBe(18);
    expect(saved().phase).toBe('active');
    expect(ids(saved().upper)).toEqual(ids(checkpoint.upper));
    expect(history()).toHaveLength(1);
  });

  it('keeps full logs for the last three finished sessions while preserving older summaries', async () => {
    start();
    const finishedIds = [];
    for (let i = 0; i < 4; i++) {
      await roll();
      finishedIds.push(saved().id);
      await wrapper.get('.hero-right .text-button').trigger('click');
      await wrapper.get('#confirm-finish').trigger('click');
      const archives = JSON.parse(localStorage.getItem(LOGS));
      expect(archives).toHaveLength(Math.min(i + 1, 3));
      expect(archives[0].sessionId).toBe(finishedIds[i]);
      expect(archives[0].session.phase).toBe('finished');
      expect(archives[0].session.events.some(event => event.type === 'roll' && event.details.upper.length === 6)).toBe(true);
      await wrapper.get('.modal-primary').trigger('click');
      expect(saved().phase).toBe('active');
      expect(saved().rollsLeft).toBe(50);
    }
    const archives = JSON.parse(localStorage.getItem(LOGS));
    expect(archives.map(item => item.sessionId)).toEqual(finishedIds.slice(-3).reverse());
    expect(history()).toHaveLength(4);
    expect(history().map(item => item.sessionId)).toContain(finishedIds[0]);
    expect(archives.map(item => item.sessionId)).not.toContain(saved().id);
  });

  it('runs optional FIFO every five seconds, permits manual Drop, and pauses in dialogs or hidden tabs', async () => {
    const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
    start();
    const knownUpper = ids(saved().upper);
    expect(wrapper.get('#auto-flow').attributes('aria-pressed')).toBe('false');
    await wrapper.get('#auto-flow').trigger('click');
    expect(wrapper.get('#auto-flow').attributes('aria-pressed')).toBe('true');
    await vi.advanceTimersByTimeAsync(5100);
    expect(saved().drops).toBe(1);
    expect(saved().diceCredits).toBe(11);
    expect(ids(saved().upper)).toEqual(knownUpper);
    expect(saved().metrics.automaticDrops).toBe(1);
    await drop();
    expect(saved().drops).toBe(2);
    expect(saved().diceCredits).toBe(10);
    expect(saved().metrics.automaticDrops).toBe(1);
    expect(saved().events.filter(event => event.type === 'drop').map(event => event.details.automatic)).toEqual([true, false]);
    await wrapper.findAll('.header-actions .quiet-button')[2].trigger('click');
    await vi.advanceTimersByTimeAsync(5100);
    expect(saved().drops).toBe(2);
    await wrapper.get('#modal .icon-button[aria-label="Закрыть"]').trigger('click');
    hidden.mockReturnValue(true);
    await vi.advanceTimersByTimeAsync(5100);
    expect(saved().drops).toBe(2);
    hidden.mockReturnValue(false);
    await wrapper.get('#auto-flow').trigger('click');
    expect(wrapper.get('#auto-flow').attributes('aria-pressed')).toBe('false');
    await vi.advanceTimersByTimeAsync(5100);
    expect(saved().drops).toBe(2);
    expect(saved().diceCredits).toBe(10);
    hidden.mockRestore();
  });

  it('blocks duplicate actions during animation and cancels owned timers on unmount', async () => {
    start();
    await wrapper.get('#roll-button').trigger('click');
    expect(wrapper.get('#roll-button').attributes('disabled')).toBeDefined();
    expect(wrapper.get('.golden-drop').attributes('disabled')).toBeDefined();
    await wrapper.get('#roll-button').trigger('click');
    await wrapper.get('.golden-drop').trigger('click');
    expect(saved().rolls).toBe(1);
    expect(saved().drops).toBe(0);
    wrapper.unmount(); wrapper = null;
    await nextTick();
    await vi.advanceTimersByTimeAsync(1000);
    expect(vi.getTimerCount()).toBe(0);
  });
});
