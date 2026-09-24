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
assert.strictEqual(LanguageFlag.code('ara'), 'ar', 'Plex three-letter Arabic codes must normalize');
assert.strictEqual(LanguageFlag.code('Arabic'), 'ar', 'English language names must resolve a flag');
assert.strictEqual(LanguageFlag.code('pol'), 'pl', 'Plex three-letter Polish codes must normalize');
assert.strictEqual(LanguageFlag.code('pl-PL'), 'pl', 'regional Polish tags must normalize');
assert.strictEqual(LanguageFlag.code('und'), '', 'unknown languages must not receive a misleading flag');
var flag = LanguageFlag.create({ createElement: createElement }, 'jpn');
assert.strictEqual(flag.className, 'language-flag language-flag-ja', 'language flags must expose one stable CSS class');
assert.strictEqual(flag.tagName, 'IMG', 'language flags must use image assets instead of platform-dependent emoji or CSS approximations');
assert.strictEqual(flag.src, 'assets/flags/jp.svg', 'language flags must resolve to a bundled SVG asset');
assert.strictEqual(flag.alt, '', 'decorative language flags must not duplicate the visible language label');
assert.strictEqual(flag.attributes['aria-hidden'], 'true', 'decorative flags must remain hidden from accessibility APIs');
['en', 'it', 'es', 'fr', 'de', 'pt', 'ja', 'ko', 'zh', 'ru', 'ar', 'pl',
  'nl', 'tr', 'sv', 'da', 'no', 'fi', 'cs', 'el', 'he', 'th', 'vi', 'id', 'uk', 'ro', 'hu',
  'bg', 'hr', 'sr', 'sk', 'hi', 'fa', 'bn', 'ms', 'ca', 'is', 'et', 'lv', 'lt'].forEach(function (language) {
  var source = LanguageFlag.asset(language);
  assert.ok(source && fs.existsSync(path.join(__dirname, '..', 'app', source)), language + ' must resolve to a bundled flag asset');
});

[
  ['nld', 'nl'], ['tur', 'tr'], ['swe', 'sv'], ['dan', 'da'], ['nor', 'no'], ['fin', 'fi'],
  ['ces', 'cs'], ['ell', 'el'], ['heb', 'he'], ['tha', 'th'], ['vie', 'vi'], ['ind', 'id'],
  ['ukr', 'uk'], ['ron', 'ro'], ['hun', 'hu'], ['bul', 'bg'], ['hrv', 'hr'], ['srp', 'sr'],
  ['slk', 'sk'], ['hin', 'hi'], ['fas', 'fa'], ['ben', 'bn'], ['msa', 'ms'], ['cat', 'ca'],
  ['isl', 'is'], ['est', 'et'], ['lav', 'lv'], ['lit', 'lt']
].forEach(function (language) {
  assert.strictEqual(LanguageFlag.code(language[0]), language[1], language[0] + ' must resolve to its language flag code');
});

console.log('Language flag checks passed');
