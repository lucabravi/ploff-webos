(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PloffThemeRegistry = factory();
  }
}(this, function () {
  'use strict';

  var DEFINITIONS = [
    { id: 'classic', className: 'visual-theme-classic', labelKey: 'settings.themeClassic', styleFile: 'classic.css', supportsAccentColor: true },
    { id: 'immersive', className: 'visual-theme-immersive', labelKey: 'settings.themeImmersive', styleFile: 'immersive.css', supportsAccentColor: true },
    { id: 'premiere', className: 'visual-theme-premiere', labelKey: 'settings.themePremiere', styleFile: 'premiere.css', supportsAccentColor: false },
    { id: 'nova', className: 'visual-theme-nova', labelKey: 'settings.themeNova', styleFile: 'nova.css', supportsAccentColor: false },
    { id: 'atelier', className: 'visual-theme-atelier', labelKey: 'settings.themeAtelier', styleFile: 'atelier.css', supportsAccentColor: false }
  ];
  var DEFAULT_ID = 'immersive';

  function copy(definition) {
    return definition ? {
      id: definition.id,
      className: definition.className,
      labelKey: definition.labelKey,
      styleFile: definition.styleFile,
      supportsAccentColor: definition.supportsAccentColor === true
    } : null;
  }

  function get(id) {
    var value = String(id || '');
    var index;
    for (index = 0; index < DEFINITIONS.length; index += 1) {
      if (DEFINITIONS[index].id === value) { return copy(DEFINITIONS[index]); }
    }
    return null;
  }

  function all() {
    return DEFINITIONS.map(copy);
  }

  function ids() {
    return DEFINITIONS.map(function (definition) { return definition.id; });
  }

  function classNames() {
    return DEFINITIONS.map(function (definition) { return definition.className; });
  }

  function defaultId() {
    return DEFAULT_ID;
  }

  return {
    all: all,
    classNames: classNames,
    defaultId: defaultId,
    get: get,
    ids: ids
  };
}));
