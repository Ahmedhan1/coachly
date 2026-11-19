import { describe, expect, it } from 'vitest';
import { snapshotWarmupPasses } from './htmlPdfRenderer';

const UA = {
  iphoneSafari: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  iphoneStandalone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
  iphoneChrome: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0 Mobile/15E148 Safari/604.1',
  ipadDesktopMode: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
  macSafari: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
  androidChrome: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36',
  desktopFirefox: 'Mozilla/5.0 (X11; Linux x86_64; rv:128.0) Gecko/20100101 Firefox/128.0',
};

describe('snapshotWarmupPasses', () => {
  it('warms up on every iPhone browser (all WebKit), installed app included', () => {
    expect(snapshotWarmupPasses(UA.iphoneSafari)).toBe(2);
    expect(snapshotWarmupPasses(UA.iphoneStandalone)).toBe(2);
    expect(snapshotWarmupPasses(UA.iphoneChrome)).toBe(2);
  });

  it('warms up on an iPad that reports itself as a Mac, and on Mac Safari', () => {
    expect(snapshotWarmupPasses(UA.ipadDesktopMode, 5)).toBe(2);
    expect(snapshotWarmupPasses(UA.macSafari, 0)).toBe(2);
  });

  it('skips the extra passes on Chromium and Firefox', () => {
    expect(snapshotWarmupPasses(UA.androidChrome)).toBe(0);
    expect(snapshotWarmupPasses(UA.desktopFirefox)).toBe(0);
  });
});
