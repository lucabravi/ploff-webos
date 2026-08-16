(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./i18n'), require('./theme-registry'));
  } else {
    root.PloffSettingsSchema = factory(root.PloffI18n, root.PloffThemeRegistry);
  }
}(this, function (I18n, ThemeRegistry) {
  'use strict';

  var SUPPORTED_UI_LANGUAGES = I18n && I18n.supportedLanguages
    ? I18n.supportedLanguages()
    : ['en', 'it'];
  var VIDEO_VERSION_PRIORITIES = ['resolution', 'hdr', 'quality', 'directPlay'];
  var DEFINITIONS = [
    { key: 'uiLanguage', defaultValue: 'en', kind: 'ui-language', allowed: SUPPORTED_UI_LANGUAGES },
    { key: 'uiLanguageExplicit', defaultValue: false, kind: 'boolean-true' },
    { key: 'backgroundMusic', defaultValue: true, kind: 'boolean-false-only' },
    { key: 'backgroundVolume', defaultValue: 20, kind: 'enum-number', allowed: [10, 20, 30] },
    { key: 'backgroundDelay', defaultValue: 500, kind: 'enum-number', allowed: [200, 500, 1000, 2000] },
    { key: 'autoplayDelay', defaultValue: 5, kind: 'enum-number', allowed: [0, 3, 5, 10, 15] },
    { key: 'upNextLayout', defaultValue: 'compact', kind: 'enum', allowed: ['compact', 'bottom-panel'] },
    { key: 'skipPromptDuration', defaultValue: 5, kind: 'enum-number', allowed: [3, 5, 10] },
    { key: 'audioLanguages', defaultValue: [], kind: 'language-list' },
    { key: 'subtitleLanguages', defaultValue: [], kind: 'language-list' },
    { key: 'subtitleSuppressedForAudio', defaultValue: [], kind: 'language-list' },
    { key: 'subtitleMode', defaultValue: 'audio-mismatch', kind: 'enum', allowed: ['off', 'always', 'audio-mismatch', 'forced'] },
    { key: 'subtitleModeExplicit', defaultValue: false, kind: 'boolean-true' },
    { key: 'subtitleSourcePreference', defaultValue: 'external', kind: 'enum', allowed: ['external', 'internal'] },
    { key: 'lanVideoQuality', defaultValue: 'original', kind: 'enum-string', allowed: ['4000', '8000', '12000', 'original'] },
    { key: 'remoteVideoQuality', defaultValue: '8000', kind: 'enum-string', allowed: ['4000', '8000', '12000', 'original'] },
    { key: 'playbackMode', defaultValue: 'auto', kind: 'enum', allowed: ['auto', 'direct', 'transcode'] },
    { key: 'adaptivePlaybackMemory', defaultValue: true, kind: 'boolean-false-only' },
    { key: 'videoVersionPriorities', defaultValue: VIDEO_VERSION_PRIORITIES, kind: 'priority-list', allowed: VIDEO_VERSION_PRIORITIES },
    { key: 'wheelBehavior', defaultValue: 'items', kind: 'enum', allowed: ['items', 'page'] },
    { key: 'cardScale', defaultValue: 100, kind: 'enum-number', allowed: [70, 80, 90, 100, 110, 120, 130] },
    { key: 'artworkQuality', defaultValue: 90, kind: 'nearest-number', allowed: [70, 80, 85, 90, 100] },
    { key: 'backdropQuality', defaultValue: 85, kind: 'nearest-number', allowed: [50, 60, 70, 85, 100] },
    { key: 'accentColor', defaultValue: 'cyan', kind: 'enum-string', allowed: ['cyan', 'amber', 'blue', 'green', 'pink', 'purple', 'red', 'white'] },
    { key: 'visualTheme', defaultValue: ThemeRegistry.defaultId(), kind: 'enum-string', allowed: ThemeRegistry.ids() },
    { key: 'interfaceAnimations', defaultValue: true, kind: 'boolean-false-only' },
    { key: 'searchT9Input', defaultValue: true, kind: 'boolean-strict-default-true' },
    { key: 'showWatchlist', defaultValue: true, kind: 'boolean-false-only' },
    { key: 'showPlaylists', defaultValue: true, kind: 'boolean-false-only' },
    { key: 'settingsBackupMode', defaultValue: 'off', kind: 'enum', allowed: ['off', 'on'] },
    { key: 'highContrast', defaultValue: false, kind: 'boolean-true' },
    { key: 'strongFocus', defaultValue: false, kind: 'boolean-true' },
    { key: 'subtitleBackground', defaultValue: 'off', kind: 'enum', allowed: ['off', 'low', 'medium', 'high', 'opaque'] },
    { key: 'subtitleEdge', defaultValue: 'shadow', kind: 'enum', allowed: ['shadow', 'outline', 'both'] },
    { key: 'subtitlePosition', defaultValue: 7, kind: 'nearest-number', allowed: [5, 7, 10, 13, 16] },
    { key: 'safeAreaTop', defaultValue: 0, kind: 'nearest-number', allowed: [0, 1, 2, 3, 4, 5] },
    { key: 'safeAreaRight', defaultValue: 0, kind: 'nearest-number', allowed: [0, 1, 2, 3, 4, 5] },
    { key: 'safeAreaBottom', defaultValue: 0, kind: 'nearest-number', allowed: [0, 1, 2, 3, 4, 5] },
    { key: 'safeAreaLeft', defaultValue: 0, kind: 'nearest-number', allowed: [0, 1, 2, 3, 4, 5] }
  ];

  function copyValue(value) {
    return Object.prototype.toString.call(value) === '[object Array]' ? value.slice() : value;
  }

  function copyDefinition(definition) {
    if (!definition) { return null; }
    return {
      key: definition.key,
      defaultValue: copyValue(definition.defaultValue),
      kind: definition.kind,
      allowed: definition.allowed ? definition.allowed.slice() : undefined
    };
  }

  function get(key) {
    var index;
    for (index = 0; index < DEFINITIONS.length; index += 1) {
      if (DEFINITIONS[index].key === key) { return copyDefinition(DEFINITIONS[index]); }
    }
    return null;
  }

  function all() {
    return DEFINITIONS.map(copyDefinition);
  }

  function allowed(key) {
    var definition = get(key);
    return definition && definition.allowed ? definition.allowed.slice() : [];
  }

  function defaults() {
    var result = {};
    var index;
    for (index = 0; index < DEFINITIONS.length; index += 1) {
      result[DEFINITIONS[index].key] = copyValue(DEFINITIONS[index].defaultValue);
    }
    return result;
  }

  return {
    all: all,
    allowed: allowed,
    defaults: defaults,
    get: get
  };
}));
