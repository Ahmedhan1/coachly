import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'dev-dist', 'node_modules', 'worker', 'design', 'assets-src/model3d/blender', 'public/draco'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx,mjs,js}'],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
  {
    // domain layer is pure TypeScript: no React, no browser storage, no data/services imports
    files: ['src/domain/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: ['react', 'react-*', 'dexie', 'dexie-*', '@/data/*', '@/services/*', '@/app/*', '@/features/*', '@/ui/*'] }],
    },
  },
);
