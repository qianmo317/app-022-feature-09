import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent, JSX } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import type { GuideStyle, Layout } from '../types';
import {
  GRID_LABELS,
  STRUCTURE_LABELS,
  TRACE_PRESETS,
  clampLayout,
  maxLines,
  maxPerLine,
  paginate,
} from '../lib/layout';
import {
  FOUR_LINE_MIN_GAP,
  FOUR_LINE_Y_DEFAULT,
  FOUR_LINE_Y_MAX,
  FOUR_LINE_Y_MIN,
  GUIDE_DEFAULT,
  GUIDE_DASH_MAX,
  GUIDE_DASH_MIN,
  GUIDE_GAP_MAX,
  GUIDE_GAP_MIN,
  HUIGONG_INSET_DEFAULT,
  HUIGONG_INSET_MAX,
  HUIGONG_INSET_MIN,
  HUIGONG_SIZE_DEFAULT,
  HUIGONG_SIZE_MIN,
  clampFourLineAt,
  clampHuigongInset,
  clampHuigongSize,
  fourLineRangeAt,
  huigongSizeMaxFor,
} from '../lib/guides';
import { parseInput } from '../lib/input';
import { readingsOf } from '../lib/pinyin';
import { charMetaOf, dataStats, importStrokes, strokeCountOf } from '../lib/data';
import { saveWorksheet } from '../lib/storage';
import { PageView } from '../components/PageView';
import { StrokePlayer } from '../components/StrokePlayer';
import { exportPng, exportSvg } from '../lib/exportImage';
import { isFormTarget, useWorksheetDoc } from '../hooks';

const PAGE_W_PX = 210 * (96 / 25.4); // 793.7

function NumField({
  label,
  value,
  min,
  max,
  onChange,
  testid,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (n: number) => void;
  testid?: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        type="number"
        data-testid={testid}
        value={value}
        min={min}
        max={max}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (!Number.isNaN(n)) onChange(n);
        }}
      />
    </label>
  );
}

function RangeField({
  label,
  value,
  min,
  max,
  onChange,
  testid,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (n: number) => void;
  testid?: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <span className="range-wrap">
        <input type="range" data-testid={testid} value={value} min={min} max={max} onChange={(e) => onChange(Number(e.target.value))} />
        <b>{value}</b>
      </span>
    </label>
  );
}

/** 编辑器：三栏（设置 | 预览 | 单字面板），自动保存，Ctrl+P 打印，←→ 切换选中字 */
export default function Editor(): JSX.Element {
  const { id } = useParams();
  const navigate = useNavigate();
  const { ws, setWs, notFound } = useWorksheetDoc(id);
  const [text, setText] = useState('');
  const [selected, setSelected] = useState('');
  const [zoom, setZoom] = useState<number | 'fit'>('fit');
  const [fitScale, setFitScale] = useState(0.7);
  const [importMsg, setImportMsg] = useState('');
  const [replaceText, setReplaceText] = useState('');
  const [dataVer, setDataVer] = useState(0);
  const [exportPage, setExportPage] = useState(0);
  /** 辅助线越界夹回的即时提示（下次调整时清掉） */
  const [guideWarn, setGuideWarn] = useState('');
  const previewRef = useRef<HTMLDivElement>(null);

  // 进入编辑器时初始化输入框与选中字
  useEffect(() => {
    if (ws) {
      setText(ws.chars.join(' '));
      setSelected(ws.chars[0] ?? '');
      setGuideWarn('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ws?.id]);

  // 预览「适应」缩放
  useEffect(() => {
    const el = previewRef.current;
    if (!el) return;
    const calc = () => {
      const w = el.clientWidth - 48;
      setFitScale(Math.max(0.2, Math.min(2, w / PAGE_W_PX)));
    };
    calc();
    window.addEventListener('resize', calc);
    return () => window.removeEventListener('resize', calc);
  }, []);

  // 自动保存（防抖），并记录页数
  useEffect(() => {
    if (!ws) return;
    const t = setTimeout(() => {
      saveWorksheet({ ...ws, pages: paginate(ws.chars, ws.layout, strokeCountOf).length, updatedAt: Date.now() });
    }, 250);
    return () => clearTimeout(t);
  }, [ws]);

  // 选中字失效时回退到第一个字
  useEffect(() => {
    if (ws && ws.chars.length > 0 && !ws.chars.includes(selected)) setSelected(ws.chars[0]);
  }, [ws, selected]);

  // 页码选择器越界回退
  const pageCount = useMemo(() => (ws ? paginate(ws.chars, ws.layout, strokeCountOf).length : 0), [ws]);
  useEffect(() => {
    setExportPage((p) => Math.min(p, Math.max(0, pageCount - 1)));
  }, [pageCount]);

  // 全局键盘：Ctrl/Cmd+P → 打印视图；←→ 切换选中字（输入控件内除外）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'p' || e.key === 'P')) {
        e.preventDefault();
        navigate(`/worksheet/${id}/print?autoprint=1`);
        return;
      }
      if (isFormTarget(e) || !ws || ws.chars.length === 0) return;
      // 播放器聚焦时 ←→ 由播放器自行处理（逐笔），避免双重响应
      if ((e.target as HTMLElement | null)?.closest?.('.player')) return;
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        const i = ws.chars.indexOf(selected);
        const d = e.key === 'ArrowLeft' ? -1 : 1;
        const ni = i < 0 ? 0 : (i + d + ws.chars.length) % ws.chars.length;
        setSelected(ws.chars[ni]);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [ws, selected, id, navigate]);

  if (notFound) return <Navigate to="/" replace />;
  if (!ws) return <div className="app-state">加载中…</div>;

  const layout = ws.layout;
  const clamped = clampLayout(layout);
  const char = selected;
  const readings = char ? readingsOf(char) : [];
  const meta = char ? charMetaOf(char) : undefined;
  const strokeCount = char ? strokeCountOf(char) : undefined;
  const stats = dataStats();
  const scale = zoom === 'fit' ? fitScale : zoom;

  const updateLayout = (patch: Partial<Layout>) =>
    setWs((w) => (w ? { ...w, layout: clampLayout({ ...w.layout, ...patch }) } : w));

  /** 回宫格离边：内框随离边收窄，越界时把边长夹回并提示 */
  const onHuigongInset = (n: number) => {
    if (!ws || !Number.isFinite(n)) { setGuideWarn(''); return; }
    const cur = clampLayout(ws.layout);
    const r = clampHuigongInset(n, cur.huigongSize!);
    updateLayout({ huigongInset: r.inset, huigongSize: r.size });
    setGuideWarn(
      r.clamped
        ? `离边须在 ${HUIGONG_INSET_MIN}~${HUIGONG_INSET_MAX}，且内框不得越出外框，已自动夹回（边长 ${r.size}）`
        : '',
    );
  };

  /** 回宫格内框边长：不得越过外框，超了夹到贴边并提示 */
  const onHuigongSize = (n: number) => {
    if (!ws || !Number.isFinite(n)) { setGuideWarn(''); return; }
    const cur = clampLayout(ws.layout);
    const r = clampHuigongSize(n, cur.huigongInset!);
    const max = huigongSizeMaxFor(r.inset);
    updateLayout({ huigongInset: r.inset, huigongSize: r.size });
    setGuideWarn(r.clamped ? `内框已到外框边缘（离边 ${r.inset} 时边长最多 ${max}），已夹回` : '');
  };

  /** 四线格某条线：与邻线至少隔开 FOUR_LINE_MIN_GAP，挤在一起时夹回并提示 */
  const onFourLineY = (index: number, n: number) => {
    if (!ws || !Number.isFinite(n)) { setGuideWarn(''); return; }
    const cur = clampLayout(ws.layout);
    const range = fourLineRangeAt(cur.fourLineYs!, index);
    const r = clampFourLineAt(cur.fourLineYs!, index, n);
    updateLayout({ fourLineYs: r.ys });
    setGuideWarn(
      r.clamped
        ? `第 ${index + 1} 条线与相邻线至少间隔 ${FOUR_LINE_MIN_GAP}，已夹回 ${range.min}~${range.max} 范围`
        : '',
    );
  };

  /** 辅助线样式（颜色 / 虚线段长 / 间隔） */
  const onGuide = (patch: Partial<GuideStyle>) => {
    if (!ws) return;
    const guide = { ...clampLayout(ws.layout).guide!, ...patch };
    updateLayout({ guide });
  };

  /** 辅助线与回宫/四线位置全部恢复传统默认 */
  const resetGuide = () => {
    updateLayout({
      guide: { ...GUIDE_DEFAULT },
      huigongInset: HUIGONG_INSET_DEFAULT,
      huigongSize: HUIGONG_SIZE_DEFAULT,
      fourLineYs: FOUR_LINE_Y_DEFAULT.map((v) => v) as Layout['fourLineYs'],
    });
    setGuideWarn('已恢复默认辅助线设置');
  };

  const onTextChange = (v: string, sortBy?: boolean) => {
    setText(v);
    setWs((w) =>
      w ? { ...w, chars: parseInput(v, { sortByStrokes: sortBy ?? w.sortByStrokes, strokeCountOf }) } : w,
    );
  };

  const setPinyinChoice = (ch: string, idx: number) =>
    setWs((w) => (w ? { ...w, pinyinChoice: { ...w.pinyinChoice, [ch]: idx } } : w));

  const doReplace = () => {
    const to = [...replaceText][0];
    if (!ws || !to || to === char) return;
    const idx = ws.chars.indexOf(char);
    if (idx < 0) return;
    const arr = [...ws.chars];
    arr[idx] = to;
    const chars: string[] = [];
    const seen = new Set<string>();
    for (const c of arr) {
      if (!seen.has(c)) {
        seen.add(c);
        chars.push(c);
      }
    }
    setWs({ ...ws, chars });
    setText(chars.join(' '));
    setSelected(to);
    setReplaceText('');
  };

  const doDelete = () => {
    if (!ws) return;
    const chars = ws.chars.filter((c) => c !== char);
    setWs({ ...ws, chars });
    setText(chars.join(' '));
  };

  const onImportFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      const json: unknown = JSON.parse(await f.text());
      const n = importStrokes(json, selected);
      setDataVer((v) => v + 1);
      setImportMsg(`已导入 ${n} 条笔顺数据`);
    } catch (err) {
      setImportMsg(`导入失败：${err instanceof Error ? err.message : String(err)}`);
    }
    e.target.value = '';
  };

  return (
    <div className="editor">
      <header className="editor-bar">
        <Link to="/" className="btn ghost">← 首页</Link>
        <input
          className="title-input"
          data-testid="title-input"
          value={ws.title}
          onChange={(e) => setWs((w) => (w ? { ...w, title: e.target.value } : w))}
        />
        <div className="bar-actions">
          <Link className="btn" data-testid="print-link" to={`/worksheet/${id}/print?autoprint=1`}>打印</Link>
          <select data-testid="export-page" value={exportPage} onChange={(e) => setExportPage(Number(e.target.value))}>
            {Array.from({ length: pageCount }, (_, i) => (
              <option key={i} value={i}>第 {i + 1} 页</option>
            ))}
          </select>
          <button className="btn" data-testid="export-svg" onClick={() => exportSvg(ws, exportPage)}>导出 SVG</button>
          <button className="btn" data-testid="export-png" onClick={() => exportPng(ws, exportPage)}>导出 PNG</button>
        </div>
      </header>

      <div className="editor-grid">
        {/* 左栏：设置 */}
        <aside className="panel">
          <h3>原文输入</h3>
          <textarea
            data-testid="editor-chars"
            value={text}
            rows={4}
            onChange={(e) => onTextChange(e.target.value)}
          />
          <p className="hint">自动去重（保留首次出现顺序），支持汉字/字母/数字。</p>
          <label className="field">
            <span>按笔画数排序</span>
            <input
              type="checkbox"
              data-testid="sort-strokes"
              checked={Boolean(ws.sortByStrokes)}
              onChange={(e) => {
                const v = e.target.checked;
                setWs((w) => (w ? { ...w, sortByStrokes: v } : w));
                onTextChange(text, v);
              }}
            />
          </label>

          <h3>格线与尺寸</h3>
          <label className="field">
            <span>格线类型</span>
            <select
              data-testid="grid-select"
              value={layout.grid}
              onChange={(e) => {
                setGuideWarn('');
                updateLayout({ grid: e.target.value as Layout['grid'] });
              }}
            >
              {Object.entries(GRID_LABELS).map(([k, label]) => (
                <option key={k} value={k}>{label}</option>
              ))}
            </select>
          </label>
          {layout.grid === 'line' && (
            <label className="field">
              <span>拼音四线格</span>
              <input
                type="checkbox"
                data-testid="four-line"
                checked={Boolean(layout.fourLine)}
                onChange={(e) => updateLayout({ fourLine: e.target.checked })}
              />
            </label>
          )}
          <RangeField label="格宽 mm" value={layout.cellMm} min={12} max={35} testid="cell-mm" onChange={(n) => updateLayout({ cellMm: n })} />
          <p className="hint">每行最多 {maxPerLine(clamped.cellMm)} 格</p>
          <NumField label="每行格数" value={layout.perLine} min={1} max={maxPerLine(clamped.cellMm)} testid="per-line" onChange={(n) => updateLayout({ perLine: n })} />
          <NumField label="每页行数" value={layout.lines} min={1} max={maxLines(clamped.cellMm, clamped.lineGapMm)} testid="lines" onChange={(n) => updateLayout({ lines: n })} />
          <RangeField label="行距 mm" value={layout.lineGapMm} min={0} max={12} testid="line-gap" onChange={(n) => updateLayout({ lineGapMm: n })} />

          <h3>辅助线设置</h3>
          <p className="hint">用于田/米/回宫格的虚线与横线格中线；设置随字帖保存。</p>
          <label className="field">
            <span>辅助线颜色</span>
            <input
              type="color"
              data-testid="guide-color"
              value={clamped.guide!.color}
              onChange={(e) => onGuide({ color: e.target.value })}
            />
          </label>
          <RangeField
            label="虚线段长"
            value={clamped.guide!.dash}
            min={GUIDE_DASH_MIN}
            max={GUIDE_DASH_MAX}
            testid="guide-dash"
            onChange={(n) => onGuide({ dash: n })}
          />
          <RangeField
            label="虚线间隔"
            value={clamped.guide!.gap}
            min={GUIDE_GAP_MIN}
            max={GUIDE_GAP_MAX}
            testid="guide-gap"
            onChange={(n) => onGuide({ gap: n })}
          />
          <p className="hint">段长设为 {GUIDE_DASH_MIN} 时画实线。</p>
          {layout.grid === 'huigong' && (
            <>
              <NumField
                label="内框离边"
                value={layout.huigongInset ?? HUIGONG_INSET_DEFAULT}
                min={HUIGONG_INSET_MIN}
                max={HUIGONG_INSET_MAX}
                testid="huigong-inset"
                onChange={onHuigongInset}
              />
              <NumField
                label="内框边长"
                value={layout.huigongSize ?? HUIGONG_SIZE_DEFAULT}
                min={HUIGONG_SIZE_MIN}
                max={huigongSizeMaxFor(clamped.huigongInset!)}
                testid="huigong-size"
                onChange={onHuigongSize}
              />
              <p className="hint">
                离边 {HUIGONG_INSET_MIN}~{HUIGONG_INSET_MAX}，边长 {HUIGONG_SIZE_MIN}~
                {huigongSizeMaxFor(clamped.huigongInset!)}（须 ≤ 100 − 2×离边）。
              </p>
            </>
          )}
          {layout.grid === 'line' && layout.fourLine && (
            <div className="four-line-fields" data-testid="four-line-fields">
              {clamped.fourLineYs!.map((v, i) => {
                const { min, max } = fourLineRangeAt(clamped.fourLineYs!, i);
                return (
                  <NumField
                    key={i}
                    label={`第 ${i + 1} 条线`}
                    value={v}
                    min={min}
                    max={max}
                    testid={`four-line-y${i}`}
                    onChange={(n) => onFourLineY(i, n)}
                  />
                );
              })}
              <p className="hint">
                位置 {FOUR_LINE_Y_MIN}~{FOUR_LINE_Y_MAX}，相邻两条至少间隔 {FOUR_LINE_MIN_GAP}。
              </p>
            </div>
          )}
          {guideWarn && (
            <p className="error" data-testid="guide-warn">{guideWarn}</p>
          )}
          <button className="btn" data-testid="guide-reset" onClick={resetGuide}>恢复默认辅助线</button>

          <h3>内容组合</h3>
          <label className="field">
            <span>例字</span>
            <input
              type="checkbox"
              data-testid="mix-model"
              checked={layout.mix.model > 0}
              onChange={(e) => updateLayout({ mix: { ...layout.mix, model: e.target.checked ? 1 : 0 } })}
            />
          </label>
          <RangeField label="笔顺分解" value={layout.mix.strokeSteps} min={0} max={8} testid="mix-steps" onChange={(n) => updateLayout({ mix: { ...layout.mix, strokeSteps: n } })} />
          <RangeField label="描红格" value={layout.mix.trace} min={0} max={8} testid="mix-trace" onChange={(n) => updateLayout({ mix: { ...layout.mix, trace: n } })} />
          <RangeField label="空格" value={layout.mix.blank} min={0} max={8} testid="mix-blank" onChange={(n) => updateLayout({ mix: { ...layout.mix, blank: n } })} />

          <h3>描红颜色</h3>
          <div className="checks">
            {TRACE_PRESETS.map((t) => (
              <label key={t.value}>
                <input
                  type="radio"
                  name="trace-color"
                  data-testid="trace-color"
                  checked={layout.traceColor === t.value}
                  onChange={() => updateLayout({ traceColor: t.value })}
                />
                {t.label}
              </label>
            ))}
          </div>

          <h3>信息显示</h3>
          <div className="checks">
            {(
              [
                ['pinyin', '拼音'],
                ['radical', '部首'],
                ['strokeCount', '笔画数'],
                ['structure', '结构'],
              ] as const
            ).map(([key, label]) => (
              <label key={key}>
                <input
                  type="checkbox"
                  data-testid={`show-${key}`}
                  checked={layout.show[key]}
                  onChange={(e) => updateLayout({ show: { ...layout.show, [key]: e.target.checked } })}
                />
                {label}
              </label>
            ))}
          </div>

          <h3>笔顺数据</h3>
          <p className="hint" data-testid="data-stats">
            内置 {stats.bundled} 字 · 自定义 {stats.custom} 字
          </p>
        </aside>

        {/* 中栏：预览 */}
        <main className="preview-col">
          <div className="zoom-bar">
            <button className={`btn ${zoom === 'fit' ? 'active' : ''}`} data-testid="zoom-fit" onClick={() => setZoom('fit')}>适应</button>
            <button className={`btn ${zoom === 1 ? 'active' : ''}`} data-testid="zoom-100" onClick={() => setZoom(1)}>100%</button>
            <button className="btn" data-testid="zoom-out" onClick={() => setZoom(Math.max(0.2, (typeof zoom === 'number' ? zoom : fitScale) - 0.1))}>−</button>
            <button className="btn" data-testid="zoom-in" onClick={() => setZoom(Math.min(2, (typeof zoom === 'number' ? zoom : fitScale) + 0.1))}>＋</button>
            <span className="hint" data-testid="char-count">{ws.chars.length} 字 · {pageCount} 页</span>
            <label className="file-btn">
              导入笔顺数据
              <input type="file" accept=".json,application/json" data-testid="import-strokes" onChange={onImportFile} />
            </label>
            {importMsg && <span className="hint" data-testid="import-msg">{importMsg}</span>}
          </div>
          <div className="preview-scroll" ref={previewRef} data-testid="preview">
            <div className="preview-inner" style={{ transform: `scale(${scale})` }} key={`v${dataVer}`}>
              <PageView worksheet={ws} selectedChar={selected} onSelectChar={setSelected} />
            </div>
          </div>
        </main>

        {/* 右栏：单字面板 */}
        <aside className="panel" data-testid="char-panel">
          {char ? (
            <>
              <h3>选中字：{char}</h3>
              <StrokePlayer key={char} char={char} sizeMm={40} autoPlay />
              {readings.length > 0 ? (
                <div className="field-group">
                  <span>拼音{readings.length > 1 ? '（多音字）' : ''}</span>
                  <div className="pinyin-choices" data-testid="pinyin-choices">
                    {readings.map((r, i) => (
                      <label key={r}>
                        <input
                          type="radio"
                          name="pinyin"
                          data-testid="pinyin-choice"
                          checked={(ws.pinyinChoice?.[char] ?? 0) === i}
                          onChange={() => setPinyinChoice(char, i)}
                        />
                        {r}
                      </label>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="hint">无拼音（非汉字）</p>
              )}
              <ul className="meta-list" data-testid="char-meta">
                <li>部首：{meta?.radical ?? '—'}</li>
                <li>笔画：{strokeCount ?? '—'}</li>
                <li>结构：{meta?.structure ? (STRUCTURE_LABELS[meta.structure] ?? '—') : '—'}</li>
              </ul>
              <div className="field-row">
                <input
                  type="text"
                  data-testid="replace-input"
                  placeholder="替换为…"
                  value={replaceText}
                  maxLength={4}
                  onChange={(e) => setReplaceText(e.target.value)}
                />
                <button className="btn" data-testid="replace-btn" onClick={doReplace}>替换</button>
              </div>
              <div className="field-row">
                <button className="btn danger" data-testid="delete-char" onClick={doDelete}>删除该字</button>
              </div>
            </>
          ) : (
            <p className="hint">点击预览中的格子选择字</p>
          )}
        </aside>
      </div>
    </div>
  );
}
