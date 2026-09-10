'use strict';

var fs = require('fs');
var path = require('path');
var zlib = require('zlib');

var MAX_BUNDLE_BYTES = 900000;
var MAX_GZIP_BYTES = 190000;
var MAX_PLAYER_BYTES = 550000;
var MAX_PLAYER_GZIP_BYTES = 115000;
// Raised 210000 -> 230000 on 2026-08-23 for the Aurora theme, then
// 230000 -> 265000 on 2026-08-24 for the Mahogany theme
// (app/styles/themes/mahogany.css); left headroom for one more theme
// of similar size before this needs revisiting again.
var MAX_STYLES_BYTES = 265000;
var MAX_STYLES_GZIP_BYTES = 40000;
var MAX_INITIAL_SCRIPT_COUNT = 130;
// Aggregate source-script guardrail. Raised from 2,200,000 to 2,210,000 on 2026-09-06
// after the measured ASS cold-start prewarm/telemetry work; the production app.js bundle
// retains its separate 900,000-byte raw / 190,000-byte gzip limits above.
var MAX_INITIAL_JS_BYTES = 2210000;

function measureBuffer(source, maxBytes, maxGzipBytes) {
  var rawBytes = source.length;
  var gzipBytes = zlib.gzipSync(source, { level: 9 }).length;
  var rawWithinBudget = rawBytes <= maxBytes;
  var gzipWithinBudget = gzipBytes <= maxGzipBytes;
  return {
    rawBytes: rawBytes,
    gzipBytes: gzipBytes,
    rawWithinBudget: rawWithinBudget,
    gzipWithinBudget: gzipWithinBudget,
    withinBudget: rawWithinBudget && gzipWithinBudget
  };
}

function checkBuffer(source) { return measureBuffer(source, MAX_BUNDLE_BYTES, MAX_GZIP_BYTES); }
function checkPlayerBuffer(source) { return measureBuffer(source, MAX_PLAYER_BYTES, MAX_PLAYER_GZIP_BYTES); }

function checkFile(fileName) {
  return checkBuffer(fs.readFileSync(fileName));
}

function setting(values, name, fallback) {
  var value = Number(values && values[name]);
  return isFinite(value) && value >= 0 ? value : fallback;
}

function localScriptSources(html) {
  var expression = /<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi;
  var sources = [];
  var match;
  var source;
  while ((match = expression.exec(html))) {
    source = String(match[1] || '').split('#')[0].split('?')[0];
    if (!source || /^(?:[a-z]+:)?\/\//i.test(source) || source.indexOf('data:') === 0) { continue; }
    sources.push(source);
  }
  return sources;
}

function checkStartupAssets(indexPath, budgets) {
  var root = path.dirname(indexPath);
  var html = fs.readFileSync(indexPath, 'utf8');
  var sources = localScriptSources(html);
  var initialJsBytes = 0;
  var index;
  var scriptPath;
  var styles = fs.readFileSync(path.join(root, 'styles.css'));
  var stylesBytes = styles.length;
  var stylesGzipBytes = zlib.gzipSync(styles, { level: 9 }).length;
  var maxStylesBytes = setting(budgets, 'maxStylesBytes', MAX_STYLES_BYTES);
  var maxStylesGzipBytes = setting(budgets, 'maxStylesGzipBytes', MAX_STYLES_GZIP_BYTES);
  var maxInitialScriptCount = setting(budgets, 'maxInitialScriptCount', MAX_INITIAL_SCRIPT_COUNT);
  var maxInitialJsBytes = setting(budgets, 'maxInitialJsBytes', MAX_INITIAL_JS_BYTES);
  var scriptCountWithinBudget;
  var initialJsWithinBudget;
  var stylesWithinBudget;
  var stylesGzipWithinBudget;

  for (index = 0; index < sources.length; index += 1) {
    scriptPath = path.resolve(root, sources[index]);
    initialJsBytes += fs.statSync(scriptPath).size;
  }
  scriptCountWithinBudget = sources.length <= maxInitialScriptCount;
  initialJsWithinBudget = initialJsBytes <= maxInitialJsBytes;
  stylesWithinBudget = stylesBytes <= maxStylesBytes;
  stylesGzipWithinBudget = stylesGzipBytes <= maxStylesGzipBytes;
  return {
    initialScriptCount: sources.length,
    initialJsBytes: initialJsBytes,
    stylesBytes: stylesBytes,
    stylesGzipBytes: stylesGzipBytes,
    scriptCountWithinBudget: scriptCountWithinBudget,
    initialJsWithinBudget: initialJsWithinBudget,
    stylesWithinBudget: stylesWithinBudget,
    stylesGzipWithinBudget: stylesGzipWithinBudget,
    withinBudget: scriptCountWithinBudget && initialJsWithinBudget && stylesWithinBudget && stylesGzipWithinBudget
  };
}

if (require.main === module) {
  var appRoot = path.join(__dirname, '..', 'app');
  var bundlePath = path.join(appRoot, 'app.js');
  var indexPath = path.join(appRoot, 'index.html');
  var result = checkFile(bundlePath);
  var startup = checkStartupAssets(indexPath);
  var player = checkPlayerBuffer(fs.readFileSync(path.join(appRoot, 'player.js')));
  console.log(
    'Runtime bundle: ' + result.rawBytes + '/' + MAX_BUNDLE_BYTES +
    ' bytes raw, ' + result.gzipBytes + '/' + MAX_GZIP_BYTES + ' bytes gzip'
  );
  console.log('Deferred Player: ' + player.rawBytes + '/' + MAX_PLAYER_BYTES + ' bytes raw, ' + player.gzipBytes + '/' + MAX_PLAYER_GZIP_BYTES + ' bytes gzip');
  console.log(
    'Startup assets: ' + startup.initialScriptCount + '/' + MAX_INITIAL_SCRIPT_COUNT +
    ' local scripts, ' + startup.initialJsBytes + '/' + MAX_INITIAL_JS_BYTES +
    ' JS bytes, ' + startup.stylesBytes + '/' + MAX_STYLES_BYTES +
    ' CSS bytes raw, ' + startup.stylesGzipBytes + '/' + MAX_STYLES_GZIP_BYTES + ' CSS bytes gzip'
  );
  if (!result.withinBudget || !player.withinBudget || !startup.withinBudget) {
    console.error('Runtime assets exceed the current adjustable engineering guardrail');
    process.exitCode = 1;
  }
}

module.exports = {
  MAX_PLAYER_BYTES: MAX_PLAYER_BYTES,
  MAX_PLAYER_GZIP_BYTES: MAX_PLAYER_GZIP_BYTES,
  checkPlayerBuffer: checkPlayerBuffer,
  MAX_BUNDLE_BYTES: MAX_BUNDLE_BYTES,
  MAX_GZIP_BYTES: MAX_GZIP_BYTES,
  MAX_STYLES_BYTES: MAX_STYLES_BYTES,
  MAX_STYLES_GZIP_BYTES: MAX_STYLES_GZIP_BYTES,
  MAX_INITIAL_SCRIPT_COUNT: MAX_INITIAL_SCRIPT_COUNT,
  MAX_INITIAL_JS_BYTES: MAX_INITIAL_JS_BYTES,
  checkBuffer: checkBuffer,
  checkFile: checkFile,
  checkStartupAssets: checkStartupAssets,
  localScriptSources: localScriptSources
};
