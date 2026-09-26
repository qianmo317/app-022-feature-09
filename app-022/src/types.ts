/** 数据模型（对应需求文档 §7） */
export type GridKind = 'tian' | 'mi' | 'huigong' | 'square' | 'line';

export type Mix = { model: number; strokeSteps: number; trace: number; blank: number };

/** 辅助线参数：坐标均以 100×100 的小格为单位 */
export type GuideSettings = {
  /** 回宫格内框距外框边的距离 */
  huigongInset: number;
  /** 回宫格内框边长 */
  huigongSize: number;
  /** 拼音四线格四条横线的位置（自上向下） */
  fourLineYs: [number, number, number, number];
  /** 辅助线颜色 */
  color: string;
  /** 虚线段长度 */
  dash: number;
  /** 虚线间隔，数值越大越疏 */
  gap: number;
};

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
  /** 回宫格、四线格及虚线辅助线参数 */
  guideSettings?: GuideSettings;
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
