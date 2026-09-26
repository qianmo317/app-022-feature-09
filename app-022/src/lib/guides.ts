/**
 * 字格辅助线配置：默认值、可用范围与夹取规则。
 * 单位均为「格内 unit」（格边长 100，1 unit = cellMm/100 mm）。
 * 预览 / 打印 / 导出共用这里算出的值，保证三者完全一致。
 */
import type { FourLineYs, GuideStyle } from '../types';

/** 回宫格内框传统比例：离边 16、边长 68（16+68+16=100） */
export const HUIGONG_INSET_DEFAULT = 16;
export const HUIGONG_SIZE_DEFAULT = 68;
export const HUIGONG_INSET_MIN = 0;
export const HUIGONG_INSET_MAX = 49; // 两边至少各留 0，内框最小 2
export const HUIGONG_SIZE_MIN = 2;
export const HUIGONG_SIZE_MAX = 100;

/** 拼音四线格默认位置（上格 28 / 中格 28 / 下格 28，首线在 12） */
export const FOUR_LINE_Y_DEFAULT: FourLineYs = [12, 40, 68, 96];
export const FOUR_LINE_Y_MIN = 0;
export const FOUR_LINE_Y_MAX = 100;
/** 相邻两条线的最小间距，避免挤在一起 */
export const FOUR_LINE_MIN_GAP = 4;

/** 辅助线默认颜色与虚线疏密（与既有画格保持一致） */
export const GUIDE_DEFAULT: GuideStyle = { color: '#e8a3a3', dash: 5, gap: 4 };
export const GUIDE_DASH_MIN = 1; // 1 视为实线
export const GUIDE_DASH_MAX = 20;
export const GUIDE_GAP_MIN = 1;
export const GUIDE_GAP_MAX = 20;

const int = (v: unknown, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : fallback;

const clamp = (n: number, min: number, max: number): number => Math.min(max, Math.max(min, n));

/** 取有效的回宫格离边（缺失时给默认值） */
export function huigongInsetOf(inset: number | undefined): number {
  return clamp(int(inset, HUIGONG_INSET_DEFAULT), HUIGONG_INSET_MIN, HUIGONG_INSET_MAX);
}

/** 取有效的回宫格边长（缺失时给默认值） */
export function huigongSizeOf(size: number | undefined): number {
  return clamp(int(size, HUIGONG_SIZE_DEFAULT), HUIGONG_SIZE_MIN, HUIGONG_SIZE_MAX);
}

/** 给定离边时边长可用的上限（内框不得越出外框） */
export function huigongSizeMaxFor(inset: number): number {
  return Math.max(HUIGONG_SIZE_MIN, HUIGONG_SIZE_MAX - 2 * inset);
}

/**
 * 夹取「离边」编辑值：内框随离边收窄，若内框因此越界则把边长一并夹回。
 * 返回夹取后的 { inset, size } 与是否发生了夹取。
 */
export function clampHuigongInset(
  rawInset: number,
  size: number,
): { inset: number; size: number; clamped: boolean } {
  const safeSize = huigongSizeOf(size);
  const wanted = int(rawInset, HUIGONG_INSET_DEFAULT);
  const inset = clamp(wanted, HUIGONG_INSET_MIN, HUIGONG_INSET_MAX);
  const maxSize = huigongSizeMaxFor(inset);
  if (safeSize <= maxSize) return { inset, size: safeSize, clamped: inset !== wanted };
  // 离边变大后内框越出外框：把边长一并夹回
  return { inset, size: maxSize, clamped: true };
}

/**
 * 夹取「边长」编辑值：边长不得超过 100-2×离边，否则夹到贴边。
 */
export function clampHuigongSize(
  rawSize: number,
  inset: number,
): { inset: number; size: number; clamped: boolean } {
  const safeInset = huigongInsetOf(inset);
  const maxSize = huigongSizeMaxFor(safeInset);
  const wanted = int(rawSize, HUIGONG_SIZE_DEFAULT);
  const size = clamp(wanted, HUIGONG_SIZE_MIN, maxSize);
  return { inset: safeInset, size, clamped: size !== wanted };
}

/** 四线格某一条线编辑时的可用范围（与相邻线至少隔开 FOUR_LINE_MIN_GAP） */
export function fourLineRangeAt(
  ys: readonly number[],
  index: number,
): { min: number; max: number } {
  const prev = index === 0 ? FOUR_LINE_Y_MIN : ys[index - 1] + FOUR_LINE_MIN_GAP;
  const next =
    index === 3 ? FOUR_LINE_Y_MAX : ys[index + 1] - FOUR_LINE_MIN_GAP;
  return { min: prev, max: Math.max(prev, next) };
}

/**
 * 夹取单条线的编辑值，只动这一条；挤到邻线时夹回并给出提示标记。
 */
export function clampFourLineAt(
  ys: readonly number[],
  index: number,
  rawY: number,
): { ys: FourLineYs; clamped: boolean } {
  const safe = sanitizeFourLineYs(ys);
  const { min, max } = fourLineRangeAt(safe, index);
  const wanted = int(rawY, safe[index]);
  const y = clamp(wanted, min, max);
  const next = [...safe] as FourLineYs;
  next[index] = y;
  return { ys: next, clamped: y !== wanted };
}

/**
 * 规整任意来源（旧存档/非法输入）的四条线位置。
 * 正向逐根夹取，保证 0<=y0<y1<y2<y3<=100 且相邻间距 >= FOUR_LINE_MIN_GAP。
 */
export function sanitizeFourLineYs(raw: unknown): FourLineYs {
  const arr = Array.isArray(raw) ? raw : [];
  const ys: number[] = [];
  for (let i = 0; i < 4; i++) {
    const fallback = FOUR_LINE_Y_DEFAULT[i];
    // 前面至少留 i 个最小间隔；后面还要放 (3-i) 个最小间隔
    const min = Math.max(
      FOUR_LINE_Y_MIN + i * FOUR_LINE_MIN_GAP,
      (ys[i - 1] ?? FOUR_LINE_Y_MIN - FOUR_LINE_MIN_GAP) + FOUR_LINE_MIN_GAP,
    );
    const max = FOUR_LINE_Y_MAX - (3 - i) * FOUR_LINE_MIN_GAP;
    ys.push(clamp(int(arr[i], fallback), min, max));
  }
  return ys as FourLineYs;
}

/** 规整辅助线样式（旧存档自动补默认颜色与疏密） */
export function sanitizeGuide(raw: unknown): GuideStyle {
  const o = (raw ?? {}) as Partial<GuideStyle>;
  const color = typeof o.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(o.color.trim())
    ? o.color.trim().toLowerCase()
    : GUIDE_DEFAULT.color;
  return {
    color,
    dash: clamp(int(o.dash, GUIDE_DEFAULT.dash), GUIDE_DASH_MIN, GUIDE_DASH_MAX),
    gap: clamp(int(o.gap, GUIDE_DEFAULT.gap), GUIDE_GAP_MIN, GUIDE_GAP_MAX),
  };
}

/** SVG stroke-dasharray；dash=1 画实线 */
export function dashArrayOf(guide: GuideStyle): string | undefined {
  return guide.dash <= 1 ? undefined : `${guide.dash} ${guide.gap}`;
}
