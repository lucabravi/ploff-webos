(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) { module.exports = factory(); }
  else { root.PloffInputTargetRouter = factory(); }
}(this, function () {
  'use strict';

  function resolve(snapshot) {
    snapshot = snapshot || {};
    if (snapshot.choiceDialogOpen) { return 'choice-dialog'; }
    if (snapshot.upNextLayoutOpen) { return 'up-next-layout'; }
    if (snapshot.privacyDialogOpen) { return 'privacy'; }
    if (snapshot.appView === 'setup') { return 'setup'; }
    if (snapshot.appView === 'diagnostics') { return 'diagnostics'; }
    if (snapshot.navReorderActive) { return 'navigation-reorder'; }
    return snapshot.appView || 'home';
  }

  return { resolve: resolve };
}));
