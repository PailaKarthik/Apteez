import nextPlugin from '@next/eslint-plugin-next';
import reactHooksPlugin from 'eslint-plugin-react-hooks';
import globals from 'globals';
import base from './base.js';

/**
 * Next.js flat config: shared base + the official Next plugin rules
 * (core-web-vitals set) + React Hooks rules. No legacy `extends` bridging,
 * so this works on ESLint 9.
 */
const next = [
  ...base,
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      globals: {
        ...globals.browser,
      },
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
  },
  {
    plugins: {
      '@next/next': nextPlugin,
      'react-hooks': reactHooksPlugin,
    },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      '@next/next/google-font-display': 'warn',
      '@next/next/google-font-preconnect': 'warn',
      '@next/next/next-script-for-ga': 'warn',
      '@next/next/no-async-client-component': 'warn',
      '@next/next/no-css-tags': 'warn',
      '@next/next/no-head-element': 'off',
      '@next/next/no-html-link-for-pages': 'warn',
      '@next/next/no-img-element': 'warn',
      '@next/next/no-sync-scripts': 'warn',
      '@next/next/no-title-in-document-head': 'warn',
      '@next/next/no-unwanted-polyfillio': 'warn',
      '@next/next/inline-script-id': 'error',
      '@next/next/no-assign-module-variable': 'error',
      // The rules below rely on ESLint APIs removed in v9 (getAncestors,
      // getScope, …) and only target the legacy pages/ router, which this
      // App Router codebase does not use — hence permanently off.
      '@next/next/no-before-interactive-script-outside-document': 'off',
      '@next/next/no-document-import-in-page': 'off',
      '@next/next/no-duplicate-head': 'off',
      '@next/next/no-head-import-in-document': 'off',
      '@next/next/no-page-custom-font': 'off',
      '@next/next/no-styled-jsx-in-document': 'off',
      '@next/next/no-typos': 'off',
      '@next/next/no-script-component-in-head': 'off',
    },
  },
];

export default next;
