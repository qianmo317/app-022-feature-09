import type { Block, GuideSettings, Layout, Page, Row } from '../types';
import { isCjk } from './input';
import { ROW_FACTOR } from '../components/paint';

/** A4 页面几何（mm）。左右留 5mm 装订边距，保证 10×20mm 默认每行格数正好放下。 */
export const PAGE = {
  wMm: 210,
  hMm: 297,
  marginLMm: 5,
  marginRMm: 5,
  marginTMm: 8,
  marginBMm: 8,
  headerMm: 12,
} as const;

export const usableWMm = PAGE.wMm - PAGE.marginLMm - PAGE.marginRMm; // 200
export const rowsAreaHMm = PAGE.hMm - PAGE.marginTMm - PAGE.marginBMm - PAGE.headerMm; // 269

export const TRACE_PRESETS = [
  { label: '浅', value: '#d9d9d9' },
  { label: '中', value: '#cccccc' },
  { label: '深', value: '#b3b3b3' },
] as const;

/** 辅助线几何边界（小格内部为 0..100） */
export const GUIDE_LIMITS = {
  huigongInset: { min: 0, max: 98 },
  huigongSize: { min: 2, max: 100 },
  fourLine: { min: 0, max: 100 },
  fourLineMinGap: 2,
  dash: { min: 1, max: 12 },
  gap: { min: 1, max: 12 },
} as const;

export const DEFAULT_GUIDE_SETTINGS: GuideSettings = {
  huigongInset: 16,
  huigongSize: 68,
  fourLineYs: [12, 40, 68, 96],
  color: '#e8a3a3',
  dash: 5,
  gap: 4,
};

export type FourLineGuideTarget = 0 | 1 | 2 | 3;

export const GRID_LABELS: Record<Layout['grid'], string> = {
  tian: '田字格',
  mi: '米字格',
  huigong: '回宫格',
  square: '方格',
  line: '横线',
};

export const STRUCTURE_LABELS: Record<string, string> = {
  left_right: '左右结构',
  top_bottom: '上下结构',
  single: '独体字',
  enclosure: '包围结构',
};

export function maxPerLine(cellMm: number): number {
  return Math.max(1, Math.floor(usableWMm / cellMm));
}

export function maxLines(cellMm: number, lineGapMm: number): number {
  const pitch = cellMm * ROW_FACTOR + lineGapMm;
  return Math.max(1, Math.floor(rowsAreaHMm / pitch));
}

function unitNumber(value: unknown, fallback: number): number {
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? n : fallback;
}

function clampUnit(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function normalizeColor(value: unknown): string {
  return typeof value === 'string' && /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value)
    ? value
    : DEFAULT_GUIDE_SETTINGS.color;
}

function normalizeFourLineYs(raw: GuideSettings['fourLineYs'] | undefined): GuideSettings['fourLineYs'] {
  const ys = DEFAULT_GUIDE_SETTINGS.fourLineYs.map((fallback, i) =>
    clampUnit(unitNumber(raw?.[i], fallback), GUIDE_LIMITS.fourLine.min, GUIDE_LIMITS.fourLine.max),
  ) as GuideSettings['fourLineYs'];

  for (let i = 1; i < ys.length; i++) {
    ys[i] = Math.max(ys[i], ys[i - 1] + GUIDE_LIMITS.fourLineMinGap);
  }
  for (let i = ys.length - 2; i >= 0; i--) {
    ys[i] = Math.min(ys[i], ys[i + 1] - GUIDE_LIMITS.fourLineMinGap);
  }
  return ys;
}

export type GuideActive =
  | { field: 'huigongInset' | 'huigongSize'; value: number }
  | { field: 'fourLineYs'; index: FourLineGuideTarget; value: number };

/** 归一化辅助线配置；编辑单个数值时优先保留其它已合法的数值，只夹回当前项 */
export function clampGuideSettings(raw?: Partial<GuideSettings>, active?: GuideActive): GuideSettings {
  const fallback = raw ?? {};
  let huigongInset = clampUnit(
    unitNumber(fallback.huigongInset, DEFAULT_GUIDE_SETTINGS.huigongInset),
    GUIDE_LIMITS.huigongInset.min,
    100 - GUIDE_LIMITS.huigongSize.min,
  );
  let huigongSize = clampUnit(
    unitNumber(fallback.huigongSize, DEFAULT_GUIDE_SETTINGS.huigongSize),
    GUIDE_LIMITS.huigongSize.min,
    GUIDE_LIMITS.huigongSize.max,
  );
  let fourLineYs = normalizeFourLineYs(fallback.fourLineYs);

  if (active?.field === 'huigongInset') {
    huigongInset = clampUnit(
      unitNumber(active.value, huigongInset),
      GUIDE_LIMITS.huigongInset.min,
      100 - huigongSize,
    );
  } else if (active?.field === 'huigongSize') {
    huigongSize = clampUnit(
      unitNumber(active.value, huigongSize),
      GUIDE_LIMITS.huigongSize.min,
      100 - huigongInset,
    );
  } else if (active?.field === 'fourLineYs') {
    const candidate = unitNumber(active.value, fourLineYs[active.index]);
    const ys = [...fourLineYs] as GuideSettings['fourLineYs'];
    ys[active.index] = clampUnit(
      candidate,
      active.index === 0 ? 0 : fourLineYs[active.index - 1] + GUIDE_LIMITS.fourLineMinGap,
      active.index === 3 ? 100 : fourLineYs[active.index + 1] - GUIDE_LIMITS.fourLineMinGap,
    );
    fourLineYs = ys;
  } else if (huigongInset + huigongSize > 100) {
    huigongSize = 100 - huigongInset;
  }

  return {
    huigongInset,
    huigongSize,
    fourLineYs,
    color: normalizeColor(fallback.color),
    dash: clampUnit(unitNumber(fallback.dash, DEFAULT_GUIDE_SETTINGS.dash), GUIDE_LIMITS.dash.min, GUIDE_LIMITS.dash.max),
    gap: clampUnit(unitNumber(fallback.gap, DEFAULT_GUIDE_SETTINGS.gap), GUIDE_LIMITS.gap.min, GUIDE_LIMITS.gap.max),
  };
}

/** 约束并修正非法/超界的版式配置 */
export function clampLayout(layout: Layout, guideActive?: GuideActive): Layout {
  const cellMm = Math.min(35, Math.max(12, Math.round(layout.cellMm)));
  const gap = Math.min(12, Math.max(0, Math.round(layout.lineGapMm)));
  const perLine = Math.min(maxPerLine(cellMm), Math.max(1, Math.round(layout.perLine)));
  const lines = Math.min(maxLines(cellMm, gap), Math.max(1, Math.round(layout.lines)));
  const mix = {
    model: Math.min(1, Math.max(0, Math.round(layout.mix.model))),
    strokeSteps: Math.min(8, Math.max(0, Math.round(layout.mix.strokeSteps))),
    trace: Math.min(8, Math.max(0, Math.round(layout.mix.trace))),
    blank: Math.min(8, Math.max(0, Math.round(layout.mix.blank))),
  };
  const guideSettings = clampGuideSettings(layout.guideSettings, guideActive);
  return { ...layout, cellMm, lineGapMm: gap, perLine, lines, mix, guideSettings };
}

/**
 * 一个字的组合小格。笔顺分解格数自适应笔画数（min(配置, 笔画数)）。
 * 无笔顺数据的汉字只保留例字与临写空格（不提供描红，避免误教）。
 */
export function buildBlock(char: string, layout: Layout, strokeCount: number | undefined): Block {
  const { mix } = layout;
  const cells: Block['cells'] = [];
  const noStrokeHanzi = strokeCount == null && isCjk(char);
  if (mix.model > 0) cells.push({ kind: 'model' });
  if (mix.strokeSteps > 0 && strokeCount != null) {
    const n = Math.min(mix.strokeSteps, strokeCount);
    for (let k = 1; k <= n; k++) cells.push({ kind: 'step', stepK: k });
  }
  if (!noStrokeHanzi) {
    for (let i = 0; i < mix.trace; i++) cells.push({ kind: 'trace' });
  }
  for (let i = 0; i < mix.blank; i++) cells.push({ kind: 'blank' });
  // 极端配置兜底：一个字的组合不允许超过一行格数
  return { char, cells: cells.slice(0, Math.max(1, layout.perLine)) };
}

/**
 * 分页排版：贪心按行填充。
 * 约束：一个字的所有小格必须在同一行、同一页（不拆字）；一行不跨页。
 */
export function paginate(
  chars: string[],
  layout: Layout,
  strokeCountOf: (ch: string) => number | undefined,
): Page[] {
  const clamped = clampLayout(layout);
  const rows: Row[] = [];
  let current: Row = [];
  let used = 0;
  for (const ch of chars) {
    const block = buildBlock(ch, clamped, strokeCountOf(ch));
    if (used > 0 && used + block.cells.length > clamped.perLine) {
      rows.push(current);
      current = [block];
      used = block.cells.length;
    } else {
      current.push(block);
      used += block.cells.length;
    }
  }
  if (current.length > 0) rows.push(current);

  const pages: Page[] = [];
  for (let i = 0; i < rows.length; i += clamped.lines) {
    pages.push(rows.slice(i, i + clamped.lines));
  }
  // 空内容也渲染一页（空白字帖可直接打印画格子）
  if (pages.length === 0) pages.push([]);
  return pages;
}

export const defaultLayout: Layout = {
  grid: 'tian',
  perLine: 10,
  lines: 10,
  cellMm: 20,
  lineGapMm: 2,
  mix: { model: 1, strokeSteps: 3, trace: 2, blank: 4 },
  show: { pinyin: true, radical: true, strokeCount: true, structure: true },
  traceColor: '#cccccc',
  guideSettings: DEFAULT_GUIDE_SETTINGS,
};
