(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) { module.exports = factory(); }
  else { root.PloffMediaInfoDialogController = factory(); }
}(this, function () {
  'use strict';

  function create(options) {
    var values = options || {};
    var View = values.MediaInfoView;
    var documentRef = values.document;
    var view;
    var closeButton = null;
    var state = { open: false, origin: '', destroyed: false };

    function call(callback, arg1) {
      if (typeof callback === 'function') { return callback(arg1); }
      return undefined;
    }

    function snapshot() {
      return { open: state.open, origin: state.origin, destroyed: state.destroyed };
    }

    function open(model, origin) {
      if (state.destroyed || !model || !view.open(model, origin)) { return false; }
      state.open = true;
      state.origin = String(origin || '');
      return true;
    }

    function close() {
      var origin;
      if (state.destroyed || !state.open) { return false; }
      origin = state.origin;
      state.open = false;
      state.origin = '';
      view.close();
      call(values.onClosed, origin);
      return true;
    }

    function scroll(direction) {
      if (state.destroyed || !state.open) { return false; }
      view.scroll(Number(direction || 0));
      return true;
    }

    function handleKey(event, direction) {
      var code = Number(event && event.keyCode || 0);
      if (state.destroyed || !state.open) { return false; }
      if (event && event.preventDefault) { event.preventDefault(); }
      if (code === 27 || code === 461 || code === 13) { close(); }
      else if (direction === 'up' || code === 38) { scroll(-1); }
      else if (direction === 'down' || code === 40) { scroll(1); }
      return true;
    }

    function destroy() {
      if (state.destroyed) { return; }
      state.destroyed = true;
      state.open = false;
      state.origin = '';
      if (closeButton) { closeButton.onclick = null; }
      if (view && view.close) { view.close(); }
    }

    if (!View || typeof View.create !== 'function') { throw new Error('MediaInfoDialogController requires MediaInfoView'); }
    view = View.create({ document: documentRef, t: values.t });
    closeButton = documentRef && documentRef.getElementById ? documentRef.getElementById('media-info-dialog-close') : null;
    if (closeButton) { closeButton.onclick = close; }

    return {
      open: open,
      close: close,
      handleKey: handleKey,
      scroll: scroll,
      snapshot: snapshot,
      destroy: destroy
    };
  }

  return { create: create };
}));
