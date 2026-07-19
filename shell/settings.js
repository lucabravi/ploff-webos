(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./i18n'));
  } else {
    root.PloffSettings = factory(root.PloffI18n);
  }
}(this, function (I18n) {
  'use strict';

  var STORAGE_KEY = 'ploff.settings.v1';
  // Keep interface locales independent from the audio/subtitle language catalog.
  // The registry belongs to i18n, so a translated locale is automatically valid
  // for stored settings and Plex account-locale seeding.
  var SUPPORTED_UI_LANGUAGES = I18n && I18n.supportedLanguages
    ? I18n.supportedLanguages()
    : ['en', 'it'];
  var VOLUMES = [10, 20, 30];
  var DELAYS = [200, 500, 1000, 2000];
  var AUTOPLAY_DELAYS = [0, 3, 5, 10, 15];
  var SKIP_PROMPT_DURATIONS = [3, 5, 10];
  var SUBTITLE_MODES = ['off', 'always', 'audio-mismatch', 'forced'];
  var VIDEO_QUALITIES = ['original', '12000', '8000', '4000'];
  var PLAYBACK_MODES = ['auto', 'direct', 'transcode'];
  var WHEEL_BEHAVIORS = ['items', 'page'];
  var CARD_SCALES = [70, 80, 90, 100, 110, 120, 130];

  function defaults() {
    return {
      version: 1,
      uiLanguage: 'en',
      uiLanguageExplicit: false,
      backgroundMusic: true,
      backgroundVolume: 20,
      backgroundDelay: 1000,
      autoplayDelay: 5,
      skipPromptDuration: 5,
      audioLanguages: [],
      subtitleLanguages: [],
      subtitleSuppressedForAudio: [],
      subtitleMode: 'audio-mismatch',
      subtitleModeExplicit: false,
      videoQuality: 'original',
      playbackMode: 'auto',
      wheelBehavior: 'items',
      cardScale: 100,
      showMediaInfo: false
    };
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

  function validate(source) {
    var fallback = defaults();
    var value = source || {};
    var uiLanguage = primaryLanguage(value.uiLanguage);
    return {
      version: 1,
      uiLanguage: enumValue(uiLanguage, SUPPORTED_UI_LANGUAGES, fallback.uiLanguage),
      uiLanguageExplicit: value.uiLanguageExplicit === true,
      backgroundMusic: value.backgroundMusic !== false,
      backgroundVolume: enumValue(Number(value.backgroundVolume), VOLUMES, fallback.backgroundVolume),
      backgroundDelay: enumValue(Number(value.backgroundDelay), DELAYS, fallback.backgroundDelay),
      autoplayDelay: value.autoplayDelay === undefined && value.autoplayNext === false ? 0 : enumValue(Number(value.autoplayDelay), AUTOPLAY_DELAYS, fallback.autoplayDelay),
      skipPromptDuration: enumValue(Number(value.skipPromptDuration), SKIP_PROMPT_DURATIONS, fallback.skipPromptDuration),
      audioLanguages: languageList(value.audioLanguages),
      subtitleLanguages: languageList(value.subtitleLanguages),
      subtitleSuppressedForAudio: languageList(value.subtitleSuppressedForAudio),
      subtitleMode: enumValue(value.subtitleMode, SUBTITLE_MODES, fallback.subtitleMode),
      subtitleModeExplicit: value.subtitleModeExplicit === true,
      videoQuality: enumValue(String(value.videoQuality || ''), VIDEO_QUALITIES, fallback.videoQuality),
      playbackMode: enumValue(value.playbackMode, PLAYBACK_MODES, fallback.playbackMode),
      wheelBehavior: enumValue(value.wheelBehavior, WHEEL_BEHAVIORS, fallback.wheelBehavior),
      cardScale: enumValue(Number(value.cardScale), CARD_SCALES, fallback.cardScale),
      showMediaInfo: value.showMediaInfo === true
    };
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

  function load(storage) {
    var raw;
    try {
      raw = storage && storage.getItem(STORAGE_KEY);
      return raw ? validate(JSON.parse(raw)) : defaults();
    } catch (error) {
      return defaults();
    }
  }

  function save(storage, value) {
    var validated = validate(value);
    if (storage && storage.setItem) {
      storage.setItem(STORAGE_KEY, JSON.stringify(validated));
    }
    return validated;
  }

  return {
    STORAGE_KEY: STORAGE_KEY,
    defaults: defaults,
    languageList: languageList,
    load: load,
    primaryLanguage: primaryLanguage,
    supportedUiLanguages: function () { return SUPPORTED_UI_LANGUAGES.slice(); },
    save: save,
    seedFromPlex: seedFromPlex,
    validate: validate
  };
}));
