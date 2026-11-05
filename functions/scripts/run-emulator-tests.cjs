'use strict';
const { spawnSync } = require('node:child_process');
process.env.SENDWAYO_RUN_EMULATOR_TESTS = '1';
const result = spawnSync(process.execPath, ['--test', 'test/emulator-finance.test.js'], {
  cwd: require('node:path').resolve(__dirname, '..'),
  env: process.env,
  stdio: 'inherit'
});
process.exit(result.status === null ? 1 : result.status);
