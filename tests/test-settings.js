'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');
var Settings = require('../app/settings');
var I18n = require('../app/i18n');

var defaults = Settings.defaults();
assert.strictEqual(defaults.uiLanguage, 'en', 'English must remain the portable fallback');
assert.deepStrictEqual(defaults.audioLanguages, [], 'audio priority starts empty until Plex seeds it');
assert.deepStrictEqual(defaults.subtitleLanguages, [], 'subtitle priority starts empty until Plex seeds it');
assert.deepStrictEqual(defaults.subtitleSuppressedForAudio, [], 'subtitle suppression must be opt-in');
assert.strictEqual(defaults.subtitleSourcePreference, 'external', 'automatic subtitles must prefer external tracks by default');
assert.strictEqual(defaults.autoplayDelay, 5, 'next-episode autoplay must keep the current five-second default');
assert.strictEqual(defaults.upNextLayout, 'compact', 'Up Next must default to the compact presentation');
assert.strictEqual(defaults.skipPromptDuration, 5, 'skip marker prompts must remain visible for five seconds by default');
assert.strictEqual(defaults.playbackMode, 'auto', 'playback must default to Plex automatic Direct Stream decisions');
assert.strictEqual(defaults.adaptivePlaybackMemory, true, 'automatic playback compatibility memory must be enabled by default');
assert.deepStrictEqual(defaults.videoVersionPriorities, ['resolution', 'hdr', 'quality', 'directPlay'], 'automatic video versions must prioritize resolution before HDR, estimated quality, and Direct Play');
assert.strictEqual(defaults.lanVideoQuality, 'original', 'LAN playback must default to original quality');
assert.strictEqual(defaults.remoteVideoQuality, '8000', 'remote playback must default to a bounded quality');
assert.strictEqual(defaults.wheelBehavior, 'items', 'the Magic Remote wheel must default to moving the selection');
assert.strictEqual(defaults.cardScale, 100, 'poster cards must keep the current Home size by default');
assert.deepStrictEqual(Settings.ARTWORK_QUALITIES, [70, 80, 85, 90, 100], 'artwork quality must expose the approved high-resolution steps');
assert.deepStrictEqual(Settings.BACKDROP_QUALITIES, [50, 60, 70, 85, 100], 'backdrop quality must expose the approved wider steps');
assert.deepStrictEqual(Settings.VIDEO_QUALITIES, ['4000', '8000', '12000', 'original'], 'video quality must expose an increasing scale with Original at the maximum step');
assert.strictEqual(defaults.artworkQuality, 90, 'poster and thumbnail downloads must default to the step below maximum');
assert.strictEqual(defaults.backdropQuality, 85, 'backdrop downloads must default to 85% independently');
assert.strictEqual(defaults.accentColor, 'cyan', 'the original cyan accent must remain the default');
assert.strictEqual(defaults.backgroundDelay, 500, 'theme audio must default to a responsive 500 ms hover delay');
assert.strictEqual(defaults.searchT9Input, true, 'T9 search input must be enabled by default');
assert.strictEqual(defaults.showWatchlist, true, 'Watchlist navigation must remain visible by default');
assert.strictEqual(defaults.showPlaylists, true, 'Playlist navigation must remain visible by default');
assert.strictEqual(defaults.settingsBackupMode, 'off', 'Plex settings backup automation must remain opt-in');
assert.strictEqual(defaults.subtitleBackground, 'off', 'subtitle background must preserve the existing transparent default');
assert.strictEqual(defaults.subtitlePosition, 7, 'subtitle position must preserve the existing seven-percent baseline');
assert.strictEqual(defaults.subtitleEdge, 'shadow', 'subtitle text must preserve the existing shadow default');
assert.deepStrictEqual([defaults.safeAreaTop, defaults.safeAreaRight, defaults.safeAreaBottom, defaults.safeAreaLeft], [0, 0, 0, 0], 'TV safe-area calibration must default to the full application canvas');

var validated = Settings.validate({
  uiLanguage: 'it-IT',
  backgroundVolume: 37,
  backgroundDelay: 1234,
  autoplayDelay: 9,
  skipPromptDuration: 9,
  subtitleMode: 'forced',
  lanVideoQuality: '12000',
  remoteVideoQuality: '8000',
  playbackMode: 'invalid',
  wheelBehavior: 'page',
  artworkQuality: 80,
  backdropQuality: 100,
  audioLanguages: [' JA ', 'en-US', 'ja', ''],
  subtitleLanguages: ['it-IT', 'EN'],
  subtitleSuppressedForAudio: ['ja-JP', 'EN', 'ja'],
  subtitleSourcePreference: 'internal'
});

assert.strictEqual(validated.uiLanguage, 'it', 'supported regional locales must use their primary tag');
assert.strictEqual(Settings.validate({ uiLanguage: 'pt-BR' }).uiLanguage, 'pt', 'Brazilian Portuguese must be accepted as a UI locale');
assert.strictEqual(Settings.validate({ uiLanguage: 'fr-FR' }).uiLanguage, 'fr', 'French regional locales must be accepted as a UI locale');
assert.strictEqual(Settings.validate({ uiLanguage: 'ja-JP' }).uiLanguage, 'ja', 'Japanese regional locales must be accepted as a UI locale');
assert.strictEqual(Settings.validate({ uiLanguage: 'ko-KR' }).uiLanguage, 'ko', 'Korean regional locales must be accepted as a UI locale');
assert.deepStrictEqual(Settings.supportedUiLanguages().sort(), I18n.supportedLanguages().sort(), 'settings must use the i18n locale registry as its single source');
assert.strictEqual(validated.backgroundVolume, 20, 'volume must be restricted to supported values');
assert.strictEqual(validated.backgroundDelay, 500, 'invalid delays must fall back to the 500 ms default');
assert.strictEqual(validated.autoplayDelay, 5, 'autoplay delay must be restricted to supported values');
assert.strictEqual(Settings.validate({ upNextLayout: 'bottom-panel' }).upNextLayout, 'bottom-panel', 'the bottom Up Next layout must be accepted');
assert.strictEqual(Settings.validate({ upNextLayout: 'invalid' }).upNextLayout, 'compact', 'unsupported Up Next layouts must fall back safely');
assert.strictEqual(validated.skipPromptDuration, 5, 'skip prompt duration must be restricted to supported values');
assert.strictEqual(validated.playbackMode, 'auto', 'invalid playback modes must safely fall back to Auto');
assert.strictEqual(validated.lanVideoQuality, '12000', 'LAN quality must validate independently');
assert.strictEqual(validated.remoteVideoQuality, '8000', 'remote quality must validate independently');
var migratedQuality = Settings.validate({ videoQuality: '4000' });
assert.strictEqual(migratedQuality.lanVideoQuality, '4000', 'legacy quality must migrate to LAN playback');
assert.strictEqual(migratedQuality.remoteVideoQuality, '4000', 'legacy quality must migrate to remote playback without changing behavior');
assert.strictEqual(validated.wheelBehavior, 'page', 'page scrolling must be a supported wheel behavior');
assert.strictEqual(validated.artworkQuality, 80, 'supported poster and thumbnail quality must be preserved');
assert.strictEqual(validated.backdropQuality, 100, 'backdrop quality must validate independently');
assert.strictEqual(Settings.validate({ artworkQuality: 70, backdropQuality: 50 }).artworkQuality, 70, 'the lowest artwork quality must be accepted');
assert.strictEqual(Settings.validate({ artworkQuality: 55 }).artworkQuality, 70, 'legacy artwork quality below the new range must migrate to the nearest supported step');
assert.strictEqual(Settings.validate({ backdropQuality: 70 }).backdropQuality, 70, 'supported backdrop quality must be accepted');
assert.strictEqual(Settings.validate({ backdropQuality: 90 }).backdropQuality, 85, 'legacy backdrop quality must migrate to the nearest supported step');
assert.strictEqual(Settings.validate({}).artworkQuality, 90, 'stored settings predating artwork quality must receive the new default');
assert.strictEqual(Settings.validate({}).backdropQuality, 85, 'stored settings predating backdrop quality must receive the new default');
assert.strictEqual(Settings.validate({ wheelBehavior: 'invalid' }).wheelBehavior, 'items', 'invalid wheel behavior must safely fall back to selection movement');
assert.strictEqual(Settings.validate({ playbackMode: 'direct' }).playbackMode, 'direct', 'Direct-only playback must be a supported global mode');
assert.strictEqual(Settings.validate({ adaptivePlaybackMemory: false }).adaptivePlaybackMemory, false, 'automatic playback compatibility memory may be disabled');
assert.deepStrictEqual(
  Settings.validate({ videoVersionPriorities: ['directPlay', 'quality', 'directPlay', 'invalid'] }).videoVersionPriorities,
  ['directPlay', 'quality', 'resolution', 'hdr'],
  'video version priorities must preserve valid unique choices and append missing criteria'
);
assert.strictEqual(Settings.validate({ cardScale: 70 }).cardScale, 70, 'the smallest supported poster scale must be accepted');
assert.strictEqual(Settings.validate({ cardScale: 130 }).cardScale, 130, 'the largest supported poster scale must be accepted');
assert.strictEqual(Settings.validate({ cardScale: 75 }).cardScale, 100, 'unsupported poster scales must safely fall back to 100%');
assert.strictEqual(Settings.validate({ accentColor: 'amber' }).accentColor, 'amber', 'supported accent colors must be preserved');
assert.strictEqual(Settings.validate({ accentColor: 'purple' }).accentColor, 'purple', 'purple must be available as an accent color');
assert.strictEqual(Settings.validate({ accentColor: 'white' }).accentColor, 'white', 'white must be available as an accent color');
assert.strictEqual(Settings.validate({ accentColor: 'orange' }).accentColor, 'cyan', 'unknown accent colors must fall back safely');
assert.strictEqual(Settings.validate({ visualTheme: 'immersive' }).visualTheme, 'immersive', 'Immersive must be accepted as a visual theme');
assert.strictEqual(Settings.validate({ visualTheme: 'unknown' }).visualTheme, 'immersive', 'unknown visual themes must fall back to the default Immersive interface');
assert.strictEqual(Settings.validate({}).visualTheme, 'immersive', 'new installations must use the Immersive interface by default');
assert.strictEqual(Settings.validate({ visualTheme: 'classic' }).visualTheme, 'classic', 'saved Simple theme preferences must remain valid');
assert.strictEqual(Settings.validate({ searchT9Input: true }).searchT9Input, true, 'T9 search input may be enabled explicitly');
assert.strictEqual(Settings.validate({ searchT9Input: 'true' }).searchT9Input, false, 'T9 search input must accept only a real boolean');
assert.strictEqual(Settings.validate({ searchT9Input: false }).searchT9Input, false, 'an explicitly disabled T9 setting must be preserved');
assert.strictEqual(Settings.validate({}).searchT9Input, true, 'stored settings without a T9 preference must receive the new default');
assert.strictEqual(Settings.validate({ showWatchlist: false }).showWatchlist, false, 'Watchlist navigation may be hidden independently');
assert.strictEqual(Settings.validate({ showPlaylists: false }).showPlaylists, false, 'Playlist navigation may be hidden independently');
assert.strictEqual(Settings.validate({ settingsBackupMode: 'on' }).settingsBackupMode, 'on', 'automatic backup may be enabled explicitly');
assert.strictEqual(Settings.validate({ settingsBackupMode: 'sync' }).settingsBackupMode, 'on', 'legacy sync mode must migrate to automatic save');
assert.strictEqual(Settings.validate({ settingsBackupMode: 'invalid' }).settingsBackupMode, 'off', 'unknown backup modes must fall back safely');
assert.deepStrictEqual(validated.audioLanguages, ['ja', 'en'], 'language priorities must be normalized and deduplicated in order');
assert.deepStrictEqual(validated.subtitleLanguages, ['it', 'en'], 'subtitle priorities must retain their order');
assert.deepStrictEqual(validated.subtitleSuppressedForAudio, ['ja', 'en'], 'suppressed audio languages must be normalized');
assert.strictEqual(validated.subtitleSourcePreference, 'internal', 'the preferred subtitle source must be validated');
assert.strictEqual(Settings.validate({ subtitleSourcePreference: 'invalid' }).subtitleSourcePreference, 'external', 'invalid subtitle source preferences must fall back to external');

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

var koreanSeeded = Settings.seedFromPlex(Settings.defaults(), {
  locale: 'ko-KR',
  profile: {}
});
assert.strictEqual(koreanSeeded.uiLanguage, 'ko', 'a Korean Plex account locale must seed the Korean interface');

var japaneseSeeded = Settings.seedFromPlex(Settings.defaults(), {
  locale: 'ja-JP',
  profile: {}
});
assert.strictEqual(japaneseSeeded.uiLanguage, 'ja', 'a Japanese Plex account locale must seed the Japanese interface');

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
assert.doesNotThrow(function () {
  Settings.save({ setItem: function () { throw new Error('quota'); } }, { accentColor: 'purple' });
}, 'settings changes must remain usable when localStorage rejects a write');

var v1Fixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/settings/v1.json'), 'utf8'));
var v2Fixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/settings/v2.json'), 'utf8'));
var v3Fixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/settings/v3.json'), 'utf8'));
function storageFrom(values) {
  var data = values || {};
  return {
    getItem: function (key) { return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null; },
    setItem: function (key, value) { data[key] = value; },
    data: data
  };
}

assert.strictEqual(Settings.CURRENT_VERSION, 3, 'settings schema must expose the current migration version');
assert.strictEqual(Settings.STORAGE_KEY, 'ploff.settings.v3', 'current settings must use a versioned v3 storage key');
var migratedV1 = Settings.load(storageFrom({ 'ploff.settings.v1': JSON.stringify(v1Fixture) }));
assert.strictEqual(migratedV1.version, 3, 'v1 settings must migrate to the current schema');
assert.strictEqual(migratedV1.lanVideoQuality, '4000', 'v1 video quality must migrate to LAN quality');
assert.strictEqual(migratedV1.remoteVideoQuality, '4000', 'v1 video quality must migrate to remote quality');
assert.strictEqual(migratedV1.autoplayDelay, 0, 'v1 disabled autoplay must migrate to zero delay');
assert.strictEqual(migratedV1.settingsBackupMode, 'on', 'legacy sync mode must migrate to automatic per-device save');
var migratedV2 = Settings.load(storageFrom({ 'ploff.settings.v2': JSON.stringify(v2Fixture) }));
assert.strictEqual(migratedV2.version, 3, 'v2 settings must migrate to the current schema');
assert.strictEqual(migratedV2.cardScale, 70, 'v2 settings values must survive migration');
assert.strictEqual(migratedV2.settingsBackupMode, 'on', 'v2 sync mode must become automatic per-device save');
var saveStorage = storageFrom({ 'ploff.settings.v2': JSON.stringify(v2Fixture) });
Settings.save(saveStorage, migratedV2);
assert.ok(saveStorage.data['ploff.settings.v3'], 'saving migrated settings must write only the current storage key');
assert.strictEqual(JSON.parse(saveStorage.data['ploff.settings.v3']).version, 3, 'persisted current settings must carry schema version 3');
assert.strictEqual(Settings.migrate(v1Fixture).version, 3, 'explicit migration must produce the current schema version');
var loadedV3 = Settings.load(storageFrom({ 'ploff.settings.v3': JSON.stringify(v3Fixture) }));
assert.strictEqual(loadedV3.version, 3, 'current fixture settings must load without a migration hop');
assert.strictEqual(loadedV3.uiLanguage, 'de', 'current fixture settings must preserve current schema values');
assert.strictEqual(loadedV3.cardScale, 110, 'current fixture settings must preserve current presentation values');

console.log('Settings checks passed');
