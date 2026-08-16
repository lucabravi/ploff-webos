'use strict';

var assert = require('assert');
var ThemeRegistry = require('../app/theme-registry');
var SettingsSchema = require('../app/settings-schema');

var expectedKeys = [
  'uiLanguage', 'uiLanguageExplicit', 'backgroundMusic', 'backgroundVolume', 'backgroundDelay',
  'autoplayDelay', 'upNextLayout', 'skipPromptDuration', 'audioLanguages', 'subtitleLanguages',
  'subtitleSuppressedForAudio', 'subtitleMode', 'subtitleModeExplicit', 'subtitleSourcePreference',
  'lanVideoQuality', 'remoteVideoQuality', 'playbackMode', 'adaptivePlaybackMemory',
  'videoVersionPriorities', 'wheelBehavior', 'cardScale', 'artworkQuality', 'backdropQuality',
  'accentColor', 'visualTheme', 'interfaceAnimations', 'searchT9Input', 'showWatchlist',
  'showPlaylists', 'settingsBackupMode', 'highContrast', 'strongFocus', 'subtitleBackground',
  'subtitleEdge', 'subtitlePosition', 'safeAreaTop', 'safeAreaRight', 'safeAreaBottom', 'safeAreaLeft'
];

var definitions = SettingsSchema.all();
assert.deepStrictEqual(definitions.map(function (definition) { return definition.key; }), expectedKeys,
  'the persisted Settings schema must list every stored setting in stable order');

var defaults = SettingsSchema.defaults();
assert.strictEqual(defaults.visualTheme, ThemeRegistry.defaultId(), 'theme defaults must come from ThemeRegistry');
assert.deepStrictEqual(SettingsSchema.allowed('visualTheme'), ThemeRegistry.ids(), 'theme validation choices must come from ThemeRegistry');
assert.deepStrictEqual(SettingsSchema.allowed('videoVersionPriorities'), ['resolution', 'hdr', 'quality', 'directPlay'],
  'priority defaults and allowed values must be declared by the schema');

var defaultsAgain = SettingsSchema.defaults();
defaults.audioLanguages.push('it');
defaults.videoVersionPriorities.reverse();
assert.deepStrictEqual(defaultsAgain.audioLanguages, [], 'array defaults must not be shared between Settings records');
assert.deepStrictEqual(defaultsAgain.videoVersionPriorities, ['resolution', 'hdr', 'quality', 'directPlay'],
  'priority defaults must be defensively copied');

var exported = SettingsSchema.all();
exported[0].key = 'mutated';
exported[0].allowed = ['mutated'];
assert.strictEqual(SettingsSchema.all()[0].key, 'uiLanguage', 'schema definitions must not be mutable through all()');
assert.notDeepStrictEqual(SettingsSchema.allowed('uiLanguage'), ['mutated'], 'allowed arrays must not be mutable through returned definitions');

assert.strictEqual(SettingsSchema.get('missing'), null, 'unknown persisted settings must not acquire implicit definitions');
assert.strictEqual(SettingsSchema.get('cardScale').kind, 'enum-number', 'numeric choices must declare their normalizer kind');
assert.strictEqual(SettingsSchema.get('artworkQuality').kind, 'nearest-number', 'nearest numeric settings must declare their normalizer kind');
assert.strictEqual(SettingsSchema.get('audioLanguages').kind, 'language-list', 'language arrays must declare their normalizer kind');

console.log('Settings schema tests passed');
