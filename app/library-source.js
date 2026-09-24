(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) { module.exports = factory(); }
  else { root.PloffLibrarySource = factory(); }
}(this, function () {
  'use strict';

  function text(value) { return String(value === undefined || value === null ? '' : value); }
  function normalizeTitle(value) { return text(value).replace(/^\s+|\s+$/g, ''); }
  function sourceId(machineIdentifier, sectionKey) {
    return text(machineIdentifier) + '|' + text(sectionKey);
  }
  function defaultIcon(source) {
    var title = normalizeTitle(source && (source.sectionTitle || source.title)).toLowerCase();
    var type = text(source && (source.sectionType || source.type)).toLowerCase();
    if (/anime|manga/.test(title)) { return 'anime'; }
    if (/documentar|documentary|docu/.test(title)) { return 'documentary'; }
    if (/kids|bambin|children|family/.test(title)) { return 'kids'; }
    if (/music|musica|concert/.test(title)) { return 'music'; }
    if (type === 'show') { return 'tv'; }
    if (type === 'movie') { return 'movie'; }
    return 'folder';
  }
  function fromSection(server, section, primaryMachineIdentifier) {
    var serverValue = server || {};
    var sectionValue = section || {};
    var machineIdentifier = text(serverValue.machineIdentifier);
    var sectionKey = text(sectionValue.key);
    var sectionTitle = normalizeTitle(sectionValue.title);
    var serverName = normalizeTitle(serverValue.name || serverValue.title) || 'Plex';
    var primary = !!machineIdentifier && machineIdentifier === text(primaryMachineIdentifier);
    var record = {
      id: sourceId(machineIdentifier, sectionKey),
      serverMachineIdentifier: machineIdentifier,
      serverName: serverName,
      primary: primary,
      owned: serverValue.owned !== false,
      sectionKey: sectionKey,
      sectionTitle: sectionTitle,
      sectionType: text(sectionValue.type),
      defaultTitle: primary ? sectionTitle : (sectionTitle + ' \u00b7 ' + serverName)
    };
    record.defaultIcon = defaultIcon(record);
    return record;
  }
  function mediaIdentity(machineIdentifier, ratingKey) {
    return text(machineIdentifier) + '|rating:' + text(ratingKey);
  }

  return {
    defaultIcon: defaultIcon,
    fromSection: fromSection,
    mediaIdentity: mediaIdentity,
    sourceId: sourceId
  };
}));
