'use strict';

var assert = require('assert');
var fs = require('fs');
var os = require('os');
var path = require('path');
var zlib = require('zlib');
var acorn = require('acorn');
var Builder = require('../scripts/build-production-runtime');
var Performance = require('../scripts/check-performance-budget');

var root = path.join(__dirname, '..');
var appRoot = path.join(root, 'app');
var stage = fs.mkdtempSync(path.join(os.tmpdir(), 'ploff-production-runtime-'));
var sourceHtml = fs.readFileSync(path.join(appRoot, 'index.html'), 'utf8');
var sourceScripts = Performance.localScriptSources(sourceHtml);
var packageScript = fs.readFileSync(path.join(root, 'scripts', 'package-tv-shell.sh'), 'utf8');
var sourceGzip = 0;

function gzipBytes(files, base) {
  return files.reduce(function (total, file) {
    return total + zlib.gzipSync(fs.readFileSync(path.join(base, file)), { level: 9 }).length;
  }, 0);
}

try {
  fs.cpSync(appRoot, stage, { recursive: true });
  sourceGzip = gzipBytes(sourceScripts, appRoot);
  var deferred = fs.readFileSync(path.join(stage, 'player.js'), 'utf8');
  var result = Builder.stage(stage);
  assert.strictEqual(fs.readFileSync(path.join(stage, 'player.js'), 'utf8'), deferred, 'staging must retain the separate Player asset unchanged');
  assert.strictEqual(fs.existsSync(path.join(stage, 'playback-session.js')), false, 'staging must omit duplicated deferred source files');
  assert.strictEqual(fs.existsSync(path.join(stage, 'player-runtime-loader.js')), false, 'the Core prelude source must not duplicate code already present in app.js');
  var productionHtml = fs.readFileSync(path.join(stage, 'index.html'), 'utf8');
  var productionScripts = Performance.localScriptSources(productionHtml);
  var productionGzip = gzipBytes(productionScripts, stage);
  var bundle = fs.readFileSync(path.join(stage, 'core.js'), 'utf8');
  var expectedBundled = sourceScripts.filter(function (file) {
    return file !== 'vendor/webOSTV.js' && file !== 'startup-metrics.js' && file !== 'app.js';
  });

  assert.deepStrictEqual(result.bundledFiles, expectedBundled, 'production core bundle must preserve the exact source script execution order outside early standalone bootstrap assets');
  assert.deepStrictEqual(productionScripts, ['startup-metrics.js', 'vendor/webOSTV.js', 'core.js', 'app.js'],
    'production stage must start the tiny ASS preloader before webOSTV and the deferred core bundle');
  assert.ok(1 - productionScripts.length / sourceScripts.length >= 0.75, 'production bundling must reduce initial script count by at least 75%');
  assert.ok(productionGzip <= sourceGzip * 1.05, 'production bundling must not increase total initial gzip bytes by more than 5%');
  acorn.parse(bundle, { allowHashBang: true, ecmaVersion: 5, sourceType: 'script' });
  assert.strictEqual(fs.existsSync(path.join(stage, expectedBundled[0])), false, 'bundled source files must be removed from the production stage');
  assert.strictEqual(fs.existsSync(path.join(stage, expectedBundled[expectedBundled.length - 1])), false, 'the final bundled source module must also be removed from the production stage');
  assert.strictEqual(fs.existsSync(path.join(stage, 'vendor', 'webOSTV.js')), true, 'webOSTV bootstrap must remain a standalone runtime asset');
  assert.strictEqual(fs.existsSync(path.join(stage, 'startup-metrics.js')), true, 'startup metrics and ASS worker preload must remain a standalone early runtime asset');
  assert.strictEqual(fs.existsSync(path.join(stage, 'app.js')), true, 'coordinator application bundle must remain the final standalone runtime asset');
  assert.ok(productionHtml.indexOf('startup-metrics.js') < productionHtml.indexOf('styles.css'),
    'production ASS worker preload must still start before stylesheet loading');
  assert.ok(productionHtml.indexOf('vendor/webOSTV.js') > productionHtml.indexOf('<body'),
    'webOSTV must keep its original body-time loading position; only the tiny ASS preloader belongs in head');
  assert.ok(productionHtml.indexOf('core.js') > productionHtml.indexOf('<body'),
    'the large production core bundle must not move into head just to preload the ASS worker');
  assert.strictEqual(fs.existsSync(path.join(stage, 'vendor', 'subtitles-octopus.js')), true, 'lazy ASS runtime must remain outside the startup bundle');
  assert.strictEqual(fs.existsSync(path.join(stage, 'vendor', 'subtitles-octopus-worker.js')), true, 'lazy ASS worker must remain separately loadable');
  assert.strictEqual(result.bundledFiles.indexOf('vendor/subtitles-octopus.js'), -1, 'lazy ASS runtime must not enter the production startup bundle');
  assert.strictEqual(result.bundledFiles.indexOf('vendor/subtitles-octopus-worker.js'), -1, 'lazy ASS worker must not enter the production startup bundle');
  assert.ok(bundle.indexOf('JavascriptSubtitlesOctopus') !== -1, 'the lightweight lazy loader must remain present in the core bundle');
  assert.ok(result.bundledFiles.indexOf('vendor/qrcode-generator.js') !== -1, 'QR runtime must preserve its original source position inside the bundle');
  assert.ok(packageScript.indexOf('build-production-runtime.js" "$STAGE') !== -1, 'TV packaging must build the production runtime bundle in the staged application');
  assert.ok(packageScript.indexOf('build-production-runtime.js') < packageScript.indexOf('asset-cache-key.js'), 'production bundling must happen before the content-derived cache key is calculated');

  var secondStage = fs.mkdtempSync(path.join(os.tmpdir(), 'ploff-missing-player-'));
  try {
    fs.cpSync(appRoot, secondStage, { recursive: true });
    fs.unlinkSync(path.join(secondStage, 'player.js'));
    assert.throws(function () { Builder.stage(secondStage); }, /Player|player/, 'production staging must fail before producing an incomplete shell');
  } finally { fs.rmSync(secondStage, { recursive: true, force: true }); }
  assert.throws(function () { Builder.bundledFiles(sourceHtml.replace('app.js?v=dev', 'player.js?v=dev')); }, /Player|player|app.js/);
  console.log('Production runtime bundle checks passed: ' + sourceScripts.length + ' -> ' + productionScripts.length + ' scripts; gzip ' + sourceGzip + ' -> ' + productionGzip);
} finally {
  fs.rmSync(stage, { recursive: true, force: true });
}
