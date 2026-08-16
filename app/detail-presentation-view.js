(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) { module.exports = factory(); }
  else { root.PloffDetailPresentationView = factory(); }
}(this, function () {
  'use strict';
  function create(options) {
    var values = options || {};
    var documentRef = values.document;
    var state = { summaryOverflowing: false, summaryDialogOpen: false };
    function node(id) { return documentRef && documentRef.getElementById ? documentRef.getElementById(id) : null; }
    function setText(id, text) { if (values.setText) { values.setText(id, text); } else if (node(id)) { node(id).textContent = String(text || ''); } }
    function t(key) { return values.t ? values.t(key) : key; }
    function zone() { return values.getZone ? values.getZone() : ''; }
    function snapshot() { return { summaryOverflowing: state.summaryOverflowing, summaryDialogOpen: state.summaryDialogOpen }; }
    function renderMetadata(detail, subtitle) {
      documentRef.body.className = documentRef.body.className.replace(/\s*is-movie-detail/g, '');
      if (detail && detail.type === 'movie') { documentRef.body.className += ' is-movie-detail'; }
      setText('detail-title', detail && detail.title || '');
      setText('detail-subtitle', subtitle || '');
      setText('detail-facts', detail && detail.facts || '');
      setText('detail-summary', detail && detail.summary || t('detail.noSummary'));
      setText('detail-summary-dialog-title', detail && detail.title || '');
      setText('detail-summary-dialog-text', detail && detail.summary || t('detail.noSummary'));
      setText('detail-summary-dialog-hint', t('detail.summaryCloseHint'));
      setText('detail-summary-dialog-close', t('common.close'));
      values.root.setTimeout(updateSummaryOverflow, 0);
    }
    function renderChoice(id, cyclable, openable) {
      var button = node(id);
      var focused = button && button.className.indexOf('is-focused') !== -1;
      if (!button) { return; }
      button.className = 'detail-choice' + (cyclable ? ' is-cyclable' : '') + (focused ? ' is-focused' : '');
      button.disabled = !(cyclable || openable);
    }
    function renderMediaControls(model) {
      var data = model || {};
      var labels = data.labels || {};
      var choices = data.choices || {};
      var content = data.values || {};
      setText('detail-version-label', labels.version || '');
      setText('detail-audio-label', labels.audio || '');
      setText('detail-subtitles-label', labels.subtitles || '');
      setText('detail-version-value', content.version || '');
      setText('detail-audio-value', content.audio || '');
      setText('detail-subtitles-value', content.subtitles || '');
      renderChoice('detail-audio', !!choices.audio);
      renderChoice('detail-subtitles', !!choices.subtitles);
      renderChoice('detail-version', !!choices.versions, choices.versionOpenable === true);
    }
    function clear() {
      setText('detail-title', ''); setText('detail-subtitle', ''); setText('detail-facts', ''); setText('detail-summary', '');
      closeSummary();
    }
    function updateSummaryOverflow() {
      var button = node('detail-summary-button');
      var summary = node('detail-summary');
      if (!button || !summary) { return false; }
      state.summaryOverflowing = summary.scrollHeight > summary.clientHeight + 2;
      button.disabled = !state.summaryOverflowing;
      button.className = 'detail-summary-button' + (state.summaryOverflowing ? ' is-overflowing' : '') + (zone() === 'summary' && state.summaryOverflowing ? ' is-focused' : '');
      button.setAttribute('aria-label', state.summaryOverflowing ? t('detail.readFullSummary') : '');
      if (!state.summaryOverflowing && zone() === 'summary' && values.onInvalidZone) { values.onInvalidZone('summary'); }
      return state.summaryOverflowing;
    }
    function openSummary() {
      if (!state.summaryOverflowing || state.summaryDialogOpen) { return false; }
      state.summaryDialogOpen = true;
      node('detail-summary-dialog-text').scrollTop = 0;
      node('detail-summary-dialog').className = 'detail-summary-dialog';
      node('detail-summary-dialog').setAttribute('aria-hidden', 'false');
      node('detail-summary-dialog-close').className = 'detail-summary-dialog-close is-focused';
      if (node('detail-summary-dialog-close').focus) { node('detail-summary-dialog-close').focus(); }
      return true;
    }
    function closeSummary() {
      var dialog = node('detail-summary-dialog');
      state.summaryDialogOpen = false;
      if (dialog) { dialog.className = 'detail-summary-dialog is-hidden'; dialog.setAttribute('aria-hidden', 'true'); }
      if (node('detail-summary-dialog-close')) { node('detail-summary-dialog-close').className = 'detail-summary-dialog-close'; }
      if (zone() === 'summary' && values.onDialogClose) { values.onDialogClose('summary'); }
    }
    function scrollSummary(direction) {
      var text = node('detail-summary-dialog-text');
      if (text) { text.scrollTop += direction * Math.max(150, Math.round(text.clientHeight * .35)); }
    }
    return {
      snapshot: snapshot, renderMetadata: renderMetadata, renderMediaControls: renderMediaControls, clear: clear,
      updateSummaryOverflow: updateSummaryOverflow, openSummary: openSummary, closeSummary: closeSummary, scrollSummary: scrollSummary
    };
  }
  return { create: create };
}));
