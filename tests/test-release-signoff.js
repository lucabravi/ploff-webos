'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');
var Signoff = require('../scripts/check-release-signoff');

var project = path.join(__dirname, '..');
var repositoryMatrix = fs.readFileSync(path.join(project, 'docs/testing.md'), 'utf8');
var repositoryTemplate = fs.readFileSync(path.join(project, 'docs/release-signoff/TEMPLATE.md'), 'utf8');
var templateDigestMatch = repositoryTemplate.match(/^- Matrix SHA-256:\s*([0-9a-f]{64})\s*$/mi);

assert.ok(templateDigestMatch, 'the release-signoff template must declare the current matrix SHA-256');
assert.strictEqual(
  templateDigestMatch[1].toLowerCase(),
  Signoff.releaseMatrixDigest(repositoryMatrix),
  'the release-signoff template digest must match the normalized physical-TV matrix'
);
assert.strictEqual(
  (repositoryTemplate.match(/^- \[ \]\s+\d+\./gm) || []).length,
  Signoff.releaseMatrixCount(repositoryMatrix),
  'the release-signoff template must contain one unchecked item for every physical-TV check'
);

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
  '- Matrix SHA-256: 83ad9679c11069bbaf63fda8bfeb3c6f55d671f97ac88d61e7073aa9b35e4872',
  '',
  '## Regression matrix',
  '',
  '- [x] 1. First check',
  '- [x] 2. Second check'
].join('\n');

assert.strictEqual(Signoff.releaseMatrixCount(matrix), 2);
assert.strictEqual(
  Signoff.releaseMatrixDigest(matrix),
  '83ad9679c11069bbaf63fda8bfeb3c6f55d671f97ac88d61e7073aa9b35e4872',
  'the release matrix digest must cover the normalized numbered checks'
);
assert.strictEqual(Signoff.validateSignoff(
  valid,
  'v1.2.3',
  2,
  Signoff.releaseMatrixDigest(matrix)
), true);

assert.throws(function () {
  Signoff.validateSignoff(valid.replace('- [x] 2.', '- [ ] 2.'), 'v1.2.3', 2, Signoff.releaseMatrixDigest(matrix));
}, /unchecked/);

assert.throws(function () {
  Signoff.validateSignoff(valid.replace('- Date: 2026-07-23', '- Date: <YYYY-MM-DD>'), 'v1.2.3', 2, Signoff.releaseMatrixDigest(matrix));
}, /Date field/);

assert.throws(function () {
  Signoff.validateSignoff(valid.replace('- Result: PASS', '- Result: FAIL'), 'v1.2.3', 2, Signoff.releaseMatrixDigest(matrix));
}, /must be PASS/);

assert.throws(function () {
  Signoff.validateSignoff(valid, 'v1.2.4', 2, Signoff.releaseMatrixDigest(matrix));
}, /heading/);

assert.throws(function () {
  Signoff.validateSignoff(
    valid.replace(/83ad[0-9a-f]+/, 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'),
    'v1.2.3',
    2,
    Signoff.releaseMatrixDigest(matrix)
  );
}, /matrix SHA-256/, 'a signoff for an older matrix with the same item count must be rejected');

assert.throws(function () {
  Signoff.validateSignoff(
    valid.replace(/^- Matrix SHA-256:.*\n/m, ''),
    'v1.2.3',
    2,
    Signoff.releaseMatrixDigest(matrix)
  );
}, /Matrix SHA-256 field/, 'a signoff without an exact matrix identity must be rejected');

var signoffSource = fs.readFileSync(path.join(project, 'scripts', 'check-release-signoff.js'), 'utf8');
assert.ok(/require\('\.\/check-release-metadata'\)/.test(signoffSource),
  'release signoff must share canonical version and tag validation');
assert.ok(/ReleaseMetadata\.check\(root, tag\)/.test(signoffSource),
  'release signoff must validate repository metadata before checking physical-TV evidence');

console.log('Release signoff checks passed');
