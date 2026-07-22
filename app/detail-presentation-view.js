(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) { module.exports = factory(); }
  else { root.PloffDetailPresentationView = factory(); }
}(this, function () {
  'use strict';
  function create(options) {
    var values = options || {};
    var documentRef = values.document;
    var state = { summaryOverflowing: false, summaryDialogOpen: false, mediaInfoOverflowing: false, mediaInfoDialogOpen: false };
    function node(id) { return documentRef && documentRef.getElementById ? documentRef.getElementById(id) : null; }
    function setText(id, text) { if (values.setText) { values.setText(id, text); } else if (node(id)) { node(id).textContent = String(text || ''); } }
    function t(key) { return values.t ? values.t(key) : key; }
    function zone() { return values.getZone ? values.getZone() : ''; }
    function snapshot() { return { summaryOverflowing: state.summaryOverflowing, summaryDialogOpen: state.summaryDialogOpen, mediaInfoOverflowing: state.mediaInfoOverflowing, mediaInfoDialogOpen: state.mediaInfoDialogOpen }; }
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
      values.root.setTimeout(updateSummaryOverflow, 0);
    }
    function renderChoice(id, cyclable) {
      var button = node(id);
      var focused = button && button.className.indexOf('is-focused') !== -1;
      if (!button) { return; }
      button.className = 'detail-choice' + (cyclable ? ' is-cyclable' : '') + (focused ? ' is-focused' : '');
      button.disabled = !cyclable;
    }
    function renderMediaControls(model) {
      var data = model || {};
      var labels = data.labels || {};
      var choices = data.choices || {};
      var content = data.values || {};
      var mediaInfoButton = node('detail-media-info-button');
      setText('detail-audio-label', labels.audio || '');
      setText('detail-subtitles-label', labels.subtitles || '');
      setText('detail-media-info-label', labels.mediaInfo || '');
      setText('detail-media-info-subtitle-languages-label', labels.subtitleLanguages || '');
      setText('detail-media-info-video-label', labels.video || '');
      setText('detail-media-info-audio-label', labels.audio || '');
      setText('detail-media-info-bitrate-label', labels.bitrate || '');
      setText('detail-audio-value', content.audio || '');
      setText('detail-subtitles-value', content.subtitles || '');
      setText('detail-version-value', content.version || '');
      setText('detail-media-info-video', content.video || '');
      setText('detail-media-info-audio', content.mediaAudio || '');
      setText('detail-media-info-bitrate', content.bitrate || '');
      setText('detail-media-info-subtitle-languages', content.subtitleLanguages || '');
      renderChoice('detail-audio', !!choices.audio);
      renderChoice('detail-subtitles', !!choices.subtitles);
      renderChoice('detail-version', !!choices.versions);
      if (mediaInfoButton) { mediaInfoButton.className = 'detail-media-info-button' + (data.mediaInfoVisible ? '' : ' is-hidden'); }
      values.root.setTimeout(function () { updateMediaInfoOverflow(!!data.mediaInfoVisible); }, 0);
    }
    function clear() {
      setText('detail-title', ''); setText('detail-subtitle', ''); setText('detail-facts', ''); setText('detail-summary', '');
      closeSummary(); closeMediaInfo();
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
      return true;
    }
    function closeSummary() {
      var dialog = node('detail-summary-dialog');
      state.summaryDialogOpen = false;
      if (dialog) { dialog.className = 'detail-summary-dialog is-hidden'; }
      if (zone() === 'summary' && values.onDialogClose) { values.onDialogClose('summary'); }
    }
    function scrollSummary(direction) {
      var text = node('detail-summary-dialog-text');
      if (text) { text.scrollTop += direction * Math.max(150, Math.round(text.clientHeight * .35)); }
    }
    function mediaInfoText() {
      var rows = [
        [t('detail.video'), node('detail-media-info-video').innerText],
        [t('detail.audio'), node('detail-media-info-audio').innerText],
        [t('detail.bitrate'), node('detail-media-info-bitrate').innerText],
        [t('detail.subtitleLanguages'), node('detail-media-info-subtitle-languages').innerText]
      ];
      return rows.map(function (row) { return row[0] + ': ' + (row[1] || t('player.unavailable')); }).join('\n\n');
    }
    function updateMediaInfoOverflow(visible) {
      var button = node('detail-media-info-button');
      var content = node('detail-media-info');
      if (!button || !content) { return false; }
      state.mediaInfoOverflowing = !!visible && content.getBoundingClientRect().bottom > button.getBoundingClientRect().bottom - 2;
      button.disabled = !state.mediaInfoOverflowing;
      button.className = 'detail-media-info-button' + (visible ? '' : ' is-hidden') + (state.mediaInfoOverflowing ? ' is-overflowing' : '') + (zone() === 'media-info' && state.mediaInfoOverflowing ? ' is-focused' : '');
      button.setAttribute('aria-label', state.mediaInfoOverflowing ? t('detail.readFullMediaInfo') : '');
      if (!state.mediaInfoOverflowing && zone() === 'media-info' && values.onInvalidZone) { values.onInvalidZone('media-info'); }
      return state.mediaInfoOverflowing;
    }
    function openMediaInfo() {
      if (!state.mediaInfoOverflowing || state.mediaInfoDialogOpen) { return false; }
      state.mediaInfoDialogOpen = true;
      setText('detail-media-info-dialog-title', t('detail.mediaInfo'));
      setText('detail-media-info-dialog-text', mediaInfoText());
      setText('detail-media-info-dialog-hint', t('detail.summaryCloseHint'));
      node('detail-media-info-dialog-text').scrollTop = 0;
      node('detail-media-info-dialog').className = 'detail-summary-dialog';
      return true;
    }
    function closeMediaInfo() {
      var dialog = node('detail-media-info-dialog');
      state.mediaInfoDialogOpen = false;
      if (dialog) { dialog.className = 'detail-summary-dialog is-hidden'; }
      if (zone() === 'media-info' && values.onDialogClose) { values.onDialogClose('media-info'); }
    }
    function scrollMediaInfo(direction) {
      var text = node('detail-media-info-dialog-text');
      if (text) { text.scrollTop += direction * Math.max(150, Math.round(text.clientHeight * .35)); }
    }
    return {
      snapshot: snapshot, renderMetadata: renderMetadata, renderMediaControls: renderMediaControls, clear: clear,
      updateSummaryOverflow: updateSummaryOverflow, openSummary: openSummary, closeSummary: closeSummary, scrollSummary: scrollSummary,
      updateMediaInfoOverflow: updateMediaInfoOverflow, openMediaInfo: openMediaInfo, closeMediaInfo: closeMediaInfo, scrollMediaInfo: scrollMediaInfo,
      mediaInfoText: mediaInfoText
    };
  }
  return { create: create };
}));
