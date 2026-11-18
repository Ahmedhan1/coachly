import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { DEMO_CODE } from './helpers';

// The trainer's logo on the home-screen icon. The app Worker endpoints (/api/brand, /b/<id>/...) are not
// served by `vite preview`, so they are mocked here; their own validation is unit-tested in shared/brandIcon.
const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const ID = '0123456789abcdef01234567';
const LOGO_PNG = readFileSync('public/icons/icon-512.png');

/** Width/height of a base64 PNG (IHDR). */
function pngDims(b64: string): [number, number] {
  const bytes = Buffer.from(b64, 'base64');
  return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
}

async function mockBrandServer(page: Page, uploads: Array<Record<string, unknown>> = []) {
  await page.route('**/api/brand', async (route) => {
    uploads.push(JSON.parse(route.request().postData() ?? '{}') as Record<string, unknown>);
    await route.fulfill({ json: { id: ID } });
  });
  await page.route(`**/b/${ID}/**`, async (route) => {
    const file = route.request().url().split('/').pop() ?? '';
    if (file === 'brand.json') return route.fulfill({ json: { id: ID, color: '#1D5FD1', startup: null } });
    if (file.endsWith('.png')) return route.fulfill({ body: LOGO_PNG, contentType: 'image/png' });
    return route.fulfill({ status: 404 });
  });
  return uploads;
}

test.use({ serviceWorkers: 'block' });

test.describe('install page (iPhone Safari)', () => {
  test.use({ userAgent: IPHONE });

  test('the picked logo becomes the home-screen icon, manifest and launch image', async ({ page }) => {
    const uploads = await mockBrandServer(page);
    await page.goto('/');
    const card = page.getByTestId('brand-icon-card');
    await expect(card).toContainText('حط اللوجو بتاعك على أيقونة التطبيق');
    await card.locator('input[type=file]').setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: LOGO_PNG });
    await expect(card.getByRole('status')).toContainText('الأيقونة جاهزة باللوجو بتاعك');

    expect(uploads).toHaveLength(1);
    const body = uploads[0] as { color: string; icon180: string; icon512: string; logo: string; startup: { png: string; width: number; height: number } | null };
    expect(body.color).toBe('#F25C1F');
    expect(pngDims(body.icon180)).toEqual([180, 180]);
    expect(pngDims(body.icon512)).toEqual([512, 512]);
    expect(Math.max(...pngDims(body.logo))).toBeLessThanOrEqual(512);
    expect(body.startup && pngDims(body.startup.png)).toEqual(body.startup && [body.startup.width, body.startup.height]);

    await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute('href', `/b/${ID}/icon-180.png`);
    await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', `/b/${ID}/manifest.webmanifest`);
    await expect(page.locator('link[rel="apple-touch-startup-image"]')).toHaveAttribute('href', `/b/${ID}/startup.png`);
    expect(new URL(page.url()).searchParams.get('brand')).toBe(ID);

    // Changing the background colour rebuilds the icon.
    await card.getByRole('radio', { name: 'أزرق' }).check({ force: true });
    await expect.poll(() => uploads.length).toBe(2);
    expect((uploads[1] as { color: string }).color).toBe('#1D5FD1');
  });

  test('an in-app icon link arrives ready', async ({ page }) => {
    await mockBrandServer(page);
    await page.goto(`/?brand=${ID}`);
    const card = page.getByTestId('brand-icon-card');
    await expect(card.getByRole('status')).toContainText('الأيقونة جاهزة باللوجو بتاعك');
    await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute('href', `/b/${ID}/icon-180.png`);
  });
});

test.describe('installed app', () => {
  test('first launch from a branded icon brings the logo in, and later launches show it instantly', async ({ page }) => {
    await mockBrandServer(page);
    await page.goto(`/?brand=${ID}&standalone=1`);
    await page.getByLabel('كود التفعيل').fill(DEMO_CODE);
    await page.getByRole('button', { name: 'تفعيل', exact: true }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'اسمك إيه؟' })).toBeVisible();
    await page.getByRole('textbox').first().fill('كابتن اختبار');
    await page.getByRole('button', { name: 'التالي' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'اللوجو بتاعك' })).toBeVisible();
    await expect(page.getByRole('img', { name: 'اللوجو' })).toBeVisible();

    // Next launch: the splash with the logo is on screen before the app bundle has run.
    await page.addInitScript(() => {
      document.addEventListener('DOMContentLoaded', () => {
        (window as { __splashAtDcl?: boolean }).__splashAtDcl = !!document.getElementById('boot-splash');
      });
    });
    await page.goto('/?standalone=1');
    await expect.poll(() => page.evaluate(() => (window as { __splashAtDcl?: boolean }).__splashAtDcl)).toBe(true);
  });

  test('a trainer who already installed gets a ready "new icon" link from the identity screen', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    const uploads = await mockBrandServer(page);
    await page.goto(`/?brand=${ID}&standalone=1`);
    await page.getByLabel('كود التفعيل').fill(DEMO_CODE);
    await page.getByRole('button', { name: 'تفعيل', exact: true }).click();
    await page.getByRole('button', { name: 'بعدين' }).click();
    await expect(page.getByRole('navigation', { name: 'التنقل الرئيسي' })).toBeVisible();
    await page.goto('/more/settings/identity?standalone=1');
    await page.getByRole('button', { name: 'حط اللوجو على أيقونة التطبيق' }).click();
    const sheet = page.getByRole('dialog', { name: 'أيقونة التطبيق باللوجو بتاعك' });
    await expect(sheet.getByTestId('icon-link')).toContainText(`/?brand=${ID}`);
    expect(uploads.length).toBeGreaterThan(0);
    await sheet.getByRole('button', { name: 'انسخ اللينك' }).click();
    await expect(sheet.getByRole('button', { name: 'اتنسخ اللينك' })).toBeVisible();
  });
});
