// Inline script of the client page (/c/:shareId). Plain ES2020 for Safari 16.4+, no framework, no imports.
// It is a small port of shared/envelope.ts (PTK1: magic | iv(12) | AES-256-GCM ct+tag); byte compatibility is
// proven by test-browser/viewer.test.mjs (sealed by shared/envelope.ts -> opened here, and back).
// Everything from the document is written with textContent, never innerHTML.
// Keep this free of backticks and "${" (it lives inside String.raw).
export const VIEWER_SCRIPT = String.raw`(function () {
'use strict';
var T = {
  loading: 'جاري التحميل…',
  noKey: 'اللينك ناقص. اطلب من المدرب يبعتهولك تاني.',
  badKey: 'مش قادرين نفتح الصفحة باللينك ده. اطلب من المدرب لينك جديد.',
  revoked: 'اللينك ده اتلغى أو مش موجود. كلّم المدرب.',
  offline: 'مفيش نت أو السيرفر مش بيرد. جرّب تاني.',
  retry: 'جرّب تاني',
  hello: 'أهلاً ',
  updated: 'آخر تحديث: ',
  tabProgram: 'البرنامج',
  tabMeals: 'الأكل',
  tabCheckin: 'المتابعة',
  noProgram: 'لسه مفيش برنامج.',
  noMeals: 'لسه مفيش خطة أكل.',
  supplements: 'المكملات',
  notes: 'ملاحظات المدرب',
  sets: 'سيتات ',
  reps: 'عدّات ',
  rest: 'راحة ',
  sec: ' ث',
  tempo: 'تمبو ',
  rpe: 'RPE ',
  checkinTitle: 'المتابعة الأسبوعية',
  checkinHint: 'سجّل وزنك ومقاسك مرة في الأسبوع، والمدرب هيشوفهم.',
  weight: 'الوزن (كجم)',
  waist: 'الوسط (سم)',
  checkinNotes: 'ملاحظات',
  photo: 'صورة (اختياري)',
  send: 'ابعت للمدرب',
  sending: 'بيتبعت…',
  sent: 'وصلت للمدرب. شكراً!',
  empty: 'اكتب الوزن أو الوسط أو ملاحظة على الأقل.',
  badNumber: 'الرقم مش مظبوط.',
  tooMany: 'بعت كتير النهارده. جرّب بكرة.',
  tooBig: 'الصورة كبيرة. جرّب صورة تانية.',
  failed: 'ما اتبعتش. اتأكد من النت وجرّب تاني.',
  photoFailed: 'مش قادرين نقرا الصورة دي.'
};

var cfg = document.getElementById('cfg');
var shareId = cfg.getAttribute('data-share');
var imgBase = cfg.getAttribute('data-img');
var app = document.getElementById('app');
var enc = new TextEncoder();
var MAGIC = [80, 84, 75, 49]; // "PTK1"

function b64urlDecode(s) {
  if (!/^[A-Za-z0-9_-]*$/.test(s)) return null;
  var b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4) b64 += '=';
  try {
    var bin = atob(b64);
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch (e) { return null; }
}
function b64urlEncode(bytes) {
  var bin = '';
  for (var i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function keyFromHash() {
  var m = /(?:^#|&)k=([A-Za-z0-9_-]{43})(?:&|$)/.exec(location.hash);
  var raw = m ? b64urlDecode(m[1]) : null;
  return raw && raw.length === 32 ? raw : null;
}
function aesKey(raw) {
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}
function openEnvelope(raw, bytes) {
  if (bytes.length < 32) return Promise.resolve(null);
  for (var i = 0; i < 4; i++) if (bytes[i] !== MAGIC[i]) return Promise.resolve(null);
  return aesKey(raw).then(function (key) {
    return crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes.slice(4, 16) }, key, bytes.slice(16));
  }).then(function (plain) { return new Uint8Array(plain); }, function () { return null; });
}
function sealEnvelope(raw, data) {
  var iv = crypto.getRandomValues(new Uint8Array(12));
  return aesKey(raw).then(function (key) {
    return crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, key, data);
  }).then(function (ct) {
    var c = new Uint8Array(ct);
    var out = new Uint8Array(16 + c.length);
    out.set(MAGIC, 0); out.set(iv, 4); out.set(c, 16);
    return out;
  });
}
function writeToken(raw) {
  return crypto.subtle.importKey('raw', raw, 'HKDF', false, ['deriveBits']).then(function (k) {
    return crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: enc.encode('pt-checkin-write') }, k, 256);
  }).then(function (bits) { return b64urlEncode(new Uint8Array(bits)); });
}

function el(tag, cls, text) {
  var e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined && text !== null) e.textContent = String(text);
  return e;
}
function message(text, withRetry) {
  app.textContent = '';
  var box = el('div', 'card msg');
  box.appendChild(el('p', '', text));
  if (withRetry) {
    var b = el('button', 'btn', T.retry);
    b.type = 'button';
    b.addEventListener('click', start);
    box.appendChild(b);
  }
  app.appendChild(box);
}
function isStr(v, max) { return typeof v === 'string' && v.length <= max; }
function isNum(v) { return typeof v === 'number' && isFinite(v); }
function valid(doc) {
  return doc && doc.v === 1 && doc.brand && isStr(doc.brand.name, 80) && /^#[0-9A-Fa-f]{6}$/.test(doc.brand.color) &&
    doc.client && isStr(doc.client.firstName, 40) && Array.isArray(doc.days) && Array.isArray(doc.meals) &&
    Array.isArray(doc.supplements) && typeof doc.notes === 'string';
}
function pad(n) { return (n < 10 ? '0' : '') + n; }
function formatDate(sec) {
  var d = new Date(sec * 1000);
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}
function applyBrand(brand) {
  var hex = brand.color;
  var r = parseInt(hex.slice(1, 3), 16) / 255, g = parseInt(hex.slice(3, 5), 16) / 255, b = parseInt(hex.slice(5, 7), 16) / 255;
  var lin = function (c) { return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  var lum = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  document.documentElement.style.setProperty('--brand', hex);
  document.documentElement.style.setProperty('--brand-on', lum > 0.4 ? '#111111' : '#FFFFFF');
  var head = document.getElementById('brand');
  head.textContent = '';
  if (typeof brand.logo === 'string' && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+\/]+=*$/.test(brand.logo)) {
    var img = el('img', 'logo');
    img.alt = '';
    img.src = brand.logo;
    head.appendChild(img);
  }
  head.appendChild(el('span', 'brand-name', brand.name));
  document.title = brand.name || document.title;
}

function exerciseCard(x) {
  var li = el('li', 'ex');
  if (typeof x.image === 'string' && /^[A-Za-z0-9_-][A-Za-z0-9_.-]{0,127}$/.test(x.image) && x.image.indexOf('..') < 0 && imgBase) {
    var img = el('img', 'ex-img');
    img.alt = '';
    img.loading = 'lazy';
    img.decoding = 'async';
    img.addEventListener('error', function () { img.remove(); });
    img.src = imgBase + encodeURIComponent(x.image);
    li.appendChild(img);
  }
  var body = el('div', 'ex-body');
  body.appendChild(el('div', 'ex-name', isStr(x.name, 120) ? x.name : ''));
  var chips = el('div', 'chips');
  var add = function (label, value) { if (value !== undefined && value !== null && value !== '') chips.appendChild(el('span', 'chip', label + value)); };
  add(T.sets, isNum(x.sets) ? x.sets : undefined);
  add(T.reps, isStr(x.reps, 20) ? x.reps : undefined);
  add(T.rest, isNum(x.restSec) ? x.restSec + T.sec : undefined);
  add(T.tempo, isStr(x.tempo, 20) ? x.tempo : undefined);
  add(T.rpe, isNum(x.rpe) ? x.rpe : undefined);
  if (chips.childNodes.length) body.appendChild(chips);
  if (isStr(x.notes, 500) && x.notes) body.appendChild(el('p', 'sub', x.notes));
  li.appendChild(body);
  return li;
}

function programSection(doc) {
  var s = el('section', 'panel');
  s.id = 'p-program';
  if (isStr(doc.programTitle, 80) && doc.programTitle) s.appendChild(el('h2', '', doc.programTitle));
  if (!doc.days.length) s.appendChild(el('p', 'card sub', T.noProgram));
  doc.days.forEach(function (day) {
    if (!day || !Array.isArray(day.exercises)) return;
    var card = el('div', 'card');
    card.appendChild(el('h3', '', isStr(day.title, 80) ? day.title : ''));
    var ul = el('ul', 'list');
    day.exercises.forEach(function (x) { if (x) ul.appendChild(exerciseCard(x)); });
    card.appendChild(ul);
    s.appendChild(card);
  });
  return s;
}

function mealsSection(doc) {
  var s = el('section', 'panel');
  s.id = 'p-meals';
  if (!doc.meals.length) s.appendChild(el('p', 'card sub', T.noMeals));
  doc.meals.forEach(function (m) {
    if (!m) return;
    var card = el('div', 'card');
    var h = el('h3', '', isStr(m.title, 80) ? m.title : '');
    if (isStr(m.time, 20) && m.time) h.appendChild(el('span', 'time', m.time));
    card.appendChild(h);
    var ul = el('ul', 'items');
    (Array.isArray(m.items) ? m.items : []).forEach(function (it) { if (isStr(it, 200)) ul.appendChild(el('li', '', it)); });
    card.appendChild(ul);
    if (isStr(m.notes, 500) && m.notes) card.appendChild(el('p', 'sub', m.notes));
    s.appendChild(card);
  });
  if (doc.supplements.length) {
    var sc = el('div', 'card');
    sc.appendChild(el('h3', '', T.supplements));
    doc.supplements.forEach(function (x) {
      if (!x) return;
      var row = el('div', 'supp');
      row.appendChild(el('div', 'ex-name', isStr(x.name, 120) ? x.name : ''));
      if (isStr(x.text, 500)) row.appendChild(el('p', 'sub', x.text));
      sc.appendChild(row);
    });
    s.appendChild(sc);
  }
  return s;
}

function field(label, input) {
  var l = el('label', 'field');
  l.appendChild(el('span', 'label', label));
  l.appendChild(input);
  return l;
}
function toNumber(text) {
  var t = String(text).trim()
    .replace(/[٠-٩]/g, function (d) { return String(d.charCodeAt(0) - 0x0660); })
    .replace(/[۰-۹]/g, function (d) { return String(d.charCodeAt(0) - 0x06F0); })
    .replace(/[٫,]/g, '.');
  if (t === '') return undefined;
  return /^\d{1,3}(\.\d{1,2})?$/.test(t) ? Number(t) : NaN;
}
function loadBitmap(file) {
  if (window.createImageBitmap) return createImageBitmap(file).catch(function () { return loadImage(file); });
  return loadImage(file);
}
function loadImage(file) {
  return new Promise(function (resolve, reject) {
    var url = URL.createObjectURL(file);
    var img = new Image();
    img.onload = function () { resolve(img); };
    img.onerror = function () { reject(new Error('img')); };
    img.src = url;
  });
}
/** Downscales to <= 1200 px on the long side and re-encodes as JPEG (drops EXIF, including GPS). */
function downscale(file) {
  return loadBitmap(file).then(function (img) {
    var w = img.width, h = img.height, scale = Math.min(1, 1200 / Math.max(w, h));
    var canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(w * scale));
    canvas.height = Math.max(1, Math.round(h * scale));
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.8);
  });
}

function checkinSection(raw) {
  var s = el('section', 'panel');
  s.id = 'p-checkin';
  var card = el('form', 'card');
  card.noValidate = true;
  card.appendChild(el('h3', '', T.checkinTitle));
  card.appendChild(el('p', 'sub', T.checkinHint));
  var weight = el('input'); weight.name = 'weight'; weight.inputMode = 'decimal'; weight.autocomplete = 'off'; weight.dir = 'ltr';
  var waist = el('input'); waist.name = 'waist'; waist.inputMode = 'decimal'; waist.autocomplete = 'off'; waist.dir = 'ltr';
  var notes = el('textarea'); notes.name = 'notes'; notes.maxLength = 1000; notes.rows = 3;
  var photo = el('input'); photo.name = 'photo'; photo.type = 'file'; photo.accept = 'image/*';
  card.appendChild(field(T.weight, weight));
  card.appendChild(field(T.waist, waist));
  card.appendChild(field(T.checkinNotes, notes));
  card.appendChild(field(T.photo, photo));
  var status = el('p', 'status'); status.setAttribute('role', 'status');
  var btn = el('button', 'btn', T.send); btn.type = 'submit';
  card.appendChild(btn);
  card.appendChild(status);
  card.addEventListener('submit', function (ev) {
    ev.preventDefault();
    var w = toNumber(weight.value), wa = toNumber(waist.value), n = notes.value.trim();
    if ((w !== undefined && (isNaN(w) || w < 20 || w > 400)) || (wa !== undefined && (isNaN(wa) || wa < 30 || wa > 300))) { status.textContent = T.badNumber; return; }
    var file = photo.files && photo.files[0];
    if (w === undefined && wa === undefined && !n && !file) { status.textContent = T.empty; return; }
    btn.disabled = true;
    status.textContent = T.sending;
    var doc = { v: 1, kind: 'checkin', createdAt: Math.floor(Date.now() / 1000) };
    if (w !== undefined) doc.weightKg = w;
    if (wa !== undefined) doc.waistCm = wa;
    if (n) doc.notes = n.slice(0, 1000);
    (file ? downscale(file).then(function (url) { doc.photo = url; }, function () { throw new Error('photo'); }) : Promise.resolve())
      .then(function () { return Promise.all([sealEnvelope(raw, enc.encode(JSON.stringify(doc))), writeToken(raw)]); })
      .then(function (r) {
        return fetch('/api/share/' + shareId + '/checkins', {
          method: 'POST', body: r[0], cache: 'no-store', credentials: 'omit',
          headers: { 'Content-Type': 'application/octet-stream', 'X-Checkin-Token': r[1] }
        });
      })
      .then(function (res) {
        if (res.status === 201) { card.reset(); status.textContent = T.sent; }
        else if (res.status === 429) status.textContent = T.tooMany;
        else if (res.status === 413) status.textContent = T.tooBig;
        else status.textContent = T.failed;
      }, function (e) { status.textContent = e && e.message === 'photo' ? T.photoFailed : T.failed; })
      .then(function () { btn.disabled = false; });
  });
  s.appendChild(card);
  return s;
}

function render(doc, raw) {
  applyBrand(doc.brand);
  app.textContent = '';
  var top = el('div', 'intro');
  top.appendChild(el('h1', '', T.hello + doc.client.firstName));
  if (isNum(doc.updatedAt)) top.appendChild(el('p', 'sub', T.updated + formatDate(doc.updatedAt)));
  app.appendChild(top);
  var panels = [['p-program', T.tabProgram, programSection(doc)], ['p-meals', T.tabMeals, mealsSection(doc)]];
  if (doc.checkinsEnabled === true) panels.push(['p-checkin', T.tabCheckin, checkinSection(raw)]);
  var tabs = el('nav', 'tabs');
  tabs.setAttribute('role', 'tablist');
  var show = function (id) {
    panels.forEach(function (p) {
      p[2].hidden = p[0] !== id;
      var t = document.getElementById('t-' + p[0]);
      if (t) t.setAttribute('aria-selected', String(p[0] === id));
    });
  };
  panels.forEach(function (p) {
    var t = el('button', 'tab', p[1]);
    t.type = 'button'; t.id = 't-' + p[0]; t.setAttribute('role', 'tab');
    t.addEventListener('click', function () { show(p[0]); });
    tabs.appendChild(t);
  });
  app.appendChild(tabs);
  panels.forEach(function (p) { app.appendChild(p[2]); });
  if (doc.notes) {
    var nc = el('div', 'card');
    nc.appendChild(el('h3', '', T.notes));
    nc.appendChild(el('p', 'pre', doc.notes));
    panels[0][2].appendChild(nc);
  }
  show('p-program');
  document.body.setAttribute('data-ready', '1');
}

function start() {
  var raw = keyFromHash();
  if (!raw) { message(T.noKey, false); return; }
  message(T.loading, false);
  fetch('/api/share/' + shareId, { cache: 'no-cache', credentials: 'omit' })
    .then(function (res) {
      if (res.status === 404) { message(T.revoked, false); return null; }
      if (!res.ok) { message(T.offline, true); return null; }
      return res.arrayBuffer().then(function (buf) { return openEnvelope(raw, new Uint8Array(buf)); }).then(function (plain) {
        var doc = null;
        try { doc = plain ? JSON.parse(new TextDecoder().decode(plain)) : null; } catch (e) { doc = null; }
        if (!valid(doc)) { message(T.badKey, false); return; }
        render(doc, raw);
      });
    }, function () { message(T.offline, true); });
}
window.addEventListener('hashchange', start);
start();
})();`;
