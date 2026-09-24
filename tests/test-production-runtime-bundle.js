'use strict';

var assert = require('assert');
var childProcess = require('child_process');
var fs = require('fs');
var os = require('os');
var path = require('path');
var zlib = require('zlib');
var acorn = require('acorn');
var vm = require('vm');
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
  assert.strictEqual(fs.existsSync(path.join(stage, 'library-grid-view.js')), false, 'staging must omit the grid source already included in app.js');
  assert.strictEqual(fs.existsSync(path.join(stage, 'player-runtime-loader.js')), false, 'the Core prelude source must not duplicate code already present in app.js');
  var productionHtml = fs.readFileSync(path.join(stage, 'index.html'), 'utf8');
  var productionScripts = Performance.localScriptSources(productionHtml);
  var productionGzip = gzipBytes(productionScripts, stage);
  var bundle = fs.readFileSync(path.join(stage, 'core.js'), 'utf8');
  var supportBundle = fs.readFileSync(path.join(stage, 'support.js'), 'utf8');
  var deferredSupportFiles = ['vendor/qrcode-generator.js', 'support-qr.js', 'support-snapshot.js'];
  var expectedBundled = sourceScripts.filter(function (file) {
    return file !== 'vendor/webOSTV.js' && file !== 'startup-metrics.js' && file !== 'app.js' &&
      file !== 'locale-bootstrap.js' && file.indexOf('locales/') !== 0 && deferredSupportFiles.indexOf(file) === -1;
  });
  var sourceLocales = Builder.localeSources();

  assert.deepStrictEqual(result.bundledFiles, expectedBundled, 'production core bundle must preserve the exact source script execution order outside early standalone bootstrap assets');
  assert.deepStrictEqual(productionScripts, ['startup-metrics.js', 'vendor/webOSTV.js', 'core.js', 'locale-bootstrap.js', 'app.js'],
    'production stage must resolve the active locale after the core registry and before the application starts');
  assert.ok(1 - productionScripts.length / sourceScripts.length >= 0.75, 'production bundling must reduce initial script count by at least 75%');
  assert.ok(productionGzip <= sourceGzip * 1.05, 'production bundling must not increase total initial gzip bytes by more than 5%');
  acorn.parse(bundle, { allowHashBang: true, ecmaVersion: 5, sourceType: 'script' });
  acorn.parse(supportBundle, { allowHashBang: true, ecmaVersion: 5, sourceType: 'script' });
  assert.strictEqual(fs.existsSync(path.join(stage, expectedBundled[0])), false, 'bundled source files must be removed from the production stage');
  assert.strictEqual(fs.existsSync(path.join(stage, expectedBundled[expectedBundled.length - 1])), false, 'the final bundled source module must also be removed from the production stage');
  assert.strictEqual(fs.existsSync(path.join(stage, 'vendor', 'webOSTV.js')), true, 'webOSTV bootstrap must remain a standalone runtime asset');
  assert.strictEqual(fs.existsSync(path.join(stage, 'startup-metrics.js')), true, 'startup metrics and ASS worker preload must remain a standalone early runtime asset');
  assert.strictEqual(fs.existsSync(path.join(stage, 'app.js')), true, 'coordinator application bundle must remain the final standalone runtime asset');
  assert.strictEqual(sourceLocales.length, 8, 'the production stage must retain every supported locale for lazy loading');
  assert.strictEqual(sourceHtml.indexOf('locales/'), -1, 'development startup must load only the selected locale');
  assert.ok(result.bundledFiles.every(function (file) { return file.indexOf('locales/') !== 0; }), 'lazy locales must not enter the production core bundle');
  assert.strictEqual(productionHtml.indexOf('locales/'), -1, 'production stage must remove static locale script tags');
  sourceLocales.forEach(function (relative) {
    assert.strictEqual(fs.existsSync(path.join(stage, relative)), true, 'lazy locale must remain separately loadable: ' + relative);
  });
  assert.strictEqual(fs.existsSync(path.join(stage, 'locale-bootstrap.js')), true, 'locale bootstrap must remain standalone');
  assert.ok(productionHtml.indexOf('core.js?v=dev') < productionHtml.indexOf('locale-bootstrap.js') &&
    productionHtml.indexOf('locale-bootstrap.js') < productionHtml.indexOf('app.js?v=dev'),
    'production locale bootstrap must run between core registry creation and application startup');
  var localeWrites = [];
  var context;
  var browser = {
    console: console,
    navigator: { language: 'en' },
    localStorage: {
      getItem: function (key) {
        return key === 'ploff.settings.v3' ? JSON.stringify({ uiLanguage: 'it' }) : null;
      }
    }
  };
  browser.document = {
    querySelector: function () { return null; },
    getElementsByTagName: function () {
      return [{ src: 'core.js?v=dev' }, { src: 'locale-bootstrap.js?v=dev' }, { src: 'app.js?v=dev' }];
    },
    write: function (html) {
      var match = String(html || '').match(/src="([^"?]+)/);
      localeWrites.push(String(html || ''));
      if (match) { vm.runInContext(fs.readFileSync(path.join(stage, match[1]), 'utf8'), context, { filename: match[1] }); }
    },
    createElement: function () { return {}; },
    head: { appendChild: function () {} }
  };
  browser.window = browser;
  context = vm.createContext(browser);
  vm.runInContext(bundle, context, { filename: 'core.js' });
  vm.runInContext(fs.readFileSync(path.join(stage, 'locale-bootstrap.js'), 'utf8'), context, { filename: 'locale-bootstrap.js' });
  assert.deepStrictEqual(localeWrites, ['<script src="locales/it.js?v=dev"></script>'],
    'production bootstrap must synchronously request the persisted locale before app.js executes');
  assert.strictEqual(context.PloffI18n.has('it'), true, 'production bootstrap must register the selected dictionary before application startup');
  assert.strictEqual(context.PloffI18n.t('it', 'nav.settings'), 'Impostazioni', 'production bootstrap must make localized UI copy available before application startup');
  var stagedAssets = childProcess.spawnSync(process.execPath,
    [path.join(root, 'scripts', 'check-shell-assets.js'), path.join(stage, 'index.html'), 'dev'],
    { encoding: 'utf8' });
  assert.strictEqual(stagedAssets.status, 0, 'staged shell must retain every lazy locale asset: ' + ((stagedAssets.stderr || '') + (stagedAssets.stdout || '')));
  assert.ok(productionHtml.indexOf('startup-metrics.js') < productionHtml.indexOf('styles.css'),
    'production ASS worker preload must still start before stylesheet loading');
  assert.ok(productionHtml.indexOf('vendor/webOSTV.js') > productionHtml.indexOf('<body'),
    'webOSTV must keep its original body-time loading position; only the tiny ASS preloader belongs in head');
  assert.ok(productionHtml.indexOf('core.js') > productionHtml.indexOf('<body'),
    'the large production core bundle must not move into head just to preload the ASS worker');
  assert.strictEqual(fs.existsSync(path.join(stage, 'vendor', 'subtitles-octopus.js')), true, 'lazy ASS runtime must remain outside the startup bundle');
  assert.strictEqual(fs.existsSync(path.join(stage, 'vendor', 'subtitles-octopus-worker.js')), true, 'lazy ASS worker must remain separately loadable');
  assert.strictEqual(fs.existsSync(path.join(stage, 'vendor', 'default.ttf')), true, 'runtime ASS fallback font must remain packaged');
  assert.strictEqual(fs.existsSync(path.join(stage, 'vendor', 'default.woff2')), false, 'source/provenance WOFF2 must not inflate the TV package when runtime always uses default.ttf');
  assert.strictEqual(result.bundledFiles.indexOf('vendor/subtitles-octopus.js'), -1, 'lazy ASS runtime must not enter the production startup bundle');
  assert.strictEqual(result.bundledFiles.indexOf('vendor/subtitles-octopus-worker.js'), -1, 'lazy ASS worker must not enter the production startup bundle');
  assert.ok(bundle.indexOf('JavascriptSubtitlesOctopus') !== -1, 'the lightweight lazy loader must remain present in the core bundle');
  deferredSupportFiles.forEach(function (file) {
    assert.strictEqual(result.bundledFiles.indexOf(file), -1, 'support-only runtime must not enter initial core.js: ' + file);
    assert.strictEqual(fs.existsSync(path.join(stage, file)), false, 'support-only source must not duplicate support.js in production: ' + file);
  });
  assert.strictEqual(fs.existsSync(path.join(stage, 'support.js')), true, 'production stage must retain the lazy diagnostics support bundle');
  assert.strictEqual(bundle.indexOf('PloffSupportSnapshot'), -1, 'support snapshot serializer must stay out of initial core.js');
  assert.strictEqual(bundle.indexOf('PloffSupportQr'), -1, 'QR support runtime must stay out of initial core.js');
  assert.ok(supportBundle.indexOf('PloffSupportSnapshot') !== -1 && supportBundle.indexOf('PloffSupportQr') !== -1,
    'lazy support.js must contain the support serializer and QR runtime');
  assert.ok(packageScript.indexOf('build-production-runtime.js" "$STAGE') !== -1, 'TV packaging must build the production runtime bundle in the staged application');
  assert.ok(packageScript.indexOf('build-production-runtime.js') < packageScript.indexOf('asset-cache-key.js'), 'production bundling must happen before the content-derived cache key is calculated');

  var secondStage = fs.mkdtempSync(path.join(os.tmpdir(), 'ploff-missing-player-'));
  try {
    fs.cpSync(appRoot, secondStage, { recursive: true });
    fs.unlinkSync(path.join(secondStage, 'player.js'));
    assert.throws(function () { Builder.stage(secondStage); }, /Player|player/, 'production staging must fail before producing an incomplete shell');
  } finally { fs.rmSync(secondStage, { recursive: true, force: true }); }
  var thirdStage = fs.mkdtempSync(path.join(os.tmpdir(), 'ploff-missing-locale-'));
  try {
    fs.cpSync(appRoot, thirdStage, { recursive: true });
    fs.unlinkSync(path.join(thirdStage, 'locales', 'it.js'));
    assert.throws(function () { Builder.stage(thirdStage); }, /locale/i, 'production staging must fail if a lazy locale asset is missing');
  } finally { fs.rmSync(thirdStage, { recursive: true, force: true }); }
  assert.throws(function () { Builder.bundledFiles(sourceHtml.replace('app.js?v=dev', 'player.js?v=dev')); }, /Player|player|app.js/);
  console.log('Production runtime bundle checks passed: ' + sourceScripts.length + ' -> ' + productionScripts.length + ' scripts; gzip ' + sourceGzip + ' -> ' + productionGzip);
} finally {
  fs.rmSync(stage, { recursive: true, force: true });
}
