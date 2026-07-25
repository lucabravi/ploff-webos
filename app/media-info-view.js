(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PloffMediaInfoView = factory();
  }
}(this, function () {
  'use strict';

  function create(options) {
    var values = options || {};
    var documentRef = values.document;
    var state = { open: false, origin: '' };
    function node(id) { return documentRef && documentRef.getElementById ? documentRef.getElementById(id) : null; }
    function t(key) { return values.t ? values.t(key) : key; }
    function clear(target) {
      while (target && target.firstChild) { target.removeChild(target.firstChild); }
    }
    function row(label, value) {
      var element = documentRef.createElement('div');
      var labelNode = documentRef.createElement('span');
      var valueNode = documentRef.createElement('span');
      element.className = 'media-info-dialog-row';
      labelNode.className = 'media-info-dialog-label';
      valueNode.className = 'media-info-dialog-value';
      labelNode.textContent = label;
      valueNode.textContent = value;
      element.appendChild(labelNode);
      element.appendChild(valueNode);
      return element;
    }
    function render(model) {
      var content = node('media-info-dialog-content');
      var title = node('media-info-dialog-title');
      var hint = node('media-info-dialog-hint');
      (model && model.sections || []).forEach(function (section) {
        var sectionNode = documentRef.createElement('section');
        var heading = documentRef.createElement('h3');
        sectionNode.className = 'media-info-dialog-section';
        heading.textContent = section.title;
        sectionNode.appendChild(heading);
        (section.rows || []).forEach(function (entry) { sectionNode.appendChild(row(entry.label, entry.value)); });
        content.appendChild(sectionNode);
      });
      if (title) { title.textContent = t('mediaDetails.title'); }
      if (hint) { hint.textContent = t('mediaDetails.closeHint'); }
    }
    function open(model, origin) {
      var dialog = node('media-info-dialog');
      var content = node('media-info-dialog-content');
      if (!dialog || !content || !model) { return false; }
      state.open = true;
      state.origin = String(origin || '');
      clear(content);
      content.scrollTop = 0;
      render(model);
      dialog.className = 'media-info-dialog';
      return true;
    }
    function close() {
      var dialog = node('media-info-dialog');
      state.open = false;
      state.origin = '';
      if (dialog) { dialog.className = 'media-info-dialog is-hidden'; }
    }
    function scroll(direction) {
      var content = node('media-info-dialog-content');
      var amount;
      if (content) {
        amount = Math.max(150, Math.round(Number(content.clientHeight || 0) * .35));
        content.scrollTop += Number(direction || 0) * amount;
      }
    }
    function snapshot() { return { open: state.open, origin: state.origin }; }
    return { close: close, open: open, render: render, scroll: scroll, snapshot: snapshot };
  }
  return { create: create };
}));
