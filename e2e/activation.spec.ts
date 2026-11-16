import { expect, test, type Page } from '@playwright/test';
import {
  bytesToHex,
  deviceFingerprint,
  generateKeyPair,
  signLicense,
  wrapOfflineCode,
  type LicensePayload,
} from '../shared/license';

/**
 * The e2e build normally uses the fake activation service. `?license-key=<hex>` (e2e build only) switches
 * to the REAL license service with a public key generated here, so the offline long code path is tested
 * end to end: device id on screen → signed by the "owner" → pasted → verified in the app → persisted.
 */
let keys: { privateKey: Uint8Array; publicKey: Uint8Array };

test.beforeAll(async () => {
  keys = await generateKeyPair();
});

async function longCodeFor(deviceId: string, over: Partial<LicensePayload> = {}): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const payload: LicensePayload = {
    v: 1,
    lid: 'lic_e2e',
    dev: await deviceFingerprint(deviceId),
    name: 'كابتن تجربة',
    iat: now - 60,
    actBy: now + 14 * 86_400,
    exp: null,
    feat: ['core'],
    ...over,
  };
  return wrapOfflineCode(await signLicense(payload, keys.privateKey));
}

async function openRealActivation(page: Page): Promise<string> {
  await page.goto(`/?standalone=1&license-key=${bytesToHex(keys.publicKey)}`);
  await expect(page.getByRole('heading', { level: 1, name: 'تفعيل التطبيق' })).toBeVisible();
  const deviceId = page.getByTestId('device-id');
  await expect(deviceId).toHaveText(/^[0-9a-f-]{36}$/);
  return (await deviceId.textContent()) ?? '';
}

test('activates with an offline long code signed for this device, and stays active after reload', async ({ page }) => {
  const deviceId = await openRealActivation(page);
  await page.getByRole('button', { name: /الكود الطويل/ }).click();
  const code = await longCodeFor(deviceId);
  // WhatsApp may split it over two lines: the app ignores whitespace.
  await page.getByLabel('الكود الطويل').fill(`${code.slice(0, 50)}\n${code.slice(50)}`);
  await page.getByRole('button', { name: 'تفعيل', exact: true }).click();
  await expect(page.getByText('خطوة 1 من 4')).toBeVisible();

  await page.reload();
  await expect(page.getByText('خطوة 1 من 4')).toBeVisible();
  // the device id survived the reload (stored in IndexedDB)
  await page.getByRole('button', { name: 'بعدين' }).click();
  await page.getByRole('button', { name: 'المزيد والإعدادات' }).click();
  await page.getByRole('link', { name: /الإعدادات/ }).click();
  await expect(page.getByTestId('device-id')).toHaveText(deviceId);
});

test('rejects a long code made for another device with a clear Arabic message', async ({ page }) => {
  await openRealActivation(page);
  await page.getByRole('button', { name: /الكود الطويل/ }).click();
  await page.getByLabel('الكود الطويل').fill(await longCodeFor('9a1b7c55-3333-4c44-8d55-aaaaaaaaaaaa'));
  await page.getByRole('button', { name: 'تفعيل', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('الكود ده معمول لجهاز تاني. ابعت رقم الجهاز اللي تحت لصاحب التطبيق.');
});

test('a short code without a configured server fails quietly with an Arabic message', async ({ page }) => {
  await openRealActivation(page);
  await page.getByLabel('كود التفعيل').fill('ABCD-EFGH-JKMN');
  await page.getByRole('button', { name: 'تفعيل', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('استخدم الكود الطويل');
});
