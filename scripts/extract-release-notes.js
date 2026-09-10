'use strict';

var fs = require('fs');
var path = require('path');

function versionFromTag(tag) {
  var match = String(tag || '').match(/^v(\d+\.\d+\.\d+)$/);
  if (!match) { throw new Error('expected a release tag in the form v<major>.<minor>.<patch>'); }
  return match[1];
}

function extract(contents, tag) {
  var version = versionFromTag(tag);
  var lines = String(contents || '').split(/\r?\n/);
  var heading = new RegExp('^## \\[' + version.replace(/\./g, '\\.') + '\\](?:\\s+-\\s+.*)?$');
  var start = -1;
  var end = lines.length;
  var index;
  var notes;
  for (index = 0; index < lines.length; index += 1) {
    if (heading.test(lines[index])) {
      start = index + 1;
      break;
    }
  }
  if (start === -1) { throw new Error('missing changelog section for ' + tag); }
  for (index = start; index < lines.length; index += 1) {
    if (/^## \[/.test(lines[index])) {
      end = index;
      break;
    }
  }
  notes = lines.slice(start, end).join('\n').replace(/^\s+|\s+$/g, '');
  if (!notes) { throw new Error('empty changelog section for ' + tag); }
  return notes;
}

if (require.main === module) {
  try {
    process.stdout.write(extract(
      fs.readFileSync(path.resolve(__dirname, '..', 'CHANGELOG.md'), 'utf8'),
      process.argv[2]
    ) + '\n');
  } catch (error) {
    console.error('Release notes extraction failed: ' + error.message);
    process.exitCode = 1;
  }
}

module.exports = {
  extract: extract,
  versionFromTag: versionFromTag
};
