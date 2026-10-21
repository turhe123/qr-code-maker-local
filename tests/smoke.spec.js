// smoke.spec.js — tool-specific checks for Static QR Code Maker, using the fictional Lantern Bean fixture.
// Regenerate the fixture with `node tests/make-fixtures.js`.
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const demo = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'lantern-bean.json'), 'utf8'));
const canvasData = (page) => page.evaluate(() => document.getElementById('qr-canvas').toDataURL());

// Count dark pixels so "visible QR code" means real modules, not a blank canvas.
const darkRatio = (page) => page.evaluate(() => {
  const c = document.getElementById('qr-canvas');
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  let dark = 0;
  for (let i = 0; i < d.length; i += 4) if (d[i] < 64) dark++;
  return dark / (c.width * c.height);
});

test.describe('Static QR Code Maker', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('./');
    await expect(page.locator('#qr-readout')).toContainText('version');
  });

  test('entering a link to the example menu page produces a visible QR code on a canvas', async ({ page }) => {
    await page.fill('#f-url', '');
    await expect(page.locator('#results .alert--error')).toBeVisible();
    await page.fill('#f-url', demo.url);
    await expect(page.locator('#results .alert--error')).toBeHidden();
    const canvas = page.locator('#qr-canvas');
    await expect(canvas).toBeVisible();
    const box = await canvas.boundingBox();
    expect(box.width).toBeGreaterThan(150);
    const ratio = await darkRatio(page);
    expect(ratio).toBeGreaterThan(0.2);
    expect(ratio).toBeLessThan(0.7);
    await expect(page.locator('#qr-readout')).toContainText(`${demo.url.length} characters`);
    await expect(page.locator('#qr-readout')).toContainText('Medium correction');
  });

  test('switching to Wi-Fi type and filling SSID and password changes the code', async ({ page }) => {
    await page.fill('#f-url', demo.url);
    const before = await canvasData(page);
    await page.click('.qr-type[data-type="wifi"]');
    await expect(page.locator('.qr-type[data-type="wifi"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#f-ssid')).toBeFocused();
    await expect(page.locator('#results .alert--error')).toContainText('network name');
    await page.keyboard.type(demo.wifi.ssid);
    await page.fill('#f-wifi-pass', demo.wifi.password);
    await expect(page.locator('#results .alert--error')).toBeHidden();
    const after = await canvasData(page);
    expect(after).not.toBe(before);
    const expected = `WIFI:T:WPA;S:${demo.wifi.ssid};P:${demo.wifi.password};;`;
    await expect(page.locator('#qr-readout')).toContainText(`${expected.length} characters`);
    await expect(page.locator('#dl-png')).toHaveText('Download wifi-qr.png');
  });

  test('Download PNG yields a file larger than 500 bytes', async ({ page }) => {
    await page.fill('#f-url', demo.url);
    const [download] = await Promise.all([page.waitForEvent('download'), page.click('#dl-png')]);
    expect(download.suggestedFilename()).toBe('qr-code.png');
    const bytes = fs.readFileSync(await download.path());
    expect(bytes.length).toBeGreaterThan(500);
    expect(bytes.subarray(1, 4).toString('latin1')).toBe('PNG');
    expect(bytes.readUInt32BE(16)).toBe(1024); // width from the IHDR chunk
    expect(bytes.readUInt32BE(20)).toBe(1024);
  });

  test('Download SVG yields a file starting with an svg element', async ({ page }) => {
    await page.click('.qr-type[data-type="contact"]');
    await page.fill('#f-first', demo.contact.first);
    await page.fill('#f-last', demo.contact.last);
    await page.fill('#f-c-phone', demo.contact.phone);
    await page.fill('#f-c-email', demo.contact.email);
    await page.fill('#f-org', demo.contact.org);
    const [download] = await Promise.all([page.waitForEvent('download'), page.click('#dl-svg')]);
    expect(download.suggestedFilename()).toBe('contact-qr.svg');
    const text = fs.readFileSync(await download.path(), 'utf8');
    expect(text.startsWith('<svg')).toBeTruthy();
    expect(text).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect((text.match(/<path /g) || []).length).toBe(1);
    expect(text.trim().endsWith('</svg>')).toBeTruthy();
  });

  test('changing error correction to High updates the code', async ({ page }) => {
    await page.fill('#f-url', demo.url);
    const before = await canvasData(page);
    const vBefore = Number(await page.locator('#qr-canvas').getAttribute('data-version'));
    await page.selectOption('#o-ecc', 'H');
    await expect(page.locator('#qr-canvas')).toHaveAttribute('data-ecc', 'H');
    await expect(page.locator('#qr-readout')).toContainText('High correction');
    expect(await canvasData(page)).not.toBe(before);
    expect(Number(await page.locator('#qr-canvas').getAttribute('data-version'))).toBeGreaterThanOrEqual(vBefore);
  });

  test('too-long content shows an overflow error and Unicode text works', async ({ page }) => {
    await page.click('.qr-type[data-type="text"]');
    await page.fill('#f-text', 'Lantern Bean ☕ café 🌙');
    await expect(page.locator('#results .alert--error')).toBeHidden();
    await expect(page.locator('#qr-readout')).toContainText('21 characters · 27 bytes');
    await page.selectOption('#o-ecc', 'H');
    await page.fill('#f-text', 'x'.repeat(1300));
    await expect(page.locator('#results .alert--error')).toContainText('Too long for High');
    await expect(page.locator('#dl-png')).toBeDisabled();
    await page.selectOption('#o-ecc', 'L');
    await expect(page.locator('#results .alert--error')).toBeHidden();
  });

  test('warns about low contrast, inverted colours and tiny sizes', async ({ page }) => {
    await page.fill('#o-size', '96');
    await expect(page.locator('#qr-warnings')).toContainText('128 pixels');
    await page.fill('#o-fg', '#ffffff');
    await page.fill('#o-bg', '#000000');
    await expect(page.locator('#qr-warnings')).toContainText('lighter than the background');
    await page.fill('#o-fg', '#cccccc');
    await page.fill('#o-bg', '#ffffff');
    await expect(page.locator('#qr-warnings')).toContainText('Low contrast');
  });

  test('works at 390px wide', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    await page.click('.qr-type[data-type="wifi"]');
    await page.fill('#f-ssid', demo.wifi.ssid);
    await page.fill('#f-wifi-pass', demo.wifi.password);
    await expect(page.locator('#qr-canvas')).toBeVisible();
    const widths = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth, win: window.innerWidth }));
    expect(widths.doc).toBeLessThanOrEqual(widths.win);
    const box = await page.locator('#qr-canvas').boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(390);
    const dl = await page.locator('#dl-png').boundingBox();
    expect(dl.x + dl.width).toBeLessThanOrEqual(390);
    const [download] = await Promise.all([page.waitForEvent('download'), page.click('#dl-png')]);
    expect(download.suggestedFilename()).toBe('wifi-qr.png');
  });

  test('__demo shows the Lantern Bean guest Wi-Fi code', async ({ page }) => {
    await page.evaluate(() => window.__demo());
    await expect(page.locator('#f-ssid')).toHaveValue('LanternGuest');
    await expect(page.locator('#qr-readout')).toContainText('Quartile correction');
    expect(await darkRatio(page)).toBeGreaterThan(0.2);
  });
});
