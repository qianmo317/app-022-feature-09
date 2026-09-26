import { expect, test, type Page } from '@playwright/test';

async function createWorksheet(page: Page, chars: string): Promise<string> {
  await page.goto('/');
  await page.fill('[data-testid="input-chars"]', chars);
  await page.click('[data-testid="create"]');
  await expect(page).toHaveURL(/\/worksheet\/[^/]+$/);
  return page.url().split('/').pop()!;
}

/** 应用启动需先加载笔顺数据才挂路由，首屏断言前先等编辑器就绪 */
async function waitEditor(page: Page, grid: string) {
  await expect(page.locator('[data-testid="grid-select"]')).toHaveValue(grid, { timeout: 20000 });
}

/** 第一个回宫格组合内「内框」rect（外框后的第二个 rect） */
async function huigongInnerRect(page: Page) {
  return page.evaluate(() => {
    const g = document.querySelector('[data-grid="huigong"]');
    if (!g) return null;
    const rect = g.querySelectorAll('rect')[1];
    return rect
      ? {
          x: rect.getAttribute('x'),
          y: rect.getAttribute('y'),
          width: rect.getAttribute('width'),
          height: rect.getAttribute('height'),
        }
      : null;
  });
}

/** 第一个四线格组合的四条线 y 坐标 */
async function fourLineYs(page: Page): Promise<number[]> {
  await expect(page.locator('[data-grid="line4"]').first()).toBeAttached({ timeout: 20000 });
  return page.evaluate(() =>
    [...(document.querySelector('[data-grid="line4"]')?.querySelectorAll('line') ?? [])].map((l) =>
      Number(l.getAttribute('y1')),
    ),
  );
}

/** 第一个米字格组合的内层辅助线 g 属性 */
async function miGuideAttrs(page: Page) {
  await expect(page.locator('[data-grid="mi"]').first()).toBeAttached({ timeout: 20000 });
  return page.evaluate(() => {
    const g = document.querySelector('[data-grid="mi"]');
    const inner = g?.querySelector('g') as SVGGElement | null;
    return inner
      ? { stroke: inner.getAttribute('stroke'), dash: inner.getAttribute('stroke-dasharray') }
      : null;
  });
}

test.describe('字格辅助线可调', () => {
  test('回宫格：内框离边/边长可调，越界夹回并提示，刷新/打印后一致', async ({ page }) => {
    const id = await createWorksheet(page, '春');
    await page.selectOption('[data-testid="grid-select"]', 'huigong');

    // 默认 16 / 68（y 含 20 units 信息带）
    await expect(await huigongInnerRect(page)).toMatchObject({
      x: '16',
      y: String(20 + 16),
      width: '68',
      height: '68',
    });

    // 离边调到 10（合法，无提示）
    await page.fill('[data-testid="huigong-inset"]', '10');
    await expect(await huigongInnerRect(page)).toMatchObject({ x: '10', width: '68' });
    await expect(page.locator('[data-testid="guide-warn"]')).toHaveCount(0);

    // 边长调到 80（合法）
    await page.fill('[data-testid="huigong-size"]', '80');
    await expect(await huigongInnerRect(page)).toMatchObject({ x: '10', width: '80', height: '80' });

    // 离边调到 20 → 内框 80 越出外框（100-40=60），边长夹回 60 并提示
    await page.fill('[data-testid="huigong-inset"]', '20');
    await expect(page.locator('[data-testid="huigong-size"]')).toHaveValue('60');
    await expect(await huigongInnerRect(page)).toMatchObject({ x: '20', width: '60' });
    await expect(page.locator('[data-testid="guide-warn"]')).toContainText('夹回');

    // 刷新后配置仍在
    await page.waitForTimeout(600);
    await page.reload();
    await waitEditor(page, 'huigong');
    await expect(page.locator('[data-testid="huigong-inset"]')).toHaveValue('20');
    await expect(page.locator('[data-testid="huigong-size"]')).toHaveValue('60');
    await expect(await huigongInnerRect(page)).toMatchObject({ x: '20', width: '60' });

    // 打印视图一个样
    await page.goto(`/worksheet/${id}/print`);
    await expect(page.locator('[data-grid="huigong"]').first()).toBeAttached({ timeout: 20000 });
    await expect(await huigongInnerRect(page)).toMatchObject({ x: '20', width: '60' });
  });

  test('四线格：四条线位置可调，挤在一起夹回并提示，刷新/打印后一致', async ({ page }) => {
    const id = await createWorksheet(page, 'a');
    await page.selectOption('[data-testid="grid-select"]', 'line');
    await page.check('[data-testid="four-line"]');
    await expect(page.locator('[data-testid="four-line-fields"]')).toBeVisible();

    // 默认 y（含信息带 20）：32/60/88/116
    expect(await fourLineYs(page)).toEqual([32, 60, 88, 116]);

    // 第 2 条线调到 50（合法）
    await page.fill('[data-testid="four-line-y1"]', '50');
    await expect(page.locator('[data-testid="four-line-y1"]')).toHaveValue('50');
    expect(await fourLineYs(page)).toEqual([32, 70, 88, 116]);

    // 再调到 13 → 距第 1 条线（12）不足 4，夹回 16（渲染 20+16=36）
    await page.fill('[data-testid="four-line-y1"]', '13');
    await expect(page.locator('[data-testid="four-line-y1"]')).toHaveValue('16');
    expect(await fourLineYs(page)).toEqual([32, 36, 88, 116]);
    await expect(page.locator('[data-testid="guide-warn"]')).toContainText('间隔');

    // 刷新后仍在
    await page.waitForTimeout(600);
    await page.reload();
    await waitEditor(page, 'line');
    await page.check('[data-testid="four-line"]');
    expect(await fourLineYs(page)).toEqual([32, 36, 88, 116]);

    // 打印视图一个样
    await page.goto(`/worksheet/${id}/print`);
    await expect(page.locator('[data-grid="line4"]').first()).toBeAttached({ timeout: 20000 });
    expect(await fourLineYs(page)).toEqual([32, 36, 88, 116]);
  });

  test('辅助线颜色与虚线疏密可调，预览/打印/导出同一套值', async ({ page }) => {
    const id = await createWorksheet(page, '春');
    await page.selectOption('[data-testid="grid-select"]', 'mi');

    await page.fill('[data-testid="guide-color"]', '#3366ff');
    await page.fill('[data-testid="guide-dash"]', '9');
    await page.fill('[data-testid="guide-gap"]', '2');
    await expect(await miGuideAttrs(page)).toMatchObject({ stroke: '#3366ff', dash: '9 2' });

    // 段长 1 → 实线（无 dasharray）
    await page.fill('[data-testid="guide-dash"]', '1');
    await expect(await miGuideAttrs(page)).toMatchObject({ dash: null });
    await page.fill('[data-testid="guide-dash"]', '9');

    // 导出 SVG 与预览同源（RowContent 服务端渲染同一组件）
    const dlPromise = page.waitForEvent('download');
    await page.click('[data-testid="export-svg"]');
    const dl = await dlPromise;
    const svgPath = await dl.path();
    const { readFile } = await import('node:fs/promises');
    const svg = await readFile(svgPath!, 'utf8');
    expect(svg).toContain('stroke="#3366ff"');
    expect(svg).toContain('stroke-dasharray="9 2"');

    // 打印视图同一套值
    await page.goto(`/worksheet/${id}/print`);
    await expect(page.locator('[data-grid="mi"]').first()).toBeAttached({ timeout: 20000 });
    expect(await miGuideAttrs(page)).toEqual({ stroke: '#3366ff', dash: '9 2' });

    // 重新打开仍在
    await page.goto(`/worksheet/${id}`);
    await waitEditor(page, 'mi');
    await expect(page.locator('[data-testid="guide-color"]')).toHaveValue('#3366ff');
    await expect(page.locator('[data-testid="guide-dash"]')).toHaveValue('9');
    await expect(page.locator('[data-testid="guide-gap"]')).toHaveValue('2');
  });

  test('恢复默认辅助线按钮', async ({ page }) => {
    await createWorksheet(page, '春');
    await page.selectOption('[data-testid="grid-select"]', 'huigong');
    await page.fill('[data-testid="huigong-inset"]', '8');
    await page.fill('[data-testid="huigong-size"]', '84');
    await page.fill('[data-testid="guide-color"]', '#123456');
    await page.click('[data-testid="guide-reset"]');
    await expect(page.locator('[data-testid="huigong-inset"]')).toHaveValue('16');
    await expect(page.locator('[data-testid="huigong-size"]')).toHaveValue('68');
    await expect(page.locator('[data-testid="guide-color"]')).toHaveValue('#e8a3a3');
    await expect(page.locator('[data-testid="guide-dash"]')).toHaveValue('5');
    await expect(page.locator('[data-testid="guide-gap"]')).toHaveValue('4');
    await expect(await huigongInnerRect(page)).toMatchObject({ x: '16', width: '68' });
  });
});
