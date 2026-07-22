(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PloffSettingsCatalog = factory();
  }
}(this, function () {
  'use strict';

  function create(options) {
    var values = options || {};

    function languageList(items, settings) {
      if (!items.length) { return values.t('settings.notConfigured'); }
      return items.map(function (code) { return values.languageName(settings.uiLanguage, code); }).join(' > ');
    }

    function choices(items, label) {
      return items.map(function (value) { return { value: value, label: label(value) }; });
    }

    function booleanChoices() {
      return [
        { value: true, label: values.t('settings.enabled') },
        { value: false, label: values.t('settings.disabled') }
      ];
    }

    function rows(settings) {
      var subtitleLabels = {
        off: values.t('subtitle.off'), always: values.t('subtitle.always'),
        'audio-mismatch': values.t('subtitle.audioMismatch'), forced: values.t('subtitle.forced')
      };
      return [
        { key: 'plexServer', section: 'plex', label: values.t('settings.plexServer'), value: values.activeServerLabel(), serverEditor: true },
        { key: 'plexProfile', section: 'plex', label: values.t('settings.plexProfile'), value: values.activeProfileTitle(), profileEditor: true },
        { key: 'uiLanguage', section: 'interface', label: values.t('settings.interfaceLanguage'), value: values.nativeLanguageName(settings.uiLanguage), choices: choices(values.supportedUiLanguages(), values.nativeLanguageName) },
        { key: 'wheelBehavior', section: 'interface', label: values.t('settings.wheelBehavior'), value: values.t(settings.wheelBehavior === 'page' ? 'settings.wheelPage' : 'settings.wheelItems'), choices: choices(['items', 'page'], function (value) { return values.t(value === 'page' ? 'settings.wheelPage' : 'settings.wheelItems'); }) },
        { key: 'cardScale', section: 'interface', label: values.t('settings.cardSize'), value: settings.cardScale + '%', choices: choices(values.cardScales, function (value) { return value + '%'; }) },
        { key: 'accentColor', section: 'interface', label: values.t('settings.accentColor'), value: values.accentColorLabel(settings.accentColor), palette: true, choices: values.accentColors.map(function (value) { return { value: value, label: values.accentColorLabel(value), color: values.accentValues[value] }; }) },
        { key: 'searchT9Input', section: 'interface', label: values.t('settings.searchT9Input'), value: values.t(settings.searchT9Input ? 'settings.enabled' : 'settings.disabled'), choices: booleanChoices() },
        { key: 'showMediaInfo', section: 'interface', label: values.t('settings.showMediaInfo'), value: values.t(settings.showMediaInfo ? 'settings.enabled' : 'settings.disabled'), choices: booleanChoices() },
        { key: 'showWatchlist', section: 'interface', label: values.t('settings.showWatchlist'), value: values.t(settings.showWatchlist ? 'settings.enabled' : 'settings.disabled'), choices: booleanChoices() },
        { key: 'showPlaylists', section: 'interface', label: values.t('settings.showPlaylists'), value: values.t(settings.showPlaylists ? 'settings.enabled' : 'settings.disabled'), choices: booleanChoices() },
        { key: 'backgroundMusic', section: 'audioAppearance', label: values.t('settings.backgroundMusic'), value: values.t(settings.backgroundMusic ? 'settings.enabled' : 'settings.disabled'), choices: booleanChoices() },
        { key: 'backgroundVolume', section: 'audioAppearance', label: values.t('settings.backgroundVolume'), value: settings.backgroundVolume + '%', choices: choices([10, 20, 30], function (value) { return value + '%'; }) },
        { key: 'backgroundDelay', section: 'audioAppearance', label: values.t('settings.backgroundDelay'), value: settings.backgroundDelay + ' ms', choices: choices([200, 500, 1000, 2000], function (value) { return value + ' ms'; }) },
        { key: 'lanVideoQuality', section: 'playback', label: values.t('settings.lanVideoQuality'), value: values.videoQualityLabel(settings.lanVideoQuality), choices: choices(['original', '12000', '8000', '4000'], values.videoQualityLabel) },
        { key: 'remoteVideoQuality', section: 'playback', label: values.t('settings.remoteVideoQuality'), value: values.videoQualityLabel(settings.remoteVideoQuality), choices: choices(['original', '12000', '8000', '4000'], values.videoQualityLabel) },
        { key: 'playbackMode', section: 'playback', label: values.t('settings.playbackMode'), value: values.playbackPreferenceLabel(settings.playbackMode), choices: choices(['auto', 'direct', 'transcode'], values.playbackPreferenceLabel) },
        { key: 'autoplayDelay', section: 'playback', label: values.t('settings.autoplayNext'), value: settings.autoplayDelay === 0 ? values.t('settings.disabled').toUpperCase() : settings.autoplayDelay + ' s', choices: choices([0, 3, 5, 10, 15], function (value) { return value === 0 ? values.t('settings.disabled').toUpperCase() : value + ' s'; }) },
        { key: 'skipPromptDuration', section: 'playback', label: values.t('settings.skipPromptDuration'), value: settings.skipPromptDuration + ' s', choices: choices([3, 5, 10], function (value) { return value + ' s'; }) },
        { key: 'audioLanguages', section: 'languages', label: values.t('settings.audioPriority'), value: languageList(settings.audioLanguages, settings), editor: true },
        { key: 'subtitleLanguages', section: 'languages', label: values.t('settings.subtitlePriority'), value: languageList(settings.subtitleLanguages, settings), editor: true },
        { key: 'subtitleSuppressedForAudio', section: 'languages', label: values.t('settings.subtitleSuppression'), value: languageList(settings.subtitleSuppressedForAudio, settings), editor: true },
        { key: 'subtitleMode', section: 'languages', label: values.t('settings.subtitleMode'), value: subtitleLabels[settings.subtitleMode], choices: choices(['off', 'always', 'audio-mismatch', 'forced'], function (value) { return subtitleLabels[value]; }) },
        { key: 'subtitleSourcePreference', section: 'languages', label: values.t('settings.subtitleSourcePreference'), value: values.t(settings.subtitleSourcePreference === 'internal' ? 'settings.preferInternalSubtitles' : 'settings.preferExternalSubtitles'), choices: choices(['external', 'internal'], function (value) { return values.t(value === 'internal' ? 'settings.preferInternalSubtitles' : 'settings.preferExternalSubtitles'); }) },
        { key: 'diagnostics', section: 'support', label: values.t('settings.diagnostics'), value: '', action: true }
      ];
    }

    function sectionLabel(section) {
      var keys = { plex: 'settings.sectionPlex', interface: 'settings.sectionInterface', audioAppearance: 'settings.sectionAudioAppearance', playback: 'settings.sectionPlayback', languages: 'settings.sectionLanguages', support: 'settings.sectionSupport' };
      return values.t(keys[section] || '');
    }

    return { rows: rows, sectionLabel: sectionLabel };
  }
  return { create: create };
}));
