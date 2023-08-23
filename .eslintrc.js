/* eslint-env node */
require("@rushstack/eslint-patch/modern-module-resolution");

module.exports = {
  root: true,
  env: {
    node: true,
    amd: true,
  },
  rules: {
    "object-shorthand": ["warn", "always"],
    "prettier/prettier": [
      "warn",
      {
        printWidth: 120,
      },
    ],
    "max-len": ["warn", { code: 120, ignoreComments: true, ignoreStrings: false }],
    // "no-extra-parens": 2,
    "prefer-const": [
      "error",
      {
        destructuring: "all",
        ignoreReadBeforeAssign: false,
      },
    ],
    "vue/no-unused-vars": [
      "warn",
      {
        ignorePattern: "^_",
      },
    ],
    "no-unused-vars": ["warn", { vars: "all", args: "after-used", argsIgnorePattern: "^_" }],
  },
  extends: [
    "plugin:vue/vue3-essential",
    "eslint:recommended",
    "@vue/eslint-config-typescript",
    "@vue/eslint-config-prettier",
  ],
  parserOptions: {
    ecmaVersion: "latest",
  },
};
