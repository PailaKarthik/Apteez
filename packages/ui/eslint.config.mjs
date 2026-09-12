import nodeConfig from '@apteez/eslint-config/node';

export default [
  ...nodeConfig,
  {
    files: ['**/*.tsx'],
    languageOptions: {
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
  },
];
