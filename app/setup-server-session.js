(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) { module.exports = factory(); }
  else { root.PloffSetupServerSession = factory(); }
}(this, function () {
  'use strict';

  function create(options) {
    var values = options || {};
    var generation = 0;
    var active = false;
    var servers = [];
    var found = false;

    function snapshot() {
      return { active: active, servers: servers.slice(), found: found };
    }

    function publish() {
      if (values.onChange) { values.onChange(snapshot()); }
    }

    function start(currentServers) {
      var requestGeneration;
      if (active) { return false; }
      generation += 1;
      requestGeneration = generation;
      active = true;
      servers = (currentServers || []).slice();
      found = false;
      publish();
      values.discover(function (discovered) {
        if (requestGeneration !== generation) { return; }
        active = false;
        servers = values.merge(servers, discovered || []);
        found = servers.length > 0;
        publish();
      });
      return true;
    }

    function cancel() {
      generation += 1;
      active = false;
      publish();
    }

    return { cancel: cancel, snapshot: snapshot, start: start };
  }

  return { create: create };
}));
