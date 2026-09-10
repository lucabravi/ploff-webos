'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');
var Settings = require('../app/settings');
var SettingsCatalog = require('../app/settings-catalog');
var SettingsSchema = require('../app/settings-schema');
var ProgressiveImages = require('../app/progressive-images');
var I18n = require('../app/i18n');

var defaults = Settings.defaults();
assert.strictEqual(defaults.uiTextScale, 100, 'UI text scale must preserve the current 100% appearance by default');
assert.deepStrictEqual(SettingsSchema.allowed('uiTextScale'), [90, 100, 115, 130], 'UI text scale must expose the approved TV viewing-distance choices');
assert.strictEqual(Settings.validate({ uiTextScale: 115 }).uiTextScale, 115, 'supported UI text scales must persist');
assert.strictEqual(Settings.validate({ uiTextScale: 112 }).uiTextScale, 100, 'unsupported UI text scales must fall back to the stable default');
assert.strictEqual(defaults.artworkDataSaver, false, 'artwork data saver must be opt-in');
assert.strictEqual(Settings.validate({ artworkDataSaver: true }).artworkDataSaver, true, 'artwork data saver must accept an explicit boolean opt-in');
assert.strictEqual(Settings.validate({ artworkDataSaver: 'true' }).artworkDataSaver, false, 'artwork data saver must reject string truthiness');
assert.strictEqual(defaults.interfaceAnimations, true, 'reduced motion must remain opt-in through the existing interfaceAnimations preference');
assert.strictEqual(Settings.validate({ interfaceAnimations: false }).interfaceAnimations, false, 'existing reduced-motion preference must remain persistent');

var catalog = SettingsCatalog.create({
  t: function (key) { return key; },
  languageName: function (_language, code) { return code; },
  nativeLanguageName: function (code) { return code; },
  activeServerLabel: function () { return 'Plex'; },
  activeProfileTitle: function () { return ''; },
  networkStatusLabel: function () { return 'online'; },
  plexConnected: function () { return true; },
  videoQualityLabel: function (value) { return String(value); },
  playbackPreferenceLabel: function (value) { return String(value); },
  accentColorLabel: function (value) { return String(value); },
  visualThemeLabel: function (value) { return String(value); },
  supportedUiLanguages: function () { return SettingsSchema.allowed('uiLanguage'); },
  accentValues: {},
  appVersion: 'test'
});
var rows = catalog.rows(defaults);
var textScaleRow = rows.filter(function (row) { return row.key === 'uiTextScale'; })[0];
var dataSaverRow = rows.filter(function (row) { return row.key === 'artworkDataSaver'; })[0];
assert.ok(textScaleRow && textScaleRow.stepper, 'UI text scale must be exposed as a stepped Accessibility setting');
assert.deepStrictEqual(textScaleRow.choices.map(function (choice) { return choice.value; }), [90, 100, 115, 130], 'UI text scale UI choices must come from the persisted schema');
assert.ok(dataSaverRow, 'artwork data saver must be exposed in Appearance settings');
assert.deepStrictEqual(dataSaverRow.choices.map(function (choice) { return choice.value; }), [true, false], 'artwork data saver must use the shared boolean choices');
assert.strictEqual(I18n.t('it', 'settings.artworkDataSaver'), 'Caricamento immagini leggero', 'Italian UI must name the mode by its loading behavior rather than data saving');
assert.strictEqual(I18n.t('en', 'settings.artworkDataSaver'), 'Lightweight image loading', 'English UI must name the mode by its loading behavior rather than data saving');

var coreCss = fs.readFileSync(path.join(__dirname, '..', 'app', 'styles', 'core.css'), 'utf8');
assert.ok(coreCss.indexOf('--ui-text-scale: 16px;') !== -1, 'CSS must define a 100% root font-size baseline');
assert.ok(/html\s*,\s*\nbody[\s\S]*font-size:\s*var\(--ui-text-scale\)/.test(coreCss), 'the root UI font size must be driven by the persisted text-scale variable');
var scalableCoreCss = coreCss.replace(/\.detail-choice-source\s*\{[^}]*\}/, '');
assert.strictEqual((scalableCoreCss.match(/font-size\s*:\s*[0-9.]+px/g) || []).length, 0, 'fixed UI font sizes must use rem except for explicit legacy-TV minimum-readable-size contracts');
assert.ok(/\.detail-choice-source\s*\{[^}]*font-size:\s*20px/.test(coreCss), 'detail preference badges must keep the LG minimum readable 20px size even when UI text scaling is reduced');
assert.ok(/body\.animations-disabled \*[\s\S]*animation-duration:\s*1ms !important;/.test(coreCss), 'existing reduced-motion CSS must continue disabling nonessential motion');
assert.ok(/body\.animations-disabled \.startup-splash-spinner[\s\S]*animation-iteration-count:\s*infinite !important;/.test(coreCss), 'reduced motion must retain essential loading indicators');

function imageTarget() {
  var value = '';
  var target = { className: 'poster-image', starts: [] };
  Object.defineProperty(target, 'src', {
    get: function () { return value; },
    set: function (next) { value = next; target.starts.push(next); }
  });
  target.removeAttribute = function () { value = ''; };
  return target;
}

function saverHarness(preferences) {
  var preloads = [];
  function FakeImage() {
    var value = '';
    var image = this;
    Object.defineProperty(image, 'src', {
      get: function () { return value; },
      set: function (next) { value = next; }
    });
    preloads.push(image);
  }
  return {
    preloads: preloads,
    loader: ProgressiveImages.create({
      Image: FakeImage,
      previewConcurrency: 6,
      fullConcurrency: 3,
      runtimeSettings: function () { return preferences; },
      isAttached: function () { return true; },
      urlFor: function (source, width, height) { return source + '@' + width + 'x' + height; }
    })
  };
}

function start(loader, target, source) {
  loader.load(target, {
    source: source,
    previewWidth: 64,
    previewHeight: 96,
    width: 154,
    height: 224,
    priority: 0,
    scope: 'home'
  });
}

var normal = saverHarness({ artworkDataSaver: false });
var normalTarget = imageTarget();
start(normal.loader, normalTarget, 'normal');
assert.strictEqual(normalTarget.src, 'normal@64x96', 'normal mode must preserve existing preview request dimensions');
normalTarget.onload();
assert.strictEqual(normal.preloads[0].src, 'normal@154x224', 'normal mode must preserve existing full request dimensions');

var saverPreferences = { artworkDataSaver: true };
var saver = saverHarness(saverPreferences);
var first = imageTarget();
var second = imageTarget();
var third = imageTarget();
start(saver.loader, first, 'first');
start(saver.loader, second, 'second');
start(saver.loader, third, 'third');
assert.strictEqual(first.src, 'first@64x96', 'lightweight image loading must not hide an extra preview-quality reduction');
assert.strictEqual(second.src, 'second@64x96', 'lightweight image loading must allow the bounded second preview request');
assert.strictEqual(third.src, '', 'data saver must cap preview concurrency at two requests');
first.onload();
assert.strictEqual(third.src, 'third@64x96', 'queued previews must resume when a lightweight-loading slot becomes available');
assert.strictEqual(saver.preloads[0].src, 'first@154x224', 'lightweight image loading must leave full request dimensions to the explicit quality settings');
second.onload();
assert.strictEqual(saver.preloads.length, 1, 'data saver must cap full-image concurrency at one request');
saver.preloads[0].onload();
assert.strictEqual(saver.preloads.length, 2, 'the next full request must resume after the single data-saver slot is released');

console.log('Legacy TV preference checks passed');
