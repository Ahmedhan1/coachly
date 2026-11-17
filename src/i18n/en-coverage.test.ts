import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ar } from './ar';
import { en } from './en';

type Tree = { [key: string]: string | Tree };

/** Every leaf key under a node, as dotted paths. */
function leaves(node: Tree, prefix = ''): string[] {
  return Object.entries(node).flatMap(([k, v]) => (typeof v === 'string' ? [`${prefix}${k}`] : leaves(v, `${prefix}${k}.`)));
}

function get(root: unknown, key: string): unknown {
  let node: unknown = root;
  for (const part of key.split('.')) {
    if (typeof node !== 'object' || node === null) return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return node;
}

const arTree = ar as unknown as Tree;
const featureAreas = new Set(['schedule', 'training', 'exercises', 'nutrition', 'outbox', 'pdf', 'settings', 'storage', 'assistant', 'hub']);

/** A top-level area is checked when its English file exists (src/i18n/en/<area>.ts, or core.ts for shared sections). */
function enFileExists(area: string): boolean {
  const file = featureAreas.has(area) ? `${area}.ts` : 'core.ts';
  return existsSync(fileURLToPath(new URL(`./en/${file}`, import.meta.url)));
}

const checkedAreas = Object.keys(arTree).filter(enFileExists);
const checkedKeys = checkedAreas.flatMap((area) => {
  const node = arTree[area];
  return node === undefined ? [] : typeof node === 'string' ? [area] : leaves(node, `${area}.`);
});

// WhatsApp templates may use English placeholder names; the domain treats them as aliases of the Arabic ones.
const ALIASES: Record<string, string> = { الاسم: 'name', الموعد: 'when', الباقة: 'package', المبلغ: 'amount' };
const placeholders = (s: string): string[] =>
  [...s.matchAll(/\{([^{}\s]+)\}/g)].map((m) => ALIASES[m[1] ?? ''] ?? m[1] ?? '').sort();

describe('English strings', () => {
  it('cover every key of each area that has an English file', () => {
    expect(checkedAreas.length).toBeGreaterThan(10);
    const missing = checkedKeys.filter((key) => typeof get(en, key) !== 'string' || (get(en, key) as string).trim() === '');
    if (missing.length > 0) console.error(`Missing English keys (${missing.length}):\n${missing.join('\n')}`);
    const all = leaves(arTree).length;
    console.info(`English coverage: ${checkedKeys.length - missing.length} of ${all} Arabic keys (${checkedAreas.length} areas checked), missing ${missing.length}`);
    expect(missing).toEqual([]);
  });

  it('have no keys the Arabic tree does not have', () => {
    const extra = leaves(en as unknown as Tree).filter((key) => typeof get(ar, key) !== 'string');
    expect(extra).toEqual([]);
  });

  it('keep the same {placeholders} as the Arabic', () => {
    const mismatched = checkedKeys.filter((key) => {
      const enValue = get(en, key);
      return typeof enValue === 'string' && placeholders(enValue).join() !== placeholders(get(ar, key) as string).join();
    });
    expect(mismatched).toEqual([]);
  });

  it('contain no Arabic letters except the language names', () => {
    const arabic = checkedKeys.filter((key) => {
      const v = get(en, key);
      return typeof v === 'string' && /[؀-ۿ]/.test(v) && !key.startsWith('settings.language.');
    });
    expect(arabic).toEqual([]);
  });
});
