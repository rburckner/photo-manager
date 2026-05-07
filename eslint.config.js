import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      }],
      '@typescript-eslint/restrict-template-expressions': 'off',
      // Fastify routes are conventionally declared async even when they
      // don't await — the framework expects the same shape for all handlers.
      '@typescript-eslint/require-await': 'off',
      // The codebase uses `!` for cases where the author knows a value is
      // present (post-insert lookups, in-bounds array indices). Strict
      // checking is preserved by the type system; this rule is stylistic.
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
  {
    ignores: ['dist/', 'web/', 'node_modules/', 'eslint.config.js'],
  },
);
