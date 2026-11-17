import { expect, test } from '@playwright/test';
import { openApp } from './helpers';

/** Set QA_SHOTS=<dir> to save the framing screenshots. */
const shot = process.env.QA_SHOTS;

for (const [name, id] of [
  ['glutes', 'pt_Frog_Pump'],
  ['calves', 'Standing_Calf_Raises'],
  ['biceps', 'Dumbbell_Bicep_Curl'],
  ['chest', 'pt_Dumbbell_Squeeze_Press'],
] as const) {
  test(`illustration framing: ${name}`, async ({ page }) => {
    test.setTimeout(60_000);
    await openApp(page, `/exercises/${id}`);
    const picture = page.locator('img[alt^="رسمة العضلات"]').first();
    await expect(picture).toBeVisible({ timeout: 30_000 });
    if (shot) await picture.screenshot({ path: `${shot}/ex-frame-${name}.png` });
  });
}
