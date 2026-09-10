'use strict';

var fs = require('fs');
var path = require('path');
var Minifier = require('./minify-javascript');
var ApplicationBuilder = require('./build-app');

var OUTPUT_FILE = 'core.js';
var RAW_PRESERVE_FILES = { 'vendor/qrcode-generator.js': true };
var STANDALONE_FILES = { 'startup-metrics.js': true, 'vendor/webOSTV.js': true };

function localScriptSources(html) {
  var expression = /<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*><\/script>/gi;
  var result = [];
  var match;
  var source;
  while ((match = expression.exec(String(html || '')))) {
    source = String(match[1] || '').split('#')[0].split('?')[0];
    if (!source || /^(?:[a-z]+:)?\/\//i.test(source) || source.indexOf('data:') === 0) { continue; }
    result.push(source);
  }
  return result;
}

function bundledFiles(html) {
  var scripts = localScriptSources(html);
  if (scripts.indexOf('player.js') !== -1) { throw new Error('Player must remain deferred, not a static startup script'); }
  if (scripts.length < 4 || scripts[0] !== 'startup-metrics.js' || scripts[1] !== 'vendor/webOSTV.js' || scripts[scripts.length - 1] !== 'app.js') {
    throw new Error('Production runtime bundling requires startup-metrics first, webOSTV second, and app.js last');
  }
  return scripts.slice(0, -1).filter(function (file) { return !STANDALONE_FILES[file]; });
}

function sourcePart(stageRoot, relative) {
  var source = fs.readFileSync(path.join(stageRoot, relative), 'utf8');
  if (RAW_PRESERVE_FILES[relative]) { return source.replace(/\s+$/, ''); }
  return Minifier.minifySource(source).replace(/\s+$/, '');
}

function bundleSource(stageRoot, files) {
  return files.map(function (relative) { return sourcePart(stageRoot, relative); }).join(';\n') + ';\n';
}

function rewriteIndex(html, files) {
  var bundled = {};
  var inserted = false;
  files.forEach(function (relative) { bundled[relative] = true; });
  return String(html || '').replace(/([ \t]*)<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*><\/script>/gi, function (tag, indent, rawSource) {
    var source = String(rawSource || '').split('#')[0].split('?')[0];
    if (!bundled[source]) { return tag; }
    if (inserted) { return ''; }
    inserted = true;
    return indent + '<script src="' + OUTPUT_FILE + '?v=dev"></script>';
  });
}

function removeBundledSources(stageRoot, files) {
  files.forEach(function (relative) {
    var target = path.join(stageRoot, relative);
    if (fs.existsSync(target)) { fs.unlinkSync(target); }
  });
}

function stage(stageRoot) {
  var playerPath = path.join(stageRoot, 'player.js');
  if (!fs.existsSync(playerPath) || !fs.statSync(playerPath).isFile() || !fs.statSync(playerPath).size) {
    throw new Error('Missing or empty deferred Player asset: player.js');
  }
  var indexPath = path.join(stageRoot, 'index.html');
  var html = fs.readFileSync(indexPath, 'utf8');
  var files = bundledFiles(html);
  var output = path.join(stageRoot, OUTPUT_FILE);
  fs.writeFileSync(output, bundleSource(stageRoot, files), 'utf8');
  fs.writeFileSync(indexPath, rewriteIndex(html, files), 'utf8');
  removeBundledSources(stageRoot, files);
  removeBundledSources(stageRoot, ApplicationBuilder.PRELUDE_FILES.concat(ApplicationBuilder.PLAYER_FILES));
  return { bundlePath: output, bundledFiles: files.slice(), outputFile: OUTPUT_FILE };
}

if (require.main === module) {
  var stageRoot = path.resolve(process.argv[2] || '');
  if (!stageRoot || !fs.existsSync(path.join(stageRoot, 'index.html'))) {
    console.error('Usage: node scripts/build-production-runtime.js <stage-root>');
    process.exitCode = 1;
  } else {
    var result = stage(stageRoot);
    console.log('Built production runtime bundle: ' + result.bundledFiles.length + ' files -> ' + result.outputFile);
  }
}

module.exports = {
  OUTPUT_FILE: OUTPUT_FILE,
  RAW_PRESERVE_FILES: RAW_PRESERVE_FILES,
  STANDALONE_FILES: STANDALONE_FILES,
  bundleSource: bundleSource,
  bundledFiles: bundledFiles,
  localScriptSources: localScriptSources,
  rewriteIndex: rewriteIndex,
  stage: stage
};
