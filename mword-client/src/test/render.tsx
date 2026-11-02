import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, vi } from 'vitest';

const roots: Root[] = [];

export async function mount(node: ReactNode) {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  roots.push(root);
  await act(async () => { root.render(node); });
  return { root, host, render: async (next: ReactNode) => { await act(async () => { root.render(next); }); } };
}

export function button(text: string) {
  const found = [...document.querySelectorAll<HTMLButtonElement>('button')].find(item => item.textContent?.trim().startsWith(text));
  if (!found) throw new Error(`未找到按钮：${text}`);
  return found;
}

export async function click(text: string) {
  await act(async () => { button(text).click(); });
}

export function key(value: string, repeat = false) {
  window.dispatchEvent(new KeyboardEvent('keydown', { key: value, repeat, bubbles: true }));
}

afterEach(async () => {
  await act(async () => { for (const root of roots.splice(0)) root.unmount(); });
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
});
