(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PloffSearchText = factory();
  }
}(this, function () {
  'use strict';

  function normalize(value) {
    return String(value || '').toLowerCase()
      .replace(/[àáâãäå]/g, 'a').replace(/[èéêë]/g, 'e')
      .replace(/[ìíîï]/g, 'i').replace(/[òóôõö]/g, 'o')
      .replace(/[ùúûü]/g, 'u').replace(/[ç]/g, 'c')
      .replace(/[^a-z0-9]+/g, ' ').replace(/^\s+|\s+$/g, '');
  }

  function terms(value) {
    return normalize(value).split(/\s+/).filter(function (term) { return !!term; });
  }

  return { normalize: normalize, terms: terms };
}));
