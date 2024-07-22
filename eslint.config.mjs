import js from '@eslint/js';
import globals from 'globals';
import stylistic from '@stylistic/eslint-plugin';
import jest from 'eslint-plugin-jest';

export default [
  {
    ignores: ['lib/sepa.min.js'],
  },
  js.configs.recommended,
  {
    plugins: {
      '@stylistic': stylistic,
    },
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },

    rules: {
      'curly': ['error', 'multi-line'],
      '@stylistic/indent': ['error', 2],
      '@stylistic/quotes': ['error', 'single'],
      '@stylistic/linebreak-style': ['error', 'unix'],
      '@stylistic/semi': ['error', 'always'],
    },
  },
  {
    files: ['**/*.test.js'],
    plugins: {
      'jest': jest,
    },
    ...jest.configs['flat/recommended'],
  }
];
