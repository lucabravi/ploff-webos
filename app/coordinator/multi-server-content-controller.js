(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('../multi-server-media'), require('./plex-source-router'), require('./media-source-resolver'));
  } else {
    root.PloffMultiServerContentController = factory(root.PloffMultiServerMedia, root.PloffPlexSourceRouter, root.PloffMediaSourceResolver);
  }
}(this, function (DefaultMultiServerMedia, DefaultPlexSourceRouter, DefaultMediaSourceResolver) {
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

  function create(options) {
    var values = options || {};
    var sources = values.sources;
    var transport = values.transport;
    var MultiServerMedia = values.MultiServerMedia || DefaultMultiServerMedia;
    var config = values.config || {};
    var SourceRouter = values.PlexSourceRouter || DefaultPlexSourceRouter;
    var sourceRouter = values.sourceRouter || (SourceRouter && SourceRouter.create ? SourceRouter.create({ config: config, sources: sources }) : null);
    var sourceResolver = values.sourceResolver || DefaultMediaSourceResolver.create({ sourceRouter: sourceRouter });
    var clock = values.clock || {};
    var onHomeEnriched = values.onHomeEnriched;
    var onPrimaryHomeUnavailable = values.onPrimaryHomeUnavailable;
    var canEnrichHome = typeof values.canEnrichHome === 'function' ? values.canEnrichHome : function () { return true; };
    var destroyed = false;
    var operations = [];
    var primaryHomeEntry = null;
    var primaryHomeUnavailable = false;
    var primaryHomeDegradedNotified = false;
    var primaryHomeFallbacks = [];
    var externalHomeEntries = [];
    var homeEnrichmentOperation = null;
    var homeEnrichmentGeneration = 0;
    var homeEnrichmentPending = false;
    var homeEnrichmentComplete = true;
    var virtualSessions = {};
    var virtualSessionOrder = [];

    if (!sources || typeof sources.resolveServers !== 'function') { throw new Error('MultiServerContentController requires sources'); }
    if (!transport) { throw new Error('MultiServerContentController requires transport'); }
    if (!MultiServerMedia) { throw new Error('MultiServerContentController requires MultiServerMedia'); }
    if (!sourceRouter) { throw new Error('MultiServerContentController requires sourceRouter'); }

    function requestConfig(server) {
      var result = sourceRouter.configFor(null, server || null);
      if (!result) { throw new Error('Plex content source is unavailable'); }
      return result;
    }

    function stableQueryKey(query) {
      var value = query || {};
      var filters = value.filters || {};
      return JSON.stringify([value.sort || 'titleSort', value.direction || 'asc', value.watched || '',
        ['year', 'genre', 'actor', 'director', 'resolution', 'hdr'].map(function (key) { return filters[key] || ''; })]);
    }

    function virtualSessionKey(library, viewKey, query) {
      return String(library && library.sourceId || library && library.key || '') + '|' + String(viewKey || '') + '|' +
        stableQueryKey(query) + '|' + JSON.stringify(library && library.memberSourceIds || []);
    }

    function rememberVirtualSession(key, session) {
      var index = virtualSessionOrder.indexOf(key);
      if (index !== -1) { virtualSessionOrder.splice(index, 1); }
      virtualSessionOrder.push(key);
      virtualSessions[key] = session;
      while (virtualSessionOrder.length > 4) { delete virtualSessions[virtualSessionOrder.shift()]; }
      return session;
    }

    function virtualComparator(viewKey, query) {
      var settings = query || {};
      var direction = settings.direction === 'desc' ? -1 : 1;
      var sort = String(settings.sort || 'titleSort');
      function text(item) { return String(item && (item.titleSort || item.title) || '').toLowerCase(); }
      function number(item, key) { return Number(item && item[key] || 0) || 0; }
      return function (left, right) {
        var leftValue;
        var rightValue;
        if (viewKey === 'recent' || viewKey === 'continue') {
          leftValue = MultiServerMedia.activityTimestamp(left);
          rightValue = MultiServerMedia.activityTimestamp(right);
          if (leftValue !== rightValue) { return rightValue - leftValue; }
        } else if (sort === 'year') {
          leftValue = number(left, 'year'); rightValue = number(right, 'year');
          if (leftValue !== rightValue) { return (leftValue - rightValue) * direction; }
        } else if (sort === 'audienceRating') {
          leftValue = number(left, 'rating'); rightValue = number(right, 'rating');
          if (leftValue !== rightValue) { return (leftValue - rightValue) * direction; }
        }
        leftValue = text(left); rightValue = text(right);
        if (leftValue < rightValue) { return -1 * direction; }
        if (leftValue > rightValue) { return 1 * direction; }
        if (!!left.primarySource !== !!right.primarySource) { return left.primarySource ? -1 : 1; }
        return String(left.serverMachineIdentifier || '').localeCompare(String(right.serverMachineIdentifier || ''));
      };
    }

    function mergeVirtualItems(session, items) {
      var byIdentity = session.byIdentity || (session.byIdentity = Object.create(null));
      var changed = Object.create(null);
      var incoming;
      var retained;
      var merged;
      var left = 0;
      var right = 0;
      (items || []).forEach(function (item) {
        var identity = MultiServerMedia.globalIdentity(item);
        var existing = byIdentity[identity];
        byIdentity[identity] = !existing ? item : item.primarySource === true && existing.primarySource !== true
          ? MultiServerMedia.mergeSourceVariants(item, existing) : MultiServerMedia.mergeSourceVariants(existing, item);
        changed[identity] = true;
      });
      // Preserve delivered positions on recovery.
      merged = session.items.slice(0, session.delivered || 0).map(function (item) {
        var identity = MultiServerMedia.globalIdentity(item);
        delete changed[identity];
        return byIdentity[identity];
      });
      retained = session.items.slice(session.delivered || 0).filter(function (item) {
        return !changed[MultiServerMedia.globalIdentity(item)];
      });
      incoming = Object.keys(changed).map(function (identity) { return byIdentity[identity]; }).sort(session.compare);
      while (left < retained.length && right < incoming.length) {
        merged.push(session.compare(retained[left], incoming[right]) <= 0 ? retained[left++] : incoming[right++]);
      }
      session.items = merged.concat(retained.slice(left), incoming.slice(right));
    }

    function virtualMemberLibrary(source) {
      return {
        key: String(source && source.sectionKey || ''),
        title: String(source && source.sectionTitle || ''),
        type: String(source && source.sectionType || ''),
        sourceId: String(source && source.id || ''),
        serverMachineIdentifier: String(source && source.serverMachineIdentifier || '')
      };
    }

    function virtualSourceAvailable(source) {
      if (!source) { return false; }
      if (typeof sources.serverAvailable !== 'function') { return true; }
      return sources.serverAvailable(source.serverMachineIdentifier) !== false;
    }

    function createVirtualSession(library, viewKey, query) {
      var unavailableMember = false;
      var members = (library && library.memberSourceIds || []).map(function (sourceId) {
        var source = typeof sources.source === 'function' ? sources.source(sourceId) : null;
        if (source && !virtualSourceAvailable(source)) { unavailableMember = true; return null; }
        return source ? { sourceId: sourceId, source: source, cursor: 0, loaded: 0, hasMore: true, context: null } : null;
      }).filter(Boolean);
      return {
        items: [], members: members, compare: virtualComparator(viewKey, query), viewKey: viewKey,
        query: copy(query || {}),
        firstError: unavailableMember && !members.length ? new Error('Virtual library source unavailable') : null
      };
    }

    function loadVirtualMember(operation, session, member, size, callback) {
      var resolver = null;
      var query = copy(session.query);
      query.filters = copy(query.filters || {});
      var matches = true;
      Object.keys(query.filters).forEach(function (key) {
        var value = String(query.filters[key] || '');
        var mapping;
        if (value.indexOf('ploff-filter:') !== 0) { return; }
        try { mapping = JSON.parse(decodeURIComponent(value.slice(13))); } catch (_error) { matches = false; return; }
        if (!mapping || typeof mapping !== 'object' || !Object.prototype.hasOwnProperty.call(mapping, member.sourceId)) { matches = false; return; }
        query.filters[key] = mapping[member.sourceId];
      });
      if (!matches) { member.hasMore = false; callback(); return; }
      function load(context) {
        var memberLibrary = virtualMemberLibrary(member.source);
        var completed = false;
        var request = null;
        member.context = context;
        request = contentRequest(operation, context, function (activeServer, done) {
          return transport.loadLibraryPage(requestConfig(activeServer), memberLibrary, session.viewKey, query, member.cursor, size, done);
        }, function (error, page) {
          var decorated = [];
          completed = true;
          if (values.onLibraryStatus) { values.onLibraryStatus(member.sourceId, !!error || !page); }
          if (error || !page) {
            member.failed = true;
            session.firstError = session.firstError || error || new Error('Virtual library member unavailable');
            callback();
            return;
          }
          decorated = (page.items || []).map(function (item) {
            var result = MultiServerMedia.decorateItem(item, context, member.sourceId);
            result.__ploffAggregateIdentity = MultiServerMedia.globalIdentity(result);
            return result;
          });
          member.loaded += Math.max(0, Number(page.nextStart) - member.cursor) || (page.items || []).length;
          member.cursor = Number(page.nextStart);
          if (!isFinite(member.cursor)) { member.cursor = member.loaded; }
          member.hasMore = page.hasMore === true;
          mergeVirtualItems(session, decorated);
          callback(true);
        });
        if (!completed) { track(operation, request); }
      }
      if (member.context) { load(member.context); return; }
      if (!sources.resolveSource) { member.hasMore = false; callback(); return; }
      resolver = sources.resolveSource(member.sourceId, function (error, context) {
        if (operation.cancelled || destroyed) { return; }
        if (error || !context) {
          if (values.onLibraryStatus) { values.onLibraryStatus(member.sourceId, true); }
          member.failed = true;
          session.firstError = session.firstError || error || new Error('Virtual library source unavailable');
          callback();
          return;
        }
        load(context);
      });
      track(operation, resolver);
    }

    function loadVirtualLibraryPage(library, viewKey, query, start, size, callback, onProgress) {
      var operation = createOperation();
      var offset = Math.max(0, Number(start || 0));
      var limit = Math.max(1, Number(size || 60));
      var target = offset + limit;
      var key = virtualSessionKey(library, viewKey, query);
      var session = offset === 0 || !virtualSessions[key]
        ? rememberVirtualSession(key, createVirtualSession(library, viewKey, query)) : virtualSessions[key];
      var rawTarget = target;
      session.members.forEach(function (member) { member.failed = false; });

      function pageSnapshot() {
        var hasMore = session.members.some(function (member) { return member.hasMore && !member.failed; });
        var items = session.items.slice(offset, target);
        return {
          libraryKey: String(library && library.key || ''),
          items: items,
          totalSize: hasMore ? Math.max(session.items.length + 1, offset + items.length + 1) : session.items.length,
          nextStart: offset + items.length,
          hasMore: hasMore || session.items.length > target
        };
      }

      function publishProgress() {
        var page;
        if (offset !== 0 || typeof onProgress !== 'function' || !session.items.length || operation.cancelled || destroyed) { return; }
        page = pageSnapshot();
        if (!page.items.length) { return; }
        try { onProgress(null, page); } catch (_progressError) {}
      }

      function finish() {
        if (operation.finished || operation.cancelled) { return; }
        var page = pageSnapshot();
        session.delivered = Math.max(session.delivered || 0, offset + page.items.length);
        finishOperation(operation);
        if (!session.items.length && session.firstError) { callback(session.firstError); return; }
        callback(null, page);
      }

      function fill() {
        var pending = session.members.filter(function (member) { return member.hasMore && !member.failed && member.loaded < rawTarget; });
        var remaining = pending.length;
        if (!remaining) {
          if (session.items.length < target && session.members.some(function (member) { return member.hasMore && !member.failed; })) {
            rawTarget += limit;
            fill();
            return;
          }
          finish();
          return;
        }
        pending.forEach(function (member) {
          var requestSize = Math.max(1, Math.min(60, rawTarget - member.loaded));
          loadVirtualMember(operation, session, member, requestSize, function (loaded) {
            remaining -= 1;
            if (remaining) {
              if (loaded) { publishProgress(); }
              return;
            }
            if (!operation.cancelled && !destroyed) { fill(); }
          });
        });
      }

      if (!session.members.length) { finish(); return operation; }
      fill();
      return operation;
    }

    function virtualMemberFanOut(library, kind, invoke, callback, onProgress) {
      var operation = createOperation();
      var memberIds = (library && library.memberSourceIds || []).slice();
      var remaining = memberIds.length;
      var results = [];
      var errors = [];
      function completeMember() {
        remaining -= 1;
        if (remaining) { return; }
        var available = results.filter(Boolean);
        finishOperation(operation);
        callback(available.length ? null : errors[0], available);
      }
      if (!remaining) {
        finishOperation(operation);
        callback(null, []);
        return operation;
      }
      memberIds.forEach(function (sourceId, index) {
        var source = typeof sources.source === 'function' ? sources.source(sourceId) : null;
        var resolver;
        if (!source || !sources.resolveSource || !virtualSourceAvailable(source)) {
          errors.push(new Error('Virtual library source unavailable'));
          completeMember();
          return;
        }
        resolver = sources.resolveSource(sourceId, function (resolveError, context) {
          if (operation.cancelled || destroyed) { return; }
          if (resolveError || !context) {
            if (values.onLibraryStatus) { values.onLibraryStatus(sourceId, true, kind); }
            errors.push(resolveError || new Error('Virtual library source unavailable'));
            completeMember();
            return;
          }
          contentRequest(operation, context, function (activeServer, done) {
            return invoke(requestConfig(activeServer), virtualMemberLibrary(source), context, done);
          }, function (error, value) {
            if (values.onLibraryStatus) { values.onLibraryStatus(sourceId, !!error, kind); }
            if (error) { errors.push(error); }
            else {
              results[index] = { value: value, context: context, sourceId: sourceId };
              if (remaining > 1 && typeof onProgress === 'function') {
                try { onProgress(results.filter(Boolean)); } catch (_progressError) {}
              }
            }
            completeMember();
          });
        });
        track(operation, resolver);
      });
      return operation;
    }

    function dedupeDecoratedItems(items) {
      var session = { items: [], compare: virtualComparator('catalog') };
      mergeVirtualItems(session, items || []);
      return session.items;
    }

    function loadVirtualLibraryRecommendations(library, callback, onProgress) {
      function mergeRecommendations(entries) {
        var grouped = {};
        var order = [];
        (entries || []).forEach(function (entry) {
          (entry.value || []).forEach(function (row) {
            var key = String(row && (row.title || row.kind) || 'recommendation');
            var target;
            if (!grouped[key]) {
              grouped[key] = copy(row || {});
              grouped[key].items = [];
              order.push(key);
            }
            target = grouped[key];
            target.items = target.items.concat((row && row.items || []).map(function (item) {
              var decorated = MultiServerMedia.decorateItem(item, entry.context, entry.sourceId);
              decorated.__ploffAggregateIdentity = MultiServerMedia.globalIdentity(decorated);
              return decorated;
            }));
          });
        });
        order.forEach(function (key) { grouped[key].items = dedupeDecoratedItems(grouped[key].items); });
        return order.map(function (key) { return grouped[key]; });
      }
      return virtualMemberFanOut(library, 'recommendations', function (memberConfig, memberLibrary, _context, done) {
        return transport.loadLibraryRecommendations(memberConfig, memberLibrary, done);
      }, function (error, entries) {
        callback(error || null, mergeRecommendations(entries));
      }, function (entries) {
        var rows = mergeRecommendations(entries);
        if (rows.length && typeof onProgress === 'function') { onProgress(null, rows); }
      });
    }

    function loadVirtualLibraryFilterOptions(library, callback) {
      return virtualMemberFanOut(library, 'filters', function (memberConfig, memberLibrary, _context, done) {
        return transport.loadLibraryFilterOptions(memberConfig, memberLibrary, done);
      }, function (error, entries) {
        var result = {};
        ['year', 'genre', 'actor', 'director', 'resolution', 'hdr'].forEach(function (key) {
          var seen = Object.create(null);
          result[key] = [];
          (entries || []).forEach(function (entry) {
            (entry.value && entry.value[key] || []).forEach(function (option) {
              var identity = String(option && option.label || '').toLowerCase().replace(/^\s+|\s+$/g, '');
              if (!identity) { return; }
              if (!seen[identity]) { seen[identity] = { label: option.label, sources: {} }; }
              seen[identity].sources[entry.sourceId] = String(option.value);
            });
          });
          Object.keys(seen).forEach(function (identity) {
            result[key].push({ label: seen[identity].label, value: 'ploff-filter:' + encodeURIComponent(JSON.stringify(seen[identity].sources)) });
          });
          result[key].sort(function (left, right) { return String(left.label || '').localeCompare(String(right.label || '')); });
        });
        callback(error || null, result);
      });
    }

    function transportIdentity(server) {
      server = server || {};
      return String(server.apiBaseUrl || '') + '|' + String(server.token || '');
    }

    function contentRequest(operation, server, invoke, callback) {
      var settled = false;
      var timer = null;
      var request = null;
      var verificationRequest = null;
      var activeServer = server || null;
      var recoveryAttempted = false;
      var handle = { abort: function () {
        settled = true;
        if (timer !== null && clock.clearTimeout) { clock.clearTimeout(timer); }
        timer = null;
        if (request && request.abort) { request.abort(); }
        if (verificationRequest && verificationRequest.abort) { verificationRequest.abort(); }
        request = null;
        verificationRequest = null;
      } };

      function clearAttemptTimer() {
        if (timer !== null && clock.clearTimeout) { clock.clearTimeout(timer); }
        timer = null;
      }

      function finalize(error, result) {
        if (settled || operation.cancelled || destroyed) { return; }
        settled = true;
        clearAttemptTimer();
        callback(error, result);
      }

      function startAttempt() {
        var completed = false;
        var nextRequest = null;
        clearAttemptTimer();
        if (settled || operation.cancelled || destroyed) { return; }
        if (clock.setTimeout) {
          timer = clock.setTimeout(function () {
            var timedOutRequest = request;
            request = null;
            clearAttemptTimer();
            if (timedOutRequest && timedOutRequest.abort) { timedOutRequest.abort(); }
            var timeoutError = new Error('Plex content timeout');
            Object.defineProperty(timeoutError, 'transportFailure', { value: true, configurable: true });
            handleAttempt(timeoutError);
          }, 10000);
        }
        try {
          nextRequest = invoke(activeServer, function (error, result) {
            completed = true;
            request = null;
            clearAttemptTimer();
            handleAttempt(error, result);
          });
          if (!completed) { request = nextRequest; }
        } catch (error) {
          completed = true;
          request = null;
          clearAttemptTimer();
          handleAttempt(error);
        }
      }

      function handleAttempt(error, result) {
        var failedIdentity;
        var completed = false;
        var nextVerification = null;
        if (settled || operation.cancelled || destroyed) { return; }
        if (!error) { finalize(null, result); return; }
        if (recoveryAttempted || !activeServer) {
          finalize(error, result);
          return;
        }
        failedIdentity = transportIdentity(activeServer);
        if (activeServer.primary) {
          if (!error || error.transportFailure !== true || typeof sources.recoverPrimary !== 'function') {
            finalize(error, result);
            return;
          }
          recoveryAttempted = true;
          try {
            sources.recoverPrimary(error, function (recoverError, refreshedPrimary) {
              if (settled || operation.cancelled || destroyed) { return; }
              if (!recoverError && refreshedPrimary && transportIdentity(refreshedPrimary) !== failedIdentity) {
                activeServer = refreshedPrimary;
                startAttempt();
                return;
              }
              finalize(error, result);
            });
          } catch (_primaryRecoverError) {
            finalize(error, result);
          }
          return;
        }
        if (!sources.verifyAvailability) {
          finalize(error, result);
          return;
        }
        recoveryAttempted = true;
        try {
          nextVerification = sources.verifyAvailability(activeServer.serverMachineIdentifier, function (verifyError, refreshed) {
            completed = true;
            verificationRequest = null;
            if (settled || operation.cancelled || destroyed) { return; }
            if (!verifyError && refreshed && transportIdentity(refreshed) !== failedIdentity) {
              activeServer = refreshed;
              startAttempt();
              return;
            }
            finalize(error, result);
          });
          if (!completed) { verificationRequest = nextVerification; }
        } catch (_verifyError) {
          finalize(error, result);
        }
      }

      track(operation, handle);
      startAttempt();
      return handle;
    }

    function createOperation() {
      var operation = {
        cancelled: false,
        finished: false,
        requests: [],
        abort: function () {
          if (operation.cancelled) { return; }
          operation.cancelled = true;
          operation.requests.forEach(function (request) { if (request && request.abort) { request.abort(); } });
          operation.requests = [];
          finishOperation(operation);
        }
      };
      operations.push(operation);
      return operation;
    }

    function track(operation, request) {
      if (!request) { return request; }
      if (operation.cancelled || destroyed) {
        if (request.abort) { request.abort(); }
      } else if (!operation.finished) { operation.requests.push(request); }
      return request;
    }

    function finishOperation(operation) {
      var index = operations.indexOf(operation);
      operation.finished = true;
      operation.requests = [];
      if (index !== -1) { operations.splice(index, 1); }
    }

    function cancelHomeEnrichment() {
      homeEnrichmentGeneration += 1;
      if (homeEnrichmentOperation && homeEnrichmentOperation.abort) { homeEnrichmentOperation.abort(); }
      homeEnrichmentOperation = null;
      homeEnrichmentPending = false;
      homeEnrichmentComplete = true;
    }

    function primaryHomeFallbackGrace() {
      return Math.max(0, Number(config.discoveryTimeout || 1800) || 1800);
    }

    function clearPrimaryHomeFallback(entry) {
      var index;
      if (!entry) { return; }
      if (entry.timer !== null && entry.timer !== undefined && clock.clearTimeout) { clock.clearTimeout(entry.timer); }
      entry.timer = null;
      index = primaryHomeFallbacks.indexOf(entry);
      if (index !== -1) { primaryHomeFallbacks.splice(index, 1); }
    }

    function notifyPrimaryHomeUnavailable(error) {
      if (primaryHomeDegradedNotified) { return; }
      if (typeof onPrimaryHomeUnavailable === 'function' && onPrimaryHomeUnavailable(error || null) === false) { return; }
      primaryHomeDegradedNotified = true;
    }

    function settlePrimaryHomeFallback(entry, error) {
      var rows;
      if (!entry || entry.operation.cancelled || destroyed) { clearPrimaryHomeFallback(entry); return false; }
      rows = currentHomeRows();
      clearPrimaryHomeFallback(entry);
      finishOperation(entry.operation);
      entry.callback(rows.length ? null : (entry.error || error || new Error('No Home rows available')), rows);
      if (rows.length) { notifyPrimaryHomeUnavailable(entry.error || error || null); }
      return rows.length > 0;
    }

    function queuePrimaryHomeFallback(operation, error, callback) {
      var entry = { operation: operation, error: error, callback: callback, timer: null };
      primaryHomeFallbacks.push(entry);
      if (clock.setTimeout) {
        entry.timer = clock.setTimeout(function () { settlePrimaryHomeFallback(entry, error); }, primaryHomeFallbackGrace());
      }
      return entry;
    }

    function settlePrimaryHomeFallbacks(complete, error) {
      var pending;
      var rows;
      var settled = false;
      if (!primaryHomeFallbacks.length) { return false; }
      rows = currentHomeRows();
      if (!rows.length && !complete) { return false; }
      pending = primaryHomeFallbacks.slice();
      pending.forEach(function (entry) {
        settled = settlePrimaryHomeFallback(entry, error) || settled;
      });
      return settled;
    }

    function startHomeEnrichment() {
      var generation;
      var completed = false;
      var published = false;
      var operation;
      if (destroyed || !canEnrichHome() || typeof onHomeEnriched !== 'function') { return false; }
      homeEnrichmentPending = false;
      homeEnrichmentComplete = false;
      generation = homeEnrichmentGeneration;
      operation = refreshExternalHome(function (error, rows) {
        var fallbackSettled;
        completed = true;
        if (destroyed || generation !== homeEnrichmentGeneration) { return; }
        homeEnrichmentOperation = null;
        homeEnrichmentComplete = true;
        fallbackSettled = settlePrimaryHomeFallbacks(true, error);
        if (!error && !published && !fallbackSettled && (primaryHomeEntry || primaryHomeUnavailable)) { onHomeEnriched(rows || []); }
      }, function (rows) {
        var fallbackSettled;
        if (destroyed || generation !== homeEnrichmentGeneration) { return; }
        fallbackSettled = settlePrimaryHomeFallbacks(false, null);
        if (!primaryHomeEntry && !primaryHomeUnavailable) { return; }
        published = true;
        if (fallbackSettled) { return; }
        onHomeEnriched(rows || []);
      });
      homeEnrichmentOperation = completed ? null : operation;
      return true;
    }

    function resetSources() {
      if (destroyed) { return false; }
      cancelHomeEnrichment();
      operations.slice().forEach(function (operation) { operation.abort(); });
      operations = [];
      primaryHomeEntry = null;
      primaryHomeUnavailable = false;
      primaryHomeDegradedNotified = false;
      primaryHomeFallbacks.slice().forEach(clearPrimaryHomeFallback);
      primaryHomeFallbacks = [];
      externalHomeEntries = [];
      virtualSessions = {};
      virtualSessionOrder = [];
      return true;
    }

    function refreshHomeEnrichment() {
      if (destroyed || typeof onHomeEnriched !== 'function') { return false; }
      cancelHomeEnrichment();
      homeEnrichmentPending = true;
      if (!canEnrichHome()) { return true; }
      return startHomeEnrichment();
    }

    function retainHomeSource(server, rows) {
      externalHomeEntries = externalHomeEntries.filter(function (entry) {
        return entry.server.serverMachineIdentifier !== server.serverMachineIdentifier;
      });
      externalHomeEntries.push({ server: server, value: rows || [] });
    }

    function refreshHomeSource(machineIdentifier) {
      var id = String(machineIdentifier || '');
      var primary = sources && typeof sources.primaryContext === 'function' ? sources.primaryContext() : null;
      var primaryMachine = String(primary && primary.serverMachineIdentifier || '');
      var source = null;
      var operation;
      var cached;
      var resolveRequest = null;
      var resolved = false;
      if (destroyed || !id || id === primaryMachine || typeof onHomeEnriched !== 'function') { return false; }
      if (!canEnrichHome()) {
        homeEnrichmentPending = true;
        return true;
      }
      if (sources && typeof sources.sources === 'function') {
        (sources.sources() || []).some(function (entry) {
          if (String(entry && entry.serverMachineIdentifier || '') !== id) { return false; }
          source = entry;
          return true;
        });
      }
      if (!source || !serverAllowed({ serverMachineIdentifier: id })) { return false; }
      operation = createOperation();
      operation.homeMachineIdentifier = id;

      function finish(error, server, rows) {
        if (destroyed || operation.cancelled) { return; }
        if (!error && server && serverAvailable(server)) {
          retainHomeSource(server, rows);
          if (primaryHomeEntry || primaryHomeUnavailable) { onHomeEnriched(currentHomeRows()); }
        }
        finishOperation(operation);
      }

      function load(server) {
        contentRequest(operation, server, function (activeServer, complete) {
          return transport.loadHome(requestConfig(activeServer), complete);
        }, function (error, rows) { finish(error, server, rows); });
      }

      cached = typeof sources.contextForMachine === 'function' ? sources.contextForMachine(id) : null;
      if (cached) { load(cached); return true; }
      if (!sources.resolveSource) { finish(new Error('Plex source unavailable')); return false; }
      resolveRequest = sources.resolveSource(source.id, function (error, server) {
        resolved = true;
        if (destroyed || operation.cancelled) { return; }
        if (error || !server) { finish(error || new Error('Plex source unavailable')); return; }
        load(server);
      });
      if (!resolved) { track(operation, resolveRequest); }
      return true;
    }

    function removeHomeSource(machineIdentifier) {
      var id = String(machineIdentifier || '');
      if (destroyed || !id) { return false; }
      operations.slice().forEach(function (operation) {
        if (String(operation && operation.homeMachineIdentifier || '') === id && operation.abort) { operation.abort(); }
      });
      if (typeof onHomeEnriched === 'function' && (primaryHomeEntry || primaryHomeUnavailable)) {
        onHomeEnriched(currentHomeRows());
      }
      return true;
    }

    function resumeHomeEnrichment() {
      if (destroyed || !homeEnrichmentPending || !canEnrichHome()) { return false; }
      return startHomeEnrichment();
    }

    function beginHomeEnrichment() {
      if (destroyed || typeof onHomeEnriched !== 'function') { return false; }
      if (homeEnrichmentOperation) { return true; }
      homeEnrichmentPending = true;
      if (!canEnrichHome()) { return true; }
      return startHomeEnrichment();
    }

    function failOrPartial(errors, successes) {
      if (successes > 0 || !errors.length) { return null; }
      return errors[0] || new Error('Plex servers unavailable');
    }

    function withServers(operation, callback, useAvailable) {
      return track(operation, sources.resolveServers(function (error, servers) {
        if (destroyed || operation.cancelled) { return; }
        if (error && !(servers && servers.length)) { callback(error); return; }
        callback(null, servers || []);
      }, useAvailable === true));
    }

    function fanOut(operation, invoke, callback) {
      return withServers(operation, function (serverError, servers) {
        var remaining;
        var results;
        var errors = [];
        var successes = 0;
        if (serverError) { finishOperation(operation); callback(serverError); return; }
        servers = (servers || []).filter(serverAllowed);
        if (!servers.length) { finishOperation(operation); callback(new Error('No reachable Plex servers')); return; }
        remaining = servers.length;
        results = new Array(servers.length);
        servers.forEach(function (server, index) {
          var completed = false;
          function done(error, value) {
            if (completed || destroyed || operation.cancelled) { return; }
            completed = true;
            if (error) { errors.push(error); }
            else { successes += 1; results[index] = { server: server, value: value }; }
            remaining -= 1;
            if (remaining === 0) {
              finishOperation(operation);
              callback(failOrPartial(errors, successes), results.filter(function (entry) { return !!entry; }));
            }
          }
          contentRequest(operation, server, function (activeServer, complete) { return invoke(activeServer, complete); }, done);
        });
      });
    }

    function search(query, callback) {
      var operation = createOperation();
      fanOut(operation, function (server, done) {
        return transport.search(requestConfig(server), query, [], done);
      }, function (error, entries) {
        var aggregated;
        var batches;
        var items;
        if (operation.cancelled || destroyed) { return; }
        if (error) { callback(error); return; }
        aggregated = aggregatedSourceMap();
        batches = entries.map(function (entry) { return { server: entry.server, items: entry.value || [] }; });
        items = MultiServerMedia.mergeRanked(batches, config.searchItemLimit || 60).map(function (item) {
          return withLibraryBadge(item, aggregated[String(item.sourceId || '')] === true);
        });
        callback(null, items);
      });
      return operation;
    }

    function resolveGuid(guid, callback) {
      var operation = createOperation();
      fanOut(operation, function (server, done) {
        return transport.findByGuid(requestConfig(server), guid, done);
      }, function (error, entries) {
        var matches;
        var preferred;
        if (operation.cancelled || destroyed) { return; }
        if (error) { callback(error); return; }
        matches = entries.filter(function (entry) { return !!entry.value; }).map(function (entry) {
          return { server: entry.server, item: MultiServerMedia.decorateItem(entry.value, entry.server) };
        });
        preferred = matches.filter(function (entry) { return entry.server && entry.server.primary; })[0] || matches[0] || null;
        if (preferred) {
          matches.forEach(function (entry) {
            if (entry !== preferred) { preferred.item = MultiServerMedia.mergeSourceVariants(preferred.item, entry.item); }
          });
        }
        callback(null, preferred ? withLibraryBadge(preferred.item, sourceIsAggregated(preferred.item.sourceId)) : null);
      });
      return operation;
    }

    function aggregatedSourceMap() {
      var result = {};
      var items;
      if (!sources || typeof sources.aggregateLibraries !== 'function' || sources.aggregateLibraries() !== true ||
          typeof sources.navigationItems !== 'function') { return result; }
      items = sources.navigationItems();
      (items || []).forEach(function (item) {
        if (!item || item.virtualLibrary !== true) { return; }
        (item.memberSourceIds || []).forEach(function (sourceId) { result[String(sourceId || '')] = true; });
      });
      return result;
    }

    function sourceIsAggregated(sourceId) {
      return aggregatedSourceMap()[String(sourceId || '')] === true;
    }

    function libraryGroupName(sourceId, fallback) {
      var preferences = sources.preferenceState ? sources.preferenceState().items || [] : [];
      var index;
      for (index = 0; index < preferences.length; index += 1) {
        if (preferences[index].sourceId === sourceId && preferences[index].mergeGroup) { return preferences[index].mergeGroup; }
      }
      return sources.displayLibraryName ? sources.displayLibraryName(sourceId) : String(fallback || '');
    }

    function homeMergedSourceMap() {
      var groups = {};
      var result = {};
      if (!sources || typeof sources.aggregateHomeLibraries !== 'function' || sources.aggregateHomeLibraries() !== true ||
          typeof sources.sources !== 'function') { return result; }
      (sources.sources() || []).forEach(function (source) {
        var sourceId = String(source && source.id || '');
        var machine = String(source && source.serverMachineIdentifier || '');
        var name = libraryGroupName(sourceId, source && source.sectionTitle);
        var type = String(source && source.sectionType || '').toLowerCase();
        var key = String(name || '').toLowerCase().replace(/^\s+|\s+$/g, '').replace(/\s+/g, ' ') + '|' + type;
        if (!sourceId || !machine || !name || !serverAllowed({ serverMachineIdentifier: machine })) { return; }
        if (!groups[key]) { groups[key] = { machines: {}, sourceIds: [] }; }
        groups[key].machines[machine] = true;
        groups[key].sourceIds.push(sourceId);
      });
      Object.keys(groups).forEach(function (key) {
        var group = groups[key];
        if (Object.keys(group.machines).length < 2) { return; }
        group.sourceIds.forEach(function (sourceId) { result[sourceId] = true; });
      });
      return result;
    }

    function sourceOrder() {
      var order = {};
      var preferences = sources && typeof sources.preferenceState === 'function' ? sources.preferenceState() : null;
      if (preferences && preferences.items) {
        preferences.items.forEach(function (entry, index) { order[String(entry.sourceId || '')] = index; });
        return order;
      }
      if (!sources || typeof sources.sources !== 'function') { return order; }
      sources.sources().forEach(function (source, index) { order[String(source.id || '')] = index; });
      return order;
    }

    function withLibraryBadge(item, aggregated) {
      var result = copy(item || {});
      var sourceId = String(result.sourceId || '');
      var secondary = result.primarySource !== true && String(result.serverMachineIdentifier || '') !== String(sources && typeof sources.primaryContext === 'function' ? sources.primaryContext().serverMachineIdentifier || '' : '');
      var label = '';
      if (!sourceId) { return result; }
      if (secondary && !aggregated && sources && typeof sources.displayTitle === 'function') { label = sources.displayTitle(sourceId); }
      else if (sources && typeof sources.displayLibraryName === 'function') { label = sources.displayLibraryName(sourceId); }
      if (label) { result.libraryTitle = String(label); }
      return result;
    }

    function withServerBadge(item) {
      var result = copy(item || {});
      var secondary = result.primarySource !== true && String(result.serverMachineIdentifier || '') !== String(sources && typeof sources.primaryContext === 'function' ? sources.primaryContext().serverMachineIdentifier || '' : '');
      var label = secondary && sources && typeof sources.displayServerNameForMachine === 'function' ? sources.displayServerNameForMachine(result.serverMachineIdentifier) : '';
      result.libraryTitle = label ? String(label) : '';
      return result;
    }

    function decorateRow(row, server) {
      var result = copy(row);
      var sourceId = '';
      if (row && row.kind === 'recent' && row.sectionKey) {
        sourceId = String(server.serverMachineIdentifier || '') + '|' + String(row.sectionKey);
      }
      result.serverMachineIdentifier = String(server.serverMachineIdentifier || '');
      result.sourceId = sourceId;
      if (sourceId && sources && typeof sources.source === 'function') {
        var librarySource = sources.source(sourceId);
        if (librarySource) { result.sectionType = String(librarySource.sectionType || result.sectionType || ''); }
      }
      if (row && row.kind === 'recent') {
        var displayedTitle = sourceId && sources && typeof sources.displayTitle === 'function' ? sources.displayTitle(sourceId) : '';
        result.titleKey = 'home.recentInLibrary';
        result.titleParameters = { library: String(displayedTitle || row.sectionTitle || '') };
        result.title = result.titleKey;
      }
      result.items = (row && row.items || []).map(function (item) {
        return MultiServerMedia.decorateItem(item, server, sourceId || null);
      });
      return result;
    }

    function mergedRow(kind, entries, merge) {
      var firstRow = null;
      var batches = [];
      entries.forEach(function (entry) {
        (entry.value || []).forEach(function (row) {
          if (row && row.kind === kind && row.items && row.items.length) {
            if (!firstRow) { firstRow = row; }
            batches.push({ server: entry.server, items: row.items });
          }
        });
      });
      if (!firstRow || !batches.length) { return null; }
      firstRow = copy(firstRow);
      firstRow.items = merge(batches, config.itemLimit || 12);
      firstRow.serverMachineIdentifier = '';
      firstRow.sourceId = '';
      return firstRow.items.length ? firstRow : null;
    }

    function aggregateRecentRows(rows, order) {
      var groups = {};
      var groupOrder = [];
      var result = [];
      (rows || []).forEach(function (row) {
        var sourceId = String(row && row.sourceId || '');
        var name = libraryGroupName(sourceId, row && row.sectionTitle);
        var type = String(row && row.sectionType || '').toLowerCase();
        var key = String(name || '').toLowerCase().replace(/^\s+|\s+$/g, '').replace(/\s+/g, ' ') + '|' + type;
        if (!groups[key]) { groups[key] = []; groupOrder.push(key); }
        groups[key].push(row);
      });
      groupOrder.forEach(function (key) {
        var group = groups[key];
        var first;
        var merged;
        var batches;
        if (!group || !group.length) { return; }
        if (group.length === 1) { result.push(group[0]); return; }
        first = copy(group[0]);
        batches = group.map(function (row) {
          var machine = String(row.serverMachineIdentifier || '');
          var server = machine && sources && typeof sources.contextForMachine === 'function' ? sources.contextForMachine(machine) : null;
          server = server || { serverMachineIdentifier: machine, serverName: String(row.serverName || ''), primary: false };
          if (sources && typeof sources.primaryContext === 'function' && machine === String(sources.primaryContext().serverMachineIdentifier || '')) { server.primary = true; }
          return { server: server, sourceId: row.sourceId, items: row.items || [] };
        });
        merged = MultiServerMedia.mergeRecent(batches, config.itemLimit || 12);
        first.titleKey = 'home.recentInLibrary';
        first.titleParameters = { library: libraryGroupName(group[0].sourceId, first.sectionTitle) };
        first.title = first.titleKey;
        first.sourceId = '';
        first.serverMachineIdentifier = '';
        first.memberSourceIds = group.map(function (row) { return String(row.sourceId || ''); }).filter(Boolean);
        first.items = merged;
        if (merged.length) { result.push(first); }
      });
      result.sort(function (left, right) {
        function rank(row) {
          if (row.memberSourceIds && row.memberSourceIds.length) {
            return row.memberSourceIds.reduce(function (best, id) { return Math.min(best, Object.prototype.hasOwnProperty.call(order, id) ? order[id] : 100000); }, 100000);
          }
          return Object.prototype.hasOwnProperty.call(order, row.sourceId) ? order[row.sourceId] : 100000;
        }
        return rank(left) - rank(right);
      });
      return result;
    }

    function serverAllowed(server) {
      var machineIdentifier = String(server && server.serverMachineIdentifier || '');
      if (!machineIdentifier || !sources || typeof sources.serverEnabled !== 'function') { return true; }
      return sources.serverEnabled(machineIdentifier) !== false;
    }

    function serverAvailable(server) {
      var machineIdentifier = String(server && server.serverMachineIdentifier || '');
      if (!machineIdentifier || !sources || typeof sources.serverAvailable !== 'function') { return true; }
      return sources.serverAvailable(machineIdentifier) !== false;
    }

    function composeHome(entries) {
      var rows = [];
      var copies = Object.create(null);
      var continueRow;
      var recommendedRow;
      var recent = [];
      var order = sourceOrder();
      var mergedHomeSources = homeMergedSourceMap();
      entries = (entries || []).filter(function (entry) { return entry && serverAllowed(entry.server); });
      continueRow = mergedRow('continue', entries, MultiServerMedia.mergeContinue);
      recommendedRow = mergedRow('recommended', entries, MultiServerMedia.mergeRanked);
      entries.forEach(function (entry) {
        (entry.value || []).forEach(function (row) {
          var decorated;
          if (!row || row.kind !== 'recent' || !row.items || !row.items.length) { return; }
          decorated = decorateRow(row, entry.server);
          if (sources && typeof sources.aggregateHomeLibraries === 'function' && sources.aggregateHomeLibraries() === true &&
              decorated.sourceId && typeof sources.homeRecentEnabled === 'function' && sources.homeRecentEnabled(decorated.sourceId) === false) { return; }
          recent.push(decorated);
        });
      });
      recent.sort(function (left, right) {
        var leftRank = Object.prototype.hasOwnProperty.call(order, left.sourceId) ? order[left.sourceId] : 100000;
        var rightRank = Object.prototype.hasOwnProperty.call(order, right.sourceId) ? order[right.sourceId] : 100000;
        if (leftRank !== rightRank) { return leftRank - rightRank; }
        return String(left.title || '').localeCompare(String(right.title || ''));
      });
      if (continueRow) { rows.push(continueRow); }
      if (recommendedRow) { rows.push(recommendedRow); }
      if (sources && typeof sources.aggregateHomeLibraries === 'function' && sources.aggregateHomeLibraries() === true) {
        recent = aggregateRecentRows(recent, order);
      }
      rows = rows.concat(recent);
      rows.forEach(function (row) {
        row.items.forEach(function (item) {
          var key = MultiServerMedia.globalIdentity(item);
          copies[key] = MultiServerMedia.mergeSourceVariants(item, copies[key] || item);
        });
      });
      rows.forEach(function (row) {
        var aggregatedRecent = !!(row.memberSourceIds && row.memberSourceIds.length > 1);
        row.items = row.items.map(function (item) {
          item = MultiServerMedia.mergeSourceVariants(item, copies[MultiServerMedia.globalIdentity(item)]);
          item.unavailable = !(item.sourceVariants || [item]).some(function (variant) {
            return serverAllowed(variant) && serverAvailable(variant);
          });
          return row.showLibraryBadge || row.kind === 'continue' || row.kind === 'recommended'
            ? withLibraryBadge(item, aggregatedRecent || mergedHomeSources[item.sourceId] === true) : item;
        });
      });
      return rows;
    }

    function currentHomeRows() {
      var entries = [];
      if (primaryHomeEntry) { entries.push(primaryHomeEntry); }
      return composeHome(entries.concat(externalHomeEntries));
    }

    function recomposeHome() {
      var rows = currentHomeRows();
      if (!destroyed && (primaryHomeEntry || externalHomeEntries.length) && typeof onHomeEnriched === 'function') {
        onHomeEnriched(rows);
      }
      return rows;
    }

    function loadHome(callback) {
      var operation = createOperation();
      var primary = sources && typeof sources.primaryContext === 'function' ? sources.primaryContext() : null;
      beginHomeEnrichment();
      if (!primary || !primary.apiBaseUrl || !serverAllowed(primary)) {
        withServers(operation, function (error, servers) {
          var enabledServers = !error ? (servers || []).filter(serverAllowed) : [];
          var fallback = enabledServers.filter(function (entry) { return entry && entry.primary; })[0];
          if (!fallback) { fallback = enabledServers[0]; }
          if (operation.cancelled || destroyed) { return; }
          if (error || !fallback) { finishOperation(operation); callback(error || new Error('Primary Plex server unavailable')); return; }
          track(operation, transport.loadHome(requestConfig(fallback), function (loadError, rows) {
            if (operation.cancelled || destroyed) { return; }
            finishOperation(operation);
            if (loadError) { callback(loadError); return; }
            primaryHomeEntry = { server: fallback, value: rows || [] };
            rows = currentHomeRows();
            callback(rows.length ? null : new Error('No Home rows available'), rows);
          }));
        });
        return operation;
      }
      var activePrimary = primary;
      var primaryRecoveryAttempted = false;
      function finishPrimaryHome(error, rows) {
        var firstPrimary = !primaryHomeEntry;
        if (operation.cancelled || destroyed) { return; }
        if (error) {
          primaryHomeUnavailable = true;
          rows = currentHomeRows();
          if (rows.length) {
            finishOperation(operation);
            callback(null, rows);
            notifyPrimaryHomeUnavailable(error);
          } else if (homeEnrichmentComplete) {
            finishOperation(operation);
            callback(error);
          } else {
            queuePrimaryHomeFallback(operation, error, callback);
          }
          return;
        }
        finishOperation(operation);
        primaryHomeEntry = { server: activePrimary, value: rows || [] };
        primaryHomeUnavailable = false;
        primaryHomeDegradedNotified = false;
        rows = firstPrimary ? composeHome([primaryHomeEntry]) : currentHomeRows();
        callback(rows.length ? null : new Error('No Home rows available'), rows);
        if (firstPrimary && externalHomeEntries.length && typeof onHomeEnriched === 'function' && !destroyed) {
          onHomeEnriched(currentHomeRows());
        }
      }
      function requestPrimaryHome() {
        var completed = false;
        var request = null;
        try {
          request = transport.loadHome(requestConfig(activePrimary), function (error, rows) {
            var failedIdentity;
            completed = true;
            if (operation.cancelled || destroyed) { return; }
            if (error && error.transportFailure === true && !primaryRecoveryAttempted && typeof sources.recoverPrimary === 'function') {
              primaryRecoveryAttempted = true;
              failedIdentity = transportIdentity(activePrimary);
              sources.recoverPrimary(error, function (recoverError, refreshedPrimary) {
                if (operation.cancelled || destroyed) { return; }
                if (!recoverError && refreshedPrimary && transportIdentity(refreshedPrimary) !== failedIdentity) {
                  activePrimary = refreshedPrimary;
                  requestPrimaryHome();
                  return;
                }
                finishPrimaryHome(error, rows);
              });
              return;
            }
            finishPrimaryHome(error, rows);
          });
        } catch (error) {
          completed = true;
          finishPrimaryHome(error, null);
        }
        if (!completed) { track(operation, request); }
      }
      requestPrimaryHome();
      return operation;
    }

    function refreshExternalHome(callback, progress) {
      var operation = createOperation();
      var primary = sources && typeof sources.primaryContext === 'function' ? sources.primaryContext() : null;
      var primaryMachine = String(primary && primary.serverMachineIdentifier || '');
      var sourceEntries;
      var machineSources = {};
      var machineOrder = [];
      if (sources && typeof sources.sources === 'function' && typeof sources.resolveSource === 'function') {
        sourceEntries = sources.sources() || [];
        sourceEntries.forEach(function (source) {
          var machine = String(source && source.serverMachineIdentifier || '');
          if (!machine || machine === primaryMachine || machineSources[machine] || !serverAllowed({ serverMachineIdentifier: machine })) { return; }
          machineSources[machine] = source;
          machineOrder.push(machine);
        });
        if (!machineOrder.length) {
          externalHomeEntries = [];
          finishOperation(operation);
          callback(null, currentHomeRows());
          return operation;
        }
        (function resolveProgressively() {
          var remaining = machineOrder.length;
          var results = [];
          var errors = [];
          function completeServer(error, server, rows) {
            if (operation.cancelled || destroyed) { return; }
            if (!error && server && !serverAvailable(server)) { error = new Error('Plex source unavailable'); }
            if (error) { errors.push(error); }
            else {
              results.push({ server: server, value: rows || [] });
              retainHomeSource(server, rows);
              if (typeof progress === 'function') { progress(currentHomeRows()); }
            }
            remaining -= 1;
            if (remaining > 0) { return; }
            finishOperation(operation);
            callback(primaryHomeEntry || results.length ? null : (errors[0] || new Error('No Home rows available')), currentHomeRows());
          }
          machineOrder.forEach(function (machine) {
            var source = machineSources[machine];
            var cached = typeof sources.contextForMachine === 'function' ? sources.contextForMachine(machine) : null;
            var resolveRequest = null;
            var resolved = false;
            function load(server) {
              contentRequest(operation, server, function (activeServer, complete) {
                return transport.loadHome(requestConfig(activeServer), complete);
              }, function (error, rows) { completeServer(error, server, rows); });
            }
            if (cached) { load(cached); return; }
            resolveRequest = sources.resolveSource(source.id, function (error, server) {
              resolved = true;
              if (operation.cancelled || destroyed) { return; }
              if (error || !server) { completeServer(error || new Error('Plex source unavailable')); return; }
              load(server);
            });
            if (!resolved) { track(operation, resolveRequest); }
          });
        }());
        return operation;
      }
      withServers(operation, function (serverError, servers) {
        var secondaries;
        var remaining;
        var results = [];
        var errors = [];
        if (operation.cancelled || destroyed) { return; }
        if (serverError) {
          finishOperation(operation);
          callback(primaryHomeEntry ? null : serverError, currentHomeRows());
          return;
        }
        secondaries = (servers || []).filter(function (server) {
          var primary = sources && typeof sources.primaryContext === 'function' ? sources.primaryContext() : null;
          var activeMachine = String(primaryHomeEntry && primaryHomeEntry.server && primaryHomeEntry.server.serverMachineIdentifier ||
            primary && primary.serverMachineIdentifier || '');
          return server && serverAllowed(server) && String(server.serverMachineIdentifier || '') !== activeMachine;
        });
        if (!secondaries.length) {
          externalHomeEntries = [];
          finishOperation(operation);
          callback(null, currentHomeRows());
          return;
        }
        remaining = secondaries.length;
        secondaries.forEach(function (server) {
          var completed = false;
          function done(error, rows) {
            if (completed || operation.cancelled || destroyed) { return; }
            completed = true;
            if (!error && !serverAvailable(server)) { error = new Error('Plex source unavailable'); }
            if (error) { errors.push(error); }
            else {
              results.push({ server: server, value: rows || [] });
              retainHomeSource(server, rows);
              if (typeof progress === 'function') { progress(currentHomeRows()); }
            }
            remaining -= 1;
            if (remaining > 0) { return; }
            finishOperation(operation);
            callback(primaryHomeEntry || results.length ? null : (errors[0] || new Error('No Home rows available')), currentHomeRows());
          }
          contentRequest(operation, server, function (activeServer, complete) { return transport.loadHome(requestConfig(activeServer), complete); }, done);
        });
      }, true);
      return operation;
    }

    function fetchAllPlaylists(operation, server, done) {
      var items = [];
      var pageSize = 200;
      function next(start) {
        if (operation.cancelled || destroyed) { return; }
        track(operation, transport.loadLibraryPage(requestConfig(server), { key: 'playlists', globalPlaylists: true }, 'playlists', {}, start, pageSize, function (error, page) {
          if (error) { done(error); return; }
          (page && page.items || []).forEach(function (item) { items.push(withServerBadge(MultiServerMedia.decorateContainer(item, server))); });
          if (page && page.hasMore && Number(page.nextStart) > start) { next(Number(page.nextStart)); return; }
          done(null, items);
        }));
      }
      next(0);
    }

    function loadPlaylists(start, size, callback) {
      var operation = createOperation();
      var offset = Math.max(0, Number(start || 0));
      var limit = Math.max(1, Number(size || 60));
      fanOut(operation, function (server, done) { fetchAllPlaylists(operation, server, done); return null; }, function (error, entries) {
        var all = [];
        var pageItems;
        if (operation.cancelled || destroyed) { return; }
        if (error) { callback(error); return; }
        entries.forEach(function (entry) { all = all.concat(entry.value || []); });
        pageItems = all.slice(offset, offset + limit);
        callback(null, {
          libraryKey: 'playlists',
          items: pageItems,
          totalSize: all.length,
          nextStart: offset + pageItems.length,
          hasMore: offset + pageItems.length < all.length
        });
      });
      return operation;
    }

    function loadPlaylistItems(container, start, size, callback) {
      var machine = String(container && container.serverMachineIdentifier || '');
      var server = machine && sources.contextForMachine ? sources.contextForMachine(machine) : null;
      var operation = createOperation();
      if (!server) {
        finishOperation(operation);
        callback(new Error('Playlist source is unavailable'));
        return operation;
      }
      contentRequest(operation, server, function (activeServer, done) {
        return transport.loadLibraryContainerPage(requestConfig(activeServer), container, start, size, done);
      }, function (error, page) {
        var result;
        if (operation.cancelled || destroyed) { return; }
        finishOperation(operation);
        if (error) { callback(error); return; }
        result = copy(page || {});
        result.items = (page && page.items || []).map(function (item) {
          return withServerBadge(MultiServerMedia.decorateItem(item, server, container.sourceId || null));
        });
        callback(null, result);
      });
      return operation;
    }


    function variantContext(variant, callback) {
      var machine = String(variant && variant.serverMachineIdentifier || '');
      var sourceId = String(variant && variant.sourceId || '');
      var context = machine && sources.contextForMachine ? sources.contextForMachine(machine) : null;
      if (context) { callback(null, context); return null; }
      if (sourceId && sources.resolveSource) { return sources.resolveSource(sourceId, callback); }
      callback(new Error('Media source is unavailable'));
      return null;
    }

    function sourceVariants(item) {
      var variants = item && item.sourceVariants && item.sourceVariants.length ? item.sourceVariants.slice() : [];
      if (!variants.length && item) { variants.push(MultiServerMedia.sourceVariant(item)); }
      return variants.filter(function (variant) { return !!(variant && variant.serverMachineIdentifier && variant.ratingKey); });
    }

    function seriesSeasonNumber(item) {
      var value = item || {};
      if (value.seasonIndex !== undefined) { return value.seasonIndex; }
      if (value.seasonNumber !== undefined) { return value.seasonNumber; }
      if (value.parentIndex !== undefined) { return value.parentIndex; }
      return undefined;
    }

    function seriesEpisodeNumber(item) {
      var value = item || {};
      if (value.episodeIndex !== undefined) { return value.episodeIndex; }
      if (value.index !== undefined) { return value.index; }
      return undefined;
    }

    function seriesRecordIdentity(item, kind) {
      var value = item || {};
      var seasonNumber;
      var episodeNumber;
      if (kind === 'episode') {
        if (value.guid) { return 'guid:' + String(value.guid); }
        seasonNumber = seriesSeasonNumber(value);
        episodeNumber = seriesEpisodeNumber(value);
        if (seasonNumber !== undefined && episodeNumber !== undefined) {
          return 'episode:' + String(seasonNumber) + ':' + String(episodeNumber);
        }
        return MultiServerMedia.serverScopedIdentity(value);
      }
      return 'season:' + String(value.seasonNumber !== undefined ? value.seasonNumber : value.index || value.title || '0');
    }

    function mergeSeriesRecords(records, kind) {
      var byIdentity = {};
      var result = [];
      (records || []).forEach(function (item) {
        var identity = seriesRecordIdentity(item, kind);
        var index = byIdentity[identity];
        if (index === undefined) {
          byIdentity[identity] = result.length;
          result.push(item);
          return;
        }
        if (item.primarySource === true && result[index].primarySource !== true) {
          result[index] = MultiServerMedia.mergeSourceVariants(item, result[index]);
        } else {
          result[index] = MultiServerMedia.mergeSourceVariants(result[index], item);
        }
      });
      result.sort(function (left, right) {
        var leftValue = kind === 'episode' ? Number(left.episodeIndex !== undefined ? left.episodeIndex : left.index || 0) : Number(left.seasonNumber !== undefined ? left.seasonNumber : left.index || 0);
        var rightValue = kind === 'episode' ? Number(right.episodeIndex !== undefined ? right.episodeIndex : right.index || 0) : Number(right.seasonNumber !== undefined ? right.seasonNumber : right.index || 0);
        if (leftValue !== rightValue) { return leftValue - rightValue; }
        return String(left.title || '').localeCompare(String(right.title || ''));
      });
      return result;
    }

    function fanOutVariants(operation, variants, invoke, callback, onProgress) {
      var remaining = variants.length;
      var records = [];
      var firstError = null;
      if (!remaining) { finishOperation(operation); callback(new Error('Media source variants are unavailable'), []); return; }
      variants.forEach(function (variant) {
        var resolver = variantContext(variant, function (resolveError, context) {
          var request;
          var completed = false;
          if (operation.cancelled || destroyed) { return; }
          if (resolveError || !context) {
            firstError = firstError || resolveError || new Error('Media source is unavailable');
            remaining -= 1;
            if (!remaining) { finishOperation(operation); callback(records.length ? null : firstError, records); }
            return;
          }
          request = contentRequest(operation, context, function (activeServer, done) {
            return invoke(variant, activeServer, done);
          }, function (error, value) {
            var succeeded = !error;
            completed = true;
            if (error) { firstError = firstError || error; }
            else { records.push({ variant: variant, context: context, value: value }); }
            remaining -= 1;
            if (succeeded && remaining && onProgress) { onProgress(records.slice()); }
            if (!remaining) { finishOperation(operation); callback(records.length ? null : firstError, records); }
          });
          if (!completed) { track(operation, request); }
        });
        track(operation, resolver);
      });
    }

    function mergedSeriesContext(entries, variants, sourcePreferenceGuid) {
      var seasons = [];
      var episodes = [];
      (entries || []).forEach(function (entry) {
        var sourceId = String(entry.variant && entry.variant.sourceId || '');
        seasons = seasons.concat((entry.value && entry.value.seasons || []).map(function (season) {
          var decorated = MultiServerMedia.decorateItem(season, entry.context, sourceId);
          if (sourcePreferenceGuid) { decorated.sourcePreferenceGuid = sourcePreferenceGuid; }
          return decorated;
        }));
        episodes = episodes.concat((entry.value && entry.value.episodes || []).map(function (episode) {
          var decorated = MultiServerMedia.decorateItem(episode, entry.context, sourceId);
          if (sourcePreferenceGuid) { decorated.sourcePreferenceGuid = sourcePreferenceGuid; }
          return decorated;
        }));
      });
      seasons = mergeSeriesRecords(seasons, 'season');
      episodes = mergeSeriesRecords(episodes, 'episode');
      if (seasons.length && episodes.length) {
        seasons.forEach(function (season) {
          var seasonNumber = Number(season.seasonNumber !== undefined ? season.seasonNumber : season.index || 0);
          var count = episodes.filter(function (episode) {
            return Number(episode.seasonIndex !== undefined ? episode.seasonIndex : episode.parentIndex || 0) === seasonNumber;
          }).length;
          if (count) { season.leafCount = Math.max(Number(season.leafCount || 0), count); }
        });
      }
      return { seasons: seasons, episodes: episodes, multiServer: variants.length > 1 };
    }

    function loadMergedSeriesContext(item, callback, onProgress) {
      var operation = createOperation();
      var variants = sourceVariants(item);
      var sourcePreferenceGuid = String(item && (item.sourcePreferenceGuid || item.guid) || '');
      if (!transport.loadSeriesContext) {
        finishOperation(operation);
        callback(new Error('Series context transport is unavailable'));
        return operation;
      }
      fanOutVariants(operation, variants, function (variant, activeServer, done) {
        return transport.loadSeriesContext(requestConfig(activeServer), {
          type: 'show', ratingKey: String(variant.ratingKey || ''), guid: String(variant.guid || item && item.guid || '')
        }, done);
      }, function (error, entries) {
        callback(error || null, mergedSeriesContext(entries, variants, sourcePreferenceGuid));
      }, function (entries) {
        if (onProgress) { onProgress(mergedSeriesContext(entries, variants, sourcePreferenceGuid)); }
      });
      return operation;
    }

    function loadMergedSeasonEpisodes(season, callback) {
      var operation = createOperation();
      var variants = sourceVariants(season);
      var sourcePreferenceGuid = String(season && (season.sourcePreferenceGuid || season.guid) || '');
      if (!transport.loadSeasonEpisodes) {
        finishOperation(operation);
        callback(new Error('Season episodes transport is unavailable'));
        return operation;
      }
      fanOutVariants(operation, variants, function (variant, activeServer, done) {
        return transport.loadSeasonEpisodes(requestConfig(activeServer), String(variant.ratingKey || ''), '', done);
      }, function (error, entries) {
        var episodes = [];
        (entries || []).forEach(function (entry) {
          var sourceId = String(entry.variant && entry.variant.sourceId || '');
          episodes = episodes.concat((entry.value || []).map(function (episode) {
            var decorated = MultiServerMedia.decorateItem(episode, entry.context, sourceId);
            if (sourcePreferenceGuid) { decorated.sourcePreferenceGuid = sourcePreferenceGuid; }
            return decorated;
          }));
        });
        callback(error || null, mergeSeriesRecords(episodes, 'episode'));
      });
      return operation;
    }

    function loadMetadata(item, callback, sourceContext) {
      var target = sourceResolver.resolve(item, { candidateContext: sourceContext || null });
      var context = target && target.route && target.route.context || null;
      var requestConfigValue = target && target.route && target.route.config || null;
      var operation = createOperation();
      var ratingKey = String(target && target.item && target.item.ratingKey || '');
      if (!context || !requestConfigValue || !ratingKey || !transport.loadMetadata) {
        finishOperation(operation);
        callback(new Error('Metadata source is unavailable'));
        return operation;
      }
      contentRequest(operation, context, function (activeServer, done) { return transport.loadMetadata(requestConfig(activeServer), ratingKey, done); }, function (error, detail) {
        if (operation.cancelled || destroyed) { return; }
        finishOperation(operation);
        callback(error || null, error || !detail ? null : sourceRouter.decorateItem(detail, context));
      });
      return operation;
    }

    function contextForItem(item, sourceContext) {
      return sourceRouter.contextForItem(item, sourceContext || null);
    }

    function destroy() {
      resetSources();
      destroyed = true;
    }

    return {
      contextForItem: contextForItem,
      destroy: destroy,
      loadHome: loadHome,
      loadVirtualLibraryPage: loadVirtualLibraryPage,
      loadVirtualLibraryRecommendations: loadVirtualLibraryRecommendations,
      loadVirtualLibraryFilterOptions: loadVirtualLibraryFilterOptions,
      loadMetadata: loadMetadata,
      loadMergedSeriesContext: loadMergedSeriesContext,
      loadMergedSeasonEpisodes: loadMergedSeasonEpisodes,
      refreshExternalHome: refreshExternalHome,
      resetSources: resetSources,
      refreshHomeEnrichment: refreshHomeEnrichment,
      refreshHomeSource: refreshHomeSource,
      recomposeHome: recomposeHome,
      removeHomeSource: removeHomeSource,
      resumeHomeEnrichment: resumeHomeEnrichment,
      loadPlaylistItems: loadPlaylistItems,
      loadPlaylists: loadPlaylists,
      resolveGuid: resolveGuid,
      search: search
    };
  }

  return { create: create };
}));
