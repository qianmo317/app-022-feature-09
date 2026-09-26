import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  FOUR_LINE_MIN_GAP,
  FOUR_LINE_Y_DEFAULT,
  GUIDE_DEFAULT,
  HUIGONG_INSET_DEFAULT,
  HUIGONG_SIZE_DEFAULT,
  clampFourLineAt,
  clampHuigongInset,
  clampHuigongSize,
  dashArrayOf,
  fourLineRangeAt,
  huigongSizeMaxFor,
  sanitizeFourLineYs,
  sanitizeGuide,
} from '../../src/lib/guides';
import { clampLayout, defaultLayout } from '../../src/lib/layout';
import { GridLines } from '../../src/components/paint';
import { pageSvgMarkup } from '../../src/lib/exportImage';
import type { Layout } from '../../src/types';

const baseLayout = (patch: Partial<Layout> = {}): Layout => ({ ...defaultLayout, ...patch });

describe('回宫格内框夹取', () => {
  it('默认离边 16、边长 68', () => {
    expect(HUIGONG_INSET_DEFAULT).toBe(16);
    expect(HUIGONG_SIZE_DEFAULT).toBe(68);
  });

  it('离边 16 时边长上限 = 68', () => {
    expect(huigongSizeMaxFor(16)).toBe(68);
  });

  it('离边调大到 20、边长 68 越界时，边长夹回 60', () => {
    const r = clampHuigongInset(20, 68);
    expect(r.inset).toBe(20);
    expect(r.size).toBe(60);
    expect(r.clamped).toBe(true);
  });

  it('离边调小不越界时边长不动', () => {
    const r = clampHuigongInset(10, 68);
    expect(r).toEqual({ inset: 10, size: 68, clamped: false });
  });

  it('离边越界（>49）夹回 49', () => {
    const r = clampHuigongInset(90, 68);
    expect(r.inset).toBe(49);
    expect(r.size).toBe(2);
    expect(r.clamped).toBe(true);
  });

  it('边长超过 100-2×离边时夹回贴边', () => {
    expect(clampHuigongSize(90, 16)).toEqual({ inset: 16, size: 68, clamped: true });
    expect(clampHuigongSize(68, 16)).toEqual({ inset: 16, size: 68, clamped: false });
    expect(clampHuigongSize(80, 10)).toEqual({ inset: 10, size: 80, clamped: false });
  });
});

describe('四线格位置夹取', () => {
  it('默认四条线 12/40/68/96', () => {
    expect(FOUR_LINE_Y_DEFAULT).toEqual([12, 40, 68, 96]);
  });

  it('第 2 条线范围受相邻线约束', () => {
    expect(fourLineRangeAt(FOUR_LINE_Y_DEFAULT, 1)).toEqual({
      min: 12 + FOUR_LINE_MIN_GAP,
      max: 68 - FOUR_LINE_MIN_GAP,
    });
  });

  it('两条线挤在一起时夹回（保持至少 4 个单位间隔）', () => {
    const r = clampFourLineAt(FOUR_LINE_Y_DEFAULT, 1, 13);
    expect(r.ys[1]).toBe(16);
    expect(r.clamped).toBe(true);
  });

  it('向下挤到第 3 条线时夹回', () => {
    const r = clampFourLineAt(FOUR_LINE_Y_DEFAULT, 1, 67);
    expect(r.ys[1]).toBe(64);
    expect(r.clamped).toBe(true);
  });

  it('合法位置不夹取', () => {
    const r = clampFourLineAt(FOUR_LINE_Y_DEFAULT, 2, 70);
    expect(r.ys[2]).toBe(70);
    expect(r.clamped).toBe(false);
  });

  it('首线不能小于 0、末线不能大于 100', () => {
    expect(clampFourLineAt(FOUR_LINE_Y_DEFAULT, 0, -5).ys[0]).toBe(0);
    expect(clampFourLineAt(FOUR_LINE_Y_DEFAULT, 3, 200).ys[3]).toBe(100);
  });
});

describe('存档规整（旧字帖 / 非法值）', () => {
  it('sanitizeFourLineYs 处理乱序/越界/缺失，输出严格递增', () => {
    const ys = sanitizeFourLineYs([90, 80, 5, 200]);
    expect(ys).toHaveLength(4);
    expect(ys[0]).toBeGreaterThanOrEqual(0);
    expect(ys[3]).toBeLessThanOrEqual(100);
    for (let i = 1; i < 4; i++) expect(ys[i] - ys[i - 1]).toBeGreaterThanOrEqual(FOUR_LINE_MIN_GAP);
  });

  it('sanitizeFourLineYs 缺字段时补默认值', () => {
    expect(sanitizeFourLineYs(undefined)).toEqual(FOUR_LINE_Y_DEFAULT);
    expect(sanitizeFourLineYs([10])).toEqual([10, 40, 68, 96]);
  });

  it('sanitizeGuide 缺字段补默认、非法颜色回退默认色', () => {
    expect(sanitizeGuide(undefined)).toEqual(GUIDE_DEFAULT);
    expect(sanitizeGuide({})).toEqual(GUIDE_DEFAULT);
    expect(sanitizeGuide({ color: 'red' })).toEqual(GUIDE_DEFAULT);
    expect(sanitizeGuide({ color: '#AABBCC', dash: 0, gap: 99 })).toEqual({
      color: '#aabbcc',
      dash: 1,
      gap: 20,
    });
  });

  it('dashArrayOf：段长 1 为实线，其余为虚线串', () => {
    expect(dashArrayOf({ color: '#000000', dash: 1, gap: 4 })).toBeUndefined();
    expect(dashArrayOf({ color: '#000000', dash: 5, gap: 4 })).toBe('5 4');
  });

  it('clampLayout 给旧存档补全新字段', () => {
    const c = clampLayout({ ...defaultLayout, guide: undefined, huigongInset: undefined, huigongSize: undefined, fourLineYs: undefined });
    expect(c.guide).toEqual(GUIDE_DEFAULT);
    expect(c.huigongInset).toBe(16);
    expect(c.huigongSize).toBe(68);
    expect(c.fourLineYs).toEqual([12, 40, 68, 96]);
  });

  it('clampLayout 修正越界的内框：16+90 越界 → 边长夹到 68', () => {
    const c = clampLayout(baseLayout({ huigongInset: 16, huigongSize: 90 }));
    expect(c.huigongSize).toBe(68);
  });
});

describe('渲染：预览组件与导出 SVG 取值一致', () => {
  it('回宫格：自定义离边/边长反映到内框 rect 的 x/y/width/height', () => {
    const layout = clampLayout(baseLayout({ grid: 'huigong', huigongInset: 10, huigongSize: 80 }));
    const markup = renderToStaticMarkup(<GridLines x0={0} layout={layout} />);
    const rects = [...markup.matchAll(/<rect[^>]*>/g)].map((m) => m[0]);
    expect(rects.some((r) => r.includes('x="10"') && r.includes('y="30"') && r.includes('width="80"') && r.includes('height="80"'))).toBe(true);
  });

  it('四线格：自定义 y 位置反映到四条 line', () => {
    const layout = clampLayout(baseLayout({ grid: 'line', fourLine: true, fourLineYs: [8, 36, 64, 92] }));
    const markup = renderToStaticMarkup(<GridLines x0={0} layout={layout} />);
    for (const ly of [8 + 20, 36 + 20, 64 + 20, 92 + 20]) {
      expect(markup).toContain(`y1="${ly}"`);
      expect(markup).toContain(`y2="${ly}"`);
    }
  });

  it('辅助线颜色与虚线疏密反映到 SVG 属性', () => {
    const layout = clampLayout(baseLayout({ grid: 'mi', guide: { color: '#3366ff', dash: 9, gap: 2 } }));
    const markup = renderToStaticMarkup(<GridLines x0={0} layout={layout} />);
    expect(markup).toContain('stroke="#3366ff"');
    expect(markup).toContain('stroke-dasharray="9 2"');
  });

  it('段长 1 时画实线（无 stroke-dasharray）', () => {
    const layout = clampLayout(baseLayout({ grid: 'tian', guide: { color: '#3366ff', dash: 1, gap: 4 } }));
    const markup = renderToStaticMarkup(<GridLines x0={0} layout={layout} />);
    expect(markup).not.toContain('stroke-dasharray');
  });

  it('导出的整页 SVG 与预览渲染使用同一份配置（颜色/疏密/内框/四线位置）', () => {
    const layout = baseLayout({
      grid: 'huigong',
      perLine: 1,
      lines: 1,
      huigongInset: 10,
      huigongSize: 80,
      guide: { color: '#123456', dash: 7, gap: 3 },
    });
    const worksheet = {
      id: 'x',
      title: 'T',
      chars: ['一'],
      layout,
      pages: 1,
      updatedAt: 0,
    };
    const svg = pageSvgMarkup(worksheet as never, 0);
    expect(svg).toContain('stroke="#123456"');
    expect(svg).toContain('stroke-dasharray="7 3"');
    expect(svg).toContain('width="80"');
    expect(svg).toContain('height="80"');
  });

  it('默认配置渲染结果与改造前的硬编码一致（16/68、12-40-68-96、#e8a3a3 / 5 4）', () => {
    const hg = renderToStaticMarkup(<GridLines x0={0} layout={clampLayout(baseLayout({ grid: 'huigong' }))} />);
    expect(hg).toContain('x="16"');
    expect(hg).toContain('width="68"');
    expect(hg).toContain('stroke="#e8a3a3"');
    expect(hg).toContain('stroke-dasharray="5 4"');
    const fl = renderToStaticMarkup(
      <GridLines x0={0} layout={clampLayout(baseLayout({ grid: 'line', fourLine: true }))} />,
    );
    for (const ly of [32, 60, 88, 116]) {
      expect(fl).toContain(`y1="${ly}"`);
    }
  });
});
