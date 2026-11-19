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
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
  {
    // React only lives in these layers (domain/data/services must not import it). The React-Compiler-based hook
    // rules are by far the slowest part of lint, so they run only where a component or hook can exist.
    files: ['src/{app,features,ui}/**/*.{ts,tsx}', 'src/main.tsx'],
    plugins: { 'react-hooks': reactHooks },
    rules: reactHooks.configs.recommended.rules,
  },
  {
    // domain layer is pure TypeScript: no React, no browser storage, no data/services imports
    files: ['src/domain/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: ['react', 'react-*', 'dexie', 'dexie-*', '@/data/*', '@/services/*', '@/app/*', '@/features/*', '@/ui/*'] }],
    },
  },
);
