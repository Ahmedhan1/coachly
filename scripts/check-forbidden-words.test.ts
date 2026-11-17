import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { FORBIDDEN_TERMS } from '../src/i18n/fitness-terms';

const script = resolve(__dirname, 'check-forbidden-words.mjs');
const planted = FORBIDDEN_TERMS[0] ?? '';
const dirs: string[] = [];

function makeRoot(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'check-words-'));
  dirs.push(root);
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(join(root, path, '..'), { recursive: true });
    writeFileSync(join(root, path), content);
  }
  return root;
}

function run(root: string) {
  return spawnSync(process.execPath, [script, '--root', root], { encoding: 'utf8' });
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('check-forbidden-words', () => {
  it('passes on clean input', () => {
    const root = makeRoot({
      'src/i18n/ar.ts': "export const ar = { glutes: 'جلوتس', curl: 'بايسبس كيرل' };\n",
      'data-src/exercise-names.ar.json': JSON.stringify([{ ar: 'بار سكوات' }], null, 2),
    });
    const result = run(root);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('check:words OK');
  });

  it('fails with file and line on a planted forbidden word in the translation file', () => {
    const root = makeRoot({
      'src/i18n/ar.ts': `export const ar = {\n  ok: 'جلوتس',\n  bad: '${planted}',\n};\n`,
    });
    const result = run(root);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('ar.ts:3');
    expect(result.stderr).toContain(planted);
  });

  it('fails on a planted forbidden word in exercise data JSON', () => {
    const root = makeRoot({
      'data-src/exercise-names.ar.json': JSON.stringify([{ ar: 'سكوات' }, { ar: `تمرين ${planted}` }], null, 2),
    });
    const result = run(root);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('exercise-names.ar.json:');
  });

  it('fails on Arabic text in the worker client page and admin dashboard', () => {
    for (const path of ['worker/src/share/page.ts', 'worker/src/admin/html.ts']) {
      const root = makeRoot({ [path]: `export const label = 'تمام';\nexport const bad = '${planted}';\n` });
      const result = run(root);
      expect(result.status, path).toBe(1);
      expect(result.stderr).toContain(`${path.split('/').pop() ?? ''}:2`);
    }
  });

  it('ignores worker tests and other worker folders', () => {
    const root = makeRoot({
      'worker/src/share/page.test.ts': `'${planted}'\n`,
      'worker/src/backup/routes.ts': `'${planted}'\n`,
    });
    expect(run(root).status).toBe(0);
  });

  it('fails on public data JSON too', () => {
    const root = makeRoot({ 'public/data/exercises.json': `{"name": "${planted}"}` });
    expect(run(root).status).toBe(1);
  });

  it('skips the marked forbidden list block and test files', () => {
    const root = makeRoot({
      'src/i18n/fitness-terms.ts': `// forbidden-words:begin\nconst list = ['${planted}'];\n// forbidden-words:end\n`,
      'src/i18n/ar.test.ts': `expect('${planted}')\n`,
    });
    expect(run(root).status).toBe(0);
  });

  it('still catches a forbidden word after the marked block ends', () => {
    const root = makeRoot({
      'src/i18n/fitness-terms.ts': `// forbidden-words:begin\n'${planted}'\n// forbidden-words:end\nconst x = '${planted}';\n`,
    });
    const result = run(root);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('fitness-terms.ts:4');
  });
});
