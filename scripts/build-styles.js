'use strict';

var fs = require('fs');
var path = require('path');
var ThemeRegistry = require('../app/theme-registry');

function sourceFiles(root) {
  return [{ relative: 'styles/core.css', absolute: path.join(root, 'app', 'styles', 'core.css') }]
    .concat(ThemeRegistry.all().map(function (theme) {
      return {
        relative: 'styles/themes/' + theme.styleFile,
        absolute: path.join(root, 'app', 'styles', 'themes', theme.styleFile)
      };
    }));
}

function read(root) {
  return sourceFiles(root).map(function (file) {
    return '/* source: ' + file.relative + ' */\n' + fs.readFileSync(file.absolute, 'utf8').replace(/\s+$/, '') + '\n';
  }).join('\n');
}

function outputPath(root) {
  return path.join(root, 'app', 'styles.css');
}

function check(root) {
  var target = outputPath(root);
  return fs.existsSync(target) && fs.readFileSync(target, 'utf8') === read(root);
}

function write(root) {
  var target = outputPath(root);
  fs.writeFileSync(target, read(root), 'utf8');
  return target;
}

if (require.main === module) {
  var projectRoot = path.resolve(__dirname, '..');
  if (process.argv.indexOf('--check') !== -1) {
    if (!check(projectRoot)) {
      console.error('app/styles.css is stale. Run: npm run build:styles');
      process.exitCode = 1;
    } else {
      console.log('Stylesheet bundle is current');
    }
  } else {
    console.log('Built ' + path.relative(projectRoot, write(projectRoot)));
  }
}

module.exports = {
  check: check,
  read: read,
  sourceFiles: sourceFiles,
  write: write
};
