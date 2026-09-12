import nodeConfig from '@apteez/eslint-config/node';

export default [
  ...nodeConfig,
  {
    files: ['test/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
];
