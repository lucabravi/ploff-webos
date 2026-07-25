'use strict';

var assert = require('assert');
var Signoff = require('../scripts/check-release-signoff');

var matrix = [
  'Before a release, verify these cases on a target webOS TV:',
  '',
  '1. First check',
  '2. Second check'
].join('\n');

var valid = [
  '# Physical-TV release signoff: v1.2.3',
  '',
  '- Date: 2026-07-23',
  '- TV model: LG OLED',
  '- webOS version: 3.4',
  '- Tester: Example Tester',
  '- Result: PASS',
  '',
  '## Regression matrix',
  '',
  '- [x] 1. First check',
  '- [x] 2. Second check'
].join('\n');

assert.strictEqual(Signoff.releaseMatrixCount(matrix), 2);
assert.strictEqual(Signoff.validateSignoff(valid, 'v1.2.3', 2), true);

assert.throws(function () {
  Signoff.validateSignoff(valid.replace('- [x] 2.', '- [ ] 2.'), 'v1.2.3', 2);
}, /unchecked/);

assert.throws(function () {
  Signoff.validateSignoff(valid.replace('- Date: 2026-07-23', '- Date: <YYYY-MM-DD>'), 'v1.2.3', 2);
}, /Date field/);

assert.throws(function () {
  Signoff.validateSignoff(valid.replace('- Result: PASS', '- Result: FAIL'), 'v1.2.3', 2);
}, /must be PASS/);

assert.throws(function () {
  Signoff.validateSignoff(valid, 'v1.2.4', 2);
}, /heading/);

console.log('Release signoff checks passed');
