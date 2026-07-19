'use strict';

var assert = require('assert');
var Settings = require('../app/settings');
var I18n = require('../app/i18n');

var defaults = Settings.defaults();
assert.strictEqual(defaults.uiLanguage, 'en', 'English must remain the portable fallback');
assert.deepStrictEqual(defaults.audioLanguages, [], 'audio priority starts empty until Plex seeds it');
assert.deepStrictEqual(defaults.subtitleLanguages, [], 'subtitle priority starts empty until Plex seeds it');
assert.deepStrictEqual(defaults.subtitleSuppressedForAudio, [], 'subtitle suppression must be opt-in');
assert.strictEqual(defaults.autoplayDelay, 5, 'next-episode autoplay must keep the current five-second default');
assert.strictEqual(defaults.skipPromptDuration, 5, 'skip marker prompts must remain visible for five seconds by default');
assert.strictEqual(defaults.playbackMode, 'auto', 'playback must default to Plex automatic Direct Stream decisions');
assert.strictEqual(defaults.wheelBehavior, 'items', 'the Magic Remote wheel must default to moving the selection');
assert.strictEqual(defaults.cardScale, 100, 'poster cards must keep the current Home size by default');
assert.strictEqual(defaults.accentColor, 'cyan', 'the original cyan accent must remain the default');
assert.strictEqual(defaults.showMediaInfo, false, 'technical media information must remain opt-in');

var validated = Settings.validate({
  uiLanguage: 'it-IT',
  backgroundVolume: 37,
  backgroundDelay: 1234,
  autoplayDelay: 9,
  skipPromptDuration: 9,
  subtitleMode: 'forced',
  videoQuality: '8000',
  playbackMode: 'invalid',
  wheelBehavior: 'page',
  audioLanguages: [' JA ', 'en-US', 'ja', ''],
  subtitleLanguages: ['it-IT', 'EN'],
  subtitleSuppressedForAudio: ['ja-JP', 'EN', 'ja']
});

assert.strictEqual(validated.uiLanguage, 'it', 'supported regional locales must use their primary tag');
assert.strictEqual(Settings.validate({ uiLanguage: 'pt-BR' }).uiLanguage, 'pt', 'Brazilian Portuguese must be accepted as a UI locale');
assert.strictEqual(Settings.validate({ uiLanguage: 'fr-FR' }).uiLanguage, 'fr', 'French regional locales must be accepted as a UI locale');
assert.deepStrictEqual(Settings.supportedUiLanguages().sort(), I18n.supportedLanguages().sort(), 'settings must use the i18n locale registry as its single source');
assert.strictEqual(validated.backgroundVolume, 20, 'volume must be restricted to supported values');
assert.strictEqual(validated.backgroundDelay, 1000, 'delay must be restricted to supported values');
assert.strictEqual(validated.autoplayDelay, 5, 'autoplay delay must be restricted to supported values');
assert.strictEqual(validated.skipPromptDuration, 5, 'skip prompt duration must be restricted to supported values');
assert.strictEqual(validated.playbackMode, 'auto', 'invalid playback modes must safely fall back to Auto');
assert.strictEqual(validated.wheelBehavior, 'page', 'page scrolling must be a supported wheel behavior');
assert.strictEqual(Settings.validate({ wheelBehavior: 'invalid' }).wheelBehavior, 'items', 'invalid wheel behavior must safely fall back to selection movement');
assert.strictEqual(Settings.validate({ playbackMode: 'direct' }).playbackMode, 'direct', 'Direct-only playback must be a supported global mode');
assert.strictEqual(Settings.validate({ cardScale: 70 }).cardScale, 70, 'the smallest supported poster scale must be accepted');
assert.strictEqual(Settings.validate({ cardScale: 130 }).cardScale, 130, 'the largest supported poster scale must be accepted');
assert.strictEqual(Settings.validate({ cardScale: 75 }).cardScale, 100, 'unsupported poster scales must safely fall back to 100%');
assert.strictEqual(Settings.validate({ accentColor: 'amber' }).accentColor, 'amber', 'supported accent colors must be preserved');
assert.strictEqual(Settings.validate({ accentColor: 'purple' }).accentColor, 'cyan', 'unknown accent colors must fall back safely');
assert.strictEqual(Settings.validate({ showMediaInfo: true }).showMediaInfo, true, 'technical media information may be enabled explicitly');
assert.strictEqual(Settings.validate({ showMediaInfo: 'true' }).showMediaInfo, false, 'technical media information must accept only a real boolean');
assert.deepStrictEqual(validated.audioLanguages, ['ja', 'en'], 'language priorities must be normalized and deduplicated in order');
assert.deepStrictEqual(validated.subtitleLanguages, ['it', 'en'], 'subtitle priorities must retain their order');
assert.deepStrictEqual(validated.subtitleSuppressedForAudio, ['ja', 'en'], 'suppressed audio languages must be normalized');

var seeded = Settings.seedFromPlex(Settings.defaults(), {
  locale: 'it-IT',
  profile: {
    defaultAudioLanguage: 'ja',
    defaultSubtitleLanguage: 'it',
    autoSelectSubtitle: true,
    defaultSubtitleForced: 'prefer'
  }
});
assert.strictEqual(seeded.uiLanguage, 'it', 'Plex account locale must seed a missing explicit UI language');
assert.deepStrictEqual(seeded.audioLanguages, ['ja'], 'Plex audio preference must seed an empty priority list');
assert.deepStrictEqual(seeded.subtitleLanguages, ['it'], 'Plex subtitle preference must seed an empty priority list');
assert.strictEqual(seeded.subtitleMode, 'audio-mismatch', 'Plex automatic subtitle selection must seed the equivalent local mode');

var subtitlesDisabled = Settings.seedFromPlex(Settings.defaults(), {
  profile: { autoSelectSubtitle: false, defaultSubtitleLanguage: 'it' }
});
assert.strictEqual(subtitlesDisabled.subtitleMode, 'off', 'a disabled Plex subtitle profile must seed subtitles as off');

assert.strictEqual(Settings.validate({ autoplayNext: false }).autoplayDelay, 0, 'legacy disabled autoplay must migrate to OFF');
assert.strictEqual(Settings.validate({ backgroundDelay: 200 }).backgroundDelay, 200, 'theme audio may start after a 200 ms hover');
assert.strictEqual(Settings.validate({ skipPromptDuration: 3 }).skipPromptDuration, 3, 'skip prompts may use the short three-second duration');
assert.strictEqual(Settings.validate({ skipPromptDuration: 10 }).skipPromptDuration, 10, 'skip prompts may use the long ten-second duration');

var explicit = Settings.seedFromPlex(Settings.validate({
  uiLanguage: 'en',
  uiLanguageExplicit: true,
  audioLanguages: ['fr'],
  subtitleLanguages: ['de']
}), {
  locale: 'it',
  profile: { defaultAudioLanguage: 'ja', defaultSubtitleLanguage: 'it' }
});
assert.strictEqual(explicit.uiLanguage, 'en', 'an explicit UI language must override Plex locale');
assert.deepStrictEqual(explicit.audioLanguages, ['fr'], 'existing audio priorities must not be overwritten');
assert.deepStrictEqual(explicit.subtitleLanguages, ['de'], 'existing subtitle priorities must not be overwritten');

var storageValue = null;
var storage = {
  getItem: function () { return storageValue; },
  setItem: function (key, value) { storageValue = value; }
};
Settings.save(storage, validated);
assert.deepStrictEqual(Settings.load(storage), validated, 'saved settings must round-trip through localStorage');
storageValue = '{broken';
assert.deepStrictEqual(Settings.load(storage), Settings.defaults(), 'invalid storage must safely fall back to defaults');

console.log('Settings checks passed');
