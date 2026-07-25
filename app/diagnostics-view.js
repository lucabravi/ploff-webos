(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PloffDiagnosticsView = factory();
  }
}(this, function () {
  'use strict';

  function create(options) {
    var values = options || {};
    var documentRef = values.document;
    var rootRef = values.root;
    var active = false;
    var focusIndex = 0;
    var timer = null;
    var identityRequest = null;
    var identityGeneration = 0;
    var identityState = { error: '', identity: null, reachable: false };

    function text(key) {
      return values.t(key);
    }

    function diagnosticText(value) {
      return value === null || value === undefined || value === '' ? text('diagnostics.unknown') : String(value);
    }

    function appendRow(section, labelKey, value) {
      var row = values.element('div', 'diagnostics-row');
      row.appendChild(values.element('span', 'diagnostics-label', text(labelKey)));
      row.appendChild(values.element('span', 'diagnostics-value', diagnosticText(value)));
      section.appendChild(row);
    }

    function appendSection(container, titleKey, rows) {
      var section = values.element('section', 'diagnostics-section');
      var index;
      section.appendChild(values.element('h2', 'diagnostics-section-title', text(titleKey)));
      for (index = 0; index < rows.length; index += 1) { appendRow(section, rows[index][0], rows[index][1]); }
      container.appendChild(section);
    }

    function appendColumns(container) {
      var left = values.element('div', 'diagnostics-column');
      var right = values.element('div', 'diagnostics-column');
      container.appendChild(left);
      container.appendChild(right);
      return [left, right];
    }

    function appendServerAddresses(rows, addresses) {
      var source = addresses || [];
      var index;
      for (index = 0; index < source.length; index += 1) {
        rows.push([
          source[index].kind === 'local' ? 'diagnostics.localAddress' : 'diagnostics.remoteAddress',
          source[index].uri
        ]);
      }
    }

    function booleanLabel(value) {
      if (value !== true && value !== false) { return text('diagnostics.unknown'); }
      return text(value ? 'diagnostics.yes' : 'diagnostics.no');
    }

    function hdrLabel(device) {
      var formats = [];
      if (!device.hdrKnown) { return text('diagnostics.unknown'); }
      if (device.hdr10) { formats.push('HDR10'); }
      if (device.dolbyVision) { formats.push('Dolby Vision'); }
      return formats.length ? formats.join(' / ') : text('diagnostics.no');
    }

    function renderFocus() {
      var buttons = documentRef.querySelectorAll('[data-diagnostics-action]');
      var index;
      for (index = 0; index < buttons.length; index += 1) {
        buttons[index].className = index === focusIndex ? 'is-focused' : '';
      }
      if (!values.isPointerSelectionActive() && buttons[focusIndex]) { buttons[focusIndex].focus(); }
    }

    function render() {
      var snapshot = values.getSnapshot(identityState);
      var content = documentRef.getElementById('diagnostics-content');
      var scrollTop = content.scrollTop;
      var playback = snapshot.playback;
      var network = snapshot.network || { status: 'unknown', lanAvailable: null, internetAvailable: null, connectionType: '', localAddress: '' };
      var serverRows;
      var columns;
      values.setText('diagnostics-title', text('diagnostics.title'));
      values.setText('diagnostics-notice', text('diagnostics.notice'));
      values.setText('diagnostics-refresh', text('diagnostics.refresh'));
      values.setText('diagnostics-back', text('diagnostics.back'));
      content.innerHTML = '';
      columns = appendColumns(content);
      appendSection(columns[0], 'diagnostics.app', [['diagnostics.appVersion', snapshot.appVersion]]);
      serverRows = [
        ['diagnostics.serverName', snapshot.server.name],
        ['diagnostics.serverVersion', snapshot.server.version],
        ['diagnostics.serverId', snapshot.server.machineIdentifier],
        ['diagnostics.reachable', booleanLabel(snapshot.server.reachable)]
      ];
      appendServerAddresses(serverRows, snapshot.server.addresses);
      appendSection(columns[1], 'diagnostics.server', serverRows);
      appendSection(columns[0], 'diagnostics.profile', [
        ['diagnostics.profileMode', snapshot.profile.mode],
        ['diagnostics.profileName', snapshot.profile.name]
      ]);
      appendSection(columns[1], 'diagnostics.device', [
        ['diagnostics.model', snapshot.device.modelName],
        ['diagnostics.webos', snapshot.device.webOSVersion],
        ['diagnostics.viewport', snapshot.device.viewport],
        ['diagnostics.capabilities', snapshot.device.known
          ? (snapshot.device.uhd ? '4K' : 'HD')
          : text('diagnostics.unknownCapabilities')],
        ['diagnostics.hdrSupport', hdrLabel(snapshot.device)]
      ]);
      appendSection(columns[0], 'diagnostics.network', [
        ['diagnostics.networkStatus', text('network.' + network.status)],
        ['diagnostics.lanAvailable', booleanLabel(network.lanAvailable)],
        ['diagnostics.internetAvailable', booleanLabel(network.internetAvailable)],
        ['diagnostics.connectionType', network.connectionType],
        ['diagnostics.networkAddress', network.localAddress]
      ]);
      if (!playback) {
        appendSection(columns[1], 'diagnostics.playback', [['diagnostics.state', text('diagnostics.noPlayback')]]);
      } else {
        appendSection(columns[1], 'diagnostics.playback', [
          ['diagnostics.file', playback.fileName],
          ['diagnostics.size', values.formatFileSize(playback.fileSize)],
          ['diagnostics.source', playback.source],
          ['diagnostics.delivery', playback.delivery],
          ['diagnostics.strategy', playback.strategy],
          ['diagnostics.attempts', playback.attempts.join(' > ')],
          ['diagnostics.fallback', playback.fallback || text('diagnostics.none')],
          ['diagnostics.position', values.formatLongTime(playback.position) + ' / ' + values.formatLongTime(playback.duration)],
          ['diagnostics.buffered', playback.buffered || text('diagnostics.none')],
          ['diagnostics.state', playback.state]
        ]);
      }
      appendSection(columns[0], 'diagnostics.lastError', [
        ['diagnostics.lastError', snapshot.error || text('diagnostics.none')]
      ]);
      content.scrollTop = scrollTop;
      renderFocus();
    }

    function clearRequest() {
      if (identityRequest && identityRequest.abort) { identityRequest.abort(); }
      identityRequest = null;
    }

    function refresh() {
      var generation;
      var request;
      var completed = false;
      clearRequest();
      identityGeneration += 1;
      generation = identityGeneration;
      if (!values.loadIdentity) {
        identityState.reachable = false;
        render();
        return;
      }
      request = values.loadIdentity(function (error, identity) {
        if (!active || generation !== identityGeneration) { return; }
        completed = true;
        identityRequest = null;
        identityState.reachable = !error;
        if (error) { identityState.error = values.sanitizeError ? values.sanitizeError(error) : String(error || ''); }
        else { identityState.identity = identity; identityState.error = ''; }
        render();
      });
      if (completed) { return; }
      identityRequest = request || null;
      if (!request) {
        identityState.reachable = false;
        render();
      }
    }

    function scroll(direction) {
      var content = documentRef.getElementById('diagnostics-content');
      var distance = Math.max(120, Math.round(content.clientHeight * 0.55));
      var maximum = Math.max(0, content.scrollHeight - content.clientHeight);
      content.scrollTop = Math.max(0, Math.min(maximum, content.scrollTop + (direction === 'down' ? distance : -distance)));
    }

    function activate() {
      if (focusIndex === 0) { refresh(); }
      else { close(); }
    }

    function setFocus(index) {
      focusIndex = Number(index) === 1 ? 1 : 0;
      renderFocus();
    }

    function handleKey(event, direction) {
      if (!active) { return; }
      event.preventDefault();
      if (event.keyCode === 27 || event.keyCode === 461) { close(); return; }
      if (direction === 'left') { setFocus(0); }
      else if (direction === 'right') { setFocus(1); }
      else if (direction === 'up' || direction === 'down') { scroll(direction); }
      else if (event.keyCode === 13) { activate(); }
    }

    function open() {
      if (active) { return; }
      active = true;
      focusIndex = 0;
      if (values.onOpen) { values.onOpen(); }
      documentRef.getElementById('diagnostics-view').className = 'diagnostics-view';
      documentRef.getElementById('diagnostics-content').scrollTop = 0;
      render();
      refresh();
      rootRef.clearInterval(timer);
      timer = rootRef.setInterval(function () { if (active) { render(); } }, 2000);
    }

    function close() {
      if (!active) { return; }
      active = false;
      identityGeneration += 1;
      rootRef.clearInterval(timer);
      timer = null;
      clearRequest();
      documentRef.getElementById('diagnostics-view').className = 'diagnostics-view is-hidden';
      if (values.onClose) { values.onClose(); }
    }

    return {
      activate: activate,
      close: close,
      destroy: close,
      handleKey: handleKey,
      isOpen: function () { return active; },
      open: open,
      refresh: refresh,
      render: render,
      scroll: scroll,
      setFocus: setFocus
    };
  }

  return { create: create };
}));
