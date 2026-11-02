// @vitest-environment jsdom
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useLearningClock } from './useLearningClock';
import { mount } from '../test/render';
import type { ReviewState } from './types';

const native = vi.hoisted(() => ({ isNative: vi.fn(() => false), addListener: vi.fn() }));
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: native.isNative } }));
vi.mock('@capacitor/app', () => ({ App: { addListener: native.addListener } }));

const emptyStates: ReviewState[] = [];
function Clock({ states = emptyStates }: { states?: ReviewState[] }) {
  return <output>{useLearningClock(states)}</output>;
}
const shownTime = () => Number(document.querySelector('output')?.textContent);

beforeEach(() => { vi.useFakeTimers(); native.isNative.mockReturnValue(false); });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe('learning clock', () => {
  it('refreshes exactly at the next due time without a state mutation or network', async () => {
    const start = new Date(2026, 10, 2, 12).getTime();
    vi.setSystemTime(start);
    const states: ReviewState[] = [{ wordId: 'alpha', senseId: 'alpha:core', repetitions: 0, lapses: 1, intervalDays: 0,
      dueAt: new Date(start + 1500).toISOString(), lastReviewedAt: null, status: 'LEARNING' }];
    await mount(<Clock states={states} />);
    await act(async () => { vi.advanceTimersByTime(1499); });
    expect(shownTime()).toBe(start);
    await act(async () => { vi.advanceTimersByTime(1); });
    expect(shownTime()).toBe(start + 1500);
  });

  it('refreshes at local midnight and removes timers on unmount', async () => {
    const start = new Date(2026, 10, 2, 23, 59, 59, 900).getTime();
    vi.setSystemTime(start);
    const view = await mount(<Clock />);
    await act(async () => { vi.advanceTimersByTime(100); });
    expect(shownTime()).toBe(new Date(2026, 10, 3).getTime());
    await view.render(null);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('immediately corrects the clock on browser foreground events', async () => {
    const start = new Date(2026, 10, 2, 12).getTime();
    vi.setSystemTime(start);
    await mount(<Clock />);
    vi.setSystemTime(start + 600_000);
    await act(async () => { window.dispatchEvent(new Event('focus')); });
    expect(shownTime()).toBe(start + 600_000);
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    vi.setSystemTime(start + 1200_000);
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
    expect(shownTime()).toBe(start + 1200_000);
  });

  it('also refreshes on native foreground events and unregisters its listener', async () => {
    let onState!: (state: { isActive: boolean }) => void;
    const remove = vi.fn();
    native.isNative.mockReturnValue(true);
    native.addListener.mockImplementation(async (_: string, listener: typeof onState) => { onState = listener; return { remove }; });
    vi.setSystemTime(1000);
    const view = await mount(<Clock />);
    vi.setSystemTime(5000);
    await act(async () => { onState({ isActive: true }); });
    expect(shownTime()).toBe(5000);
    await view.render(null);
    expect(remove).toHaveBeenCalledOnce();
  });
});
