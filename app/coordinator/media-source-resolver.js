(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) { module.exports = factory(require('../multi-server-media')); }
  else { root.PloffMediaSourceResolver = factory(root.PloffMultiServerMedia); }
}(this, function (MultiServerMedia) {
  'use strict';

  function machineIdentifier(value) {
    return String(value && (value.serverMachineIdentifier || value.machineIdentifier) || '');
  }

  function validVariant(variant) {
    return !!(variant && variant.serverMachineIdentifier && variant.ratingKey);
  }

  function create(options) {
    var sourceRouter = options && options.sourceRouter;
    if (!sourceRouter || typeof sourceRouter.routeFor !== 'function') {
      throw new Error('MediaSourceResolver requires sourceRouter');
    }

    // One traversal for first-match resolution and enumeration. Routing remains
    // live and concrete; this owner never discovers, caches or persists sources.
    function visit(item, options, accept) {
      var values = options || {};
      var context = values.candidateContext || null;
      var preferred = String(values.preferredMachine || '');
      var variants = null;
      var seen = Object.create(null);
      var preferredVariant;
      var affinityVariant;
      var index;
      if (!item || typeof item !== 'object') { return; }

      function sourceVariants() {
        if (variants === null) { variants = Array.isArray(item.sourceVariants) ? item.sourceVariants : []; }
        return variants;
      }

      function variantForMachine(machine) {
        var candidates = sourceVariants();
        var position;
        if (!machine) { return null; }
        for (position = 0; position < candidates.length; position += 1) {
          if (validVariant(candidates[position]) && machineIdentifier(candidates[position]) === machine) {
            return candidates[position];
          }
        }
        return null;
      }

      function attempt(candidate, fallback, project) {
        var key;
        var route;
        if (project && !validVariant(candidate)) { return false; }
        key = machineIdentifier(candidate) + '|' + String(candidate.ratingKey || '');
        if (seen[key]) { return false; }
        seen[key] = true;
        if (project) {
          candidate = MultiServerMedia.selectSourceVariant(item, machineIdentifier(candidate), candidate.ratingKey);
        }
        route = sourceRouter.routeFor(candidate, context);
        return !!route && accept({ item: candidate, route: route, fallback: fallback }) === true;
      }

      // A saved preference is intent only when this item actually represents it.
      if (preferred && preferred !== machineIdentifier(item)) {
        preferredVariant = variantForMachine(preferred);
        if (preferredVariant && attempt(preferredVariant, false, true)) { return; }
      }
      // The common path does not even enumerate variants or project an item.
      if (attempt(item, !!preferredVariant, false)) { return; }
      // Session affinity is a fallback tie-breaker, never an owner override.
      affinityVariant = context ? variantForMachine(machineIdentifier(context)) : null;
      if (affinityVariant && attempt(affinityVariant, true, true)) { return; }
      variants = sourceVariants();
      for (index = 0; index < variants.length; index += 1) {
        if (attempt(variants[index], true, true)) { return; }
      }
    }

    function resolve(item, options) {
      var result = null;
      visit(item, options, function (resolved) { result = resolved; return true; });
      return result;
    }

    function available(item, options) {
      var result = [];
      visit(item, options, function (resolved) { result.push(resolved); return false; });
      return result;
    }

    return { resolve: resolve, available: available };
  }

  return { create: create };
}));
