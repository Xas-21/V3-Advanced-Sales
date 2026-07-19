import js from '@eslint/js'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'backend/**',
      'graphify-out/**',
      // Plan 040 targets TS/TSX only; leave Vite/Node scripts unlinted.
      '**/*.{js,mjs,cjs}',
    ],
  },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      // Classic hooks only — React Compiler rules (refs/set-state-in-effect/…)
      // fire ~170 errors on this codebase; tighten later.
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
      // Ratchet: high-noise on this codebase — tighten later, don't mass-fix here.
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      'no-unused-vars': 'off',
      '@typescript-eslint/no-empty-object-type': 'warn',
      '@typescript-eslint/ban-ts-comment': 'warn',
      'no-empty': 'warn',
      'prefer-const': 'warn',
      'no-case-declarations': 'warn',
      'no-useless-assignment': 'warn',
      'no-useless-escape': 'warn',
      // TS handles undefined idents; no-undef false-positives on types/globals.
      'no-undef': 'off',
    },
  },
)
