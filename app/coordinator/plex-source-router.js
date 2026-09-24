(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) { module.exports = factory(); }
  else { root.PloffPlexSourceRouter = factory(); }
}(this, function () {
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

  function machineIdentifier(value) {
    return String(value && (value.serverMachineIdentifier || value.machineIdentifier) || '');
  }

  function contextIdentity(context) {
    var machine = machineIdentifier(context);
    var sourceId = String(context && context.sourceId || '');
    if (machine) { return 'server:' + machine; }
    if (sourceId) { return 'source:' + sourceId; }
    return '';
  }

  function create(options) {
    var values = options || {};
    var config = values.config || {};
    var sources = values.sources || {};

    function primaryContext() {
      return typeof sources.primaryContext === 'function' ? sources.primaryContext() : null;
    }

    function sourceEnabled(machine) {
      machine = String(machine || '');
      if (!machine) { return true; }
      if (typeof sources.serverEnabled === 'function' && sources.serverEnabled(machine) === false) { return false; }
      if (typeof sources.serverAvailable === 'function' && sources.serverAvailable(machine) === false) { return false; }
      return true;
    }

    function liveContext(owner) {
      if (!owner || !sourceEnabled(owner) || typeof sources.contextForMachine !== 'function') { return null; }
      return sources.contextForMachine(owner);
    }

    function contextForItem(item, candidateContext) {
      var owner = machineIdentifier(item);
      var live = owner ? liveContext(owner) : null;
      var context = null;
      var result;
      if (owner) {
        if (!sourceEnabled(owner)) { return null; }
        if (live && machineIdentifier(live) === owner) { context = live; }
        else if (candidateContext && machineIdentifier(candidateContext) === owner && sourceEnabled(machineIdentifier(candidateContext))) { context = candidateContext; }
        else { return null; }
      } else if (candidateContext) {
        if (!sourceEnabled(machineIdentifier(candidateContext))) { return null; }
        context = candidateContext;
      } else {
        context = primaryContext();
        if (context && !sourceEnabled(machineIdentifier(context))) { return null; }
      }
      if (!context) { return null; }
      result = copy(context);
      if (item && item.sourceId) { result.sourceId = String(item.sourceId); }
      return result;
    }

    function decorateItem(item, candidateContext) {
      var result;
      if (!item || typeof item !== 'object') { return item || null; }
      result = copy(item);
      var owner = machineIdentifier(item);
      var context = null;
      var live;
      if (owner) {
        if (!sourceEnabled(owner)) { return result; }
        live = liveContext(owner);
        if (live && machineIdentifier(live) === owner) { context = live; }
        else if (candidateContext && machineIdentifier(candidateContext) === owner && sourceEnabled(machineIdentifier(candidateContext))) { context = candidateContext; }
      } else if (candidateContext) {
        if (!sourceEnabled(machineIdentifier(candidateContext))) { return result; }
        context = candidateContext;
        owner = machineIdentifier(context);
      }
      if (owner && !result.serverMachineIdentifier) { result.serverMachineIdentifier = owner; }
      if (context && (!owner || machineIdentifier(context) === owner)) {
        if (!result.sourceId && context.sourceId) { result.sourceId = String(context.sourceId); }
        if (!result.serverName && context.serverName) { result.serverName = String(context.serverName); }
      }
      return result;
    }

    function configFromContext(context) {
      var result = copy(config);
      if (!context) { return result; }
      result.apiBaseUrl = String(context.apiBaseUrl || '');
      result.token = String(context.token || '');
      if (Object.prototype.hasOwnProperty.call(context, 'requestTimeout')) { result.requestTimeout = context.requestTimeout; }
      return result;
    }

    function routeFor(item, candidateContext) {
      var owner = machineIdentifier(item);
      var explicit = !!candidateContext;
      var context = contextForItem(item, candidateContext);
      var primary;
      var requestConfig;
      if (owner && !context) { return null; }
      if (!owner && explicit && !context) { return null; }
      if (!owner && !explicit && !context && typeof sources.primaryContext === 'function') {
        primary = primaryContext();
        if (primary && !sourceEnabled(machineIdentifier(primary))) { return null; }
      }
      if (context && (owner || explicit) && !String(context.apiBaseUrl || '')) { return null; }
      requestConfig = configFromContext(context);
      if (owner && !String(requestConfig.apiBaseUrl || '')) { return null; }
      return {
        context: context ? copy(context) : null,
        config: requestConfig,
        identity: contextIdentity(context) || (owner ? 'server:' + owner : '')
      };
    }

    function configFor(item, candidateContext) {
      var route = routeFor(item, candidateContext);
      return route ? copy(route.config) : null;
    }

    function identityFor(item, candidateContext) {
      var owner = machineIdentifier(item);
      var context;
      if (owner) { return 'server:' + owner; }
      context = contextForItem(item, candidateContext);
      return contextIdentity(context);
    }

    return {
      configFor: configFor,
      decorateItem: decorateItem,
      contextForItem: contextForItem,
      contextIdentity: contextIdentity,
      identityFor: identityFor,
      routeFor: routeFor
    };
  }

  return {
    contextIdentity: contextIdentity,
    create: create
  };
}));
