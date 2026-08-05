(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) { module.exports = factory(); }
  else {
    root.PloffApplicationBootstrap = factory();
    root.PloffApplication = root.PloffApplicationBootstrap.start(root, root.document);
  }
}(this, function () {
  'use strict';

  function call(callback, arg1, arg2) {
    if (typeof callback === 'function') { return callback(arg1, arg2); }
    return undefined;
  }

  function start(root, document, options) {
    var values = options || {};
    var application = null;
    var destroyed = false;
    var events = null;
    var create = values.createApplication || (root && root.PloffApplicationController && root.PloffApplicationController.create);

    function instance() { return application; }

    function destroy() {
      if (destroyed) { return; }
      destroyed = true;
      if (application && typeof application.destroy === 'function') { application.destroy(); }
      application = null;
      if (events) { events.destroy(); events = null; }
    }

    if (root && root.PloffApplicationEvents && root.PloffApplicationEvents.bind) {
      events = root.PloffApplicationEvents.bind([{ target: root, name: 'unload', handler: destroy }]);
    }
    if (!root || !document || !root.PloffCredentialVault || typeof root.PloffCredentialVault.prepare !== 'function') {
      call(values.onError, new Error('Application dependencies are unavailable'));
      return { destroy: destroy, instance: instance };
    }
    if (typeof create !== 'function') {
      call(values.onError, new Error('Application controller is unavailable'));
      return { destroy: destroy, instance: instance };
    }
    root.PloffCredentialVault.prepare(root, root.localStorage, function (credentialStorage) {
      if (destroyed || application) { return; }
      try { application = create(root, document, credentialStorage); }
      catch (error) { call(values.onError, error); return; }
      call(values.onReady, application);
    });
    return { destroy: destroy, instance: instance };
  }

  return { start: start };
}));
