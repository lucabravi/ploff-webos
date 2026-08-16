(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./settings-schema'), require('./theme-registry'));
  } else {
    root.PloffSettingsCatalog = factory(root.PloffSettingsSchema, root.PloffThemeRegistry);
  }
}(this, function (SettingsSchema, ThemeRegistry) {
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

    function domainValues(key) {
      return SettingsSchema && SettingsSchema.allowed ? SettingsSchema.allowed(key) : [];
    }

    function supportsAccentColor(themeId) {
      var definition = ThemeRegistry && ThemeRegistry.get ? ThemeRegistry.get(themeId) : null;
      return !definition || definition.supportsAccentColor === true;
    }

    function languageChoices(items, label) {
      return items.map(function (value) { return { value: value, label: label(value), languageCode: value }; });
    }

    function versionPriorityList(items) {
      return (items || []).map(function (key) { return values.t('settings.versionPriority.' + key); }).join(' > ');
    }

    function booleanChoices() {
      return [
        { value: true, label: values.t('settings.enabled') },
        { value: false, label: values.t('settings.disabled') }
      ];
    }

    function upNextLayoutLabel(value) {
      return values.t(value === 'bottom-panel' ? 'settings.upNextLayout.bottomPanel' : 'settings.upNextLayout.compact');
    }

    function safeAreaLabel(settings) {
      var adjusted = Number(settings.safeAreaTop || 0) > 0 || Number(settings.safeAreaRight || 0) > 0 ||
        Number(settings.safeAreaBottom || 0) > 0 || Number(settings.safeAreaLeft || 0) > 0;
      return values.t(adjusted ? 'settings.safeAreaAdjusted' : 'settings.safeAreaDefault');
    }

    function rows(settings) {
      var subtitleLabels = {
        off: values.t('subtitle.off'), always: values.t('subtitle.always'),
        'audio-mismatch': values.t('subtitle.audioMismatch'), forced: values.t('subtitle.forced')
      };
      var result = [
        { key: 'plexServer', section: 'plex', label: values.t('settings.plexServer'), value: values.activeServerLabel(), serverEditor: true },
        { key: 'plexProfile', section: 'plex', label: values.t('settings.plexProfile'), value: values.activeProfileTitle(), profileEditor: true },
        { key: 'networkStatus', section: 'plex', label: values.t('settings.networkStatus'), value: values.networkStatusLabel(), readOnly: true },
        { key: 'uiLanguage', section: 'interface', label: values.t('settings.interfaceLanguage'), value: values.nativeLanguageName(settings.uiLanguage), languageCode: settings.uiLanguage, choices: languageChoices(values.supportedUiLanguages(), values.nativeLanguageName) },
        { key: 'visualTheme', section: 'interface', label: values.t('settings.visualTheme'), value: values.visualThemeLabel(settings.visualTheme), choices: choices(domainValues('visualTheme'), values.visualThemeLabel) },
        { key: 'accentColor', section: 'interface', label: values.t('settings.accentColor'), value: values.accentColorLabel(settings.accentColor), palette: true, choices: domainValues('accentColor').map(function (value) { return { value: value, label: values.accentColorLabel(value), color: values.accentValues[value] }; }) },
        { key: 'cardScale', section: 'interface', label: values.t('settings.cardSize'), value: settings.cardScale + '%', currentValue: settings.cardScale, choices: choices(domainValues('cardScale'), function (value) { return value + '%'; }), stepper: true, choiceVariant: 'card-scale' },
        { key: 'artworkQuality', section: 'interface', label: values.t('settings.artworkQuality'), value: settings.artworkQuality + '%', currentValue: settings.artworkQuality, choices: choices(domainValues('artworkQuality'), function (value) { return value + '%'; }), stepper: true, choiceVariant: 'artwork-quality' },
        { key: 'backdropQuality', section: 'interface', label: values.t('settings.backdropQuality'), value: settings.backdropQuality + '%', currentValue: settings.backdropQuality, choices: choices(domainValues('backdropQuality'), function (value) { return value + '%'; }), stepper: true, choiceVariant: 'backdrop-quality' },
        { key: 'interfaceAnimations', section: 'interface', label: values.t('settings.interfaceAnimations'), value: values.t(settings.interfaceAnimations ? 'settings.enabled' : 'settings.disabled'), choices: booleanChoices() },
        { key: 'wheelBehavior', section: 'interface', label: values.t('settings.wheelBehavior'), value: values.t(settings.wheelBehavior === 'page' ? 'settings.wheelPage' : 'settings.wheelItems'), choices: choices(domainValues('wheelBehavior'), function (value) { return values.t(value === 'page' ? 'settings.wheelPage' : 'settings.wheelItems'); }) },
        { key: 'searchT9Input', section: 'interface', label: values.t('settings.searchT9Input'), value: values.t(settings.searchT9Input ? 'settings.enabled' : 'settings.disabled'), choices: booleanChoices() },
        { key: 'showWatchlist', section: 'interface', label: values.t('settings.showWatchlist'), value: values.t(settings.showWatchlist ? 'settings.enabled' : 'settings.disabled'), choices: booleanChoices() },
        { key: 'showPlaylists', section: 'interface', label: values.t('settings.showPlaylists'), value: values.t(settings.showPlaylists ? 'settings.enabled' : 'settings.disabled'), choices: booleanChoices() },
        { key: 'highContrast', section: 'accessibility', label: values.t('settings.highContrast'), value: values.t(settings.highContrast ? 'settings.enabled' : 'settings.disabled'), choices: booleanChoices() },
        { key: 'strongFocus', section: 'accessibility', label: values.t('settings.strongFocus'), value: values.t(settings.strongFocus ? 'settings.enabled' : 'settings.disabled'), choices: booleanChoices() },
        { key: 'safeAreaCalibration', section: 'accessibility', label: values.t('settings.safeAreaCalibration'), value: safeAreaLabel(settings), action: true, safeAreaCalibration: true },
        { key: 'subtitleAppearance', section: 'accessibility', label: values.t('settings.subtitleAppearance'), value: values.t('settings.manage'), action: true, subtitleStyleEditor: true },
        { key: 'lanVideoQuality', section: 'playback', label: values.t('settings.lanVideoQuality'), value: values.videoQualityLabel(settings.lanVideoQuality), currentValue: settings.lanVideoQuality, choices: choices(domainValues('lanVideoQuality'), values.videoQualityLabel), stepper: true },
        { key: 'remoteVideoQuality', section: 'playback', label: values.t('settings.remoteVideoQuality'), value: values.videoQualityLabel(settings.remoteVideoQuality), currentValue: settings.remoteVideoQuality, choices: choices(domainValues('lanVideoQuality'), values.videoQualityLabel), stepper: true },
        { key: 'playbackMode', section: 'playback', label: values.t('settings.playbackMode'), value: values.playbackPreferenceLabel(settings.playbackMode), choices: choices(domainValues('playbackMode'), values.playbackPreferenceLabel) },
        { key: 'videoVersionPriorities', section: 'playback', label: values.t('settings.videoVersionPriorities'), value: versionPriorityList(settings.videoVersionPriorities), priorityEditor: true },
        { key: 'playbackCompatibility', section: 'playback', label: values.t('settings.playbackCompatibility'), value: values.t('settings.manage'), action: true, compatibilityEditor: true },
        { key: 'autoplayDelay', section: 'playback', label: values.t('settings.autoplayNext'), value: settings.autoplayDelay === 0 ? values.t('settings.disabled').toUpperCase() : settings.autoplayDelay + ' s', currentValue: settings.autoplayDelay, choices: choices(domainValues('autoplayDelay'), function (value) { return value === 0 ? values.t('settings.disabled').toUpperCase() : value + ' s'; }), stepper: true },
        { key: 'upNextLayout', section: 'playback', label: values.t('settings.upNextLayout'), value: upNextLayoutLabel(settings.upNextLayout), upNextLayoutEditor: true, choices: choices(domainValues('upNextLayout'), upNextLayoutLabel) },
        { key: 'skipPromptDuration', section: 'playback', label: values.t('settings.skipPromptDuration'), value: settings.skipPromptDuration + ' s', currentValue: settings.skipPromptDuration, choices: choices(domainValues('skipPromptDuration'), function (value) { return value + ' s'; }), stepper: true },
        { key: 'audioLanguages', section: 'languages', label: values.t('settings.audioPriority'), value: languageList(settings.audioLanguages, settings), editor: true },
        { key: 'subtitleLanguages', section: 'languages', label: values.t('settings.subtitlePriority'), value: languageList(settings.subtitleLanguages, settings), editor: true },
        { key: 'subtitleSuppressedForAudio', section: 'languages', label: values.t('settings.subtitleSuppression'), value: languageList(settings.subtitleSuppressedForAudio, settings), editor: true },
        { key: 'subtitleMode', section: 'languages', label: values.t('settings.subtitleMode'), value: subtitleLabels[settings.subtitleMode], choices: choices(domainValues('subtitleMode'), function (value) { return subtitleLabels[value]; }) },
        { key: 'subtitleSourcePreference', section: 'languages', label: values.t('settings.subtitleSourcePreference'), value: values.t(settings.subtitleSourcePreference === 'internal' ? 'settings.preferInternalSubtitles' : 'settings.preferExternalSubtitles'), choices: choices(domainValues('subtitleSourcePreference'), function (value) { return values.t(value === 'internal' ? 'settings.preferInternalSubtitles' : 'settings.preferExternalSubtitles'); }) },
        { key: 'backgroundMusic', section: 'audioAppearance', label: values.t('settings.backgroundMusic'), value: values.t(settings.backgroundMusic ? 'settings.enabled' : 'settings.disabled'), choices: booleanChoices() },
        { key: 'backgroundVolume', section: 'audioAppearance', label: values.t('settings.backgroundVolume'), value: settings.backgroundVolume + '%', currentValue: settings.backgroundVolume, choices: choices(domainValues('backgroundVolume'), function (value) { return value + '%'; }), stepper: true },
        { key: 'backgroundDelay', section: 'audioAppearance', label: values.t('settings.backgroundDelay'), value: settings.backgroundDelay + ' ms', currentValue: settings.backgroundDelay, choices: choices(domainValues('backgroundDelay'), function (value) { return value + ' ms'; }), stepper: true },
        { key: 'settingsBackup', section: 'support', label: values.t('settings.backup.title'), value: values.t('settings.backup.mode.' + settings.settingsBackupMode), action: true },
        { key: 'diagnostics', section: 'support', label: values.t('settings.diagnostics'), value: '', action: true },
        { key: 'privacy', section: 'support', label: values.t('settings.privacyPolicy'), value: '', action: true },
        { key: 'disconnectPlex', section: 'support', label: values.t('setup.disconnectPlex'), value: values.plexConnected() ? values.t('settings.connected') : values.t('settings.notConnected'), action: true },
        { key: 'deleteLocalData', section: 'support', label: values.t('settings.deleteLocalData'), value: '', action: true },
        { key: 'appVersion', section: 'support', label: 'Ploff ' + String(values.appVersion || ''), value: values.updateStatusLabel ? values.updateStatusLabel() : '', action: true, versionRow: true }
      ];
      if (!supportsAccentColor(settings.visualTheme)) {
        result = result.filter(function (row) { return row.key !== 'accentColor'; });
      }
      return result;
    }

    function sectionLabel(section) {
      var keys = {
        plex: 'settings.sectionPlex', navigation: 'settings.sectionNavigation', appearance: 'settings.sectionAppearance',
        accessibility: 'settings.sectionAccessibility', playback: 'settings.sectionPlayback', languages: 'settings.sectionLanguages',
        data: 'settings.sectionDataSupport', interface: 'settings.sectionInterface', audioAppearance: 'settings.sectionAudioAppearance', support: 'settings.sectionSupport'
      };
      return values.t(keys[section] || '');
    }

    function categoryDefinitions() {
      return [
        { id: 'plex', keys: ['plexServer', 'plexProfile', 'networkStatus', 'disconnectPlex'] },
        { id: 'navigation', keys: ['uiLanguage', 'wheelBehavior', 'searchT9Input', 'showWatchlist', 'showPlaylists'] },
        { id: 'appearance', keys: ['visualTheme', 'accentColor', 'cardScale', 'artworkQuality', 'backdropQuality', 'interfaceAnimations', 'backgroundMusic', 'backgroundVolume', 'backgroundDelay'] },
        { id: 'accessibility', keys: ['highContrast', 'strongFocus', 'safeAreaCalibration'] },
        { id: 'playback', keys: ['lanVideoQuality', 'remoteVideoQuality', 'playbackMode', 'videoVersionPriorities', 'playbackCompatibility', 'autoplayDelay', 'upNextLayout', 'skipPromptDuration'] },
        { id: 'languages', keys: ['audioLanguages', 'subtitleLanguages', 'subtitleSuppressedForAudio', 'subtitleMode', 'subtitleSourcePreference', 'subtitleAppearance'] },
        { id: 'data', keys: ['settingsBackup', 'diagnostics', 'privacy', 'deleteLocalData'] }
      ];
    }

    function snapshot(settings) {
      var allRows = rows(settings);
      var byKey = {};
      var categoryList = [];
      var definitions = categoryDefinitions();
      var definitionIndex;
      var rowIndex;
      var definition;
      var categoryRows;
      var row;
      for (rowIndex = 0; rowIndex < allRows.length; rowIndex += 1) {
        byKey[allRows[rowIndex].key] = allRows[rowIndex];
      }
      for (definitionIndex = 0; definitionIndex < definitions.length; definitionIndex += 1) {
        definition = definitions[definitionIndex];
        categoryRows = [];
        for (rowIndex = 0; rowIndex < definition.keys.length; rowIndex += 1) {
          row = byKey[definition.keys[rowIndex]];
          if (!row) { continue; }
          row.section = definition.id;
          categoryRows.push(row);
        }
        categoryList.push({ id: definition.id, label: sectionLabel(definition.id), rows: categoryRows });
      }
      return { allRows: allRows, byKey: byKey, categories: categoryList, versionRow: byKey.appVersion || null };
    }

    function categories(settings) {
      return snapshot(settings).categories;
    }

    function versionRow(settings) {
      return snapshot(settings).versionRow;
    }

    return { rows: rows, snapshot: snapshot, categories: categories, versionRow: versionRow, sectionLabel: sectionLabel };
  }
  return { create: create };
}));
