import { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { App as NativeApp } from '@capacitor/app';
import { localDayBounds } from './dailyPlan';
import type { ReviewState } from './types';

export function useLearningClock(reviewStates: ReviewState[]) {
  const [now, setNow] = useState(Date.now);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    let disposed = false;
    function refresh() {
      if (disposed) return;
      clearTimeout(timer);
      const time = Date.now();
      setNow(time);
      // 同时兜底设备时钟、时区变化；后台暂停后由前台事件立即校准。
      let next = Math.min(localDayBounds(time).end, time + 60_000);
      for (const state of reviewStates) {
        const due = Date.parse(state.dueAt);
        if (due > time) next = Math.min(next, due);
      }
      timer = setTimeout(refresh, Math.max(1, next - time));
    }
    const onVisible = () => { if (document.visibilityState === 'visible') refresh(); };
    refresh();
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', onVisible);
    const nativeListener = Capacitor.isNativePlatform()
      ? NativeApp.addListener('appStateChange', state => { if (state.isActive) refresh(); })
      : null;
    return () => {
      disposed = true;
      clearTimeout(timer);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', onVisible);
      if (nativeListener) void nativeListener.then(listener => listener.remove());
    };
  }, [reviewStates]);

  return now;
}
