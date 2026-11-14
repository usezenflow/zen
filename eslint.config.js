// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*'],
  },
  // Config files and config plugins run in Node.
  {
    files: ['*.js', 'plugins/*.js'],
    languageOptions: { globals: { __dirname: 'readonly' } },
  },
]);
