import globals from 'globals';
import base from './base.js';

/**
 * Node.js (NestJS / scripts) flat config: shared base + Node globals.
 */
const node = [
  ...base,
  {
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
];

export default node;
