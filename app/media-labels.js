(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PloffMediaLabels = factory();
  }
}(this, function () {
  'use strict';

  function localized(item, property, translate) {
    var key = item && item[property + 'Key'];
    var fallback = item && item[property];
    if (key && translate) { return translate(key, item[property + 'Parameters'] || {}); }
    return String(fallback || '');
  }

  function title(item, translate) { return localized(item, 'title', translate); }
  function meta(item, translate) { return localized(item, 'meta', translate); }
  function detail(item, translate) { return localized(item, 'detail', translate); }

  function description(item, translate) {
    return [title(item, translate), meta(item, translate), detail(item, translate)].filter(function (value) {
      return !!value;
    }).join(', ');
  }

  return {
    description: description,
    detail: detail,
    meta: meta,
    title: title
  };
}));
