(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) { module.exports = factory(); }
  else { root.PloffNetworkPolicy = factory(); }
}(this, function () {
  'use strict';

  function routeForUri(routes, uri, normalizeUri) {
    var normalizedUri = normalizeUri(uri);
    var values = Object.prototype.toString.call(routes) === '[object Array]' ? routes : [];
    var index;
    var route;
    if (!normalizedUri) { return null; }
    for (index = 0; index < values.length; index += 1) {
      route = values[index] || {};
      if (normalizeUri(route.uri) === normalizedUri) { return route; }
    }
    return null;
  }

  function allowsFailover(snapshot, routes, uri, normalizeUri, isLocalCandidate) {
    var route;
    if (!snapshot || snapshot.internetAvailable !== false) { return true; }
    route = routeForUri(routes, uri, normalizeUri);
    if (route) { return route.local === true && route.relay !== true; }
    return typeof isLocalCandidate === 'function' && isLocalCandidate(uri);
  }

  function deferCloudWork(target, allowsCloud, work, skipped) {
    return target.setTimeout(function () {
      if (allowsCloud()) { work(); }
      else if (typeof skipped === 'function') { skipped(); }
    }, 0);
  }

  return {
    allowsFailover: allowsFailover,
    deferCloudWork: deferCloudWork
  };
}));
