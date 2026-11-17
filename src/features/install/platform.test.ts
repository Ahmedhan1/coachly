import { describe, expect, it } from 'vitest';
import { detectPlatform } from './platform';

const IPHONE_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const IPHONE_CHROME =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0 Mobile/15E148 Safari/604.1';
const IPHONE_WEBVIEW = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148';
const IPAD = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15';
const ANDROID_CHROME =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36';
const ANDROID_WEBVIEW =
  'Mozilla/5.0 (Linux; Android 14; SM-S918B; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/126.0.0.0 Mobile Safari/537.36';
const DESKTOP = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

describe('detectPlatform', () => {
  it('recognises iPhone Safari as installable iOS', () => {
    expect(detectPlatform(IPHONE_SAFARI)).toEqual({ platform: 'ios', inAppBrowser: false });
  });
  it('flags Chrome and in-app web views on iPhone', () => {
    expect(detectPlatform(IPHONE_CHROME).inAppBrowser).toBe(true);
    expect(detectPlatform(IPHONE_WEBVIEW).inAppBrowser).toBe(true);
  });
  it('treats a touch "Mac" as an iPad, and a mouse Mac as desktop', () => {
    expect(detectPlatform(IPAD, 5).platform).toBe('ios');
    expect(detectPlatform(IPAD, 0).platform).toBe('desktop');
  });
  it('recognises Android Chrome and Android web views', () => {
    expect(detectPlatform(ANDROID_CHROME)).toEqual({ platform: 'android', inAppBrowser: false });
    expect(detectPlatform(ANDROID_WEBVIEW)).toEqual({ platform: 'android', inAppBrowser: true });
  });
  it('falls back to desktop', () => {
    expect(detectPlatform(DESKTOP)).toEqual({ platform: 'desktop', inAppBrowser: false });
  });
});
