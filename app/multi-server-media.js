(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) { module.exports = factory(require('./library-source')); }
  else { root.PloffMultiServerMedia = factory(root.PloffLibrarySource); }
}(this, function (LibrarySource) {
  'use strict';

  function copy(source) {
    var result = {};
    var key;
    source = source || {};
    for (key in source) {
      if (Object.prototype.hasOwnProperty.call(source, key)) { result[key] = source[key]; }
    }
    return result;
  }

  function machineIdentifier(server) {
    return String(server && (server.serverMachineIdentifier || server.machineIdentifier) || '');
  }

  function sourceId(machine, item) {
    var sectionId = String(item && (item.librarySectionID || item.sectionKey) || '');
    if (!machine || !sectionId || !LibrarySource || typeof LibrarySource.sourceId !== 'function') { return ''; }
    return LibrarySource.sourceId(machine, sectionId);
  }

  function decorateItem(item, server, explicitSourceId) {
    var result = copy(item);
    var machine = machineIdentifier(server);
    result.serverMachineIdentifier = machine;
    result.sourceId = String(explicitSourceId || sourceId(machine, result) || '');
    if (server && server.serverName) { result.serverName = String(server.serverName); }
    else if (server && server.name) { result.serverName = String(server.name); }
    if (server && server.primary === true) { result.primarySource = true; }
    return result;
  }

  function decorateContainer(item, server, explicitSourceId) { return decorateItem(item, server, explicitSourceId); }

  function serverScopedIdentity(item) {
    var value = item || {};
    var machine = String(value.serverMachineIdentifier || '');
    if (value.ratingKey) { return machine + '|rating:' + String(value.ratingKey); }
    if (value.key) { return machine + '|key:' + String(value.key); }
    return machine + '|title:' + String(value.title || '');
  }

  function globalIdentity(item) {
    var value = item || {};
    if (value.guid) { return 'guid:' + String(value.guid); }
    return serverScopedIdentity(value);
  }

  function sourceVariant(item) {
    var value = item || {};
    return {
      serverMachineIdentifier: String(value.serverMachineIdentifier || ''),
      serverName: String(value.serverName || ''),
      sourceId: String(value.sourceId || ''),
      ratingKey: String(value.ratingKey || ''),
      guid: String(value.guid || ''),
      librarySectionID: String(value.librarySectionID || ''),
      image: String(value.image || ''),
      art: String(value.art || ''),
      thumb: String(value.thumb || ''),
      mediaProfile: value.mediaProfile || null,
      primarySource: value.primarySource === true
    };
  }

  function variantIdentity(variant) {
    var value = variant || {};
    return String(value.serverMachineIdentifier || '') + '|' + String(value.ratingKey || value.sourceId || '');
  }

  function mergeSourceVariants(primaryItem, secondaryItem) {
    var result = copy(primaryItem);
    var variants = [];
    var seen = {};
    function addVariant(value) {
      var variant = sourceVariant(value);
      var key = variantIdentity(variant);
      if (!key || seen[key]) { return; }
      seen[key] = true;
      variants.push(variant);
    }
    (primaryItem && primaryItem.sourceVariants || []).forEach(addVariant);
    if (!variants.length) { addVariant(primaryItem); }
    (secondaryItem && secondaryItem.sourceVariants || []).forEach(addVariant);
    if (!(secondaryItem && secondaryItem.sourceVariants && secondaryItem.sourceVariants.length)) { addVariant(secondaryItem); }
    if (variants.length > 1) { result.sourceVariants = variants; }
    return result;
  }


  function selectSourceVariant(item, machineIdentifier, ratingKey) {
    var source = item || {};
    var machine = String(machineIdentifier || '');
    var variants = source.sourceVariants || [];
    var selected = null;
    var result;
    var index;
    if (!machine || !variants.length) { return copy(source); }
    for (index = 0; index < variants.length; index += 1) {
      if (String(variants[index] && variants[index].serverMachineIdentifier || '') === machine &&
          (ratingKey === undefined || String(variants[index].ratingKey || '') === String(ratingKey))) {
        selected = variants[index];
        break;
      }
    }
    if (!selected) { return copy(source); }
    result = copy(source);
    // Missing fields belong to this copy too: never keep another PMS's paths
    // or library identity when projecting a sparse variant.
    result.serverMachineIdentifier = String(selected.serverMachineIdentifier || '');
    result.serverName = String(selected.serverName || '');
    result.sourceId = String(selected.sourceId || '');
    result.ratingKey = String(selected.ratingKey || '');
    result.librarySectionID = String(selected.librarySectionID || '');
    result.image = String(selected.image || '');
    result.art = String(selected.art || '');
    result.thumb = String(selected.thumb || '');
    if (selected.mediaProfile) { result.mediaProfile = selected.mediaProfile; }
    else { delete result.mediaProfile; }
    if (selected.primarySource === true) { result.primarySource = true; }
    else { delete result.primarySource; }
    result.sourceVariants = variants.map(copy);
    return result;
  }

  function preferredCanonical(existing, candidate) {
    if (!existing) { return copy(candidate); }
    if (candidate && candidate.primarySource === true && existing.primarySource !== true) {
      return mergeSourceVariants(candidate, existing);
    }
    return mergeSourceVariants(existing, candidate);
  }

  function mergeRecent(batches, limit) {
    var byIdentity = Object.create(null);
    var rows = [];
    (batches || []).forEach(function (batch) {
      (batch.items || []).forEach(function (rawItem) {
        var item = decorateItem(rawItem, batch.server || {}, batch.sourceId || null);
        var key = globalIdentity(item);
        var timestamp = activityTimestamp(item);
        var existing = byIdentity[key];
        if (!existing) { byIdentity[key] = { item: item, timestamp: timestamp }; }
        else {
          existing.timestamp = Math.max(existing.timestamp, timestamp);
          existing.item = preferredCanonical(existing.item, item);
        }
      });
    });
    Object.keys(byIdentity).forEach(function (key) { rows.push(byIdentity[key]); });
    rows.sort(function (left, right) {
      if (right.timestamp !== left.timestamp) { return right.timestamp - left.timestamp; }
      if (left.item.primarySource !== right.item.primarySource) { return left.item.primarySource ? -1 : 1; }
      return String(left.item.title || '').localeCompare(String(right.item.title || ''));
    });
    limit = Math.max(0, Number(limit || 0)) || 12;
    return rows.slice(0, limit).map(function (entry) { return entry.item; });
  }

  function activityTimestamp(item) {
    var value = item || {};
    return Math.max(0, Number(value.lastViewedAt || value.updatedAt || value.addedAt || 0) || 0);
  }

  function mergeRanked(batches, limit) {
    var source = batches || [];
    var positions = source.map(function () { return 0; });
    var seen = Object.create(null);
    var result = [];
    var progressed = true;
    var index;
    var item;
    var key;
    limit = Math.max(0, Number(limit || 0)) || 60;
    while (progressed) {
      progressed = false;
      for (index = 0; index < source.length; index += 1) {
        while (positions[index] < (source[index].items || []).length) {
          item = decorateItem(source[index].items[positions[index]], source[index].server || {});
          positions[index] += 1;
          progressed = true;
          key = globalIdentity(item);
          if (Object.prototype.hasOwnProperty.call(seen, key)) {
            result[seen[key]] = preferredCanonical(result[seen[key]], item);
            continue;
          }
          seen[key] = result.length;
          result.push(item);
          break;
        }
      }
    }
    return result.slice(0, limit);
  }

  function mergeContinue(batches, limit) {
    var source = batches || [];
    var byIdentity = Object.create(null);
    var rows = [];
    var serial = 0;
    source.forEach(function (batch, serverIndex) {
      (batch.items || []).forEach(function (rawItem, itemIndex) {
        var item = decorateItem(rawItem, batch.server || {});
        var key = globalIdentity(item);
        var existing = byIdentity[key];
        var timestamp = activityTimestamp(item);
        var entry = {
          item: item,
          timestamp: timestamp,
          primary: !!(batch.server && batch.server.primary),
          order: serial + serverIndex * 100000 + itemIndex
        };
        serial += 1;
        if (!existing) {
          byIdentity[key] = entry;
        } else if (timestamp > existing.timestamp || (timestamp === existing.timestamp && entry.primary && !existing.primary)) {
          entry.item = mergeSourceVariants(entry.item, existing.item);
          byIdentity[key] = entry;
        } else {
          existing.item = mergeSourceVariants(existing.item, entry.item);
        }
      });
    });
    Object.keys(byIdentity).forEach(function (key) { rows.push(byIdentity[key]); });
    rows.sort(function (left, right) {
      if (right.timestamp !== left.timestamp) { return right.timestamp - left.timestamp; }
      if (left.primary !== right.primary) { return left.primary ? -1 : 1; }
      return left.order - right.order;
    });
    limit = Math.max(0, Number(limit || 0)) || 12;
    return rows.slice(0, limit).map(function (entry) { return entry.item; });
  }

  return {
    activityTimestamp: activityTimestamp,
    decorateContainer: decorateContainer,
    decorateItem: decorateItem,
    globalIdentity: globalIdentity,
    mergeContinue: mergeContinue,
    mergeRecent: mergeRecent,
    mergeSourceVariants: mergeSourceVariants,
    sourceVariant: sourceVariant,
    selectSourceVariant: selectSourceVariant,
    mergeRanked: mergeRanked,
    serverScopedIdentity: serverScopedIdentity,
    sourceId: sourceId
  };
}));
