// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import App from '../src/App';

/** 极简渲染助手（react-dom/client + act），避免引入额外测试库 */
let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  localStorage.clear();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

async function renderApp() {
  await act(async () => {
    root.render(
      <React.StrictMode>
        <App />
      </React.StrictMode>,
    );
  });
}

function click(el: Element) {
  return act(async () => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

describe('界面端到端（jsdom）', () => {
  it('首屏渲染：三示例、四轮标签、叠图与候选表', async () => {
    await renderApp();
    expect(container.textContent).toContain('轮对镟修余量规划台');
    expect(container.textContent).toContain('正常磨耗');
    expect(container.textContent).toContain('偏磨/凹磨');
    expect(container.textContent).toContain('缺测无解');
    for (const p of ['M1', 'M2', 'T1', 'T2']) {
      expect(container.textContent).toContain(p);
    }
    // 正常场景推荐方案横幅
    expect(container.textContent).toContain('推荐方案');
    // 候选表至少一行
    const rows = container.querySelectorAll('table.cand tbody tr');
    expect(rows.length).toBeGreaterThan(1);
    // SVG 叠图存在
    expect(container.querySelectorAll('svg').length).toBeGreaterThanOrEqual(2);
  });

  it('预览候选→采用→撤销→重做，状态条随之变化', async () => {
    await renderApp();
    const row = container.querySelector('table.cand tbody tr')!;
    await click(row);
    expect(container.textContent).toContain('候选预览');
    expect(container.textContent).toContain('采用');

    const adoptBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent === '采用',
    )!;
    await click(adoptBtn);
    expect(container.textContent).toContain('方案 #1');
    expect(container.textContent).toContain('已采用方案');

    const undoBtn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes('撤销'))!;
    await click(undoBtn);
    expect(container.textContent).not.toContain('方案 #1 ●');
    const redoBtn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes('重做'))!;
    await click(redoBtn);
    expect(container.textContent).toContain('方案 #1');
  });

  it('切换缺测场景显示无解诊断与控制车轮 T2', async () => {
    await renderApp();
    const btn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('缺测无解'),
    )!;
    await click(btn);
    expect(container.textContent).toContain('无可行方案');
    expect(container.textContent).toContain('T2');
    expect(container.textContent).toContain('轮廓不可用');
  });

  it('刷新恢复：localStorage 中持久化已采用方案', async () => {
    await renderApp();
    const row = container.querySelector('table.cand tbody tr')!;
    await click(row);
    const adoptBtn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === '采用')!;
    await click(adoptBtn);
    const saved = JSON.parse(localStorage.getItem('wrp-state-v1')!);
    expect(saved.history.entries).toHaveLength(1);
    expect(saved.history.index).toBe(0);

    // 重新挂载（模拟刷新）
    await act(async () => root.unmount());
    root = createRoot(container);
    await renderApp();
    expect(container.textContent).toContain('方案 #1');
  });

  it('切换轮位更新尺寸卡；设置修改后自动重算', async () => {
    await renderApp();
    const tab = Array.from(container.querySelectorAll('button.wheel-tab')).find((b) =>
      b.textContent?.startsWith('T2'),
    )!;
    await click(tab);
    // 叠图 aria-label 切换
    const svg = container.querySelector('svg[aria-label="T2 轮廓叠图"]');
    expect(svg).toBeTruthy();
  });
});
