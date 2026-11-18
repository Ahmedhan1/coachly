// Instant launch splash: runs before the app bundle, so the trainer's logo is the very first thing on screen.
// Reads the cache written by src/features/identity/brandAssets.ts (same element id and look as
// src/app/BootSplash.ts, which takes over and fades it out). On the first launch of an app installed from a
// branded install page there is no cache yet, so the hosted logo (/?brand=<id>) is used. Classic script, no
// dependencies, every failure ignored (the app's own splash still runs).
(function () {
  try {
    var cache = null;
    try {
      cache = JSON.parse(window.localStorage.getItem('pt.brandAssets.v1') || 'null');
    } catch {
      cache = null;
    }
    var png = /^data:image\/png;base64,[A-Za-z0-9+/]+=*$/;
    var hex = /^#[0-9a-fA-F]{6}$/;
    var logo = cache && typeof cache.logo === 'string' && png.test(cache.logo) ? cache.logo : null;
    if (!logo) {
      var m = /[?&]brand=([0-9a-f]{24})(?:&|$)/.exec(window.location.search);
      if (m) logo = '/b/' + m[1] + '/logo.png';
    }
    if (!logo || document.getElementById('boot-splash')) return;
    var color = cache && hex.test(cache.color) ? cache.color : '#ffffff';
    var el = document.createElement('div');
    el.id = 'boot-splash';
    el.setAttribute('aria-hidden', 'true');
    el.style.cssText =
      'position:fixed;inset:0;z-index:2147483000;pointer-events:none;display:flex;align-items:center;justify-content:center;' +
      'background:' + color + ';transition:opacity 280ms ease-out;';
    var img = document.createElement('img');
    img.alt = '';
    img.decoding = 'sync';
    img.src = logo;
    img.style.cssText =
      'max-width:min(56vw,300px);max-height:34vh;object-fit:contain;background:#fff;border-radius:28px;padding:22px;box-shadow:0 18px 40px rgba(0,0,0,.18);';
    el.appendChild(img);
    document.body.appendChild(el);
    document.documentElement.style.background = color;
    window.__bootSplashAt = performance.now();
  } catch {
    /* the app's own splash still runs */
  }
})();
