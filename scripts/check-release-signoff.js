'use strict';

var childProcess = require('child_process');
var fs = require('fs');
var path = require('path');

function fail(message) {
  throw new Error(message);
}

function releaseMatrixCount(contents) {
  var marker = 'Before a release, verify these cases on a target webOS TV:';
  var start = contents.indexOf(marker);
  var lines;
  var count = 0;
  var index;
  if (start === -1) { fail('release matrix not found in docs/testing.md'); }
  lines = contents.slice(start + marker.length).split(/\r?\n/);
  for (index = 0; index < lines.length; index += 1) {
    if (/^\d+\.\s+\S/.test(lines[index])) { count += 1; }
  }
  if (!count) { fail('release matrix has no numbered checks'); }
  return count;
}

function field(contents, name) {
  var expression = new RegExp('^- ' + name + ':\\s*(.+)\\s*$', 'mi');
  var match = contents.match(expression);
  var value = match ? match[1].replace(/^\s+|\s+$/g, '') : '';
  if (!value || /^<.*>$/.test(value) || /^(?:tbd|todo)$/i.test(value)) {
    fail('release signoff has no completed ' + name + ' field');
  }
  return value;
}

function validateDate(value) {
  var match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  var parsed;
  if (!match) { fail('release signoff date must use YYYY-MM-DD'); }
  parsed = new Date(value + 'T00:00:00Z');
  if (
    isNaN(parsed.getTime()) ||
    parsed.getUTCFullYear() !== Number(match[1]) ||
    parsed.getUTCMonth() + 1 !== Number(match[2]) ||
    parsed.getUTCDate() !== Number(match[3])
  ) {
    fail('release signoff date is invalid');
  }
}

function validateSignoff(contents, tag, expectedChecks) {
  var checked = [];
  var lines = contents.split(/\r?\n/);
  var index;
  var match;
  if (contents.indexOf('# Physical-TV release signoff: ' + tag) === -1) {
    fail('release signoff heading does not match ' + tag);
  }
  validateDate(field(contents, 'Date'));
  field(contents, 'TV model');
  field(contents, 'webOS version');
  field(contents, 'Tester');
  if (field(contents, 'Result').toUpperCase() !== 'PASS') {
    fail('release signoff result must be PASS');
  }
  for (index = 0; index < lines.length; index += 1) {
    if (/^- \[ \]\s+\d+\./.test(lines[index])) {
      fail('release signoff contains unchecked matrix items');
    }
    match = lines[index].match(/^- \[[xX]\]\s+(\d+)\.\s+\S/);
    if (match) { checked.push(Number(match[1])); }
  }
  if (checked.length !== expectedChecks) {
    fail('release signoff must contain ' + expectedChecks + ' checked matrix items');
  }
  for (index = 0; index < expectedChecks; index += 1) {
    if (checked[index] !== index + 1) {
      fail('release signoff matrix items must be numbered 1 through ' + expectedChecks);
    }
  }
  return true;
}

function isTracked(root, relativePath) {
  try {
    childProcess.execFileSync(
      'git',
      ['ls-files', '--error-unmatch', '--', relativePath],
      { cwd: root, stdio: 'ignore' }
    );
    return true;
  } catch (error) {
    return false;
  }
}

function check(root, tag) {
  var version;
  var signoffPath;
  var relativePath;
  var matrix;
  if (!/^v\d+\.\d+\.\d+$/.test(tag || '')) {
    fail('usage: node scripts/check-release-signoff.js v<major>.<minor>.<patch>');
  }
  version = JSON.parse(fs.readFileSync(path.join(root, 'webos-shell-app', 'appinfo.json'), 'utf8')).version;
  if (tag !== 'v' + version) { fail('release tag ' + tag + ' does not match app version v' + version); }
  relativePath = path.join('docs', 'release-signoff', tag + '.md');
  signoffPath = path.join(root, relativePath);
  if (!fs.existsSync(signoffPath)) { fail('missing physical-TV release signoff: ' + relativePath); }
  if (!isTracked(root, relativePath)) { fail('physical-TV release signoff is not tracked by git: ' + relativePath); }
  matrix = fs.readFileSync(path.join(root, 'docs', 'testing.md'), 'utf8');
  validateSignoff(fs.readFileSync(signoffPath, 'utf8'), tag, releaseMatrixCount(matrix));
  return relativePath;
}

if (require.main === module) {
  try {
    console.log('Physical-TV release signoff passed: ' + check(path.resolve(__dirname, '..'), process.argv[2]));
  } catch (error) {
    console.error('Physical-TV release signoff failed: ' + error.message);
    process.exitCode = 1;
  }
}

module.exports = {
  check: check,
  releaseMatrixCount: releaseMatrixCount,
  validateSignoff: validateSignoff
};
