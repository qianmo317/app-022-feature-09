/** 数据模型（对应需求文档 §7） */
export type GridKind = 'tian' | 'mi' | 'huigong' | 'square' | 'line';

export type Mix = { model: number; strokeSteps: number; trace: number; blank: number };

/** 辅助线样式（田/米/回宫的虚线与中线、横线格中线） */
export type GuideStyle = {
  /** 线条颜色（#rrggbb） */
  color: string;
  /** 虚线段长（unit，>=2 时为虚线，1 = 实线） */
  dash: number;
  /** 虚线间隔（unit） */
  gap: number;
};

/** 拼音四线格四条横线的纵坐标（0~100 unit，自格顶向下，必须严格递增） */
export type FourLineYs = [number, number, number, number];

export type Layout = {
  grid: GridKind;
  perLine: number;
  lines: number;
  cellMm: number;
  lineGapMm: number;
  mix: Mix;
  show: { pinyin: boolean; radical: boolean; strokeCount: boolean; structure: boolean };
  traceColor: string;
  /** 拼音四线格（配合 grid=line 使用） */
  fourLine?: boolean;
  /** 辅助线颜色与虚线疏密 */
  guide?: GuideStyle;
  /** 回宫格内框离边距离（unit，四边相同，0~49） */
  huigongInset?: number;
  /** 回宫格内框边长（unit，2~100，受 inset 联动约束） */
  huigongSize?: number;
  /** 四线格四条线的位置（仅 fourLine 时使用） */
  fourLineYs?: FourLineYs;
};

export type CharStructure = 'left_right' | 'top_bottom' | 'single' | 'enclosure';

export type CharInfo = {
  char: string;
  pinyin?: string[];
  radical?: string;
  strokeCount?: number;
  structure?: CharStructure;
  /** 笔顺路径（SVG d），缺失时 undefined —— 必须显式提示「无笔顺数据」 */
  strokes?: { path: string; order: number }[];
};

export type Worksheet = {
  id: string;
  title: string;
  chars: string[];
  layout: Layout;
  pages: number;
  updatedAt: number;
  /** 多音字选择：char -> readings 下标 */
  pinyinChoice?: Record<string, number>;
  /** 输入选项：按笔画数排序 */
  sortByStrokes?: boolean;
};

/** 一个小格的类型：例字 / 笔顺分解(第 k 笔) / 描红 / 临写空格 */
export type CellKind = 'model' | 'step' | 'trace' | 'blank';
export type Cell = { kind: CellKind; stepK?: number };
/** 一个字的小格组合（所有小格必须同页同行） */
export type Block = { char: string; cells: Cell[] };
export type Row = Block[];
export type Page = Row[];
