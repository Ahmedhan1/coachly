/**
 * The app never suggests supplement doses (project rule). The system prompt says so; this is the output
 * filter behind it: any assistant text or drafted message that names a supplement next to an amount is
 * dropped and replaced by a fixed note in the UI.
 */

const SUPPLEMENTS = [
  'كرياتين',
  'كرياتنين',
  'واي بروتين',
  'بروتين باودر',
  'بروتين بودر',
  'سكوب بروتين',
  'بي سي ايه ايه',
  'جلوتامين',
  'كافيين',
  'بري ووركاوت',
  'بري وركاوت',
  'فيتامين',
  'اوميجا',
  'أوميجا',
  'زنك',
  'ماغنسيوم',
  'مغنيسيوم',
  'حديد',
  'كارنيتين',
  'ستيرويد',
  'هرمون',
  'مكمل',
  'مكملات',
  'creatine',
  'whey',
  'protein powder',
  'casein',
  'bcaa',
  'eaa',
  'glutamine',
  'caffeine',
  'pre-workout',
  'preworkout',
  'vitamin',
  'omega',
  'fish oil',
  'zinc',
  'magnesium',
  'iron',
  'carnitine',
  'ashwagandha',
  'melatonin',
  'steroid',
  'supplement',
] as const;

/** Dose units next to a number (matched on normalised text: ة→ه, أ→ا). Grams count: "5 جرام كرياتين" is a dose. */
const DOSE = /(\d+(?:[.,]\d+)?)\s*(?:-|–|إلى|to)?\s*(?:\d+(?:[.,]\d+)?)?\s*(mg|mcg|µg|g|gr|grams?|iu|ml|scoops?|caps(?:ules?)?|tabs?|tablets?|pills?|ملجم|مجم|مللي|مل|ميكروجرام|جرام|جم|جرامات|وحده|وحدات|سكوب|سكوبات|كبسوله|كبسولات|قرص|اقراص|حبايه|حبايات|حبه|حبوب)(?![a-z])/giu;

const WINDOW = 40;

const normalize = (s: string) =>
  s
    .toLowerCase()
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي');

const NORMALIZED = SUPPLEMENTS.map(normalize);
const LATIN = /^[a-z -]+$/;
const escape = (w: string) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** Latin words match whole words only ("iron" must not hit "environment"); Arabic ones as substrings. */
const MATCHERS = NORMALIZED.map((w) => (LATIN.test(w) ? new RegExp(`\\b${escape(w)}\\b`) : null));
const named = (around: string) => NORMALIZED.some((w, i) => MATCHERS[i]?.test(around) ?? around.includes(w));

/** True when a supplement is named within a few words of an amount with a dose unit. */
export function mentionsSupplementDose(text: string): boolean {
  const s = normalize(text);
  for (const m of s.matchAll(DOSE)) {
    const at = m.index;
    const around = s.slice(Math.max(0, at - WINDOW), at + m[0].length + WINDOW);
    if (named(around)) return true;
  }
  return false;
}

/** The assistant's answer, or null (blocked) when it carries a supplement dose. */
export function safeAssistantText(text: string | null): { text: string | null; blocked: boolean } {
  if (text && mentionsSupplementDose(text)) return { text: null, blocked: true };
  return { text, blocked: false };
}
