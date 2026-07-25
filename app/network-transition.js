(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) { module.exports = factory(); }
  else { root.PloffNetworkTransition = factory(); }
}(this, function () {
  'use strict';

  function create(initialSnapshot, resumeRemoteConnectionVerification) {
    var previous = initialSnapshot || {};

    function update(snapshot, activeServer) {
      var current = snapshot || {};
      var cloudRecovered = previous.internetAvailable === false && current.internetAvailable !== false;
      var result = {
        cloudRecovered: cloudRecovered,
        localWasAvailable: previous.lanAvailable !== false
      };
      previous = current;
      if (cloudRecovered && activeServer && typeof resumeRemoteConnectionVerification === 'function') {
        resumeRemoteConnectionVerification(activeServer);
      }
      return result;
    }

    return { update: update };
  }

  return { create: create };
}));
