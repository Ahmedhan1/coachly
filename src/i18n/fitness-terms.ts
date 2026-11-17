/**
 * Arabic naming system for fitness terms.
 *
 * Rule (CLAUDE.md + docs/SPEC.md): gym terms are TRANSLITERATED the way Egyptian trainers say them,
 * never translated literally. Glutes → جلوتس (the forbidden literal forms are listed in FORBIDDEN_TERMS).
 *
 * This file is pure data + pure functions (no imports) so that Node scripts can import it directly
 * (Node 22 strips the types) and the domain layer can use it too.
 *
 * Every generated name still needs review by a real trainer; the trainer can rename any exercise in
 * the app (these are defaults, not hard-coded UI).
 *
 * Writing conventions:
 * - g → ج (Egyptian pronunciation), p → ب, v → ف, ch → تش, th → ث, sh → ش.
 * - Keep English word order ("Dumbbell Bench Press" → "دامبل بنش برس"), as trainers say it.
 * - Plurals collapse to the singular form trainers use ("Curls" → "كيرل", "Squats" → "سكوات"),
 *   except a few words that are always said in plural (Glutes, Quads, Lats, Bands...).
 */

/** Muscle names (dataset values and the words that appear inside exercise names). */
export const MUSCLE_TERMS: Readonly<Record<string, string>> = {
  glutes: 'جلوتس',
  glute: 'جلوت',
  butt: 'بات',
  quads: 'كوادز',
  quad: 'كواد',
  quadriceps: 'كوادز',
  hamstrings: 'هامسترينج',
  hamstring: 'هامسترينج',
  ham: 'هام',
  lats: 'لاتس',
  lat: 'لات',
  'latissimus dorsi': 'لاتس',
  traps: 'ترابس',
  trap: 'تراب',
  chest: 'تشيست',
  pec: 'بيك',
  pecs: 'بيكس',
  shoulders: 'شولدرز',
  shoulder: 'شولدر',
  delts: 'ديلتس',
  delt: 'ديلت',
  deltoid: 'ديلت',
  deltoids: 'ديلتس',
  triceps: 'ترايسبس',
  tricep: 'ترايسبس',
  biceps: 'بايسبس',
  bicep: 'بايسبس',
  forearms: 'فورآرمز',
  forearm: 'فورآرم',
  abs: 'أبس',
  ab: 'أب',
  abdominals: 'أبس',
  core: 'كور',
  obliques: 'أوبليكس',
  oblique: 'أوبليك',
  calves: 'كالفز',
  calf: 'كالف',
  adductors: 'أداكتورز',
  adductor: 'أداكتور',
  abductors: 'أبداكتورز',
  abductor: 'أبداكتور',
  'lower back': 'لوور باك',
  'middle back': 'ميدل باك',
  'upper back': 'أبر باك',
  back: 'باك',
  neck: 'نيك',
  rhomboids: 'رومبويدز',
  brachialis: 'براكياليس',
  tibialis: 'تيبياليس',
  'tibialis anterior': 'تيبياليس',
  gastrocnemius: 'جاستروك',
  soleus: 'سوليس',
  piriformis: 'بيريفورميس',
  peroneals: 'بيرونيالز',
  'hip flexor': 'هيب فليكسور',
  'hip flexors': 'هيب فليكسورز',
  flexor: 'فليكسور',
  flexors: 'فليكسورز',
  groin: 'جروين',
  'iliotibial tract': 'آي تي باند',
  'it band': 'آي تي باند',
  achilles: 'أكيليس',
  sternum: 'ستيرنم',
  rotator: 'روتيتور',
  'rotator cuff': 'روتيتور كاف',
};

/** Body parts that appear in exercise names. */
export const BODY_PART_TERMS: Readonly<Record<string, string>> = {
  hip: 'هيب',
  hips: 'هيبس',
  knee: 'ني',
  knees: 'نيز',
  wrist: 'ريست',
  ankle: 'أنكل',
  elbow: 'إلبو',
  elbows: 'إلبوز',
  toe: 'تو',
  toes: 'توز',
  heel: 'هيل',
  thigh: 'ثاي',
  torso: 'تورسو',
  spinal: 'سباينال',
  spine: 'سباين',
  scapular: 'سكابيولر',
  pelvic: 'بيلفيك',
  leg: 'ليج',
  legs: 'ليجز',
  arm: 'آرم',
  arms: 'آرمز',
  hand: 'هاند',
  hands: 'هاندز',
  foot: 'فوت',
  feet: 'فييت',
  head: 'هيد',
  body: 'بودي',
  chin: 'تشين',
  face: 'فيس',
  stomach: 'ستوماك',
  finger: 'فينجر',
  palm: 'بالم',
  palms: 'بالمز',
  muscle: 'ماسل',
  side: 'سايد',
  sides: 'سايدز',
};

/** Equipment. */
export const EQUIPMENT_TERMS: Readonly<Record<string, string>> = {
  dumbbell: 'دامبل',
  dumbbells: 'دامبلز',
  db: 'دامبل',
  barbell: 'بار',
  bar: 'بار',
  bars: 'بارز',
  'ez bar': 'إي زد بار',
  'e z': 'إي زد',
  ez: 'إي زد',
  'e z curl bar': 'إي زد بار',
  'e-z curl bar': 'إي زد بار',
  'balance board': 'بالانس بورد',
  't bar': 'تي بار',
  'v bar': 'في بار',
  'trap bar': 'تراب بار',
  'straight bar': 'ستريت بار',
  cable: 'كابل',
  cables: 'كابل',
  kettlebell: 'كيتل بيل',
  kettlebells: 'كيتل بيل',
  machine: 'ماشين',
  smith: 'سميث',
  'smith machine': 'سميث ماشين',
  band: 'باند',
  bands: 'باندز',
  ball: 'بول',
  'medicine ball': 'ميديسن بول',
  'exercise ball': 'جيم بول',
  'stability ball': 'جيم بول',
  'swiss ball': 'جيم بول',
  physioball: 'جيم بول',
  bosu: 'بوسو',
  'foam roll': 'فوم رولر',
  'foam roller': 'فوم رولر',
  roller: 'رولر',
  plate: 'بليت',
  plates: 'بليتس',
  sled: 'سليد',
  chains: 'تشينز',
  chain: 'تشين',
  rope: 'روب',
  ropes: 'روبس',
  'battling ropes': 'باتل روب',
  pulley: 'بولي',
  bench: 'بنش',
  box: 'بوكس',
  landmine: 'لاندماين',
  rack: 'راك',
  pins: 'بينز',
  pin: 'بين',
  blocks: 'بلوكس',
  block: 'بلوك',
  board: 'بورد',
  sandbag: 'ساند باج',
  tire: 'تاير',
  keg: 'كيج',
  log: 'لوج',
  'atlas stone': 'أطلس ستون',
  'atlas stones': 'أطلس ستون',
  stone: 'ستون',
  stones: 'ستونز',
  yoke: 'يوك',
  axle: 'أكسل',
  sledgehammer: 'سليدج هامر',
  towel: 'تاول',
  straps: 'سترابس',
  strap: 'ستراب',
  harness: 'هارنس',
  platform: 'بلاتفورم',
  treadmill: 'تريدميل',
  elliptical: 'إليبتيكال',
  'elliptical trainer': 'إليبتيكال',
  bike: 'بايك',
  'air bike': 'إير بايك',
  stairmaster: 'ستير ماستر',
  rings: 'رينجز',
  ring: 'رينج',
  wall: 'وول',
  chair: 'كرسي',
  floor: 'فلور',
  step: 'ستيب',
  cone: 'كون',
  cones: 'كونز',
  hurdle: 'هيردل',
  hurdles: 'هيردلز',
  prowler: 'براولر',
  wheel: 'ويل',
  'ab wheel': 'أب ويل',
  iron: 'آيرون',
  leverage: 'ليفريدج',
  handle: 'هاندل',
  attachment: 'أتاتشمنت',
  'heavy bag': 'هيفي باج',
  bag: 'باج',
  car: 'كار',
  'body only': 'بودي ويت',
  bodyweight: 'بودي ويت',
  'body weight': 'بودي ويت',
  'parallel bars': 'متوازي',
  stairs: 'ستيرز',
  other: 'أخرى',
};

/** Movement words (the action of the exercise). */
export const MOVEMENT_TERMS: Readonly<Record<string, string>> = {
  press: 'برس',
  presses: 'برس',
  'bench press': 'بنش برس',
  'leg press': 'ليج برس',
  'shoulder press': 'شولدر برس',
  'military press': 'ميليتري برس',
  'floor press': 'فلور برس',
  'push press': 'بوش برس',
  curl: 'كيرل',
  curls: 'كيرل',
  'biceps curl': 'بايسبس كيرل',
  'bicep curl': 'بايسبس كيرل',
  squat: 'سكوات',
  squats: 'سكوات',
  row: 'رو',
  rows: 'رو',
  rowing: 'روينج',
  raise: 'رايز',
  raises: 'رايز',
  'lateral raise': 'لاتيرال رايز',
  'side lateral': 'سايد لاتيرال',
  'side lateral raise': 'سايد لاتيرال رايز',
  extension: 'إكستنشن',
  extensions: 'إكستنشن',
  fly: 'فلاي',
  flys: 'فلاي',
  flye: 'فلاي',
  flyes: 'فلاي',
  pulldown: 'بول داون',
  pulldowns: 'بول داون',
  'pull down': 'بول داون',
  'lat pulldown': 'لات بول داون',
  'pull up': 'بول أب',
  'pull ups': 'بول أب',
  pullup: 'بول أب',
  pullups: 'بول أب',
  'chin up': 'تشين أب',
  'chin ups': 'تشين أب',
  chins: 'تشين أب',
  'push up': 'بوش أب',
  'push ups': 'بوش أب',
  pushup: 'بوش أب',
  pushups: 'بوش أب',
  'sit up': 'سيت أب',
  'sit ups': 'سيت أب',
  'step up': 'ستيب أب',
  'step ups': 'ستيب أب',
  'muscle up': 'ماسل أب',
  'v up': 'في أب',
  'v ups': 'في أب',
  'get up': 'جت أب',
  'pull in': 'بول إن',
  'pull through': 'بول ثرو',
  'pull apart': 'بول أبارت',
  lunge: 'لانج',
  lunges: 'لانج',
  plank: 'بلانك',
  'side plank': 'سايد بلانك',
  crunch: 'كرانش',
  crunches: 'كرانش',
  deadlift: 'ديدليفت',
  deadlifts: 'ديدليفت',
  'romanian deadlift': 'رومانيان ديدليفت',
  'stiff legged deadlift': 'ستيف ليج ديدليفت',
  'hip thrust': 'هيب ثرست',
  thrust: 'ثرست',
  thruster: 'ثراستر',
  clean: 'كلين',
  'clean and jerk': 'كلين آند جيرك',
  'clean and press': 'كلين آند برس',
  snatch: 'سناتش',
  jerk: 'جيرك',
  hang: 'هانج',
  shrug: 'شراج',
  shrugs: 'شراج',
  dip: 'ديبس',
  dips: 'ديبس',
  pushdown: 'بوش داون',
  pushdowns: 'بوش داون',
  kickback: 'كيك باك',
  kickbacks: 'كيك باك',
  pullover: 'بول أوفر',
  crossover: 'كروس أوفر',
  'cross over': 'كروس أوفر',
  'good morning': 'جود مورنينج',
  'good mornings': 'جود مورنينج',
  bridge: 'بريدج',
  bridges: 'بريدج',
  'glute bridge': 'جلوت بريدج',
  stretch: 'ستريتش',
  stretches: 'ستريتش',
  jump: 'جامب',
  jumps: 'جامب',
  jumping: 'جامبينج',
  'jumping jacks': 'جامبينج جاك',
  hop: 'هوب',
  hops: 'هوب',
  bound: 'باوند',
  sprint: 'سبرينت',
  sprints: 'سبرينت',
  run: 'رن',
  running: 'رانينج',
  walk: 'ووك',
  walking: 'ووكينج',
  carry: 'كاري',
  drag: 'دراج',
  drags: 'دراج',
  throw: 'ثرو',
  slam: 'سلام',
  swing: 'سوينج',
  swings: 'سوينج',
  twist: 'تويست',
  twists: 'تويست',
  rotation: 'روتيشن',
  rotations: 'روتيشن',
  rollout: 'رول أوت',
  windmill: 'ويندميل',
  windmills: 'ويندميل',
  halo: 'هيلو',
  'skull crusher': 'سكال كراشر',
  'skull crushers': 'سكال كراشر',
  skullcrusher: 'سكال كراشر',
  hyperextension: 'هايبر إكستنشن',
  hyperextensions: 'هايبر إكستنشن',
  'back extension': 'باك إكستنشن',
  crawl: 'كرول',
  climb: 'كلايم',
  climbers: 'كلايمبرز',
  hug: 'هاج',
  kick: 'كيك',
  kicks: 'كيكس',
  tuck: 'تاك',
  tucks: 'تاك',
  pike: 'بايك',
  handstand: 'هاند ستاند',
  hold: 'هولد',
  lift: 'ليفت',
  circles: 'سيركلز',
  circle: 'سيركل',
  flexion: 'فليكشن',
  adduction: 'أداكشن',
  adductions: 'أداكشن',
  abduction: 'أبداكشن',
  pronation: 'برونيشن',
  supination: 'سوبينيشن',
  scaption: 'سكابشن',
  tilt: 'تيلت',
  bend: 'بيند',
  bends: 'بيند',
  'bent over': 'بنت أوفر',
  pull: 'بول',
  pulls: 'بول',
  push: 'بوش',
  chop: 'تشوب',
  'wood chop': 'وود تشوب',
  catch: 'كاتش',
  pass: 'باس',
  leap: 'ليب',
  skip: 'سكيب',
  skipping: 'سكيبينج',
  skating: 'سكيتينج',
  shuffle: 'شافل',
  jogging: 'جوجينج',
  bicycling: 'بايسكلينج',
  stride: 'سترايد',
  squeeze: 'سكويز',
  squeezes: 'سكويز',
  touches: 'تاتش',
  touchers: 'تاتش',
  grab: 'جراب',
  flip: 'فليب',
  heaving: 'هيفينج',
  kipping: 'كيبينج',
  release: 'ريليس',
  delivery: 'ديليفري',
  return: 'ريتيرن',
  slides: 'سلايدز',
  partials: 'بارشالز',
  rollouts: 'رول أوت',
  vacuum: 'فاكيوم',
  'stomach vacuum': 'ستوماك فاكيوم',
  fallout: 'فول أوت',
  straddle: 'سترادل',
  pinch: 'بينش',
  claw: 'كلو',
  scoop: 'سكوب',
  load: 'لود',
  drill: 'دريل',
  drills: 'دريل',
  'mountain climbers': 'ماونتن كلايمبرز',
  'flutter kicks': 'فلاتر كيكس',
  'farmers walk': 'فارمرز ووك',
  'jump squat': 'جامب سكوات',
  burpee: 'بيربي',
  burpees: 'بيربي',
};

/** Position and variation words. */
export const MODIFIER_TERMS: Readonly<Record<string, string>> = {
  incline: 'إنكلاين',
  decline: 'ديكلاين',
  flat: 'فلات',
  seated: 'سيتد',
  sitting: 'سيتد',
  standing: 'ستاندينج',
  lying: 'لاينج',
  kneeling: 'نيلينج',
  prone: 'برون',
  supine: 'سوباين',
  'one arm': 'ون آرم',
  'one leg': 'ون ليج',
  'one legged': 'ون ليج',
  'single arm': 'سينجل آرم',
  'single leg': 'سينجل ليج',
  'two arm': 'تو آرم',
  'two dumbbell': 'تو دامبل',
  one: 'ون',
  two: 'تو',
  single: 'سينجل',
  alternating: 'ألترنيت',
  alternate: 'ألترنيت',
  grip: 'جريب',
  'close grip': 'كلوز جريب',
  'wide grip': 'وايد جريب',
  'reverse grip': 'ريفيرس جريب',
  'neutral grip': 'نيوترال جريب',
  reverse: 'ريفيرس',
  neutral: 'نيوترال',
  underhand: 'أندرهاند',
  overhand: 'أوفرهاند',
  overhead: 'أوفرهيد',
  'over head': 'أوفرهيد',
  front: 'فرونت',
  lateral: 'لاتيرال',
  laterals: 'لاتيرال',
  rear: 'رير',
  'rear delt': 'رير ديلت',
  upright: 'أبرايت',
  high: 'هاي',
  low: 'لو',
  mid: 'ميد',
  middle: 'ميدل',
  upper: 'أبر',
  lower: 'لوور',
  inner: 'إنر',
  external: 'إكسترنال',
  internal: 'إنترنال',
  weighted: 'ويتد',
  assisted: 'أسيستد',
  isometric: 'أيزومتريك',
  iso: 'أيزو',
  dynamic: 'دايناميك',
  static: 'ستاتيك',
  plyo: 'بلايو',
  plyometric: 'بلايومتريك',
  plyometrics: 'بلايومتركس',
  deficit: 'ديفيسيت',
  elevated: 'إليفيتد',
  suspended: 'سسبندد',
  inverted: 'إنفيرتد',
  hanging: 'هانجينج',
  straight: 'ستريت',
  'straight arm': 'ستريت آرم',
  'straight leg': 'ستريت ليج',
  stiff: 'ستيف',
  'stiff legged': 'ستيف ليج',
  'stiff leg': 'ستيف ليج',
  legged: 'ليج',
  bent: 'بنت',
  'bent arm': 'بنت آرم',
  'bent knee': 'بنت ني',
  wide: 'وايد',
  close: 'كلوز',
  narrow: 'ناروو',
  medium: 'ميديم',
  double: 'دابل',
  half: 'هاف',
  full: 'فول',
  long: 'لونج',
  speed: 'سبيد',
  quick: 'كويك',
  fast: 'فاست',
  heavy: 'هيفي',
  linear: 'لينير',
  diagonal: 'دايجونال',
  vertical: 'فيرتيكال',
  forward: 'فوروارد',
  backward: 'باكوارد',
  downward: 'داونوارد',
  upward: 'أبوارد',
  stance: 'ستانس',
  split: 'سبليت',
  'split squat': 'سبليت سكوات',
  sumo: 'سومو',
  power: 'باور',
  olympic: 'أوليمبيك',
  powerlifting: 'باورليفتينج',
  strength: 'سترينث',
  stretching: 'ستريتشينج',
  strongman: 'سترونج مان',
  cardio: 'كارديو',
  'olympic weightlifting': 'أوليمبيك ويتليفتينج',
  weightlifting: 'ويتليفتينج',
  compound: 'كومباوند',
  isolation: 'أيزوليشن',
  technique: 'تكنيك',
  version: 'فيرجن',
  position: 'بوزيشن',
  positions: 'بوزيشنز',
  progression: 'بروجريشن',
  exercise: 'إكسرسايز',
  response: 'ريسبونس',
  'range of motion': 'رينج أوف موشن',
  motion: 'موشن',
  resistance: 'ريزيستانس',
  stationary: 'ثابتة',
  recumbent: 'ريكمبنت',
  facing: 'فيسينج',
  pronated: 'برونيتد',
  supinated: 'سوبينيتد',
  extended: 'إكستندد',
  open: 'أوبن',
  parallel: 'باراليل',
  depth: 'ديبث',
  multiple: 'مالتيبل',
  mixed: 'ميكسد',
  cambered: 'كامبرد',
  moving: 'موفينج',
  movers: 'موفرز',
  natural: 'ناتشورال',
  manual: 'مانيوال',
  pyramid: 'بيراميد',
  series: 'سيريز',
  style: 'ستايل',
  acceleration: 'أكسيليريشن',
  freehand: 'فري هاند',
  handed: 'هاندد',
  'one handed': 'ون هاند',
  'all fours': 'أول فورز',
  bottoms: 'باتمز',
  'bottoms up': 'باتمز أب',
  part: 'بارت',
  start: 'ستارت',
  point: 'بوينت',
  dead: 'ديد',
  round: 'راوند',
  trail: 'ترايل',
  wind: 'ويند',
  air: 'إير',
  'anti gravity': 'أنتي جرافيتي',
  posterior: 'بوستيريور',
  anterior: 'أنتيريور',
  intermediate: 'إنترميديت',
  advanced: 'أدفانسد',
  partial: 'بارشال',
  explosive: 'إكسبلوسيف',
  tempo: 'تمبو',
  pause: 'بوز',
  balance: 'بالانس',
  drop: 'دروب',
  military: 'ميليتري',
  range: 'رينج',
  sit: 'سيت',
  paused: 'بوزد',
};

/**
 * Named exercises and proper nouns (people, places, animals, objects used as exercise names).
 * Keys use no apostrophes: "farmer's" is looked up as "farmers".
 */
export const NAMED_TERMS: Readonly<Record<string, string>> = {
  arnold: 'أرنولد',
  'arnold press': 'أرنولد برس',
  zottman: 'زوتمان',
  zercher: 'زيرتشر',
  jefferson: 'جيفرسون',
  bradford: 'برادفورد',
  rocky: 'روكي',
  tate: 'تيت',
  svend: 'سفيند',
  jm: 'جي إم',
  gironda: 'جيروندا',
  pallof: 'بالوف',
  russian: 'رشيان',
  'russian twist': 'رشيان تويست',
  turkish: 'تركيش',
  'turkish get up': 'تركيش جت أب',
  romanian: 'رومانيان',
  bulgarian: 'بلغاريان',
  'bulgarian split squat': 'بلغاريان سبليت سكوات',
  cuban: 'كيوبان',
  london: 'لندن',
  otis: 'أوتيس',
  janda: 'جاندا',
  hack: 'هاك',
  'hack squat': 'هاك سكوات',
  sissy: 'سيسي',
  pistol: 'بيستول',
  goblet: 'جوبلت',
  frog: 'فروج',
  spider: 'سبايدر',
  preacher: 'بريتشر',
  concentration: 'كونسنتريشن',
  hammer: 'هامر',
  'hammer curl': 'هامر كيرل',
  crucifix: 'كروسيفكس',
  guillotine: 'جيلوتين',
  butterfly: 'باترفلاي',
  'pec deck': 'بيك ديك',
  renegade: 'رينيجيد',
  bear: 'بير',
  superman: 'سوبرمان',
  'butt ups': 'بات أب',
  inchworm: 'إنش وورم',
  jackknife: 'جاك نايف',
  'windshield wipers': 'ويندشيلد وايبرز',
  wipers: 'وايبرز',
  'dead bug': 'ديد باج',
  bug: 'باج',
  scissor: 'سيزر',
  scissors: 'سيزرز',
  seesaw: 'سي سو',
  'see saw': 'سي سو',
  star: 'ستار',
  carioca: 'كاريوكا',
  frankenstein: 'فرانكنشتاين',
  monster: 'مونستر',
  gorilla: 'جوريلا',
  groiners: 'جروينرز',
  plie: 'بليه',
  'worlds greatest stretch': 'وورلدز جريتست ستريتش',
  'around the worlds': 'أراوند ذا وورلد',
  'round the world': 'أراوند ذا وورلد',
  'childs pose': 'تشايلدز بوز',
  pose: 'بوز',
  cat: 'كات',
  'cat stretch': 'كات ستريتش',
  cocoons: 'كوكونز',
  jammer: 'جامر',
  rickshaw: 'ريكشو',
  'conans wheel': 'كونانز ويل',
  circus: 'سيركس',
  'circus bell': 'سيركس بل',
  bell: 'بل',
  clock: 'كلوك',
  'pirate ships': 'بايرت شيبس',
  shotgun: 'شوت جان',
  'spell caster': 'سبيل كاستر',
  rocket: 'روكيت',
  rocking: 'روكينج',
  judo: 'جودو',
  drivers: 'درايفرز',
  donkey: 'دونكي',
  'donkey calf raise': 'دونكي كالف رايز',
  'dancers stretch': 'دانسرز ستريتش',
  'runners stretch': 'رانرز ستريتش',
  locust: 'لوكاست',
  'looking at ceiling': 'لوكينج أت سيلينج',
  'figure 8': 'فيجر 8',
  figure: 'فيجر',
  mill: 'ميل',
  'star jump': 'ستار جامب',
  'wind sprints': 'ويند سبرينت',
  'iron cross': 'آيرون كروس',
  cross: 'كروس',
  crosses: 'كروس',
  'face pull': 'فيس بول',
  'atlas stone trainer': 'أطلس ستون',
  trainer: 'ترينر',
  'mountain climber': 'ماونتن كلايمبر',
  mountain: 'ماونتن',
  para: 'بارا',
  'speed bag': 'سبيد باج',
  // Positions trainers say in Arabic, not English (reviewed 17 Nov 2026).
  'two dumbbell': 'دامبلين',
  'against wall': 'على الحيطة',
  'against the wall': 'على الحيطة',
  'against a wall': 'على الحيطة',
  'behind the head': 'ورا الراس',
  'behind head': 'ورا الراس',
  'behind the back': 'ورا الضهر',
  'behind back': 'ورا الضهر',
  'head on bench': 'والراس على البنش',
  'with head on bench': 'والراس على البنش',
  'palms in': 'الكفوف لجوه',
  'palms facing in': 'الكفوف لجوه',
  'palms facing each other': 'الكفوف قصاد بعض',
  'palms out': 'الكفوف لبره',
  'palms down': 'الكفوف لتحت',
  'palms up': 'الكفوف لفوق',
  'around the world': 'أراوند وورلد',
};

/**
 * Connector words. Arabic glue is used where trainers would naturally use it ("Squat with Bands" →
 * "سكوات مع باندز"); articles are dropped. "and" attaches to the next word ("و" + word).
 */
export const CONNECTOR_TERMS: Readonly<Record<string, string>> = {
  with: 'مع',
  'with no': 'من غير',
  and: 'و',
  on: 'على',
  'on your': 'على',
  from: 'من',
  or: 'أو',
  to: 'لحد',
  in: 'إن',
  into: 'إنتو',
  up: 'أب',
  ups: 'أب',
  down: 'داون',
  over: 'أوفر',
  off: 'أوف',
  'off of': 'أوف',
  out: 'أوت',
  through: 'ثرو',
  behind: 'بيهايند',
  between: 'بيتوين',
  across: 'أكروس',
  around: 'أراوند',
  above: 'أبوف',
  below: 'بيلو',
  against: 'على',
  apart: 'أبارت',
  at: 'أت',
  the: '',
  a: '',
  an: '',
  of: '',
  your: '',
  it: '',
  no: 'من غير',
  smr: 'فوم رولر',
};

/**
 * Structured dataset fields (free-exercise-db values → Arabic). Levels are plain Arabic words because
 * they are not gym jargon.
 */
export const DATASET_FIELD_TERMS = {
  level: { beginner: 'مبتدئ', intermediate: 'متوسط', expert: 'متقدم' },
  force: { push: 'بوش', pull: 'بول', static: 'ستاتيك' },
  mechanic: { compound: 'كومباوند', isolation: 'أيزوليشن' },
  category: {
    strength: 'سترينث',
    stretching: 'ستريتشينج',
    plyometrics: 'بلايومتركس',
    strongman: 'سترونج مان',
    powerlifting: 'باورليفتينج',
    cardio: 'كارديو',
    'olympic weightlifting': 'أوليمبيك ويتليفتينج',
  },
} as const satisfies Readonly<Record<string, Readonly<Record<string, string>>>>;

// forbidden-words:begin — the scanner skips this block (it is the list itself).
/**
 * Literal / textbook translations that must never appear in user-visible text or exercise data.
 * Matching ignores tashkeel, tatweel and alef/hamza variants (see normalizeArabic).
 */
export const FORBIDDEN_TERMS: readonly string[] = [
  // glutes
  'المؤخرة',
  'الأرداف',
  'العضلات الألوية',
  'العضلة الألوية',
  'الألوية الكبرى',
  // biceps / triceps
  'العضلة ذات الرأسين',
  'ذات الرأسين',
  'ثني العضلة',
  'ثني الذراع',
  'ثني الذراعين',
  'ذات الثلاث رؤوس',
  'ثلاثية الرؤوس',
  'العضلة ثلاثية',
  'مد الذراع',
  'بسط الذراع',
  // quads / hamstrings / calves
  'العضلة الرباعية',
  'رباعية الرؤوس',
  'أوتار الركبة',
  'الأوتار المأبضية',
  'العضلات الخلفية للفخذ',
  'عضلات الفخذ الخلفية',
  'العضلة الخلفية للفخذ',
  'عضلات الفخذ الأمامية',
  'السمانة',
  'عضلة الساق',
  'بطة الرجل',
  'بطن الساق',
  // back / chest / shoulders / arms / core
  'الظهرية العريضة',
  'العضلة الظهرية',
  'العضلات الظهرية',
  'شبه المنحرفة',
  'المعينية',
  'الصدرية',
  'العضلة الدالية',
  'الدالية',
  'عضلات الساعد',
  'العضلة المستقيمة البطنية',
  'المستقيمة البطنية',
  'عضلات البطن',
  'العضلات المائلة',
  'العضلة المقربة',
  'العضلات المقربة',
  'العضلة المبعدة',
  'العضلات المبعدة',
  // exercises
  'الرفعة الميتة',
  'الرفعة المميتة',
  'الرفع الميت',
  'الضغط على المقعد',
  'ضغط المقعد',
  'القرفصاء',
  'الدفع بالورك',
  'دفع الورك',
  'رفع الورك',
  'السحب للأسفل',
  'السحب الأمامي',
  'التجديف',
  'الطعنات',
  'الاندفاع للأمام',
  'تمرين الطعن',
  'الثني بالدمبل',
  'الثني بالبار',
  'تمديد الترايسبس',
  'رفع جانبي',
  'رفع أمامي',
  'الرفع الجانبي',
  'الرفع الأمامي',
  'هز الكتفين',
  'تمرين البطن المعدة',
];
// forbidden-words:end

/** Strip tashkeel and tatweel, unify alef/hamza forms and alef maqsura so spelling variants match. */
export function normalizeArabic(text: string): string {
  return text
    .replace(/[ً-ٰٟـ]/g, '')
    .replace(/[آأإٱ]/g, 'ا')
    .replace(/ى/g, 'ي');
}

/** Returns every forbidden term contained in `text` (after normalization). */
export function findForbiddenTerms(text: string): string[] {
  const normalized = normalizeArabic(text);
  return FORBIDDEN_TERMS.filter((term) => normalized.includes(normalizeArabic(term)));
}

const ALL_TERM_GROUPS: readonly Readonly<Record<string, string>>[] = [
  CONNECTOR_TERMS,
  MUSCLE_TERMS,
  BODY_PART_TERMS,
  EQUIPMENT_TERMS,
  MODIFIER_TERMS,
  MOVEMENT_TERMS,
  NAMED_TERMS,
];

/** One merged lookup. Later groups win on key clashes (named phrases override generic words). */
export const FITNESS_TERMS: ReadonlyMap<string, string> = new Map(
  ALL_TERM_GROUPS.flatMap((group) => Object.entries(group)),
);

const MAX_PHRASE_WORDS = Math.max(...[...FITNESS_TERMS.keys()].map((key) => key.split(' ').length));

type Token =
  | { kind: 'word'; key: string; raw: string }
  | { kind: 'number'; raw: string }
  | { kind: 'open' | 'close' | 'slash' | 'comma' | 'amp'; raw: string };

const TOKEN_PATTERN = /(\d+(?:[./]\d+)?)(?:'s)?|([A-Za-z]+(?:'[A-Za-z]+)?)|([()[\]/,&])|[\s\-–_.:;!?"]+/g;

function tokenize(english: string): Token[] {
  const tokens: Token[] = [];
  for (const match of english.matchAll(TOKEN_PATTERN)) {
    const [, number, word, punct] = match;
    if (number !== undefined) tokens.push({ kind: 'number', raw: number });
    else if (word !== undefined) tokens.push({ kind: 'word', key: word.toLowerCase().replace(/'/g, ''), raw: word });
    else if (punct === '(' || punct === '[') tokens.push({ kind: 'open', raw: '(' });
    else if (punct === ')' || punct === ']') tokens.push({ kind: 'close', raw: ')' });
    else if (punct === '/') tokens.push({ kind: 'slash', raw: '/' });
    else if (punct === ',') tokens.push({ kind: 'comma', raw: '،' });
    else if (punct === '&') tokens.push({ kind: 'amp', raw: 'و' });
  }
  return tokens;
}

/** Look up a single word, falling back to simple English plural / possessive stripping. */
function lookupWord(key: string): string | undefined {
  const direct = FITNESS_TERMS.get(key);
  if (direct !== undefined) return direct;
  const candidates = [
    key.endsWith('s') ? key.slice(0, -1) : undefined,
    key.endsWith('es') ? key.slice(0, -2) : undefined,
  ];
  for (const candidate of candidates) {
    if (candidate === undefined || candidate.length < 3) continue;
    const found = FITNESS_TERMS.get(candidate);
    if (found !== undefined) return found;
  }
  return undefined;
}

/**
 * Match the longest dictionary phrase starting at `start` within a run of consecutive word tokens.
 * Number tokens may sit inside a phrase key (e.g. "figure 8").
 */
function matchPhrase(tokens: readonly Token[], start: number): { arabic: string; length: number } | undefined {
  for (let length = MAX_PHRASE_WORDS; length >= 2; length -= 1) {
    const slice = tokens.slice(start, start + length);
    if (slice.length < length) continue;
    const parts: string[] = [];
    let valid = true;
    for (const token of slice) {
      if (token.kind === 'word') parts.push(token.key);
      else if (token.kind === 'number') parts.push(token.raw);
      else {
        valid = false;
        break;
      }
    }
    if (!valid) continue;
    const phrase = parts.join(' ');
    const found = FITNESS_TERMS.get(phrase) ?? lookupPhrasePlural(phrase);
    if (found !== undefined) return { arabic: found, length };
  }
  return undefined;
}

function lookupPhrasePlural(phrase: string): string | undefined {
  if (phrase.endsWith('es')) {
    const found = FITNESS_TERMS.get(phrase.slice(0, -2));
    if (found !== undefined) return found;
  }
  if (phrase.endsWith('s')) return FITNESS_TERMS.get(phrase.slice(0, -1));
  return undefined;
}

export interface TransliterationResult {
  /** Arabic name. Unknown English words are kept as-is inside it so nothing is silently lost. */
  arabic: string;
  /** Lower-cased English words with no dictionary entry (empty when fully covered). */
  unknownTokens: string[];
}

/**
 * Transliterate an English exercise name into gym Arabic, token by token.
 * Multi-word phrases are matched first (longest wins), numbers are kept, hyphens act as spaces,
 * slashes and parentheses are preserved.
 */
export function transliterateExerciseName(english: string): TransliterationResult {
  const tokens = tokenize(english);
  const pieces: string[] = [];
  const unknownTokens: string[] = [];
  let attachNext = false;

  const pushWord = (text: string): void => {
    if (text === '') return;
    if (attachNext) {
      const previous = pieces.pop() ?? '';
      pieces.push(previous + text);
      attachNext = false;
      return;
    }
    pieces.push(text);
  };

  for (let index = 0; index < tokens.length; ) {
    const token = tokens[index];
    if (token === undefined) break;
    if (token.kind === 'word' || token.kind === 'number') {
      const phrase = matchPhrase(tokens, index);
      if (phrase !== undefined) {
        pushWord(phrase.arabic);
        index += phrase.length;
        continue;
      }
    }
    if (token.kind === 'number') {
      pushWord(token.raw);
    } else if (token.kind === 'word') {
      const arabic = lookupWord(token.key);
      if (arabic === undefined) {
        unknownTokens.push(token.key);
        pushWord(token.raw);
      } else if (arabic === 'و') {
        pieces.push('و');
        attachNext = true;
      } else {
        pushWord(arabic);
      }
    } else if (token.kind === 'amp') {
      pieces.push('و');
      attachNext = true;
    } else if (token.kind === 'open') {
      pieces.push('(');
      attachNext = true;
    } else if (token.kind === 'close') {
      if (attachNext && pieces[pieces.length - 1] === '(') {
        pieces.pop();
        attachNext = false;
      } else {
        const previous = pieces.pop() ?? '';
        pieces.push(previous + ')');
        attachNext = false;
      }
    } else if (token.kind === 'comma') {
      const previous = pieces.pop();
      if (previous !== undefined) pieces.push(previous + '،');
    } else {
      pieces.push('/');
    }
    index += 1;
  }

  const arabic = pieces
    .filter((piece) => piece !== '' && piece !== 'و')
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
  return { arabic, unknownTokens };
}

/**
 * Egyptian gym-floor word order: the movement first, then the tool, the position and the side, and the grip
 * or stance after a dash — "Incline Dumbbell Press" → "برس إنكلاين بالدامبل",
 * "Wide-Grip Lat Pulldown" → "لات بول داون - قبضة واسعة". Connectors are plain Egyptian Arabic; the gym
 * terms themselves stay transliterated (transliterateExerciseName). Hand-curated names
 * (data-src/exercise-names.overrides.ar.json) win over this rule.
 */
type DescriptorSlot = 'angle' | 'tool' | 'position' | 'side' | 'grip';

const W = String.raw`[\s_-]+`;
const NATURAL_DESCRIPTORS: readonly { slot: DescriptorSlot; pattern: RegExp; arabic: string }[] = [
  { slot: 'angle', pattern: /\bincline\b/i, arabic: 'إنكلاين' },
  { slot: 'angle', pattern: /\bdecline\b/i, arabic: 'ديكلاين' },
  { slot: 'grip', pattern: new RegExp(String.raw`\b(?:with${W})?palms?${W}down\b`, 'i'), arabic: 'كفوف لتحت' },
  { slot: 'grip', pattern: new RegExp(String.raw`\b(?:with${W})?palms?${W}up\b`, 'i'), arabic: 'كفوف لفوق' },
  { slot: 'tool', pattern: new RegExp(String.raw`\bsmith(?:${W}machine)?\b`, 'i'), arabic: 'على السميث' },
  { slot: 'tool', pattern: new RegExp(String.raw`\be[\s_-]*z(?:${W}curl)?${W}bar\b`, 'i'), arabic: 'بالإيزي بار' },
  { slot: 'tool', pattern: /\bbarbells?\b/i, arabic: 'بالبار' },
  { slot: 'tool', pattern: new RegExp(String.raw`\b(?:two${W})?(?:dumbbells?|db)\b`, 'i'), arabic: 'بالدامبل' },
  { slot: 'tool', pattern: /\bkettlebells?\b/i, arabic: 'بالكيتل بيل' },
  { slot: 'tool', pattern: new RegExp(String.raw`\blow${W}pulley\b`, 'i'), arabic: 'على الكابل من تحت' },
  { slot: 'tool', pattern: new RegExp(String.raw`\bhigh${W}pulley\b`, 'i'), arabic: 'على الكابل من فوق' },
  { slot: 'tool', pattern: /\b(?:cables?|pulley)\b/i, arabic: 'على الكابل' },
  { slot: 'tool', pattern: /\b(?:leverage|lever|machine)\b/i, arabic: 'على الماشين' },
  { slot: 'tool', pattern: new RegExp(String.raw`\bmedicine${W}ball\b`, 'i'), arabic: 'بالميديسن بول' },
  {
    slot: 'tool',
    pattern: new RegExp(String.raw`\b(?:on${W}(?:an?${W})?)?(?:exercise|stability|swiss)${W}ball\b|\bphysioball\b`, 'i'),
    arabic: 'على الجيم بول',
  },
  { slot: 'tool', pattern: new RegExp(String.raw`\b(?:with${W})?bands?\b`, 'i'), arabic: 'بالباند' },
  { slot: 'tool', pattern: new RegExp(String.raw`\b(?:with${W})?rope(?:${W}attachment)?(?=${W}|$)(?!${W}(?:jump|climb))`, 'i'), arabic: 'بالحبل' },
  { slot: 'position', pattern: /\b(?:seated|sitting)\b/i, arabic: 'قاعد' },
  { slot: 'position', pattern: /\bstanding\b/i, arabic: 'واقف' },
  { slot: 'position', pattern: /\blying\b/i, arabic: 'نايم' },
  { slot: 'position', pattern: new RegExp(String.raw`\bkneeling\b|\bon${W}(?:your${W})?knees\b`, 'i'), arabic: 'على ركبك' },
  { slot: 'position', pattern: new RegExp(String.raw`\bon${W}the${W}floor\b`, 'i'), arabic: 'على الأرض' },
  { slot: 'side', pattern: new RegExp(String.raw`\b(?:one|single)${W}arm(?:ed)?\b`, 'i'), arabic: 'بإيد واحدة' },
  { slot: 'side', pattern: new RegExp(String.raw`\b(?:one|single)${W}leg(?:ged)?\b`, 'i'), arabic: 'برجل واحدة' },
  { slot: 'side', pattern: /\balternat(?:e|ing)\b/i, arabic: 'بالتبادل' },
  { slot: 'side', pattern: new RegExp(String.raw`\btwo${W}arms?\b`, 'i'), arabic: '' },
  { slot: 'grip', pattern: new RegExp(String.raw`\bwide${W}grip\b`, 'i'), arabic: 'قبضة واسعة' },
  { slot: 'grip', pattern: new RegExp(String.raw`\b(?:close|narrow)${W}grip\b`, 'i'), arabic: 'قبضة ضيقة' },
  { slot: 'grip', pattern: new RegExp(String.raw`\bmedium${W}grip\b`, 'i'), arabic: '' },
  { slot: 'grip', pattern: new RegExp(String.raw`\breverse${W}grip\b|\bunderhand\b`, 'i'), arabic: 'قبضة معكوسة' },
  {
    slot: 'grip',
    pattern: new RegExp(String.raw`\b(?:neutral|hammer)${W}grip\b|\b(?:with${W})?palms${W}(?:facing${W})?in\b`, 'i'),
    arabic: 'قبضة هامر',
  },
  { slot: 'grip', pattern: /\bversion\b/i, arabic: '' },
  { slot: 'grip', pattern: new RegExp(String.raw`\bwide${W}stance\b`, 'i'), arabic: 'رجل واسعة' },
  { slot: 'grip', pattern: new RegExp(String.raw`\b(?:narrow|close)${W}stance\b`, 'i'), arabic: 'رجل ضيقة' },
];

export function naturalExerciseName(english: string): TransliterationResult {
  const slots: Record<DescriptorSlot, string[]> = { angle: [], tool: [], position: [], side: [], grip: [] };
  let rest = english;
  for (const { slot, pattern, arabic } of NATURAL_DESCRIPTORS) {
    if (!pattern.test(rest)) continue;
    rest = rest.replace(pattern, ' ');
    const taken = slots[slot].some((have) => have.startsWith(arabic) || arabic.startsWith(have));
    if (arabic !== '' && !taken) slots[slot].push(arabic);
  }
  rest = rest
    .replace(/\(\s*\)/g, ' ')
    .replace(/\b(?:with|on|to|a|an|the)\s*$/i, ' ')
    .replace(/^[\s\-–_]+|[\s\-–_]+$/g, '')
    .replace(/\s+-\s+(?=-|$)/g, ' ');
  const movement = transliterateExerciseName(rest);
  if (movement.arabic === '' || !/[A-Za-z]/.test(rest)) return transliterateExerciseName(english);
  const head = [movement.arabic, ...slots.angle, ...slots.tool, ...slots.position, ...slots.side].join(' ');
  const arabic = (slots.grip.length > 0 ? `${head} - ${slots.grip.join('، ')}` : head).replace(/\s+/g, ' ').trim();
  return { arabic, unknownTokens: movement.unknownTokens };
}
