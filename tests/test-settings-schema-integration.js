'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');
var Settings = require('../app/settings');
var SettingsSchema = require('../app/settings-schema');

var root = path.resolve(__dirname, '..');
var source = fs.readFileSync(path.join(root, 'app', 'settings.js'), 'utf8');
var html = fs.readFileSync(path.join(root, 'app', 'index.html'), 'utf8');

assert.ok(/require\('\.\/settings-schema'\)/.test(source), 'Settings must consume the persisted settings schema in Node');
assert.ok(/root\.PloffSettingsSchema/.test(source), 'Settings must consume the persisted settings schema in the browser');
assert.ok(/theme-registry\.js[\s\S]*settings-schema\.js[\s\S]*settings\.js/.test(html),
  'the browser must load ThemeRegistry, SettingsSchema, then Settings in dependency order');
assert.deepStrictEqual(Settings.defaults(), Object.assign({ version: Settings.CURRENT_VERSION }, SettingsSchema.defaults()),
  'Settings defaults must be derived from the persisted schema registry');
assert.deepStrictEqual(Settings.ACCENT_COLORS, SettingsSchema.allowed('accentColor'), 'exported accent choices must come from the schema');
assert.deepStrictEqual(Settings.VIDEO_QUALITIES, SettingsSchema.allowed('lanVideoQuality'), 'exported video choices must come from the schema');
assert.deepStrictEqual(Settings.ARTWORK_QUALITIES, SettingsSchema.allowed('artworkQuality'), 'exported artwork choices must come from the schema');

console.log('Settings schema integration tests passed');
