(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) { module.exports = factory(require('./search-text')); }
  else { root.PloffPlexSearchParser = factory(root.PloffSearchText); }
}(this, function (SearchText) {
  'use strict';

  function create(dependencies) {
    var values = dependencies || {};
    var mediaFromAttributes = values.mediaFromAttributes;

    function searchAttributesMatch(attributes, query) {
      var terms = SearchText.terms(query);
      var searchable;
      if (!terms.length) { return true; }
      searchable = SearchText.normalize([attributes.title, attributes.originalTitle, attributes.titleSort].join(' '));
      return terms.every(function (term) { return searchable.indexOf(term) !== -1; });
    }

    function searchItemsFromAttributes(attributesList, baseUrl, token, query) {
      var seen = {};
      var items = [];
      var attributes;
      var item;
      var index;
      for (index = 0; index < attributesList.length; index += 1) {
        attributes = attributesList[index];
        if ((attributes.type !== 'movie' && attributes.type !== 'show') || !attributes.ratingKey || seen[attributes.ratingKey] || !searchAttributesMatch(attributes, query)) { continue; }
        seen[attributes.ratingKey] = true;
        item = mediaFromAttributes(attributes, baseUrl, token);
        item.libraryTitle = attributes.librarySectionTitle || '';
        items.push(item);
      }
      items.sort(function (left, right) {
        var leftTitle = left.title.toLowerCase();
        var rightTitle = right.title.toLowerCase();
        if (leftTitle < rightTitle) { return -1; }
        if (leftTitle > rightTitle) { return 1; }
        return 0;
      });
      return items;
    }

    return { normalizedSearchText: SearchText.normalize, searchAttributesMatch: searchAttributesMatch, searchItemsFromAttributes: searchItemsFromAttributes };
  }
  return { create: create };
}));
