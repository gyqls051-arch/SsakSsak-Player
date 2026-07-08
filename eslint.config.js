// ESLint flat config for OFFCUT Player.
// Install the devDependencies listed in package.json, then run `npm run lint`.
const js = require('@eslint/js');
const tseslint = require('typescript-eslint');
const reactHooks = require('eslint-plugin-react-hooks');
const globals = require('globals');

module.exports = tseslint.config(
  {
    // Build output, deps, vendored binaries, and tsc-generated config
    // artifacts (vite.config.js/.d.ts는 vite.config.ts의 빌드 산출물).
    ignores: [
      'dist/**',
      'release/**',
      'node_modules/**',
      'resources/**',
      'vite.config.js',
      'vite.config.d.ts',
    ],
  },

  // Base JS + TypeScript recommended rules for the renderer (TS/TSX).
  {
    files: ['src/**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.browser },
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      'react-hooks': reactHooks,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },

  // Electron main process and CJS config files run on Node (CommonJS).
  {
    files: ['electron/**/*.js', 'eslint.config.js', 'electron-launcher.js', 'scripts/**/*.js'],
    extends: [js.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: { ...globals.node },
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    },
  },

  // ESM config files (tailwind uses export default; vite.config.ts is TS ESM).
  {
    files: ['tailwind.config.js', 'vite.config.ts'],
    extends: [js.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.node },
    },
  },
);
