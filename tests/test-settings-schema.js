'use strict';

var assert = require('assert');
var ThemeRegistry = require('../app/theme-registry');
var SettingsSchema = require('../app/settings-schema');

var expectedKeys = [
  'uiLanguage', 'uiLanguageExplicit', 'backgroundMusic', 'backgroundVolume', 'backgroundDelay',
  'autoplayDelay', 'upNextLayout', 'skipPromptDuration', 'audioLanguages', 'subtitleLanguages',
  'subtitleSuppressedForAudio', 'subtitleMode', 'subtitleModeExplicit', 'subtitleSourcePreference',
  'subtitleRenderingSrt', 'subtitleRenderingAss',
  'lanVideoQuality', 'remoteVideoQuality', 'playbackMode', 'adaptivePlaybackMemory',
  'videoVersionPriorities', 'wheelBehavior', 'cardScale', 'uiTextScale', 'artworkQuality', 'backdropQuality',
  'artworkDataSaver', 'accentColor', 'visualTheme', 'interfaceAnimations', 'searchT9Input', 'showWatchlist',
  'showPlaylists', 'aggregateLibraries', 'aggregateHomeLibraries', 'homeRows', 'settingsBackupMode', 'highContrast', 'strongFocus', 'subtitleBackground',
  'subtitleEdge', 'subtitlePosition', 'subtitleSize', 'safeAreaTop', 'safeAreaRight', 'safeAreaBottom', 'safeAreaLeft'
];

var definitions = SettingsSchema.all();
assert.deepStrictEqual(definitions.map(function (definition) { return definition.key; }), expectedKeys,
  'the persisted Settings schema must list every stored setting in stable order');

var defaults = SettingsSchema.defaults();
assert.strictEqual(defaults.visualTheme, ThemeRegistry.defaultId(), 'theme defaults must come from ThemeRegistry');
assert.deepStrictEqual(SettingsSchema.allowed('visualTheme'), ThemeRegistry.ids(), 'theme validation choices must come from ThemeRegistry');
assert.deepStrictEqual(SettingsSchema.allowed('videoVersionPriorities'), ['resolution', 'hdr', 'quality', 'directPlay'],
  'priority defaults and allowed values must be declared by the schema');
assert.deepStrictEqual(SettingsSchema.allowed('homeRows'), ['continue', 'recommended', 'recent'],
  'Home row groups must be declared once in the persisted schema');
assert.strictEqual(SettingsSchema.get('homeRows').kind, 'ordered-subset',
  'Home rows must allow ordered visibility without restoring hidden entries');

var defaultsAgain = SettingsSchema.defaults();
defaults.audioLanguages.push('it');
defaults.videoVersionPriorities.reverse();
defaults.homeRows.pop();
assert.deepStrictEqual(defaultsAgain.audioLanguages, [], 'array defaults must not be shared between Settings records');
assert.deepStrictEqual(defaultsAgain.videoVersionPriorities, ['resolution', 'hdr', 'quality', 'directPlay'],
  'priority defaults must be defensively copied');
assert.deepStrictEqual(defaultsAgain.homeRows, ['continue', 'recommended', 'recent'],
  'Home row defaults must be defensively copied');

var exported = SettingsSchema.all();
exported[0].key = 'mutated';
exported[0].allowed = ['mutated'];
assert.strictEqual(SettingsSchema.all()[0].key, 'uiLanguage', 'schema definitions must not be mutable through all()');
assert.notDeepStrictEqual(SettingsSchema.allowed('uiLanguage'), ['mutated'], 'allowed arrays must not be mutable through returned definitions');

assert.strictEqual(SettingsSchema.get('missing'), null, 'unknown persisted settings must not acquire implicit definitions');
assert.strictEqual(SettingsSchema.get('cardScale').kind, 'enum-number', 'numeric choices must declare their normalizer kind');
assert.strictEqual(SettingsSchema.get('uiTextScale').kind, 'enum-number', 'UI text scale must use the shared numeric choice normalizer');
assert.deepStrictEqual(SettingsSchema.allowed('uiTextScale'), [90, 100, 115, 130], 'UI text scale choices must be declared once in the schema');
assert.strictEqual(SettingsSchema.get('artworkQuality').kind, 'nearest-number', 'nearest numeric settings must declare their normalizer kind');
assert.strictEqual(SettingsSchema.get('artworkDataSaver').kind, 'boolean-true', 'artwork data saver must be a strict opt-in boolean');
assert.strictEqual(SettingsSchema.lightweightImageQualityCap('artworkQuality'), 80, 'schema must own the lightweight artwork-quality cap');
assert.strictEqual(SettingsSchema.lightweightImageQualityCap('backdropQuality'), 70, 'schema must own the lightweight backdrop-quality cap');
assert.strictEqual(SettingsSchema.lightweightImageQualityCap('cardScale'), 0, 'unrelated settings must not receive an image-quality cap');
assert.strictEqual(SettingsSchema.get('audioLanguages').kind, 'language-list', 'language arrays must declare their normalizer kind');
assert.strictEqual(SettingsSchema.get('subtitleSize').kind, 'enum-number', 'subtitle size must use the shared numeric choice normalizer');
assert.deepStrictEqual(SettingsSchema.allowed('subtitleSize'), [75, 100, 125, 150, 175, 200], 'subtitle size choices must preserve existing steps and extend through 200%');
assert.deepStrictEqual(SettingsSchema.allowed('subtitleEdge'), ['shadow', 'outline', 'both', 'double-outline-shadow'], 'subtitle edge choices must keep the stronger double-outline option after outline plus shadow');
assert.strictEqual(defaults.subtitleRenderingSrt, false, 'local SRT rendering must be opt-in');
assert.strictEqual(defaults.subtitleRenderingAss, false, 'local ASS rendering must remain disabled until a renderer is available');
assert.strictEqual(SettingsSchema.get('subtitleRenderingSrt').kind, 'boolean-true', 'local SRT rendering must use strict opt-in validation');
assert.strictEqual(SettingsSchema.get('subtitleRenderingAss').kind, 'boolean-true', 'local ASS rendering must use strict opt-in validation');

console.log('Settings schema tests passed');
