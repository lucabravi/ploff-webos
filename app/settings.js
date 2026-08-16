(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./settings-schema'), require('./theme-registry'));
  } else {
    root.PloffSettings = factory(root.PloffSettingsSchema, root.PloffThemeRegistry);
  }
}(this, function (SettingsSchema, ThemeRegistry) {
  'use strict';

  var CURRENT_VERSION = 3;
  var STORAGE_KEY = 'ploff.settings.v3';
  var LEGACY_STORAGE_KEYS = [
    { key: 'ploff.settings.v2', version: 2 },
    { key: 'ploff.settings.v1', version: 1 }
  ];
  var SUPPORTED_UI_LANGUAGES = SettingsSchema.allowed('uiLanguage');
  var ARTWORK_QUALITIES = SettingsSchema.allowed('artworkQuality');
  var BACKDROP_QUALITIES = SettingsSchema.allowed('backdropQuality');
  var VIDEO_QUALITIES = SettingsSchema.allowed('lanVideoQuality');
  var ACCENT_COLORS = SettingsSchema.allowed('accentColor');
  var VISUAL_THEMES = SettingsSchema.allowed('visualTheme');
  var SETTINGS_BACKUP_MODES = SettingsSchema.allowed('settingsBackupMode');
  var SUBTITLE_BACKGROUNDS = SettingsSchema.allowed('subtitleBackground');
  var SUBTITLE_EDGES = SettingsSchema.allowed('subtitleEdge');
  var SUBTITLE_POSITIONS = SettingsSchema.allowed('subtitlePosition');
  var SAFE_AREA_INSETS = SettingsSchema.allowed('safeAreaTop');

  /** @returns {PloffSettingsRecord} */
  function defaults() {
    var result = SettingsSchema.defaults();
    result.version = CURRENT_VERSION;
    return result;
  }

  function primaryLanguage(value) {
    var normalized = String(value || '').toLowerCase().replace(/_/g, '-').replace(/^\s+|\s+$/g, '');
    return normalized.split('-')[0].replace(/[^a-z]/g, '');
  }

  function contains(values, value) {
    return values.indexOf(value) !== -1;
  }

  function languageList(value) {
    var source = Object.prototype.toString.call(value) === '[object Array]' ? value : [];
    var result = [];
    var index;
    var language;
    for (index = 0; index < source.length; index += 1) {
      language = primaryLanguage(source[index]);
      if (language && !contains(result, language)) {
        result.push(language);
      }
    }
    return result;
  }

  function enumValue(value, allowed, fallback) {
    return contains(allowed, value) ? value : fallback;
  }

  function nearestNumericValue(value, allowed, fallback) {
    var numeric = Number(value);
    var nearest = fallback;
    var distance = Infinity;
    var index;
    var currentDistance;
    if (!isFinite(numeric)) { return fallback; }
    for (index = 0; index < allowed.length; index += 1) {
      currentDistance = Math.abs(allowed[index] - numeric);
      if (currentDistance < distance) {
        nearest = allowed[index];
        distance = currentDistance;
      }
    }
    return nearest;
  }

  function priorityList(value, allowed) {
    var source = Object.prototype.toString.call(value) === '[object Array]' ? value : [];
    var result = [];
    source.concat(allowed).forEach(function (item) {
      if (contains(allowed, item) && !contains(result, item)) { result.push(item); }
    });
    return result;
  }

  function normalizeDefinition(definition, value, fallback) {
    var allowed = definition.allowed || [];
    if (definition.kind === 'ui-language') {
      return enumValue(primaryLanguage(value), allowed, fallback);
    }
    if (definition.kind === 'boolean-true') { return value === true; }
    if (definition.kind === 'boolean-false-only') { return value !== false; }
    if (definition.kind === 'boolean-strict-default-true') {
      return value === undefined ? fallback : value === true;
    }
    if (definition.kind === 'enum-number') { return enumValue(Number(value), allowed, fallback); }
    if (definition.kind === 'nearest-number') { return nearestNumericValue(value, allowed, fallback); }
    if (definition.kind === 'enum-string') { return enumValue(String(value || ''), allowed, fallback); }
    if (definition.kind === 'enum') { return enumValue(value, allowed, fallback); }
    if (definition.kind === 'language-list') { return languageList(value); }
    if (definition.kind === 'priority-list') { return priorityList(value, allowed); }
    return fallback;
  }

  /** @returns {PloffSettingsRecord} */
  function validate(source) {
    var fallback = defaults();
    var value = source || {};
    var definitions = SettingsSchema.all();
    var result = defaults();
    var legacyVideoQuality = enumValue(String(value.videoQuality || ''), VIDEO_QUALITIES, '');
    var index;
    var definition;
    var rawValue;
    for (index = 0; index < definitions.length; index += 1) {
      definition = definitions[index];
      rawValue = value[definition.key];
      if (definition.key === 'autoplayDelay' && rawValue === undefined && value.autoplayNext === false) {
        rawValue = 0;
      } else if ((definition.key === 'lanVideoQuality' || definition.key === 'remoteVideoQuality') && legacyVideoQuality) {
        if (enumValue(String(rawValue || ''), definition.allowed || [], '') === '') { rawValue = legacyVideoQuality; }
      } else if (definition.key === 'settingsBackupMode' && rawValue === 'sync') {
        rawValue = 'on';
      }
      result[definition.key] = normalizeDefinition(definition, rawValue, fallback[definition.key]);
    }
    return result;
  }


  function visualThemeDefinition(value) {
    return ThemeRegistry.get(value) || ThemeRegistry.get(ThemeRegistry.defaultId());
  }

  function visualThemeClassNames() {
    return ThemeRegistry.classNames();
  }

  function seedFromPlex(current, account) {
    var result = validate(current);
    var profile = account && account.profile ? account.profile : {};
    var accountLanguage = primaryLanguage(account && account.locale);
    if (!result.uiLanguageExplicit && contains(SUPPORTED_UI_LANGUAGES, accountLanguage)) {
      result.uiLanguage = accountLanguage;
    }
    if (!result.audioLanguages.length && profile.defaultAudioLanguage) {
      result.audioLanguages = languageList([profile.defaultAudioLanguage]);
    }
    if (!result.subtitleLanguages.length && profile.defaultSubtitleLanguage) {
      result.subtitleLanguages = languageList([profile.defaultSubtitleLanguage]);
    }
    if (!result.subtitleModeExplicit && profile.autoSelectSubtitle === false) {
      result.subtitleMode = 'off';
    } else if (!result.subtitleModeExplicit && profile.defaultSubtitleForced === 'only') {
      result.subtitleMode = 'forced';
    }
    return result;
  }

  function copyRecord(source) {
    var result = {};
    var key;
    source = source || {};
    for (key in source) {
      if (Object.prototype.hasOwnProperty.call(source, key)) { result[key] = source[key]; }
    }
    return result;
  }

  function migrateV1ToV2(source) {
    var result = copyRecord(source);
    if (result.lanVideoQuality === undefined && result.videoQuality !== undefined) {
      result.lanVideoQuality = result.videoQuality;
    }
    if (result.remoteVideoQuality === undefined && result.videoQuality !== undefined) {
      result.remoteVideoQuality = result.videoQuality;
    }
    if (result.autoplayDelay === undefined && result.autoplayNext === false) { result.autoplayDelay = 0; }
    result.version = 2;
    return result;
  }

  function migrateV2ToV3(source) {
    var result = copyRecord(source);
    if (result.settingsBackupMode === 'sync') { result.settingsBackupMode = 'on'; }
    result.version = 3;
    return result;
  }

  function migrate(source, assumedVersion) {
    var result = copyRecord(source);
    var version = Number(result.version || assumedVersion || 1);
    if (!isFinite(version) || version < 1) { version = 1; }
    if (version > CURRENT_VERSION) { throw new Error('Ploff settings schema is newer than this application'); }
    while (version < CURRENT_VERSION) {
      if (version === 1) { result = migrateV1ToV2(result); }
      else if (version === 2) { result = migrateV2ToV3(result); }
      else { throw new Error('Ploff settings schema migration is unavailable'); }
      version = Number(result.version || version + 1);
    }
    result.version = CURRENT_VERSION;
    return result;
  }

  function load(storage) {
    var candidates = [{ key: STORAGE_KEY, version: CURRENT_VERSION }].concat(LEGACY_STORAGE_KEYS);
    var index;
    var raw;
    if (!storage || typeof storage.getItem !== 'function') { return defaults(); }
    for (index = 0; index < candidates.length; index += 1) {
      try {
        raw = storage.getItem(candidates[index].key);
        if (raw) { return validate(migrate(JSON.parse(raw), candidates[index].version)); }
      } catch (_error) {}
    }
    return defaults();
  }

  function save(storage, value) {
    var validated = validate(value);
    if (storage && storage.setItem) {
      try { storage.setItem(STORAGE_KEY, JSON.stringify(validated)); }
      catch (_error) {}
    }
    return validated;
  }

  return {
    CURRENT_VERSION: CURRENT_VERSION,
    ACCENT_COLORS: ACCENT_COLORS.slice(),
    VISUAL_THEMES: VISUAL_THEMES.slice(),
    SAFE_AREA_INSETS: SAFE_AREA_INSETS.slice(),
    SUBTITLE_BACKGROUNDS: SUBTITLE_BACKGROUNDS.slice(),
    SUBTITLE_EDGES: SUBTITLE_EDGES.slice(),
    SUBTITLE_POSITIONS: SUBTITLE_POSITIONS.slice(),
    ARTWORK_QUALITIES: ARTWORK_QUALITIES.slice(),
    BACKDROP_QUALITIES: BACKDROP_QUALITIES.slice(),
    VIDEO_QUALITIES: VIDEO_QUALITIES.slice(),
    SETTINGS_BACKUP_MODES: SETTINGS_BACKUP_MODES.slice(),
    STORAGE_KEY: STORAGE_KEY,
    defaults: defaults,
    languageList: languageList,
    load: load,
    migrate: migrate,
    primaryLanguage: primaryLanguage,
    supportedUiLanguages: function () { return SUPPORTED_UI_LANGUAGES.slice(); },
    save: save,
    seedFromPlex: seedFromPlex,
    validate: validate,
    visualThemeClassNames: visualThemeClassNames,
    visualThemeDefinition: visualThemeDefinition
  };
}));
