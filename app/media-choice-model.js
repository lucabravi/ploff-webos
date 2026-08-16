(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PloffMediaChoiceModel = factory();
  }
}(this, function () {
  'use strict';

  function trackValue(track, index, useIndexFallback) {
    var item = track || {};
    if (item.id !== undefined && item.id !== null && String(item.id) !== '') { return String(item.id); }
    return useIndexFallback ? String(Math.max(0, Number(index || 0))) : '';
  }

  function trackChoices(tracks, options) {
    var source = tracks || [];
    var values = options || {};
    var choices = [];
    var index;
    var choice;
    if (values.automatic) { choices.push({ value: String(values.automatic.value), label: String(values.automatic.label), track: null, languageCode: String(values.automatic.languageCode || '') }); }
    if (values.off) { choices.push({ value: String(values.off.value), label: String(values.off.label), track: null }); }
    for (index = 0; index < source.length; index += 1) {
      choice = {
        value: trackValue(source[index], index, values.useIndexFallback === true),
        label: String(values.label ? values.label(source[index], index) : ''),
        track: source[index],
        languageCode: String(source[index].languageTag || source[index].languageCode || source[index].language || '')
      };
      choices.push(choice);
    }
    return choices;
  }

  function versionLabel(profile, options) {
    var values = options || {};
    var label = profile && profile.summary || String(values.unavailable || '');
    return values.automatic === true ? String(values.automaticLabel || '') + ' - ' + label : label;
  }

  function versionValue(version) {
    var item = version || {};
    return String(item.mediaIndex) + ':' + String(item.partIndex);
  }

  function versionChoices(versions, label) {
    return (versions || []).map(function (version, index) {
      return {
        value: versionValue(version),
        label: String(label ? label(version, index) : ''),
        version: version
      };
    });
  }

  function findVersion(versions, value) {
    var source = versions || [];
    var key = String(value || '');
    var index;
    for (index = 0; index < source.length; index += 1) {
      if (versionValue(source[index]) === key) { return source[index]; }
    }
    return null;
  }

  return {
    findVersion: findVersion,
    trackChoices: trackChoices,
    trackValue: trackValue,
    versionChoices: versionChoices,
    versionLabel: versionLabel,
    versionValue: versionValue
  };
}));
