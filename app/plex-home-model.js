(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./plex-media-document'), require('./plex-media-mapper'));
  } else {
    root.PloffPlexHomeModel = factory(root.PloffPlexMediaDocument, root.PloffPlexMediaMapper);
  }
}(this, function (PlexMediaDocument, PlexMediaMapper) {
  'use strict';

  var attributesFromNode = PlexMediaDocument.attributesFromNode;
  var mediaFromAttributes = PlexMediaMapper.mediaFromAttributes;

  function sectionDefinitions(sections) {
    return (sections || []).filter(function (section) {
      return section.key && section.title && (section.type === 'movie' || section.type === 'show');
    }).map(function (section) {
      return {
        title: 'home.recentInLibrary',
        titleKey: 'home.recentInLibrary',
        titleParameters: { library: String(section.title) },
        path: '/library/sections/' + section.key + '/recentlyAdded',
        kind: 'recent',
        sectionKey: String(section.key),
        sectionTitle: String(section.title),
        groupRecent: true
      };
    });
  }

  function homeDefinitions(sections, config) {
    return [{
      title: 'library.continue',
      titleKey: 'library.continue',
      path: config && config.continuePath || '/hubs/continueWatching/items',
      kind: 'continue',
      showLibraryBadge: true
    }].concat(sectionDefinitions(sections));
  }

  function recommendationHubPriority(identifier) {
    var value = String(identifier || '').toLowerCase();
    if (value.indexOf('startwatching') !== -1) { return 1; }
    if (value.indexOf('.genre.') !== -1 || value.indexOf('moreingenre') !== -1) { return 2; }
    if (value.indexOf('by.actor.or.director') !== -1) { return 3; }
    if (value.indexOf('topunwatched') !== -1) { return 4; }
    if (value.indexOf('toprated') !== -1) { return 5; }
    return 0;
  }

  function recommendationHubsFromXml(xmlText) {
    var documentNode = PlexMediaDocument.parseXmlDocument(xmlText, 'Invalid Plex recommendation response');
    var hubs = documentNode.getElementsByTagName('Hub');
    var result = [];
    var hubIndex;
    var childIndex;
    var hub;
    var priority;
    var attributes;
    var child;
    var items;
    for (hubIndex = 0; hubIndex < hubs.length; hubIndex += 1) {
      hub = hubs[hubIndex];
      priority = recommendationHubPriority(hub.getAttribute('hubIdentifier'));
      if (!priority) { continue; }
      items = [];
      for (childIndex = 0; childIndex < hub.childNodes.length; childIndex += 1) {
        child = hub.childNodes[childIndex];
        if (!child || child.nodeType !== 1 || (child.nodeName !== 'Video' && child.nodeName !== 'Directory')) { continue; }
        attributes = attributesFromNode(child);
        if ((attributes.type !== 'movie' && attributes.type !== 'show') || !attributes.ratingKey || Number(attributes.viewCount || 0) > 0) { continue; }
        if (attributes.type === 'show' && Number(attributes.leafCount || 0) > 0 && Number(attributes.viewedLeafCount || 0) >= Number(attributes.leafCount)) { continue; }
        items.push(attributes);
      }
      if (items.length) {
        result.push({
          title: hub.getAttribute('title') || '',
          identifier: hub.getAttribute('hubIdentifier') || '',
          priority: priority,
          order: hubIndex,
          attributes: items
        });
      }
    }
    result.sort(function (left, right) {
      return left.priority === right.priority ? left.order - right.order : left.priority - right.priority;
    });
    return result;
  }

  function appendRecommendationItems(attributesList, items, seen, baseUrl, token) {
    attributesList.forEach(function (attributes) {
      var key = String(attributes.ratingKey);
      if (seen[key]) { return; }
      seen[key] = true;
      items.push(mediaFromAttributes(attributes, baseUrl, token));
    });
  }

  function recommendationItemsFromXml(xmlText, baseUrl, token) {
    var result = [];
    var seen = Object.create(null);
    recommendationHubsFromXml(xmlText).forEach(function (hub) {
      appendRecommendationItems(hub.attributes, result, seen, baseUrl, token);
    });
    return result;
  }

  function recommendationRowsFromXml(xmlText, baseUrl, token) {
    return recommendationHubsFromXml(xmlText).map(function (hub) {
      var items = [];
      appendRecommendationItems(hub.attributes, items, Object.create(null), baseUrl, token);
      return { title: hub.title, identifier: hub.identifier, priority: hub.priority, items: items };
    });
  }

  function mergeRecommendedItems(itemLists, limit) {
    var lists = (itemLists || []).map(function (items) { return items || []; });
    var positions = lists.map(function () { return 0; });
    var seen = Object.create(null);
    var result = [];
    var progressed = true;
    var index;
    var item;
    while (progressed && result.length < limit) {
      progressed = false;
      for (index = 0; index < lists.length && result.length < limit; index += 1) {
        while (positions[index] < lists[index].length) {
          item = lists[index][positions[index]];
          positions[index] += 1;
          progressed = true;
          if (!item || !item.ratingKey || seen[item.ratingKey]) { continue; }
          seen[item.ratingKey] = true;
          result.push(item);
          break;
        }
      }
    }
    return result;
  }

  return {
    homeDefinitions: homeDefinitions,
    mergeRecommendedItems: mergeRecommendedItems,
    recommendationHubPriority: recommendationHubPriority,
    recommendationItemsFromXml: recommendationItemsFromXml,
    recommendationRowsFromXml: recommendationRowsFromXml,
    sectionDefinitions: sectionDefinitions
  };
}));
