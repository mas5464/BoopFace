import { expect, test } from '@playwright/test';

// head-shape / setHeadShape(): the head outline as a polygon, over whatever
// roundness is set, and back to the rounded head when taken off.

const errorsByPage = new WeakMap();

const page0 = async (page, html) => {
  const errors = [];
  errorsByPage.set(page, errors);
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/examples/basic.html');
  await page.evaluate(markup => { document.body.innerHTML = markup; }, html);
  await page.waitForFunction(() => [...document.querySelectorAll('boop-face')].every(f => f.shadowRoot?.getElementById('leftBase')));
};

test.afterEach(async ({ page }) => {
  expect(errorsByPage.get(page) ?? []).toEqual([]);
});

const outline = id => document.getElementById(id).shadowRoot.getElementById('headShape').getAttribute('d');

test('setHeadShape draws the polygon and null brings the rounded head back', async ({ page }) => {
  await page0(page, '<boop-face id="a"></boop-face>');
  const round = await page.evaluate(() => { a.setHeadRoundness(80); return a.shadowRoot.getElementById('headShape').getAttribute('d'); });

  await page.evaluate(() => a.setHeadShape('hexagon'));
  expect(await page.evaluate(() => a.getHeadShape())).toBe('hexagon');
  expect(await page.evaluate(() => a.getAttribute('head-shape'))).toBe('hexagon');
  const hexagon = await page.evaluate(outline, 'a');
  expect(hexagon).not.toBe(round);

  // Every point sits on the hexagon: the six corners are the widest, top and bottom are flat.
  const box = await page.evaluate(() => { const { x, width, height } = a.shadowRoot.getElementById('headShape').getBBox(); return { x, width, height }; });
  expect(box.x).toBeCloseTo(16, 0);
  expect(box.width).toBeCloseTo(208, 0);
  expect(box.height).toBeCloseTo(180, 0);

  await page.evaluate(() => a.setHeadShape(null));
  expect(await page.evaluate(() => a.getHeadShape())).toBeNull();
  expect(await page.evaluate(() => a.hasAttribute('head-shape'))).toBe(false);
  expect(await page.evaluate(outline, 'a')).toBe(round);
});

test('a shape stays on through roundness changes and never stacks on another', async ({ page }) => {
  await page0(page, '<boop-face id="a"></boop-face><boop-face id="b"></boop-face>');
  await page.evaluate(() => { a.setHeadShape('octagon'); b.setHeadShape('octagon'); });
  const octagon = await page.evaluate(outline, 'a');

  await page.evaluate(() => a.setHeadRoundness(10).setHeadRoundness(90));
  expect(await page.evaluate(() => a.getHeadRoundness())).toBe(90);
  expect(await page.evaluate(outline, 'a')).toBe(octagon);

  await page.evaluate(() => a.setHeadShape('diamond').setHeadShape('octagon'));
  expect(await page.evaluate(outline, 'a')).toBe(octagon);
  expect(await page.evaluate(outline, 'b')).toBe(octagon);
});

test('the head-shape attribute works on its own, and an unknown one is ignored', async ({ page }) => {
  const warnings = [];
  page.on('console', message => { if (message.type() === 'warning') warnings.push(message.text()); });
  await page0(page, '<boop-face id="a" head-shape="shield"></boop-face><boop-face id="b" head-shape="triangle"></boop-face><boop-face id="c"></boop-face>');
  await expect.poll(() => page.evaluate(() => a.getHeadShape())).toBe('shield');
  await expect.poll(() => page.evaluate(() => a._headShapeApplied)).toBe('shield');
  expect(await page.evaluate(() => b.getHeadShape())).toBeNull();
  expect(await page.evaluate(() => { try { b.setHeadShape('triangle'); return 'no error'; } catch (error) { return error.name; } })).toBe('RangeError');
  await expect.poll(() => warnings.some(text => text.includes('unknown head-shape "triangle"'))).toBe(true);
  // c never had a shape: its outline is the rounded head the shield is drawn over.
  expect(await page.evaluate(outline, 'a')).not.toBe(await page.evaluate(outline, 'c'));
  await page.evaluate(() => a.removeAttribute('head-shape'));
  await expect.poll(() => page.evaluate(outline, 'a')).toBe(await page.evaluate(outline, 'c'));
});

test('an avatar with no shape is left alone', async ({ page }) => {
  await page0(page, '<boop-face id="a"></boop-face>');
  await page.evaluate(() => {
    window.roundnessEvents = 0;
    a.addEventListener('head-roundness-change', () => { window.roundnessEvents++; });
  });
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => window.roundnessEvents)).toBe(0);
  expect(await page.evaluate(() => a._headShapeApplied ?? null)).toBeNull();
});

test('the 3D head and the skins take the shape too', async ({ page }) => {
  await page0(page, '<boop-face id="a" size="200" view="3d" head-shape="pentagon"></boop-face><boop-face id="b" skin="301" head-shape="hexagon"></boop-face>');
  await expect.poll(() => page.evaluate(() => a.dataset.view)).toBe('3d');
  await expect.poll(() => page.evaluate(() => !!a.shadowRoot.querySelector('.view-3d')?.shadowRoot?.querySelector('.head'))).toBe(true);
  // The 3D head is built from a capture keyed by the shape.
  await expect.poll(() => page.evaluate(() => a._view3dState?.key ?? '')).toMatch(/\|pentagon$/);
  // A skin paints through the same outline.
  await expect.poll(() => page.evaluate(() => b.getSkin())).toBe('301');
  expect(await page.evaluate(() => b.getHeadShape())).toBe('hexagon');
});
