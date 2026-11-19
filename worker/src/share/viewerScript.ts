// Inline script of the client page (/c/:shareId). Plain ES2020 for Safari 16.4+, no framework, no imports.
// It is a small port of shared/envelope.ts (PTK1: magic | iv(12) | AES-256-GCM ct+tag); byte compatibility is
// proven by test-browser/viewer.test.mjs (sealed by shared/envelope.ts -> opened here, and back).
// Everything from the document is written with textContent, never innerHTML. Charts are SVG built with the DOM.
// Keep this free of backticks and "${" (it lives inside String.raw).
export const VIEWER_SCRIPT = String.raw`(function () {
'use strict';
var AR = {
  pageTitle: 'صفحتك',
  exFew: 'تمارين',
  exMany: 'تمرين',
  kg: ' كجم',
  loading: 'جاري التحميل…',
  noKey: 'اللينك ناقص. اطلب من المدرب يبعتهولك تاني.',
  badKey: 'مش قادرين نفتح الصفحة باللينك ده. اطلب من المدرب لينك جديد.',
  revoked: 'اللينك ده اتلغى أو مش موجود. كلّم المدرب.',
  offline: 'مفيش نت أو السيرفر مش بيرد. جرّب تاني.',
  retry: 'جرّب تاني',
  hello: 'أهلاً ',
  updated: 'آخر تحديث من المدرب: ',
  tabProgram: 'تمرينك',
  tabMeals: 'أكلك',
  tabProgress: 'تقدّمك',
  tabCheckin: 'متابعة',
  nextSession: 'الحصة الجاية',
  noNextSession: 'مفيش حصة محجوزة',
  minutes: ' دقيقة',
  packageLabel: 'باقتك',
  packageLeft: 'فاضل ',
  packageSuffix: '',
  of: ' من ',
  sessions: ' حصة',
  until: 'لحد ',
  nextWorkout: 'التمرين الجاي',
  goal: 'هدفك',
  noProgram: 'لسه المدرب ما حطش برنامج. هيظهر هنا أول ما يجهّزه.',
  noMeals: 'لسه مفيش خطة أكل. هتظهر هنا أول ما المدرب يجهّزها.',
  mealOption: 'اختيار ',
  mealOptionsHint: 'اختار اللي يعجبك، كلهم نفس السعرات والبروتين.',
  supplements: 'المكملات',
  notes: 'ملاحظات المدرب',
  setsTotal: ' سيت',
  next: 'الجاي',
  sets: 'سيتات ',
  reps: 'عدّات ',
  rest: 'راحة ',
  sec: ' ث',
  tempo: 'تمبو ',
  rpe: 'RPE ',
  superset: 'سوبر سيت ',
  targets: 'هدفك اليومي',
  kcalUnit: 'سعرة في اليوم',
  protein: 'بروتين',
  carbs: 'كارب',
  fat: 'دهون',
  gram: ' جم',
  water: 'المية: ',
  liter: ' لتر',
  dayKcal: ' سعرة',
  progressEmpty: 'لسه مفيش قياسات. ابعت أول متابعة من تبويب «متابعة» والمدرب هيتابعك.',
  series: { weight: 'الوزن', waist: 'الوسط', bodyFat: 'نسبة الدهون', hip: 'الهيب', chest: 'الصدر', arm: 'الدراع', thigh: 'الفخد' },
  units: { weight: 'كجم', waist: 'سم', bodyFat: '%', hip: 'سم', chest: 'سم', arm: 'سم', thigh: 'سم' },
  fromStart: ' من أول قياس',
  same: 'زي أول قياس بالظبط',
  records: 'أحسن أرقامك',
  attended: 'حضرت ',
  attendedSuffix: ' حصة لحد دلوقتي',
  checkinTitle: 'المتابعة الأسبوعية',
  checkinHint: 'سجّل وزنك ومقاساتك مرة في الأسبوع، والمدرب هيشوفهم عنده.',
  weight: 'الوزن (كجم)',
  waist: 'الوسط (سم)',
  more: 'مقاسات تانية (اختياري)',
  hip: 'الهيب (سم)',
  chest: 'الصدر (سم)',
  arm: 'الدراع (سم)',
  thigh: 'الفخد (سم)',
  neck: 'الرقبة (سم)',
  picksSent: 'اختياراتك في الوجبات هتتبعت للمدرب مع المتابعة.',
  checkinNotes: 'ملاحظات للمدرب',
  photo: 'صور (اختياري، لحد 3)',
  send: 'ابعت للمدرب',
  sending: 'بيتبعت…',
  sent: 'وصلت للمدرب. شكراً!',
  empty: 'اكتب الوزن أو مقاس أو ملاحظة على الأقل.',
  badNumber: 'فيه رقم مش مظبوط.',
  tooMany: 'بعت كتير النهارده. جرّب بكرة.',
  tooBig: 'الصور كبيرة. جرّب صور أقل.',
  failed: 'ما اتبعتش. اتأكد من النت وجرّب تاني.',
  photoFailed: 'مش قادرين نقرا الصورة دي.',
  addPhoto: '+ أضف صورة',
  myPhotoTitle: 'صورتك',
  myPhotoHint: 'حط صورة ليك، والمدرب هيشوفها في ملفك عنده.',
  myPhotoPick: 'اختار صورة',
  myPhotoSending: 'بنبعت الصورة…',
  myPhotoSent: 'الصورة وصلت للمدرب.',
  removePhoto: 'شيل الصورة',
  photoCount: function (n) { return n + ' من 3 صور'; },
  privateNote: 'الصفحة دي خاصة بيك. ما تبعتش اللينك لحد.',
  days: ['الأحد', 'الاتنين', 'التلات', 'الأربع', 'الخميس', 'الجمعة', 'السبت'],
  am: 'ص',
  pm: 'م',
  today: 'النهارده',
  tomorrow: 'بكرة',
  todayWorkout: 'ده تمرينك الجاي',
  streak: 'التزامك',
  weeksInRow: ' أسابيع ورا بعض',
  weekInRow: ' أسبوع',
  milestones: 'إنجازاتك',
  nextMilestone: 'الهدف الجاي: ',
  lostKg: 'نزلت ',
  gainedKg: 'زوّدت ',
  kgSuffix: ' كجم',
  waistDown: 'وسطك قلّ ',
  cmSuffix: ' سم',
  sessionsDone: ' حصة خلّصتها',
  weeksStreak: ' أسابيع التزام ورا بعض',
  checkinsDone: ' متابعات بعتها',
  since: 'بدأت معانا ',
  history: 'متابعاتك اللي فاتت',
  sleep: 'نومك (ساعات في الليلة)',
  energy: 'طاقتك الأسبوع ده',
  energyLabels: ['تعبان جداً', 'تعبان', 'عادي', 'كويس', 'ممتاز'],
  adherence: 'التزامك بالخطة (%)',
  howWeek: 'أسبوعك كان عامل إزاي؟'
};

var EN = {
  pageTitle: 'Your page',
  exFew: 'exercises',
  exMany: 'exercises',
  kg: ' kg',
  loading: 'Loading…',
  noKey: 'The link is incomplete. Ask your coach to send it again.',
  badKey: 'We could not open the page with this link. Ask your coach for a new one.',
  revoked: 'This link was cancelled or does not exist. Contact your coach.',
  offline: 'No internet, or the server is not responding. Try again.',
  retry: 'Try again',
  hello: 'Hi ',
  updated: 'Last update from your coach: ',
  tabProgram: 'Training',
  tabMeals: 'Meals',
  tabProgress: 'Progress',
  tabCheckin: 'Check-in',
  nextSession: 'Next session',
  noNextSession: 'No session booked',
  minutes: ' min',
  packageLabel: 'Your package',
  packageLeft: '',
  of: ' of ',
  sessions: ' sessions',
  packageSuffix: ' left',
  until: 'until ',
  nextWorkout: 'Next workout',
  goal: 'Your goal',
  noProgram: 'Your coach has not added a program yet. It shows here once it is ready.',
  noMeals: 'No meal plan yet. It shows here once your coach prepares it.',
  mealOption: 'Option ',
  mealOptionsHint: 'Pick the one you like; they all have the same calories and protein.',
  supplements: 'Supplements',
  notes: 'Coach notes',
  setsTotal: ' sets',
  next: 'Next',
  sets: 'Sets ',
  reps: 'Reps ',
  rest: 'Rest ',
  sec: 's',
  tempo: 'Tempo ',
  rpe: 'RPE ',
  superset: 'Superset ',
  targets: 'Your daily target',
  kcalUnit: 'kcal per day',
  protein: 'Protein',
  carbs: 'Carbs',
  fat: 'Fat',
  gram: ' g',
  water: 'Water: ',
  liter: ' L',
  dayKcal: ' kcal',
  progressEmpty: 'No measurements yet. Send your first check-in from the Check-in tab and your coach will follow up.',
  series: { weight: 'Weight', waist: 'Waist', bodyFat: 'Body fat', hip: 'Hips', chest: 'Chest', arm: 'Arm', thigh: 'Thigh' },
  units: { weight: 'kg', waist: 'cm', bodyFat: '%', hip: 'cm', chest: 'cm', arm: 'cm', thigh: 'cm' },
  fromStart: ' since the first measurement',
  same: 'Same as the first measurement',
  records: 'Your best lifts',
  attended: 'Attended ',
  attendedSuffix: ' sessions so far',
  checkinTitle: 'Weekly check-in',
  checkinHint: 'Log your weight and measurements once a week, and your coach will see them.',
  weight: 'Weight (kg)',
  waist: 'Waist (cm)',
  more: 'Other measurements (optional)',
  hip: 'Hips (cm)',
  chest: 'Chest (cm)',
  arm: 'Arm (cm)',
  thigh: 'Thigh (cm)',
  neck: 'Neck (cm)',
  picksSent: 'Your meal choices will be sent to your coach with this check-in.',
  checkinNotes: 'Notes for your coach',
  photo: 'Photos (optional, up to 3)',
  send: 'Send to coach',
  sending: 'Sending…',
  sent: 'Sent to your coach. Thanks!',
  empty: 'Enter at least your weight, a measurement or a note.',
  badNumber: 'A number is not valid.',
  tooMany: 'Too many check-ins today. Try tomorrow.',
  tooBig: 'The photos are too large. Try fewer photos.',
  failed: 'Not sent. Check your internet and try again.',
  photoFailed: 'We could not read this photo.',
  addPhoto: '+ Add a photo',
  myPhotoTitle: 'Your photo',
  myPhotoHint: 'Add a photo of yourself; your coach sees it in your file.',
  myPhotoPick: 'Choose a photo',
  myPhotoSending: 'Sending the photo…',
  myPhotoSent: 'Your coach has the photo.',
  removePhoto: 'Remove photo',
  photoCount: function (n) { return n + ' of 3 photos'; },
  privateNote: 'This page is private to you. Do not share the link.',
  days: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
  am: 'am',
  pm: 'pm',
  today: 'Today',
  tomorrow: 'Tomorrow',
  todayWorkout: 'Your next workout',
  streak: 'Your consistency',
  weeksInRow: ' weeks in a row',
  weekInRow: ' week',
  milestones: 'Your milestones',
  nextMilestone: 'Next goal: ',
  lostKg: 'Lost ',
  gainedKg: 'Gained ',
  kgSuffix: ' kg',
  waistDown: 'Waist down ',
  cmSuffix: ' cm',
  sessionsDone: ' sessions done',
  weeksStreak: ' weeks in a row',
  checkinsDone: ' check-ins sent',
  since: 'Started ',
  history: 'Your past check-ins',
  sleep: 'Sleep (hours per night)',
  energy: 'Your energy this week',
  energyLabels: ['Very tired', 'Tired', 'OK', 'Good', 'Great'],
  adherence: 'Plan adherence (%)',
  howWeek: 'How was your week?'
};
var T = AR;

/** The trainer's app language (doc.lang): English pages are LTR with English labels; Arabic is the default. */
function applyLanguage(doc) {
  var en = doc && doc.lang === 'en';
  T = en ? EN : AR;
  document.documentElement.lang = en ? 'en' : 'ar';
  document.documentElement.dir = en ? 'ltr' : 'rtl';
  document.title = T.pageTitle;
}

var cfg = document.getElementById('cfg');
var shareId = cfg.getAttribute('data-share');
var imgBase = cfg.getAttribute('data-img');
var app = document.getElementById('app');
var enc = new TextEncoder();
var MAGIC = [80, 84, 75, 49]; // "PTK1"
var SVG = 'http://www.w3.org/2000/svg';
var IMAGE_FILE = /^[A-Za-z0-9_-][A-Za-z0-9_.-]{0,127}$/;

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
function svg(tag, attrs) {
  var e = document.createElementNS(SVG, tag);
  for (var k in attrs) if (Object.prototype.hasOwnProperty.call(attrs, k)) e.setAttribute(k, String(attrs[k]));
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
function arr(v) { return Array.isArray(v) ? v : []; }
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
function shortDate(iso) { return isStr(iso, 10) ? Number(iso.slice(8, 10)) + '/' + Number(iso.slice(5, 7)) : ''; }
function isoDay(iso) { return isStr(iso, 10) ? Number(iso.slice(8, 10)) + '/' + Number(iso.slice(5, 7)) + '/' + iso.slice(0, 4) : ''; }
function count(n, few, many) { return n + ' ' + (T === EN ? (n === 1 ? few.replace(/s$/, '') : many) : (n >= 3 && n <= 10 ? few : many)); }
function fmt(n) { return String(Math.round(n * 10) / 10); }
function clock(d) {
  var h = d.getHours(), m = d.getMinutes();
  var h12 = h % 12 === 0 ? 12 : h % 12;
  return h12 + ':' + pad(m) + ' ' + (h < 12 ? T.am : T.pm);
}
function dayLabel(d) {
  var now = new Date();
  var a = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  var b = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  var diff = Math.round((b - a) / 86400000);
  if (diff === 0) return T.today;
  if (diff === 1) return T.tomorrow;
  return T.days[d.getDay()] + ' ' + d.getDate() + '/' + (d.getMonth() + 1);
}
function applyBrand(brand) {
  var hex = brand.color;
  var r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
  var lin = function (c) { c = c / 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  var lum = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  var root = document.documentElement.style;
  root.setProperty('--brand', hex);
  root.setProperty('--brand-on', lum > 0.4 ? '#111111' : '#FFFFFF');
  root.setProperty('--brand-tint', 'rgba(' + r + ',' + g + ',' + b + ',.14)');
  document.title = brand.name || document.title;
}
function hero(doc) {
  var head = document.getElementById('brand');
  head.textContent = '';
  var wrap = el('div', 'hero');
  var top = el('div', 'hero-top');
  if (typeof doc.brand.logo === 'string' && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+\/]+=*$/.test(doc.brand.logo)) {
    var img = el('img', 'logo');
    img.alt = '';
    img.src = doc.brand.logo;
    top.appendChild(img);
  }
  if (typeof doc.brand.photo === 'string' && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+\/]+=*$/.test(doc.brand.photo)) {
    var face = el('img', 'trainer-photo');
    face.alt = '';
    face.src = doc.brand.photo;
    top.appendChild(face);
  }
  top.appendChild(el('span', 'brand-name', doc.brand.name));
  wrap.appendChild(top);
  wrap.appendChild(el('h1', 'hello', T.hello + doc.client.firstName));
  if (isNum(doc.updatedAt)) wrap.appendChild(el('p', 'sub', T.updated + isoDay(formatDate(doc.updatedAt))));
  head.appendChild(wrap);
}

function stat(label, value, sub, accent) {
  var c = el('div', 'stat' + (accent ? ' accent' : ''));
  c.appendChild(el('span', 'stat-label', label));
  c.appendChild(el('span', 'stat-value', value));
  if (sub) c.appendChild(el('span', 'stat-sub', sub));
  return c;
}
function upcoming(doc) {
  var now = Date.now();
  var list = arr(doc.sessions).filter(function (s) { return s && isNum(s.at) && isNum(s.durationMin) && (s.at + s.durationMin * 60) * 1000 > now; });
  list.sort(function (a, b) { return a.at - b.at; });
  return list[0] || null;
}
function nextDayIndex(doc) {
  return isNum(doc.nextDay) && doc.nextDay >= 0 && doc.nextDay < doc.days.length ? doc.nextDay : 0;
}
function summary(doc) {
  var box = el('div', 'cards');
  var s = upcoming(doc);
  if (s) {
    var d = new Date(s.at * 1000);
    box.appendChild(stat(T.nextSession, dayLabel(d), clock(d) + ' · ' + s.durationMin + T.minutes, true));
  } else if (Array.isArray(doc.sessions)) {
    box.appendChild(stat(T.nextSession, T.noNextSession, ''));
  }
  if (doc.days.length > 0) {
    var day = doc.days[nextDayIndex(doc)];
    if (day && isStr(day.title, 80)) box.appendChild(stat(T.nextWorkout, day.title, count(arr(day.exercises).length, T.exFew, T.exMany)));
  }
  var p = doc.package;
  if (p && isNum(p.left) && isNum(p.total) && p.total > 0) {
    box.appendChild(stat(T.packageLabel, T.packageLeft + p.left + T.of + p.total + T.sessions + T.packageSuffix, isStr(p.endDate, 10) ? T.until + isoDay(p.endDate) : ''));
  }
  if (doc.goal && isStr(doc.goal.title, 80) && doc.goal.title) box.appendChild(stat(T.goal, doc.goal.title, ''));
  if (isNum(doc.streakWeeks) && doc.streakWeeks > 0) {
    box.appendChild(stat(T.streak, doc.streakWeeks + (doc.streakWeeks > 1 ? T.weeksInRow : T.weekInRow), isNum(doc.attended) && doc.attended > 0 ? T.attended + doc.attended + T.sessions : ''));
  }
  return box.childNodes.length ? box : null;
}

function pills(labels, selected, marked, onPick) {
  var row = el('div', 'pills');
  var buttons = labels.map(function (label, i) {
    var b = el('button', 'pill', label);
    b.type = 'button';
    b.setAttribute('aria-pressed', String(i === selected));
    if (i === marked) {
      var dot = el('span', 'dot');
      dot.title = T.next;
      dot.setAttribute('aria-label', T.next);
      b.appendChild(dot);
    }
    b.addEventListener('click', function () {
      buttons.forEach(function (x, j) { x.setAttribute('aria-pressed', String(j === i)); });
      onPick(i);
    });
    row.appendChild(b);
    return b;
  });
  return row;
}

function exerciseImage(file) {
  if (!(typeof file === 'string' && IMAGE_FILE.test(file) && file.indexOf('..') < 0 && imgBase)) return null;
  var img = el('img');
  img.alt = '';
  img.loading = 'lazy';
  img.decoding = 'async';
  img.src = imgBase + encodeURIComponent(file);
  return img;
}
function exerciseCard(x, n) {
  var li = el('li', 'ex');
  var media = el('div', 'ex-media');
  [x.image, x.image2].forEach(function (f, i) {
    var img = exerciseImage(f);
    if (!img) return;
    if (i === 0) img.className = 'ex-img';
    img.addEventListener('error', function () { img.remove(); if (!media.childNodes.length) media.remove(); });
    media.appendChild(img);
  });
  if (media.childNodes.length) li.appendChild(media);
  var body = el('div', 'ex-body');
  var top = el('div', 'ex-top');
  top.appendChild(el('span', 'ex-n', n));
  top.appendChild(el('div', 'ex-name', isStr(x.name, 120) ? x.name : ''));
  body.appendChild(top);
  var main = [];
  if (isNum(x.sets)) main.push(T.sets + x.sets);
  if (isStr(x.reps, 20) && x.reps) main.push(T.reps + x.reps);
  if (main.length) body.appendChild(el('div', 'ex-main', main.join(' × ')));
  var chips = el('div', 'chips');
  var add = function (label, value, cls) { if (value !== undefined && value !== null && value !== '') chips.appendChild(el('span', 'chip' + (cls ? ' ' + cls : ''), label + value)); };
  add(T.superset, isStr(x.group, 4) && x.group ? x.group : undefined, 'brand');
  add(T.rest, isNum(x.restSec) ? x.restSec + T.sec : undefined);
  add(T.tempo, isStr(x.tempo, 20) ? x.tempo : undefined);
  add(T.rpe, isNum(x.rpe) ? x.rpe : undefined);
  if (chips.childNodes.length) body.appendChild(chips);
  if (isStr(x.notes, 500) && x.notes) body.appendChild(el('p', 'sub', x.notes));
  li.appendChild(body);
  return li;
}
function dayView(day, isNext) {
  var box = el('div');
  if (isNext) box.appendChild(el('p', 'next-flag', T.todayWorkout));
  var exs = arr(day.exercises).filter(Boolean);
  var head = el('div', 'day-head');
  head.appendChild(el('h2', '', isStr(day.title, 80) ? day.title : ''));
  var sets = exs.reduce(function (n, x) { return n + (isNum(x.sets) ? x.sets : 0); }, 0);
  head.appendChild(el('span', 'sub', count(exs.length, T.exFew, T.exMany) + (sets ? ' · ' + sets + T.setsTotal : '')));
  box.appendChild(head);
  var ul = el('ul', 'list');
  exs.forEach(function (x, i) { ul.appendChild(exerciseCard(x, i + 1)); });
  box.appendChild(ul);
  return box;
}
function programSection(doc) {
  var s = el('section', 'panel');
  s.id = 'p-program';
  if (isStr(doc.programTitle, 80) && doc.programTitle) s.appendChild(el('h2', '', doc.programTitle));
  if (!doc.days.length) {
    s.appendChild(el('p', 'card empty', T.noProgram));
  } else {
    var days = doc.days.filter(function (d) { return d && Array.isArray(d.exercises); });
    var first = nextDayIndex(doc);
    var holder = el('div');
    var marked = isNum(doc.nextDay) ? first : -1;
    var showDay = function (i) { holder.textContent = ''; if (days[i]) holder.appendChild(dayView(days[i], i === marked)); };
    if (days.length > 1) {
      s.appendChild(pills(days.map(function (d, i) { return isStr(d.title, 80) && d.title ? d.title.split(' — ')[0] + (d.title.indexOf(' — ') > 0 ? ' · ' + d.title.split(' — ')[1] : '') : String(i + 1); }), first, isNum(doc.nextDay) ? first : -1, showDay));
    }
    s.appendChild(holder);
    showDay(first);
  }
  if (doc.notes) {
    var nc = el('div', 'card');
    nc.appendChild(el('h3', '', T.notes));
    nc.appendChild(el('p', 'pre', doc.notes));
    s.appendChild(nc);
  }
  return s;
}

function targetsCard(t) {
  if (!t || !isNum(t.kcal)) return null;
  var card = el('div', 'card');
  card.appendChild(el('h3', '', T.targets));
  var k = el('div', 'kcal');
  k.appendChild(el('span', 'num', Math.round(t.kcal)));
  card.appendChild(k);
  card.appendChild(el('p', 'sub', T.kcalUnit));
  var rows = [[T.protein, t.proteinG, 4], [T.carbs, t.carbG, 4], [T.fat, t.fatG, 9]].filter(function (r) { return isNum(r[1]); });
  if (rows.length) {
    var box = el('div', 'macros');
    rows.forEach(function (r) {
      var line = el('div');
      var head = el('div', 'macro-row');
      head.appendChild(el('span', '', r[0]));
      head.appendChild(el('strong', '', Math.round(r[1]) + T.gram));
      line.appendChild(head);
      var bar = el('div', 'bar');
      var fill = el('span');
      fill.style.setProperty('inline-size', Math.max(4, Math.min(100, Math.round((r[1] * r[2] * 100) / t.kcal))) + '%');
      bar.appendChild(fill);
      line.appendChild(bar);
      box.appendChild(line);
    });
    card.appendChild(box);
  }
  if (isNum(t.waterMinMl) && isNum(t.waterMaxMl)) card.appendChild(el('p', 'sub', T.water + fmt(t.waterMinMl / 1000) + '–' + fmt(t.waterMaxMl / 1000) + T.liter));
  return card;
}
/** The client's own pick among a meal's options, kept on this phone (by the meal's id when the app sent one). */
var MEAL_ID = /^[A-Za-z0-9_-]{1,64}$/;
var picksMemo = {};
function mealId(m) { return m && typeof m.id === 'string' && MEAL_ID.test(m.id) ? m.id : null; }
function mealPickKey(day, meal, id) { return 'pt.mealPick.' + location.pathname + '.' + (id ? 'id.' + id : day + '.' + meal); }
function readPick(day, meal, n, id) {
  var key = mealPickKey(day, meal, id);
  var raw = picksMemo[key];
  try {
    if (raw === undefined) raw = localStorage.getItem(key);
    if (raw === null && id) raw = localStorage.getItem(mealPickKey(day, meal, null));
  } catch (e) { /* private mode */ }
  var v = Number(raw);
  return raw !== null && raw !== undefined && v >= 0 && v < n && Math.floor(v) === v ? v : 0;
}
function savePick(day, meal, i, id) {
  var key = mealPickKey(day, meal, id);
  picksMemo[key] = String(i);
  try { localStorage.setItem(key, String(i)); } catch (e) { /* private mode: choice lasts this visit */ }
}
/** Every meal with options as [day index, meal index, meal] (same days the meals tab shows). */
function mealsWithOptions(doc) {
  var days = arr(doc.mealDays).filter(function (d) { return d && Array.isArray(d.meals); });
  if (!days.length && arr(doc.meals).length) days = [{ meals: doc.meals }];
  var out = [];
  days.forEach(function (d, di) {
    d.meals.forEach(function (m, mi) {
      if (m && Array.isArray(m.items) && arr(m.options).some(function (o) { return o && Array.isArray(o.items); })) out.push([di, mi, m]);
    });
  });
  return out;
}
/** The picks the check-in carries: meal id → option (0 = as planned). Only meals the app gave an id. */
function currentPicks(doc) {
  var seen = {};
  var picks = [];
  mealsWithOptions(doc).forEach(function (x) {
    var id = mealId(x[2]);
    if (!id || seen[id]) return;
    seen[id] = true;
    var n = 1 + arr(x[2].options).filter(function (o) { return o && Array.isArray(o.items); }).slice(0, 3).length;
    picks.push({ id: id, o: readPick(x[0], x[1], n, id) });
  });
  return picks.slice(0, 84);
}
function itemList(items) {
  var ul = el('ul', 'items');
  arr(items).forEach(function (it) { if (isStr(it, 200)) ul.appendChild(el('li', '', it)); });
  return ul;
}
function mealCards(meals, dayIndex) {
  var box = el('div');
  meals.forEach(function (m, mi) {
    if (!m) return;
    var card = el('div', 'card');
    var h = el('h3', '', isStr(m.title, 80) ? m.title : '');
    if (isStr(m.time, 20) && m.time) h.appendChild(el('span', 'time', m.time));
    card.appendChild(h);
    var choices = [m.items].concat(arr(m.options).filter(function (o) { return o && Array.isArray(o.items); }).slice(0, 3).map(function (o) { return o.items; }));
    if (choices.length > 1) {
      var holder = el('div');
      var show = function (i) {
        holder.textContent = '';
        holder.appendChild(itemList(choices[i]));
        savePick(dayIndex || 0, mi, i, mealId(m));
      };
      var start = readPick(dayIndex || 0, mi, choices.length, mealId(m));
      card.appendChild(el('p', 'sub', T.mealOptionsHint));
      card.appendChild(pills(choices.map(function (_, i) { return T.mealOption + (i + 1); }), start, -1, show));
      card.appendChild(holder);
      show(start);
    } else {
      card.appendChild(itemList(m.items));
    }
    if (isStr(m.notes, 500) && m.notes) card.appendChild(el('p', 'sub', m.notes));
    box.appendChild(card);
  });
  return box;
}
function mealsSection(doc) {
  var s = el('section', 'panel');
  s.id = 'p-meals';
  var tc = targetsCard(doc.targets);
  if (tc) s.appendChild(tc);
  var days = arr(doc.mealDays).filter(function (d) { return d && Array.isArray(d.meals); });
  if (!days.length && doc.meals.length) days = [{ title: '', meals: doc.meals }];
  if (!days.length) s.appendChild(el('p', 'card empty', T.noMeals));
  var holder = el('div');
  var showDay = function (i) {
    holder.textContent = '';
    var d = days[i];
    if (!d) return;
    if (isNum(d.kcal) && days.length > 1) holder.appendChild(el('p', 'sub', Math.round(d.kcal) + T.dayKcal));
    holder.appendChild(mealCards(d.meals, i));
  };
  if (days.length > 1) s.appendChild(pills(days.map(function (d, i) { return isStr(d.title, 80) && d.title ? d.title : String(i + 1); }), 0, -1, showDay));
  s.appendChild(holder);
  showDay(0);
  if (doc.supplements.length) {
    var sc = el('div', 'card');
    sc.appendChild(el('h3', '', T.supplements));
    doc.supplements.forEach(function (x) {
      if (!x) return;
      var row = el('div', 'supp');
      row.appendChild(el('div', 'ex-name', isStr(x.name, 120) ? x.name : ''));
      if (isStr(x.text, 500) && x.text) row.appendChild(el('p', 'sub', x.text));
      sc.appendChild(row);
    });
    s.appendChild(sc);
  }
  return s;
}

function lineChart(points) {
  var W = 320, H = 150, L = 34, R = 8, Tp = 10, B = 24;
  var vs = points.map(function (p) { return p.v; });
  var min = Math.min.apply(null, vs), max = Math.max.apply(null, vs);
  if (max - min < 1) { min -= 0.5; max += 0.5; }
  var padV = (max - min) * 0.15; min -= padV; max += padV;
  var x = function (i) { return points.length === 1 ? (L + W - R) / 2 : W - R - (i * (W - R - L)) / (points.length - 1); };
  var y = function (v) { return Tp + ((max - v) * (H - Tp - B)) / (max - min); };
  var chart = svg('svg', { viewBox: '0 0 ' + W + ' ' + H, class: 'chart', role: 'img' });
  [max - padV, min + padV].forEach(function (v) {
    chart.appendChild(svg('line', { x1: L, x2: W - R, y1: y(v), y2: y(v), class: 'grid' }));
    var lbl = svg('text', { x: 2, y: y(v) + 4, class: 'axis' });
    lbl.textContent = fmt(v);
    chart.appendChild(lbl);
  });
  // RTL: the oldest point sits on the right, the newest on the left (reading direction).
  var d = points.map(function (p, i) { return (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(p.v).toFixed(1); }).join(' ');
  chart.appendChild(svg('path', { d: d + ' L' + x(points.length - 1).toFixed(1) + ' ' + (H - B) + ' L' + x(0).toFixed(1) + ' ' + (H - B) + ' Z', class: 'area' }));
  chart.appendChild(svg('path', { d: d, class: 'line' }));
  points.forEach(function (p, i) { chart.appendChild(svg('circle', { cx: x(i), cy: y(p.v), r: 4, class: 'dot' })); });
  [0, points.length - 1].forEach(function (i) {
    var t = svg('text', { x: x(i), y: H - 6, class: 'axis', 'text-anchor': i === 0 ? 'end' : 'start' });
    t.textContent = shortDate(points[i].d);
    chart.appendChild(t);
  });
  return chart;
}
function seriesCard(series) {
  var pts = arr(series.points).filter(function (p) { return p && isNum(p.v) && isStr(p.d, 10); });
  if (!pts.length || !T.series[series.key]) return null;
  var unit = T.units[series.key];
  var card = el('div', 'card');
  card.appendChild(el('h3', '', T.series[series.key]));
  var last = pts[pts.length - 1];
  var big = el('div', 'big');
  big.appendChild(el('span', 'num', fmt(last.v)));
  big.appendChild(el('span', 'unit', unit));
  card.appendChild(big);
  if (pts.length > 1) {
    var diff = Math.round((last.v - pts[0].v) * 10) / 10;
    var delta = el('span', 'delta', diff === 0 ? T.same : '');
    if (diff !== 0) {
      delta.appendChild(el('span', 'num', (diff > 0 ? '+' : '−') + fmt(Math.abs(diff))));
      delta.appendChild(document.createTextNode(' ' + unit + T.fromStart));
    }
    card.appendChild(delta);
    card.appendChild(lineChart(pts));
  } else {
    card.appendChild(el('p', 'sub', shortDate(last.d)));
  }
  return card;
}
function seriesOf(doc, key) {
  var found = arr(doc.progress).filter(function (x) { return x && x.key === key; })[0];
  return found ? arr(found.points).filter(function (p) { return p && isNum(p.v) && isStr(p.d, 10); }) : [];
}
/** Achieved milestones and the next one, computed from what the trainer published (nothing is invented). */
function milestones(doc) {
  var done = [], next = [];
  var w = seriesOf(doc, 'weight');
  var lossGoal = !(doc.goal && /تضخيم|زيادة|muscle|gain|bulk/i.test(String(doc.goal.title)));
  if (w.length > 1) {
    var diff = Math.round((w[w.length - 1].v - w[0].v) * 10) / 10;
    var lost = lossGoal ? -diff : diff;
    var wk = [2, 5, 10, 15, 20, 30];
    wk.forEach(function (k) { if (lost >= k) done.push((lossGoal ? T.lostKg : T.gainedKg) + k + T.kgSuffix); });
    var nw = wk.filter(function (k) { return lost < k; })[0];
    if (lost > 0 && nw) next.push((lossGoal ? T.lostKg : T.gainedKg) + nw + T.kgSuffix);
  }
  var waist = seriesOf(doc, 'waist');
  if (waist.length > 1) {
    var wd = Math.round((waist[0].v - waist[waist.length - 1].v) * 10) / 10;
    if (wd >= 2) done.push(T.waistDown + fmt(wd) + T.cmSuffix);
  }
  if (isNum(doc.attended)) {
    var sk = [10, 25, 50, 100, 200];
    sk.forEach(function (k) { if (doc.attended >= k) done.push(k + T.sessionsDone); });
    var ns = sk.filter(function (k) { return doc.attended < k; })[0];
    if (doc.attended > 0 && ns) next.push(ns + T.sessionsDone);
  }
  if (isNum(doc.streakWeeks) && doc.streakWeeks >= 2) done.push(doc.streakWeeks + T.weeksStreak);
  var ck = arr(doc.checkins).length;
  if (ck >= 4) done.push(ck + T.checkinsDone);
  if (!done.length && !next.length) return null;
  var card = el('div', 'card');
  card.appendChild(el('h3', '', T.milestones));
  var list = el('ul', 'badges');
  done.slice(-6).forEach(function (t) { list.appendChild(el('li', 'badge done', t)); });
  card.appendChild(list);
  if (next.length) card.appendChild(el('p', 'sub', T.nextMilestone + next.join(' · ')));
  if (isStr(doc.startDate, 10)) card.appendChild(el('p', 'sub', T.since + isoDay(doc.startDate)));
  return card;
}
function historyCard(doc) {
  var list = arr(doc.checkins).filter(function (c) { return c && isStr(c.d, 10); });
  if (!list.length) return null;
  var card = el('div', 'card');
  card.appendChild(el('h3', '', T.history));
  list.forEach(function (c) {
    var row = el('div', 'rec');
    row.appendChild(el('span', '', isoDay(c.d)));
    var v = el('span', 'hist');
    if (isNum(c.weightKg)) { v.appendChild(el('strong', 'num', fmt(c.weightKg))); v.appendChild(document.createTextNode(' ' + T.units.weight + '  ')); }
    if (isNum(c.waistCm)) { v.appendChild(el('strong', 'num', fmt(c.waistCm))); v.appendChild(document.createTextNode(' ' + T.units.waist)); }
    row.appendChild(v);
    card.appendChild(row);
  });
  return card;
}
function progressSection(doc) {
  var s = el('section', 'panel');
  s.id = 'p-progress';
  if (doc.goal && isStr(doc.goal.title, 80) && doc.goal.title) {
    var g = el('div', 'card');
    g.appendChild(el('h3', '', T.goal + ': ' + doc.goal.title));
    if (isStr(doc.goal.note, 500) && doc.goal.note) g.appendChild(el('p', 'pre', doc.goal.note));
    s.appendChild(g);
  }
  var any = false;
  var ms = milestones(doc);
  if (ms) { s.appendChild(ms); any = true; }
  arr(doc.progress).forEach(function (series) {
    var c = series ? seriesCard(series) : null;
    if (c) { s.appendChild(c); any = true; }
  });
  var recs = arr(doc.records).filter(function (r) { return r && isStr(r.name, 120) && isNum(r.weightKg) && isNum(r.reps); });
  if (recs.length) {
    any = true;
    var rc = el('div', 'card');
    rc.appendChild(el('h3', '', T.records));
    recs.forEach(function (r) {
      var row = el('div', 'rec');
      row.appendChild(el('span', '', r.name));
      row.appendChild(el('strong', '', fmt(r.weightKg) + T.kg + ' × ' + r.reps));
      rc.appendChild(row);
    });
    s.appendChild(rc);
  }
  var hc = historyCard(doc);
  if (hc) { s.appendChild(hc); any = true; }
  if (isNum(doc.attended) && doc.attended > 0) {
    any = true;
    s.appendChild(el('p', 'card', T.attended + doc.attended + T.attendedSuffix));
  }
  if (!any) s.appendChild(el('p', 'card empty', T.progressEmpty));
  return s;
}

function field(label, input) {
  var l = el('label', 'field');
  l.appendChild(el('span', 'label', label));
  l.appendChild(input);
  return l;
}
function numberInput(name) {
  var i = el('input'); i.name = name; i.inputMode = 'decimal'; i.autocomplete = 'off'; i.dir = 'ltr';
  return i;
}
function toNumber(text) {
  var t = String(text).trim()
    .replace(/[٠-٩]/g, function (d) { return String(d.charCodeAt(0) - 0x0660); })
    .replace(/[۰-۹]/g, function (d) { return String(d.charCodeAt(0) - 0x06F0); })
    .replace(/[٫,]/g, '.');
  if (t === '') return undefined;
  return /^\d{1,3}(\.\d{1,2})?$/.test(t) ? Number(t) : NaN;
}
function loadImage(file) {
  return new Promise(function (resolve, reject) {
    var url = URL.createObjectURL(file);
    var img = new Image();
    img.onload = function () {
      var done = function () { resolve({ src: img, w: img.naturalWidth, h: img.naturalHeight, close: function () { URL.revokeObjectURL(url); } }); };
      if (img.decode) img.decode().then(done, done); else done();
    };
    img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('img')); };
    img.src = url;
  });
}
function loadBitmap(file) {
  if (!window.createImageBitmap) return Promise.resolve(null);
  return createImageBitmap(file).then(function (b) {
    return { src: b, w: b.width, h: b.height, close: function () { if (b.close) b.close(); } };
  }, function () { return null; });
}
/** Draws onto a canvas of at most 1200 px on the long side; null when nothing was painted. */
function paint(pic) {
  if (!pic.w || !pic.h) return null;
  var scale = Math.min(1, 1200 / Math.max(pic.w, pic.h));
  var canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(pic.w * scale));
  canvas.height = Math.max(1, Math.round(pic.h * scale));
  var ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(pic.src, 0, 0, canvas.width, canvas.height);
  try {
    var px = ctx.getImageData(0, 0, canvas.width, canvas.height).data, any = false;
    for (var i = 3; i < px.length; i += 28) if (px[i] !== 0) { any = true; break; }
    if (!any) { canvas.width = 0; canvas.height = 0; return null; }
  } catch (e) { /* cannot read back: keep the draw */ }
  ctx.globalCompositeOperation = 'destination-over';
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  return canvas;
}
function drawWith(load, file) {
  return load(file).then(function (pic) {
    if (!pic) return null;
    try { return paint(pic); } finally { pic.close(); }
  });
}
/**
 * Downscales to <= 1200 px on the long side and re-encodes as JPEG (drops EXIF, including GPS). iPhone Safari
 * can return a bitmap that draws nothing; then the photo is decoded again through an <img>.
 */
function downscale(file) {
  return drawWith(loadBitmap, file)
    .then(function (canvas) { return canvas || drawWith(loadImage, file); })
    .then(function (canvas) {
      if (!canvas) throw new Error('photo');
      var url = canvas.toDataURL('image/jpeg', 0.8);
      canvas.width = 0; canvas.height = 0;
      if (url.indexOf('data:image/jpeg;base64,') !== 0) throw new Error('photo');
      return url;
    });
}
/** Same layout as the app's domain/files packFile: "PF1\0", 4-byte big-endian header length, JSON header, bytes. */
function packFile(mime, bytes) {
  var head = enc.encode(JSON.stringify({ mime: mime }));
  var out = new Uint8Array(8 + head.length + bytes.length);
  out.set([0x50, 0x46, 0x31, 0], 0);
  new DataView(out.buffer).setUint32(4, head.length);
  out.set(head, 8);
  out.set(bytes, 8 + head.length);
  return out;
}
function dataUrlBytes(url) {
  var bin = atob(url.slice(url.indexOf(',') + 1));
  var out = new Uint8Array(bin.length);
  for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
/** The client's own profile photo: downscaled, encrypted with the link key, sent to the trainer. */
function myPhotoCard(raw) {
  var card = el('div', 'card my-photo');
  card.appendChild(el('h3', '', T.myPhotoTitle));
  card.appendChild(el('p', 'sub', T.myPhotoHint));
  var row = el('div', 'my-photo-row');
  var face = el('div', 'my-photo-face');
  var input = el('input'); input.type = 'file'; input.accept = 'image/*'; input.name = 'my-photo';
  var pick = el('label', 'add-photo');
  pick.appendChild(input);
  pick.appendChild(el('span', '', T.myPhotoPick));
  row.appendChild(face);
  row.appendChild(pick);
  card.appendChild(row);
  var status = el('p', 'status'); status.setAttribute('role', 'status');
  card.appendChild(status);
  var say = function (text, cls) { status.textContent = text; status.className = 'status' + (cls ? ' ' + cls : ''); };
  input.addEventListener('change', function () {
    var f = input.files && input.files[0];
    input.value = '';
    if (!f) return;
    say(T.myPhotoSending);
    downscale(f)
      .then(function (url) {
        face.textContent = '';
        var img = el('img'); img.alt = ''; img.src = url;
        face.appendChild(img);
        return Promise.all([sealEnvelope(raw, packFile('image/jpeg', dataUrlBytes(url))), writeToken(raw)]);
      }, function () { throw new Error('photo'); })
      .then(function (r) {
        return fetch('/api/share/' + shareId + '/files?kind=client_photo', {
          method: 'POST', body: r[0], cache: 'no-store', credentials: 'omit',
          headers: { 'Content-Type': 'application/octet-stream', 'X-Checkin-Token': r[1] }
        });
      })
      .then(function (res) {
        if (res.status === 201) say(T.myPhotoSent, 'ok');
        else if (res.status === 429) say(T.tooMany, 'err');
        else if (res.status === 413) say(T.tooBig, 'err');
        else say(T.failed, 'err');
      }, function (e) { say(e && e.message === 'photo' ? T.photoFailed : T.failed, 'err'); });
  });
  return card;
}

/** One photo at a time: three full-size iPhone photos decoded at once can run Safari out of memory. */
function downscaleAll(files) {
  var out = [];
  return files.reduce(function (p, f) {
    return p.then(function () { return downscale(f).then(function (u) { out.push(u); }); });
  }, Promise.resolve()).then(function () { return out; });
}

var RANGES = { weight: [20, 400], waist: [30, 300], neck: [20, 100], hip: [30, 300], chest: [30, 300], arm: [10, 150], thigh: [20, 200], sleep: [0, 24], adherence: [0, 100] };
var DOC_KEYS = { weight: 'weightKg', waist: 'waistCm', neck: 'neckCm', hip: 'hipCm', chest: 'chestCm', arm: 'armCm', thigh: 'thighCm', sleep: 'sleepHours', adherence: 'adherence' };

function energyPicker() {
  var box = el('fieldset', 'energy');
  box.appendChild(el('legend', 'label', T.energy));
  var row = el('div', 'seg');
  T.energyLabels.forEach(function (label, i) {
    var l = el('label', 'seg-opt');
    var r = el('input'); r.type = 'radio'; r.name = 'energy'; r.value = String(i + 1);
    l.appendChild(r);
    var face = el('span', 'seg-face');
    face.appendChild(el('span', 'num seg-n', i + 1));
    face.appendChild(el('span', 'seg-l', label));
    l.appendChild(face);
    row.appendChild(l);
  });
  box.appendChild(row);
  return box;
}

function checkinSection(raw, page) {
  var s = el('section', 'panel');
  s.id = 'p-checkin';
  s.appendChild(myPhotoCard(raw));
  var card = el('form', 'card');
  card.noValidate = true;
  card.appendChild(el('h3', '', T.checkinTitle));
  card.appendChild(el('p', 'sub', T.checkinHint));
  var inputs = {};
  Object.keys(RANGES).forEach(function (k) { inputs[k] = numberInput(k); });
  var row = el('div', 'row2');
  row.appendChild(field(T.weight, inputs.weight));
  row.appendChild(field(T.waist, inputs.waist));
  card.appendChild(row);
  var more = el('details');
  more.appendChild(el('summary', '', T.more));
  var row2 = el('div', 'row2');
  row2.appendChild(field(T.hip, inputs.hip));
  row2.appendChild(field(T.chest, inputs.chest));
  row2.appendChild(field(T.arm, inputs.arm));
  row2.appendChild(field(T.thigh, inputs.thigh));
  row2.appendChild(field(T.neck, inputs.neck));
  more.appendChild(row2);
  card.appendChild(more);
  var week = el('div', 'week');
  week.appendChild(el('h3', '', T.howWeek));
  var energy = energyPicker();
  week.appendChild(energy);
  var row3 = el('div', 'row2');
  row3.appendChild(field(T.sleep, inputs.sleep));
  row3.appendChild(field(T.adherence, inputs.adherence));
  week.appendChild(row3);
  card.appendChild(week);
  var notes = el('textarea'); notes.name = 'notes'; notes.maxLength = 1000; notes.rows = 3;
  // Photos are collected across picks (front, side, back are often taken one at a time with the camera),
  // up to 3; each thumbnail has its own remove button.
  var chosen = [];
  var photo = el('input'); photo.name = 'photo'; photo.type = 'file'; photo.accept = 'image/*'; photo.multiple = true;
  var thumbs = el('div', 'thumbs');
  var addBtn = el('label', 'add-photo');
  var addText = el('span', '', T.addPhoto);
  addBtn.appendChild(photo);
  addBtn.appendChild(addText);
  var photoBox = el('div', 'field');
  photoBox.appendChild(el('span', 'label', T.photo));
  photoBox.appendChild(thumbs);
  photoBox.appendChild(addBtn);
  var drawThumbs = function () {
    thumbs.textContent = '';
    chosen.forEach(function (p, idx) {
      var t = el('div', 'thumb');
      var i = el('img'); i.alt = ''; i.src = p.url;
      var x = el('button', 'thumb-x', '×'); x.type = 'button'; x.setAttribute('aria-label', T.removePhoto);
      x.addEventListener('click', function () {
        URL.revokeObjectURL(p.url);
        chosen.splice(idx, 1);
        drawThumbs();
      });
      t.appendChild(i);
      t.appendChild(x);
      thumbs.appendChild(t);
    });
    addBtn.hidden = chosen.length >= 3;
    thumbs.setAttribute('aria-label', T.photoCount(chosen.length));
  };
  var clearPhotos = function () {
    chosen.forEach(function (p) { URL.revokeObjectURL(p.url); });
    chosen = [];
    drawThumbs();
  };
  photo.addEventListener('change', function () {
    Array.prototype.slice.call(photo.files || []).forEach(function (f) {
      if (chosen.length < 3) chosen.push({ file: f, url: URL.createObjectURL(f) });
    });
    photo.value = ''; // so picking the same photo again still fires "change"
    drawThumbs();
  });
  card.appendChild(photoBox);
  card.appendChild(field(T.checkinNotes, notes));
  if (currentPicks(page).length) card.appendChild(el('p', 'sub picks-note', T.picksSent));
  var status = el('p', 'status'); status.setAttribute('role', 'status');
  var btn = el('button', 'btn', T.send); btn.type = 'submit';
  card.appendChild(btn);
  card.appendChild(status);
  var say = function (text, cls) { status.textContent = text; status.className = 'status' + (cls ? ' ' + cls : ''); };
  card.addEventListener('submit', function (ev) {
    ev.preventDefault();
    var doc = { v: 1, kind: 'checkin', createdAt: Math.floor(Date.now() / 1000) };
    var bad = false, anyNumber = false;
    Object.keys(RANGES).forEach(function (k) {
      var v = toNumber(inputs[k].value);
      if (v === undefined) return;
      if (isNaN(v) || v < RANGES[k][0] || v > RANGES[k][1]) { bad = true; return; }
      doc[DOC_KEYS[k]] = v;
      anyNumber = true;
    });
    if (bad) { say(T.badNumber, 'err'); return; }
    var picked = card.querySelector('input[name=energy]:checked');
    if (picked) { doc.energy = Number(picked.value); anyNumber = true; }
    var n = notes.value.trim();
    var files = chosen.map(function (p) { return p.file; });
    if (!anyNumber && !n && !files.length) { say(T.empty, 'err'); return; }
    if (n) doc.notes = n.slice(0, 1000);
    var picks = currentPicks(page);
    if (picks.length) doc.mealPicks = picks;
    btn.disabled = true;
    say(T.sending);
    downscaleAll(files)
      .then(function (list) {
        if (list[0]) doc.photo = list[0];
        if (list.length > 1) doc.photos = list.slice(1);
      }, function () { throw new Error('photo'); })
      .then(function () { return Promise.all([sealEnvelope(raw, enc.encode(JSON.stringify(doc))), writeToken(raw)]); })
      .then(function (r) {
        return fetch('/api/share/' + shareId + '/checkins', {
          method: 'POST', body: r[0], cache: 'no-store', credentials: 'omit',
          headers: { 'Content-Type': 'application/octet-stream', 'X-Checkin-Token': r[1] }
        });
      })
      .then(function (res) {
        if (res.status === 201) { card.reset(); clearPhotos(); say(T.sent, 'ok'); }
        else if (res.status === 429) say(T.tooMany, 'err');
        else if (res.status === 413) say(T.tooBig, 'err');
        else say(T.failed, 'err');
      }, function (e) { say(e && e.message === 'photo' ? T.photoFailed : T.failed, 'err'); })
      .then(function () { btn.disabled = false; });
  });
  s.appendChild(card);
  return s;
}

function render(doc, raw) {
  applyBrand(doc.brand);
  hero(doc);
  app.textContent = '';
  var sum = summary(doc);
  if (sum) app.appendChild(sum);
  var panels = [['p-program', T.tabProgram, programSection(doc)], ['p-meals', T.tabMeals, mealsSection(doc)], ['p-progress', T.tabProgress, progressSection(doc)]];
  if (doc.checkinsEnabled === true) panels.push(['p-checkin', T.tabCheckin, checkinSection(raw, doc)]);
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
    t.addEventListener('click', function () {
      show(p[0]);
      var top = tabs.getBoundingClientRect().top;
      if (top < 0) tabs.scrollIntoView();
    });
    tabs.appendChild(t);
  });
  app.appendChild(tabs);
  panels.forEach(function (p) { app.appendChild(p[2]); });
  app.appendChild(el('p', 'foot', T.privateNote));
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
        applyLanguage(doc);
        render(doc, raw);
      });
    }, function () { message(T.offline, true); });
}
window.addEventListener('hashchange', start);
start();
})();`;
