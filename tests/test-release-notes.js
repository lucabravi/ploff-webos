'use strict';

var assert = require('assert');
var ReleaseNotes = require('../scripts/extract-release-notes');

var changelog = [
  '# Changelog',
  '',
  '## [Unreleased]',
  '',
  '## [1.2.3] - 2026-08-16',
  '',
  '### Added',
  '',
  '- First change.',
  '- Second change.',
  '',
  '## [1.2.2] - 2026-08-01',
  '',
  '- Older change.',
  ''
].join('\n');

assert.strictEqual(
  ReleaseNotes.extract(changelog, 'v1.2.3'),
  ['### Added', '', '- First change.', '- Second change.'].join('\n')
);
assert.strictEqual(ReleaseNotes.versionFromTag('v1.2.3'), '1.2.3');
assert.throws(function () { ReleaseNotes.versionFromTag('latest'); }, /release tag/);
assert.throws(function () { ReleaseNotes.extract(changelog, 'v9.9.9'); }, /section/);

console.log('release notes tests passed');
