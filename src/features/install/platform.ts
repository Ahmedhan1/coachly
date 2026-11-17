export type InstallPlatform = 'ios' | 'android' | 'desktop';

export interface PlatformInfo {
  platform: InstallPlatform;
  /** Opened inside another app's web view (WhatsApp, Facebook, Instagram…), which cannot install. */
  inAppBrowser: boolean;
}

/**
 * Which install instructions to show. iPadOS reports a Mac user agent, so a "Macintosh" with a touch screen
 * counts as iOS. Pure: the caller passes navigator.userAgent and navigator.maxTouchPoints.
 */
export function detectPlatform(userAgent: string, maxTouchPoints = 0): PlatformInfo {
  const ua = userAgent;
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && maxTouchPoints > 1);
  if (ios) {
    // Safari's UA has "Safari/" and no other browser tag; in-app views (WhatsApp, FB) and Chrome/Firefox on iOS
    // cannot add to the home screen as a standalone app on older iOS versions.
    const otherBrowser = /CriOS|FxiOS|EdgiOS|OPiOS|FBAN|FBAV|Instagram|Line\/|WhatsApp/.test(ua);
    return { platform: 'ios', inAppBrowser: otherBrowser || !/Safari\//.test(ua) };
  }
  if (/Android/.test(ua)) {
    // "; wv)" marks an Android WebView (WhatsApp, Facebook, Instagram in-app browsers).
    const webView = /; wv\)/.test(ua) || /FBAN|FBAV|Instagram|WhatsApp/.test(ua);
    return { platform: 'android', inAppBrowser: webView };
  }
  return { platform: 'desktop', inAppBrowser: false };
}
