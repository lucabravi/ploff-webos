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
    function sectionNode(section) {
      var element = documentRef.createElement('section');
      var heading = documentRef.createElement('h3');
      element.className = 'media-info-dialog-section';
      heading.textContent = section.title;
      element.appendChild(heading);
      (section.rows || []).forEach(function (entry) { element.appendChild(row(entry.label, entry.value)); });
      return element;
    }
    function render(model) {
      var content = node('media-info-dialog-content');
      var title = node('media-info-dialog-title');
      var hint = node('media-info-dialog-hint');
      var close = node('media-info-dialog-close');
      var left = documentRef.createElement('div');
      var right = documentRef.createElement('div');
      left.className = 'media-info-dialog-column media-info-dialog-column-left';
      right.className = 'media-info-dialog-column media-info-dialog-column-right';
      (model && model.sections || []).forEach(function (section) {
        (section.column === 'right' ? right : left).appendChild(sectionNode(section));
      });
      content.appendChild(left);
      content.appendChild(right);
      if (title) { title.textContent = t('mediaDetails.title'); }
      if (hint) { hint.textContent = t('mediaDetails.closeHint'); }
      if (close) { close.textContent = t('state.back'); }
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
