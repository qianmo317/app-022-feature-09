import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { GridLines, RowContent } from '../../src/components/paint';
import { pageSvgMarkup } from '../../src/lib/exportImage';
import { defaultLayout } from '../../src/lib/layout';
import type { Worksheet } from '../../src/types';

const customLayout = {
  ...defaultLayout,
  grid: 'line' as const,
  fourLine: true,
  guideSettings: {
    huigongInset: 20,
    huigongSize: 60,
    fourLineYs: [12, 66, 68, 96] as [number, number, number, number],
    color: '#66aaff',
    dash: 7,
    gap: 3,
  },
};

describe('辅助线渲染与导出共用同一结果', () => {
  it('四线格使用配置的线位', () => {
    const svg = renderToStaticMarkup(createElement(GridLines, { x0: 0, layout: customLayout }));
    expect(svg).toContain('y1="86"');
    expect(svg).toContain('y2="86"');
  });

  it('回宫格使用配置的离边、边长、颜色与虚线疏密', () => {
    const layout = { ...customLayout, grid: 'huigong' as const, fourLine: false };
    const svg = renderToStaticMarkup(createElement(GridLines, { x0: 0, layout }));
    expect(svg).toContain('x="20" y="40" width="60" height="60" stroke="#66aaff" stroke-width="1.6" stroke-dasharray="7 3"');
  });

  it('导出 SVG 中四线格位置与预览原语一致', () => {
    const worksheet: Worksheet = {
      id: 'guide-line-test',
      title: '四线格测试',
      chars: ['a'],
      layout: {
        ...customLayout,
        perLine: 10,
        lines: 1,
        mix: { model: 1, strokeSteps: 0, trace: 0, blank: 0 },
      },
      pages: 1,
      updatedAt: 0,
    };
    const svg = pageSvgMarkup(worksheet, 0);
    expect(svg).toContain('<line x1="0" y1="86" x2="100" y2="86" stroke="#9aa0a6" stroke-width="2">');
    expect(svg).toContain('<g transform="translate(18.898 75.591) scale(0.7559055118110237)">');
  });

  it('导出 SVG 中回宫格颜色与虚线疏密与预览原语一致', () => {
    const worksheet: Worksheet = {
      id: 'guide-huigong-test',
      title: '回宫格测试',
      chars: ['一'],
      layout: {
        ...defaultLayout,
        grid: 'huigong',
        perLine: 10,
        lines: 1,
        mix: { model: 1, strokeSteps: 0, trace: 0, blank: 0 },
        guideSettings: customLayout.guideSettings,
      },
      pages: 1,
      updatedAt: 0,
    };
    const svg = pageSvgMarkup(worksheet, 0);
    expect(svg).toContain('x="20" y="40" width="60" height="60" stroke="#66aaff" stroke-width="1.6" stroke-dasharray="7 3"');
    expect(svg).toContain('<g transform="translate(18.898 75.591) scale(0.7559055118110237)">');
  });

  it('每行的每个单元格都绘制同一套辅助线', () => {
    const svg = renderToStaticMarkup(
      createElement(RowContent, {
        row: [{ char: 'a', cells: [{ kind: 'blank' }, { kind: 'blank' }] }],
        layout: customLayout,
      }),
    );
    expect(svg.match(/data-grid="line4"/g)).toHaveLength(2);
    expect(svg.match(/y1="86"/g)).toHaveLength(2);
  });
});
