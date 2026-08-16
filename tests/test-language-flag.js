'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');
var LanguageFlag = require('../app/language-flag');

function createElement() {
  return {
    tagName: String(arguments[0] || '').toUpperCase(),
    className: '',
    attributes: {},
    setAttribute: function (key, value) { this.attributes[key] = String(value); }
  };
}

assert.strictEqual(LanguageFlag.code('eng'), 'en', 'Plex three-letter English codes must normalize');
assert.strictEqual(LanguageFlag.code('ita-IT'), 'it', 'regional Plex language codes must normalize');
assert.strictEqual(LanguageFlag.trackCode({ language: 'Japanese' }), 'ja', 'track language names must resolve to a flag');
assert.strictEqual(LanguageFlag.code('und'), '', 'unknown languages must not receive a misleading flag');
var flag = LanguageFlag.create({ createElement: createElement }, 'jpn');
assert.strictEqual(flag.className, 'language-flag language-flag-ja', 'language flags must expose one stable CSS class');
assert.strictEqual(flag.tagName, 'IMG', 'language flags must use image assets instead of platform-dependent emoji or CSS approximations');
assert.strictEqual(flag.src, 'assets/flags/jp.svg', 'language flags must resolve to a bundled SVG asset');
assert.strictEqual(flag.alt, '', 'decorative language flags must not duplicate the visible language label');
assert.strictEqual(flag.attributes['aria-hidden'], 'true', 'decorative flags must remain hidden from accessibility APIs');
['en', 'it', 'es', 'fr', 'de', 'pt', 'ja', 'ko', 'zh', 'ru'].forEach(function (language) {
  var source = LanguageFlag.asset(language);
  assert.ok(source && fs.existsSync(path.join(__dirname, '..', 'app', source)), language + ' must resolve to a bundled flag asset');
});

console.log('Language flag checks passed');
