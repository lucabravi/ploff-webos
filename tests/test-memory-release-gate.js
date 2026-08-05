'use strict';

var assert = require('assert');
var childProcess = require('child_process');
var path = require('path');
var packageJson = require('../package.json');

var project = path.join(__dirname, '..');
var result;

assert.strictEqual(
  packageJson.scripts['test:memory'],
  'node --expose-gc tests/pre-release-memory.js',
  'the memory gate must always expose the V8 garbage collector'
);
assert.ok(
  /npm run verify/.test(packageJson.scripts['test:pre-release']) && /npm run test:memory/.test(packageJson.scripts['test:pre-release']),
  'the pre-release command must combine the normal verification suite with the memory gate'
);

result = childProcess.spawnSync(process.execPath, ['--expose-gc', 'tests/pre-release-memory.js'], {
  cwd: project,
  encoding: 'utf8',
  env: Object.assign({}, process.env, {
    PLOFF_MEMORY_CYCLES: '12',
    PLOFF_MEMORY_SAMPLES: '3'
  }),
  timeout: 60000
});

assert.strictEqual(result.status, 0, result.stderr || result.stdout || 'memory-gate smoke test failed');
assert.ok(/Pre-release memory lifecycle checks passed/.test(result.stdout), 'the smoke test must execute the real memory gate');

console.log('Memory release gate checks passed');
