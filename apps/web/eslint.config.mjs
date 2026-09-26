import nextConfig from '@apteez/eslint-config/next';
import globals from 'globals';

export default [
  ...nextConfig,
  // Build/tooling files run in Node, not the browser.
  {
    files: ['*.config.{js,mjs,ts}', 'vitest.config.ts', 'postcss.config.mjs', 'tailwind.config.ts'],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
];
