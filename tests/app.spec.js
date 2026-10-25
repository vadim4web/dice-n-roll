import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import App from '../src/App.vue';

let wrapper;
async function throwDice() {
  await wrapper.get('#roll-button').trigger('click');
  await vi.advanceTimersByTimeAsync(100);
  await nextTick();
}
beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
  vi.spyOn(Math, 'random').mockReturnValue(0);
  vi.stubGlobal('matchMedia', () => ({ matches: true }));
});
afterEach(() => { wrapper?.unmount(); wrapper = null; vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('Vue game interface', () => {
  it('rolls dice, selects the best combination, and banks points reactively', async () => {
    wrapper = mount(App);
    expect(wrapper.findAll('.die')).toHaveLength(6);
    expect(wrapper.get('#bank-button').attributes('disabled')).toBeDefined();
    await throwDice();
    expect(wrapper.findAll('.die.selected')).toHaveLength(6);
    expect(wrapper.get('#round-score').text().replace(/\s/g, '')).toBe('8000');
    await wrapper.get('#bank-button').trigger('click');
    expect(wrapper.get('#total-score').text().replace(/\s/g, '')).toBe('8000');
    expect(wrapper.get('#round-number').text()).toBe('02');
    expect(wrapper.get('#round-history').text()).toContain('Мощный раунд');
    expect(JSON.parse(localStorage.getItem('dnr-game-v1')).total).toBe(8000);
  });

  it('restores the current game after remount', async () => {
    wrapper = mount(App);
    await throwDice();
    await wrapper.get('#bank-button').trigger('click');
    wrapper.unmount();
    wrapper = mount(App);
    expect(wrapper.get('#round-number').text()).toBe('02');
    expect(wrapper.get('#total-score').text().replace(/\s/g, '')).toBe('8000');
  });

  it('confirms a mode change and expires blitz while rules are open', async () => {
    wrapper = mount(App);
    await throwDice();
    await wrapper.get('[data-mode="blitz"]').trigger('click');
    expect(wrapper.get('#modal-content').text()).toContain('Сменим темп?');
    await wrapper.get('#confirm-new').trigger('click');
    expect(wrapper.get('#round-number').text()).toBe('1:30');
    await throwDice();
    await wrapper.get('.help-button').trigger('click');
    // UI clock updates every 250 ms; pass the next tick after the deadline.
    await vi.advanceTimersByTimeAsync(90250);
    expect(wrapper.get('#modal-content').text()).toContain('Время вышло');
    expect(JSON.parse(localStorage.getItem('dnr-records-v1'))).toHaveLength(1);
    expect(wrapper.get('#total-score').text()).toBe('0');
  });

  it('finishes ten rounds, saves one record, and starts a fresh game', async () => {
    wrapper = mount(App);
    for (let i = 0; i < 10; i++) { await throwDice(); await wrapper.get('#bank-button').trigger('click'); }
    expect(wrapper.get('.results-score').text().replace(/\s/g, '')).toBe('80000');
    expect(wrapper.get('.new-record').exists()).toBe(true);
    expect(JSON.parse(localStorage.getItem('dnr-records-v1'))).toHaveLength(1);
    await wrapper.get('.modal-primary').trigger('click');
    expect(wrapper.get('#total-score').text()).toBe('0');
    expect(wrapper.get('#round-number').text()).toBe('01');
    expect(wrapper.get('#personal-best').text().replace(/\s/g, '')).toBe('80000');
  });

  it('prevents duplicate rolls and releases timers when unmounted', async () => {
    wrapper = mount(App);
    await wrapper.get('#roll-button').trigger('click');
    expect(wrapper.get('#roll-button').attributes('disabled')).toBeDefined();
    expect(wrapper.get('#restart').attributes('disabled')).toBeDefined();
    wrapper.unmount(); wrapper = null;
    await vi.advanceTimersByTimeAsync(1000);
    expect(vi.getTimerCount()).toBe(0);
  });
});
