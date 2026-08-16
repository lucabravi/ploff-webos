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
    var state = { open: false, origin: '', mode: 'info' };
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
    function renderColumns(model, resetScroll) {
      var content = node('media-info-dialog-content');
      var left;
      var right;
      if (!content) { return false; }
      clear(content);
      if (resetScroll) { content.scrollTop = 0; }
      left = documentRef.createElement('div');
      right = documentRef.createElement('div');
      left.className = 'media-info-dialog-column media-info-dialog-column-left';
      right.className = 'media-info-dialog-column media-info-dialog-column-right';
      (model && model.sections || []).forEach(function (section) {
        (section.column === 'right' ? right : left).appendChild(sectionNode(section));
      });
      content.appendChild(left);
      content.appendChild(right);
      return true;
    }
    function hiddenClass(base, hidden) { return base + (hidden ? ' is-hidden' : ''); }
    function focusVersion(zone, showApply) {
      var selector = node('media-info-dialog-version-value');
      var content = node('media-info-dialog-content');
      var close = node('media-info-dialog-close');
      var apply = node('media-info-dialog-apply');
      if (selector) { selector.className = 'media-info-dialog-version-value' + (zone === 'selector' ? ' is-focused' : ''); }
      if (content) { content.className = 'media-info-dialog-content' + (zone === 'content' ? ' is-focused' : ''); }
      if (close) { close.className = 'media-info-dialog-close' + (zone === 'cancel' ? ' is-focused' : ''); }
      if (apply) { apply.className = hiddenClass('media-info-dialog-apply' + (zone === 'apply' ? ' is-focused' : ''), !showApply); }
      if (zone === 'selector' && selector && selector.focus) { selector.focus(); }
      else if (zone === 'content' && content && content.focus) { content.focus(); }
      else if (zone === 'cancel' && close && close.focus) { close.focus(); }
      else if (zone === 'apply' && showApply && apply && apply.focus) { apply.focus(); }
      return zone;
    }
    function render(model) {
      var title = node('media-info-dialog-title');
      var hint = node('media-info-dialog-hint');
      var close = node('media-info-dialog-close');
      var browser = node('media-info-dialog-version-browser');
      var apply = node('media-info-dialog-apply');
      renderColumns(model, false);
      if (title) { title.textContent = t('mediaDetails.title'); }
      if (hint) { hint.textContent = t('mediaDetails.closeHint'); }
      if (close) { close.textContent = t('common.close'); close.className = 'media-info-dialog-close'; }
      if (browser) { browser.className = 'media-info-dialog-version-browser is-hidden'; }
      if (apply) { apply.className = 'media-info-dialog-apply is-hidden'; }
    }
    function renderVersions(frame, resetScroll) {
      var data = frame || {};
      var title = node('media-info-dialog-title');
      var hint = node('media-info-dialog-hint');
      var browser = node('media-info-dialog-version-browser');
      var previous = node('media-info-dialog-version-prev');
      var selector = node('media-info-dialog-version-value');
      var next = node('media-info-dialog-version-next');
      var count = node('media-info-dialog-version-count');
      var status = node('media-info-dialog-version-state');
      var close = node('media-info-dialog-close');
      var apply = node('media-info-dialog-apply');
      if (!data.model || !renderColumns(data.model, resetScroll)) { return false; }
      if (title) { title.textContent = t('mediaDetails.versionTitle'); }
      if (hint) { hint.textContent = t('mediaDetails.versionHint'); }
      if (browser) { browser.className = 'media-info-dialog-version-browser'; }
      if (previous) { previous.className = hiddenClass('media-info-dialog-version-arrow', !data.canCycle); }
      if (selector) { selector.textContent = String(data.label || ''); }
      if (next) { next.className = hiddenClass('media-info-dialog-version-arrow', !data.canCycle); }
      if (count) { count.textContent = String(Number(data.index || 0) + 1) + ' / ' + String(Math.max(1, Number(data.count || 0))); }
      if (status) { status.textContent = t(data.active ? 'mediaDetails.active' : 'mediaDetails.preview'); }
      if (close) { close.textContent = t('common.cancel'); }
      if (apply) { apply.textContent = t('mediaDetails.useVersion'); }
      focusVersion(String(data.focus || 'selector'), data.showApply === true);
      return true;
    }
    function open(model, origin) {
      var dialog = node('media-info-dialog');
      var content = node('media-info-dialog-content');
      if (!dialog || !content || !model) { return false; }
      state.open = true;
      state.origin = String(origin || '');
      state.mode = 'info';
      clear(content);
      content.scrollTop = 0;
      render(model);
      dialog.className = 'media-info-dialog';
      dialog.setAttribute('aria-hidden', 'false');
      return true;
    }
    function openVersions(frame) {
      var dialog = node('media-info-dialog');
      var content = node('media-info-dialog-content');
      if (!dialog || !content || !frame || !frame.model) { return false; }
      state.open = true;
      state.origin = '';
      state.mode = 'versions';
      if (!renderVersions(frame, true)) { return false; }
      dialog.className = 'media-info-dialog is-version-browser';
      dialog.setAttribute('aria-hidden', 'false');
      return true;
    }
    function updateVersions(frame) {
      if (!state.open || state.mode !== 'versions') { return false; }
      return renderVersions(frame, true);
    }
    function close() {
      var dialog = node('media-info-dialog');
      var browser = node('media-info-dialog-version-browser');
      state.open = false;
      state.origin = '';
      state.mode = 'info';
      if (dialog) { dialog.className = 'media-info-dialog is-hidden'; dialog.setAttribute('aria-hidden', 'true'); }
      if (browser) { browser.className = 'media-info-dialog-version-browser is-hidden'; }
    }
    function scroll(direction) {
      var content = node('media-info-dialog-content');
      var amount;
      var maximum;
      var before;
      var after;
      if (!content) { return false; }
      amount = Math.max(150, Math.round(Number(content.clientHeight || 0) * .35));
      maximum = Math.max(0, Number(content.scrollHeight || 0) - Number(content.clientHeight || 0));
      before = Math.max(0, Number(content.scrollTop || 0));
      after = Math.max(0, Math.min(maximum, before + Number(direction || 0) * amount));
      content.scrollTop = after;
      return after !== before;
    }
    function snapshot() { return { open: state.open, origin: state.origin, mode: state.mode }; }
    return {
      close: close, open: open, openVersions: openVersions, updateVersions: updateVersions,
      focusVersion: focusVersion, render: render, scroll: scroll, snapshot: snapshot
    };
  }
  return { create: create };
}));
