// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import React from 'react';
import App from '../src/App';

function clickButton(text: string): HTMLButtonElement {
  const btn = [...document.querySelectorAll('button')].find((b) => b.textContent?.includes(text)) as HTMLButtonElement | undefined;
  if (!btn) throw new Error(`找不到按钮：${text}；现有按钮：${[...document.querySelectorAll('button')].map((b) => b.textContent).join(' | ')}`);
  act(() => btn.click());
  return btn;
}

async function renderApp() {
  const el = document.createElement('div');
  document.body.appendChild(el);
  const root = createRoot(el);
  await act(async () => {
    root.render(React.createElement(App));
  });
  return { el, root };
}

describe('App 端到端冒烟', () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = '';
  });

  it('正常示例：渲染叠图 → 候选表 → 预览 → 采用 → 撤销', async () => {
    await renderApp();
    clickButton('正常磨耗');

    expect(document.body.textContent).toContain('候选镟修方案');
    expect(document.body.textContent).toContain('可行离散组合');
    // 四轮布局与尺寸
    expect(document.body.textContent).toContain('转向架俯视');
    expect(document.body.textContent).toContain('轮缘高 Sh');

    // 点选候选表第一行预览
    const firstRow = document.querySelector('tr.cand-row') as HTMLTableRowElement;
    expect(firstRow).toBeTruthy();
    act(() => firstRow.click());
    expect(document.body.textContent).toContain('采用预览方案');

    // 采用
    clickButton('采用预览方案');
    expect(document.body.textContent).toContain('已采用方案');
    expect(localStorage.getItem('wheelset-planner-v1')).toContain('adoptedAt');

    // 撤销：采用记录消失，车轮数据仍在
    clickButton('撤销');
    expect(document.body.textContent).not.toContain('已采用方案（加工记录）');
    expect(document.querySelectorAll('tr.cand-row').length).toBeGreaterThan(0);
  });

  it('偏磨示例：首屏直接给出无解诊断与控制轮', async () => {
    await renderApp();
    clickButton('偏磨');
    expect(document.body.textContent).toContain('无可行镟修方案');
    expect(document.body.textContent).toContain('最小轮径');
    expect(document.body.textContent).toContain('偏磨');
  });

  it('缺测示例：缺段诊断且缺测轮不可成图', async () => {
    await renderApp();
    clickButton('缺测');
    expect(document.body.textContent).toContain('无可行镟修方案');
    expect(document.body.textContent).toContain('缺段/校验');
    expect(document.body.textContent).toContain('缺测');
  });

  it('刷新后从 localStorage 恢复已采用方案', async () => {
    const { root } = await renderApp();
    clickButton('正常磨耗');
    act(() => (document.querySelector('tr.cand-row') as HTMLTableRowElement).click());
    clickButton('采用预览方案');
    expect(document.body.textContent).toContain('已采用方案');

    // 卸载重挂（模拟刷新）
    await act(async () => {
      root.unmount();
    });
    document.body.innerHTML = '';
    await renderApp();
    expect(document.body.textContent).toContain('已从本地恢复');
    expect(document.body.textContent).toContain('已采用方案');
  });
});
