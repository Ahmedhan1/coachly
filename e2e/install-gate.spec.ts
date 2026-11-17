import { expect, test } from '@playwright/test';

const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const IPHONE_WHATSAPP = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148';
const ANDROID =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36';
const DESKTOP = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

test.describe('iPhone Safari', () => {
  test.use({ userAgent: IPHONE });
  test('shows Share → Add to Home Screen and refuses to continue', async ({ page }) => {
    await page.goto('/');
    const gate = page.getByTestId('install-gate');
    await expect(gate).toHaveAttribute('data-platform', 'ios');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('ثبّت التطبيق على الشاشة الرئيسية');
    await expect(gate).toContainText('إضافة إلى الشاشة الرئيسية');
    await expect(page.getByRole('img', { name: 'رسم لزرار المشاركة' })).toBeVisible();
    await expect(page.getByRole('navigation')).toHaveCount(0);
    await expect(gate).not.toContainText('الصفحة دي مفتوحة جوه برنامج تاني');

    await page.goto('/clients');
    await expect(gate).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  });
});

test.describe('iPhone in-app browser', () => {
  test.use({ userAgent: IPHONE_WHATSAPP });
  test('tells the trainer to open the link in Safari', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('install-gate')).toContainText('الصفحة دي مفتوحة جوه برنامج تاني');
  });
});

test.describe('Android Chrome', () => {
  test.use({ userAgent: ANDROID });
  test('shows the Chrome ⋮ menu steps instead of the iPhone ones', async ({ page }) => {
    await page.goto('/');
    const gate = page.getByTestId('install-gate');
    await expect(gate).toHaveAttribute('data-platform', 'android');
    await expect(gate).toContainText('افتح الصفحة دي في Chrome');
    await expect(gate).toContainText('«تثبيت التطبيق»');
    await expect(page.getByRole('img', { name: 'رسم لقائمة Chrome وفيها تثبيت التطبيق' })).toBeVisible();
    await expect(gate).not.toContainText('Safari');
    await expect(page.getByRole('navigation')).toHaveCount(0);
  });

  test('offers a one-tap install button when Chrome fires beforeinstallprompt', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('install-gate')).toBeVisible();
    // Headless Chromium never fires the real event: simulate what Chrome sends when the app is installable.
    await page.evaluate(() => {
      const event = new Event('beforeinstallprompt') as Event & { prompt: () => Promise<void>; userChoice: Promise<unknown> };
      event.prompt = async () => {
        (window as unknown as { prompted: boolean }).prompted = true;
      };
      event.userChoice = Promise.resolve({ outcome: 'accepted' });
      window.dispatchEvent(event);
    });
    const install = page.getByRole('button', { name: 'ثبّت التطبيق' });
    await install.click();
    expect(await page.evaluate(() => (window as unknown as { prompted?: boolean }).prompted)).toBe(true);
    await page.evaluate(() => window.dispatchEvent(new Event('appinstalled')));
    await expect(page.getByRole('status')).toContainText('افتح التطبيق من أيقونة');
  });
});

test.describe('desktop', () => {
  test.use({ userAgent: DESKTOP, isMobile: false, hasTouch: false });
  test('explains the app is made for the phone', async ({ page }) => {
    await page.goto('/');
    const gate = page.getByTestId('install-gate');
    await expect(gate).toHaveAttribute('data-platform', 'desktop');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('التطبيق معمول للموبايل');
  });
});

test('is installable for Chrome: manifest, icons and a controlling service worker', async ({ page, request }) => {
  await page.goto('/');
  const href = await page.locator('link[rel="manifest"]').getAttribute('href');
  expect(href).toBeTruthy();
  const manifest = (await (await request.get(`/${href?.replace(/^\//, '')}`)).json()) as {
    name: string;
    start_url: string;
    display: string;
    icons: Array<{ src: string; sizes: string; purpose?: string }>;
  };
  expect(manifest.display).toBe('standalone');
  expect(manifest.start_url).toBe('/');
  const sizes = manifest.icons.map((i) => i.sizes);
  expect(sizes).toContain('192x192');
  expect(sizes).toContain('512x512');
  expect(manifest.icons.some((i) => i.purpose === 'maskable')).toBe(true);
  for (const icon of manifest.icons) {
    const res = await request.get(`/${icon.src.replace(/^\//, '')}`);
    expect(res.status(), icon.src).toBe(200);
    expect(res.headers()['content-type']).toContain('image/png');
  }
  await page.waitForFunction(async () => (await navigator.serviceWorker.getRegistration())?.active != null, null, { timeout: 30_000 });
});
