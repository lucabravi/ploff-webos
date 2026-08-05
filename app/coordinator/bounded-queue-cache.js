(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PloffBoundedQueueCache = factory();
  }
}(this, function () {
  'use strict';

  function create(options) {
    var values = options || {};
    var pageSize = Math.max(1, Number(values.pageSize || 40));
    var maxPages = Math.max(1, Number(values.maxPages || 5));
    var maxRecords = Math.max(1, Number(values.maxRecords || pageSize * maxPages));
    var pages = {};
    var descriptors = {};
    var residentPages = 0;
    var residentRecords = 0;
    var peakResidentPages = 0;
    var peakResidentRecords = 0;
    var accessClock = 0;
    var destroyed = false;

    function keyFor(start) {
      return String(Math.max(0, Number(start) || 0));
    }

    function descriptorRecord(start, records, metadata, loadState) {
      var source = metadata || {};
      return {
        start: Math.max(0, Number(start) || 0),
        expectedSize: pageSize,
        knownSize: Math.max(0, Number(records && records.length || 0)),
        total: Math.max(0, Number(source.total || 0)),
        terminal: source.terminal === true,
        generation: Math.max(0, Number(source.generation || 0)),
        loadState: loadState,
        signature: String(source.signature || '')
      };
    }

    function touch(page) {
      accessClock += 1;
      page.access = accessClock;
    }

    function removeResident(key, evicted) {
      var page = pages[key];
      if (!page) { return; }
      residentPages -= 1;
      residentRecords -= page.records.length;
      delete pages[key];
      if (evicted && descriptors[key]) { descriptors[key].loadState = 'evicted'; }
    }

    function leastRecentKey(excludedKey) {
      var keys = Object.keys(pages);
      var selected = '';
      var selectedAccess = Infinity;
      var index;
      var page;
      for (index = 0; index < keys.length; index += 1) {
        if (keys[index] === excludedKey) { continue; }
        page = pages[keys[index]];
        if (page.access < selectedAccess) {
          selected = keys[index];
          selectedAccess = page.access;
        }
      }
      return selected;
    }

    function makeRoom(recordCount, excludedKey) {
      var key;
      while (residentPages >= maxPages || residentRecords + recordCount > maxRecords) {
        key = leastRecentKey(excludedKey);
        if (!key) { break; }
        removeResident(key, true);
      }
    }

    function putPage(start, records, metadata) {
      var source = records || [];
      var key = keyFor(start);
      var page;
      if (destroyed) { return false; }
      if (source.length > pageSize) { throw new Error('Queue page exceeds configured page size'); }
      if (source.length > maxRecords) { throw new Error('Queue page exceeds maximum record count'); }
      removeResident(key, false);
      makeRoom(source.length, key);
      descriptors[key] = descriptorRecord(start, source, metadata, 'resident');
      page = { records: source.slice(), access: 0 };
      pages[key] = page;
      residentPages += 1;
      residentRecords += page.records.length;
      touch(page);
      peakResidentPages = Math.max(peakResidentPages, residentPages);
      peakResidentRecords = Math.max(peakResidentRecords, residentRecords);
      return true;
    }

    function getPage(start) {
      var page;
      if (destroyed) { return null; }
      page = pages[keyFor(start)];
      if (!page) { return null; }
      touch(page);
      return page.records.slice();
    }

    function descriptor(start) {
      var value = descriptors[keyFor(start)];
      /** @type {{start:number, expectedSize:number, knownSize:number, total:number, terminal:boolean, generation:number, loadState:string, signature?:string}} */
      var result;
      if (!value) { return null; }
      result = {
        start: value.start,
        expectedSize: value.expectedSize,
        knownSize: value.knownSize,
        total: value.total,
        terminal: value.terminal,
        generation: value.generation,
        loadState: value.loadState
      };
      if (value.signature) { result.signature = String(value.signature); }
      return result;
    }

    function discardFrom(start) {
      var boundary = Math.max(0, Number(start) || 0);
      var keys = Object.keys(descriptors);
      var removed = 0;
      var index;
      for (index = 0; index < keys.length; index += 1) {
        if (Number(keys[index]) < boundary) { continue; }
        removeResident(keys[index], false);
        delete descriptors[keys[index]];
        removed += 1;
      }
      return removed;
    }

    function snapshot() {
      return {
        residentPages: residentPages,
        residentRecords: residentRecords,
        peakResidentPages: peakResidentPages,
        peakResidentRecords: peakResidentRecords,
        descriptorCount: Object.keys(descriptors).length
      };
    }

    function clear() {
      pages = {};
      descriptors = {};
      residentPages = 0;
      residentRecords = 0;
      accessClock = 0;
    }

    function destroy() {
      clear();
      destroyed = true;
    }

    return {
      putPage: putPage,
      getPage: getPage,
      descriptor: descriptor,
      discardFrom: discardFrom,
      snapshot: snapshot,
      clear: clear,
      destroy: destroy
    };
  }

  return { create: create };
}));
