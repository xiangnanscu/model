require("@rushstack/eslint-patch/modern-module-resolution");

module.exports = {
  root: true,
  env: {
    node: true,
    amd: true,
  },
  rules: {
    "no-constant-condition": 0,
    "no-empty": 0,
    "prettier/prettier": [
      "warn",
      {
        printWidth: 100,
      },
    ],
    "max-len": ["warn", { code: 100, ignoreComments: true, ignoreStrings: true }],
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
    "vue/multi-word-component-names": "off",
  },
  extends: [
    // 这里必须以./开头,否则不会被识别为文件路径
    "./src/unplugin/.eslintrc-auto-import.json",
    "plugin:vue/vue3-essential",
    "eslint:recommended",
    "@vue/eslint-config-typescript",
    "@vue/eslint-config-prettier/skip-formatting",
  ],
  parserOptions: {
    ecmaVersion: "latest",
    // parserOptions: { tsconfigRootDir: __dirname }
  },
};
