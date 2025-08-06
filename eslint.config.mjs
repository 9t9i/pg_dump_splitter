// Node 23/24 + TypeScript + ESM

import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import stylistic from '@stylistic/eslint-plugin';
import nodePlugin from 'eslint-plugin-n';
import globals from 'globals';

export default tseslint.config(

  // Base correctness rules
  eslint.configs.recommended,
  tseslint.configs.recommended,
  tseslint.configs.strict,

  // Node awareness (ES-module flavour)
  nodePlugin.configs['flat/recommended-module'],
  {
    settings: { node: { version: '>=23.0.0' } },
  },

  // Test files configuration - allow devDependencies
  {
    files: ['test/**/*.ts'],
    rules: {
      'n/no-unpublished-import': 'off',
    },
  },

  // TypeScript files with type-aware linting
  {
    files: ['src/**/*.ts', 'test/**/*.ts'],
    extends: [
      tseslint.configs.recommendedTypeChecked,
      tseslint.configs.stylisticTypeChecked,
    ],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: globals.node,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      'no-unused-vars': 'off', // rely on tsconfig noUnusedLocals/noUnusedParameters which also covers unused private class members
      '@typescript-eslint/no-unused-vars': 'off', // rely on tsconfig noUnusedLocals/noUnusedParameters which also covers unused private class members
    }
  },

  // Config files without type-aware linting
  {
    files: [
      'eslint.config.mjs',
      'ava.config.mjs',
    ],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: globals.node,
    },
    rules: {
      'n/no-extraneous-import': 'off',
      'n/no-unpublished-import': 'off',
    },
  },

  // Stylistic layer
  {
    files: ['**/*.ts'],
    plugins: {
      '@stylistic': stylistic,
    },
    rules: {
      '@stylistic/arrow-parens': ['error', 'always'],
      '@stylistic/arrow-spacing': ['error', { before: true, after: true }],
      '@stylistic/comma-dangle': [
        'error',
        {
          arrays: 'always-multiline',
          objects: 'always-multiline'
        }
      ],
      '@stylistic/eol-last': ['error', 'always'],
      '@stylistic/indent': ['error', 2, { SwitchCase: 1 }],
      '@stylistic/quotes': ['error', 'single', { avoidEscape: true }],
      '@stylistic/quote-props': ['error', 'as-needed'],
      '@stylistic/max-len': [
        'error',
        {
          code: 100,
          ignoreComments: true,
          ignoreRegExpLiterals: true,
          ignoreTrailingComments:
          true
        }
      ],
      '@stylistic/no-tabs': 'error',
      '@stylistic/no-trailing-spaces': 'error',
      '@stylistic/one-var-declaration-per-line': ['error', 'always'],
      '@stylistic/operator-linebreak': [
        'error',
        'before',
        { overrides: { "=": "after", "+=": "after", "-=": "after" } }
      ],
      '@stylistic/semi':                ['error', 'always'],
      '@stylistic/space-before-function-paren': [
        'error',
        {
          anonymous:
          'always',
          named: 'never',
          asyncArrow: 'always'
        }
      ],
    },
  },

);
