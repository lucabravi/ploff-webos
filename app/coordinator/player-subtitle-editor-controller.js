(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) { module.exports = factory(); }
  else { root.PloffPlayerSubtitleEditorController = factory(); }
}(this, function () {
  'use strict';

  function create(options) {
    var values = options || {};
    var platform = values.platform || {};
    var document = platform.document || {};
    var modules = values.modules || {};
    var playback = values.playback || {};
    var settings = values.settings || {};
    var presentation = values.presentation || {};
    var SubtitleSync = modules.SubtitleSync;
    var SubtitleStyleDialog = modules.SubtitleStyleDialog;
    var SubtitleEditorView = modules.SubtitleEditorView;
    var Settings = modules.Settings;
    var MediaInfo = modules.MediaInfo;
    var view = null;
    var index = 0;
    var styleOriginal = null;
    var styleDraft = null;
    var trackChanged = false;
    var trackIntent = '';
    var loadedPresentation = null;
    var dirty = false;
    var draftScope = 'global';
    var resetSeason = false;
    var editing = '';
    var pendingResetStreamId = null;
    var pendingResetSize = null;
    var pendingResetOffset = null;
    var SUBTITLE_INHERIT_VALUE = '__inherit__';
    var destroyed = false;

    function call(callback, arg1, arg2, arg3, arg4, arg5) {
      return typeof callback === 'function' ? callback(arg1, arg2, arg3, arg4, arg5) : undefined;
    }

    function t(key, parameters) { return call(presentation.t, key, parameters) || key; }
    function owns(source, key) { return !!source && Object.prototype.hasOwnProperty.call(source, key); }
    function snapshot() { return call(playback.snapshot) || { subtitleEditor: { open: false }, playback: null }; }
    function editorSnapshot() { return snapshot().subtitleEditor || { open: false }; }
    function currentPlayback() { return snapshot().playback || null; }
    function currentSettings() { return call(settings.current) || {}; }
    function subtitleSizes() {
      var source = call(presentation.subtitleSizes) || (Settings && Settings.SUBTITLE_SIZES);
      return source && source.length ? source.slice() : [100];
    }
    function formatTime(value) { return call(presentation.formatTime, value) || String(value || 0); }

    function ensureView() {
      if (!view) {
        view = SubtitleEditorView.create({ document: document, setText: presentation.setText, SubtitleSync: SubtitleSync });
      }
      return view;
    }

    function controls() { return ensureView().controls(); }

    function controlIndex(name) {
      var list = controls();
      var controlIndexValue;
      for (controlIndexValue = 0; controlIndexValue < list.length; controlIndexValue += 1) {
        if (list[controlIndexValue].getAttribute('data-subtitle-editor') === name) { return controlIndexValue; }
      }
      return -1;
    }

    function seasonAvailable(playbackValue) { return call(presentation.seasonAvailable, playbackValue) === true; }

    function rowsFor(playbackValue) {
      var commitRow = ['reset', 'cancel', 'apply'];
      if (seasonAvailable(playbackValue)) { commitRow.splice(2, 0, 'apply-season'); }
      return [['track', 'size'], ['background', 'edge'], ['render-srt', 'render-ass'], ['offset', 'loop'], ['timeline'], commitRow];
    }

    function capabilitiesFor(state, playbackValue) {
      var source = state && state.capabilities;
      var track;
      var raw;
      var local;
      var result;
      playbackValue = playbackValue || currentPlayback();
      if (source) {
        result = {
          track: source.track !== false,
          size: source.size !== false,
          background: source.background !== false,
          edge: source.edge !== false,
          'render-srt': source['render-srt'] !== false && source.renderSrt !== false,
          'render-ass': source['render-ass'] !== false && source.renderAss !== false,
          offset: source.offset !== false,
          loop: source.loop !== false,
          timeline: source.timeline !== false
        };
      } else {
        if (!playbackValue || !(playbackValue.subtitleTracks || []).length) {
          return {
            track: true, size: true, background: true, edge: true,
            'render-srt': true, 'render-ass': true, offset: true, loop: true,
            timeline: true, reset: true, cancel: true,
            'apply-season': seasonAvailable(playbackValue), apply: true
          };
        }
        track = playbackValue && MediaInfo.selectedTrack(playbackValue.subtitleTracks || [], state && state.selectedStreamID);
        raw = SubtitleSync && track ? SubtitleSync.classify(track) : { kind: 'unsupported' };
        if (state && state.previewMode) {
          local = state.previewLoading !== true && state.previewError !== true &&
            (state.previewMode === 'overlay' || (state.previewMode === 'ass' && state.rendererType === 'ass'));
        } else {
          local = (raw.kind === 'external-ass' || raw.kind === 'embedded-ass') ? renderingValue('ass') : renderingValue('srt');
        }
        raw = SubtitleSync && SubtitleSync.editorCapabilities ? SubtitleSync.editorCapabilities(track, {
          local: local,
          tracks: playbackValue && playbackValue.subtitleTracks || []
        }) : {};
        result = {
          track: raw.track !== false,
          size: raw.size === true,
          background: raw.background === true,
          edge: raw.edge === true,
          'render-srt': raw.renderSrt === true,
          'render-ass': raw.renderAss === true,
          offset: raw.offset === true,
          loop: raw.loop === true,
          timeline: raw.timeline === true
        };
      }
      result.reset = true;
      result.cancel = true;
      result['apply-season'] = seasonAvailable(playbackValue);
      result.apply = true;
      return result;
    }

    function enabled(name, state, playbackValue) {
      return capabilitiesFor(state || editorSnapshot(), playbackValue || currentPlayback())[name] !== false;
    }

    function clearPendingReset() {
      pendingResetStreamId = null;
      pendingResetSize = null;
      pendingResetOffset = null;
    }

    function applyPendingReset(state, playbackValue) {
      var capabilities;
      var size;
      var offset;
      var delta;
      if (pendingResetStreamId === null || !state || String(state.selectedStreamID || '') !== pendingResetStreamId) { return; }
      capabilities = capabilitiesFor(state, playbackValue);
      if (pendingResetOffset !== null) {
        if (capabilities.offset === true) {
          offset = pendingResetOffset;
          pendingResetOffset = null;
          delta = offset - Math.round(Number(state.offsetMs || 0));
          if (delta) { call(playback.open, { action: 'adjust-offset', delta: delta }); }
        } else if (state.previewLoading !== true) {
          pendingResetOffset = null;
        }
      }
      if (pendingResetSize !== null) {
        if (capabilities.size === true) {
          size = pendingResetSize;
          pendingResetSize = null;
          if (Number(state.subtitleSize || 100) !== size) { call(playback.open, { action: 'set-size', size: size }); }
        } else if (state.previewLoading !== true) {
          pendingResetSize = null;
        }
      }
      if (pendingResetSize === null && pendingResetOffset === null) { pendingResetStreamId = null; }
    }

    function normalizedIndex(state, playbackValue) {
      var list = controls();
      var capabilities = capabilitiesFor(state, playbackValue);
      var currentName = list[index] && list[index].getAttribute('data-subtitle-editor');
      var controlIndexValue;
      var bestIndex = -1;
      var bestDistance = 999;
      var distance;
      if (currentName && capabilities[currentName] !== false) { return index; }
      for (controlIndexValue = 0; controlIndexValue < list.length; controlIndexValue += 1) {
        currentName = list[controlIndexValue].getAttribute('data-subtitle-editor');
        if (capabilities[currentName] === false) { continue; }
        distance = Math.abs(controlIndexValue - index);
        if (distance < bestDistance) { bestIndex = controlIndexValue; bestDistance = distance; }
      }
      return bestIndex >= 0 ? bestIndex : 0;
    }

    function moveFocus(direction) {
      var playbackValue = currentPlayback();
      var state = editorSnapshot();
      var capabilities = capabilitiesFor(state, playbackValue);
      var rows = rowsFor(playbackValue);
      var list = controls();
      var current = list[index] && list[index].getAttribute('data-subtitle-editor');
      var row = 0;
      var column = 0;
      var targetRow;
      var targetColumn;
      var rowIndex;
      var candidate;
      var distance;
      var bestDistance;
      var step;
      index = normalizedIndex(state, playbackValue);
      current = list[index] && list[index].getAttribute('data-subtitle-editor');
      for (rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
        if (rows[rowIndex].indexOf(current) !== -1) { row = rowIndex; column = rows[rowIndex].indexOf(current); break; }
      }
      if (direction === 'left' || direction === 'right') {
        step = direction === 'left' ? -1 : 1;
        targetColumn = column + step;
        while (targetColumn >= 0 && targetColumn < rows[row].length) {
          candidate = rows[row][targetColumn];
          if (capabilities[candidate] !== false) { index = controlIndex(candidate); }
          if (capabilities[candidate] !== false) { break; }
          targetColumn += step;
        }
        return;
      }
      step = direction === 'up' ? -1 : 1;
      targetRow = row + step;
      while (targetRow >= 0 && targetRow < rows.length) {
        candidate = '';
        bestDistance = 999;
        for (targetColumn = 0; targetColumn < rows[targetRow].length; targetColumn += 1) {
          if (capabilities[rows[targetRow][targetColumn]] === false) { continue; }
          distance = Math.abs(targetColumn - column);
          if (distance < bestDistance) { candidate = rows[targetRow][targetColumn]; bestDistance = distance; }
        }
        if (candidate) { index = controlIndex(candidate); return; }
        targetRow += step;
      }
    }

    function trackAvailable(track) {
      var result;
      if (!track || typeof playback.availability !== 'function') { return false; }
      if (SubtitleSync && !SubtitleSync.advancedEditorSupported(track)) { return false; }
      result = playback.availability(String(track.id || '')) || {};
      return result.enabled === true;
    }

    function trackChoices() {
      var current = currentPlayback();
      var choices = [{ value: SUBTITLE_INHERIT_VALUE, label: t('player.automatic') }, { value: '', label: t('subtitle.off') }];
      if (!current) { return choices; }
      (current.subtitleTracks || []).forEach(function (track) {
        if (trackAvailable(track)) {
          choices.push({
            value: String(track.id || ''),
            label: call(presentation.trackLabel, current.subtitleTracks, track.id, t('subtitle.off')) || t('subtitle.off'),
            languageCode: track.languageTag || track.languageCode || track.language || ''
          });
        }
      });
      return choices;
    }

    function progress() {
      var current = snapshot();
      if (!current.durationSeconds) { return 0; }
      return Math.max(0, Math.min(100, current.positionSeconds / current.durationSeconds * 100));
    }

    function copyStyle(source) {
      if (SubtitleStyleDialog && typeof SubtitleStyleDialog.copy === 'function') { return SubtitleStyleDialog.copy(source); }
      source = source || {};
      return {
        subtitleBackground: String(source.subtitleBackground || 'off'),
        subtitlePosition: Number(source.subtitlePosition || 7),
        subtitleEdge: String(source.subtitleEdge || 'shadow'),
        subtitleSize: Number(source.subtitleSize || 100)
      };
    }

    function copyRendering(source) {
      source = source || {};
      return {
        srt: source.renderSrt === true || source.subtitleRenderingSrt === true,
        ass: source.renderAss === true || source.subtitleRenderingAss === true
      };
    }

    function currentLoadedPresentation() {
      return loadedPresentation || call(presentation.load, currentPlayback()) || {};
    }

    function scopedPresentation() {
      return currentLoadedPresentation().effective || currentSettings();
    }

    function scopeStatus() {
      if (dirty) { return t('player.subtitleScopeUnsaved'); }
      if (draftScope === 'media') { return t(seasonAvailable(currentPlayback()) ? 'player.subtitleScopeEpisode' : 'player.subtitleScopeMedia'); }
      if (draftScope === 'season') { return t('player.subtitleScopeSeason'); }
      return t('player.subtitleScopeGlobal');
    }

    function scopedStyle(source) {
      var current = currentSettings();
      var style = copyStyle(source || current);
      style.subtitlePosition = Number(current.subtitlePosition || style.subtitlePosition || 7);
      return style;
    }

    function currentRendering() { return copyRendering(currentSettings()); }

    function renderingValue(name) { return currentRendering()[name] === true; }

    function confirmRenderingChange(name) {
      var current = currentRendering();
      var enabled = current[name] !== true;
      var next = { srt: current.srt === true, ass: current.ass === true };
      next[name] = enabled;
      call(presentation.confirmRendering, name, enabled, function () {
        var committed = call(settings.commitRendering, next);
        if (!committed || typeof committed !== 'object') {
          call(presentation.reportError, new Error('Unable to save global subtitle rendering setting'));
          render();
          return;
        }
        call(playback.open, { action: 'set-rendering' });
        render();
      }, function () { render(); });
    }

    function styleLabel(key, value) {
      var prefix = key === 'subtitleBackground' ? 'settings.subtitleBackground.' : 'settings.subtitleEdge.';
      return t(prefix + String(value || ''));
    }

    function previewStyle() {
      if (styleDraft) { call(settings.previewStyle, styleDraft); }
    }

    function styleValues(name) {
      var fallback = name === 'background' ? ['off', 'low', 'medium', 'high', 'opaque'] : ['shadow', 'outline', 'both', 'double-outline-shadow'];
      var source = name === 'background' ? Settings && Settings.SUBTITLE_BACKGROUNDS : Settings && Settings.SUBTITLE_EDGES;
      return source && source.length ? source.slice() : fallback;
    }

    function styleChoices(name) {
      var key = name === 'background' ? 'subtitleBackground' : 'subtitleEdge';
      return styleValues(name).map(function (value) { return { value: value, label: styleLabel(key, value) }; });
    }


    function render(stateValue) {
      var current;
      var playbackValue;
      var state;
      var style;
      var track;
      var capabilities;
      var renderSrt;
      var renderAss;
      if (destroyed) { return; }
      current = snapshot();
      playbackValue = current.playback;
      state = stateValue || current.subtitleEditor;
      style = styleDraft || scopedStyle(scopedPresentation());
      if (!state || !state.open || !playbackValue) { return; }
      capabilities = capabilitiesFor(state, playbackValue);
      if (editing && capabilities[editing] === false) { editing = ''; }
      track = MediaInfo.selectedTrack(playbackValue.subtitleTracks || [], state.selectedStreamID);
      renderSrt = renderingValue('srt');
      renderAss = renderingValue('ass');
      index = normalizedIndex(state, playbackValue);
      ensureView().render({
        status: state.status || scopeStatus(),
        track: track ? (call(presentation.trackLabel, playbackValue.subtitleTracks, track.id, t('subtitle.off')) || t('subtitle.off')) : t('subtitle.off'),
        size: state.subtitleSize,
        background: styleLabel('subtitleBackground', style.subtitleBackground),
        edge: styleLabel('subtitleEdge', style.subtitleEdge),
        renderSrt: renderSrt,
        renderSrtValue: t(renderSrt ? 'settings.enabled' : 'settings.disabled'),
        renderAss: renderAss,
        renderAssValue: t(renderAss ? 'settings.enabled' : 'settings.disabled'),
        offsetMs: state.offsetMs,
        progress: progress(),
        index: index,
        currentTime: formatTime(current.positionSeconds),
        duration: formatTime(current.durationSeconds),
        loop: state.loop,
        editing: editing,
        capabilities: capabilities,
        seasonAvailable: seasonAvailable(playbackValue),
        pointerActive: call(presentation.pointerActive) === true
      });
    }

    function update(stateValue) {
      var state = stateValue || editorSnapshot();
      var editorNode = document && document.getElementById ? document.getElementById('subtitle-editor') : null;
      if (state.open) {
        applyPendingReset(state, currentPlayback());
        if (editing && !enabled(editing, state, currentPlayback())) { editing = ''; }
        if (editorNode && String(editorNode.className || '').indexOf('is-hidden') !== -1) { call(presentation.setPanelOpen, true); }
        render(state);
      } else if (editorNode && String(editorNode.className || '').indexOf('is-hidden') === -1) {
        call(presentation.setPanelOpen, false);
      }
    }

    function openSubtitleEditor() {
      var effective;
      var style;
      var mediaLayer;
      if (destroyed || typeof playback.open !== 'function') { return false; }
      loadedPresentation = call(presentation.load, currentPlayback()) || {};
      effective = loadedPresentation.effective || currentSettings();
      style = scopedStyle(effective);
      if (!playback.open()) { loadedPresentation = null; return false; }
      styleOriginal = style;
      styleDraft = copyStyle(style);
      trackChanged = false;
      mediaLayer = loadedPresentation.layers && loadedPresentation.layers.media;
      trackIntent = mediaLayer && owns(mediaLayer, 'subtitleMode') ? String(mediaLayer.subtitleMode || '') : 'inherit';
      dirty = false;
      draftScope = String(loadedPresentation.scope || 'global');
      resetSeason = false;
      editing = '';
      previewStyle();
      index = 0;
      call(presentation.setPanelOpen, true);
      render();
      return true;
    }


    function setSize(value) {
      if (!styleDraft) { styleDraft = scopedStyle(scopedPresentation()); }
      styleDraft.subtitleSize = Number(value);
      dirty = true;
      previewStyle();
      call(playback.open, { action: 'set-size', size: Number(value) });
    }


    function openSubtitleEditorChoice(name) {
      var state = editorSnapshot();
      var choices;
      var selected;
      if (!enabled(name, state, currentPlayback())) { return false; }
      if (name === 'track') { choices = trackChoices(); selected = trackIntent === 'inherit' ? SUBTITLE_INHERIT_VALUE : String(state.selectedStreamID || ''); }
      else if (name === 'size') { choices = subtitleSizes().map(function (size) { return { value: String(size), label: size + '%' }; }); selected = String(state.subtitleSize || 100); }
      else if (name === 'background') { choices = styleChoices('background'); selected = String((styleDraft || scopedStyle(scopedPresentation())).subtitleBackground); }
      else { choices = styleChoices('edge'); selected = String((styleDraft || scopedStyle(scopedPresentation())).subtitleEdge); }
      call(presentation.openChoice,
        t(name === 'track' ? 'player.subtitles' : (name === 'size' ? 'player.subtitleSize' : (name === 'background' ? 'settings.subtitleBackground' : 'settings.subtitleEdge'))),
        choices,
        selected,
        function (choice) {
          var streamId;
          if (name === 'track') {
            trackChanged = true;
            dirty = true;
            if (choice.value === SUBTITLE_INHERIT_VALUE) {
              trackIntent = 'inherit';
              streamId = String(currentLoadedPresentation().inheritedStreamID || '');
            } else {
              streamId = String(choice.value || '');
              trackIntent = streamId ? 'track' : 'off';
            }
            call(playback.open, { action: 'set-track', streamId: streamId });
          } else if (name === 'size') { setSize(choice.value); }
          else {
            if (!styleDraft) { styleDraft = scopedStyle(scopedPresentation()); }
            styleDraft[name === 'background' ? 'subtitleBackground' : 'subtitleEdge'] = choice.value;
            dirty = true;
            previewStyle();
            render();
          }
        },
        function () { render(); }
      );
      return true;
    }

    function adjustOffset(delta) {
      if (!enabled('offset')) { return false; }
      dirty = true;
      call(playback.open, { action: 'adjust-offset', delta: delta });
      return true;
    }
    function seek(direction) {
      if (!enabled('timeline')) { return false; }
      call(playback.open, { action: 'seek', delta: direction * 10 });
      return true;
    }

    function finish() {
      call(presentation.setPanelOpen, false);
      styleOriginal = null;
      styleDraft = null;
      trackChanged = false;
      trackIntent = '';
      loadedPresentation = null;
      dirty = false;
      draftScope = 'global';
      resetSeason = false;
      editing = '';
      clearPendingReset();
      call(presentation.finish);
    }

    function closeSubtitleEditor(apply, scope) {
      var draft = copyStyle(styleDraft || styleOriginal || scopedPresentation());
      var original = copyStyle(styleOriginal || scopedStyle(scopedPresentation()));
      var stateValue = editorSnapshot();
      var capabilities = capabilitiesFor(stateValue, currentPlayback());
      if (destroyed) { return; }
      if (apply) {
        call(playback.apply, { rendering: currentRendering() }, function (error) {
          if (error) { call(presentation.reportError, error); render(); return; }
          if (call(presentation.save, scope === 'season' ? 'season' : 'media', {
            state: stateValue,
            style: draft,
            capabilities: capabilities,
            trackChanged: trackChanged,
            trackIntent: trackIntent,
            resetSeason: resetSeason
          }) === false) {
            call(presentation.reportError, new Error('Unable to save subtitle presentation'));
            render();
            return;
          }
          finish();
        });
      } else {
        call(playback.cancel, function (error) {
          if (error) { call(presentation.reportError, error); }
          call(settings.restoreStyle, original);
          finish();
        });
      }
    }

    function applyResetDraft(scope) {
      var projection = call(presentation.reset, scope, currentPlayback()) || {};
      var state = editorSnapshot();
      var effective = projection.effective || {};
      var targetStream = String(projection.selectedStreamID || '');
      var targetSize = Number(effective.subtitleSize || state.subtitleSize || 100);
      var targetOffset = Math.round(Number(effective.offsetMs || 0));
      styleDraft = scopedStyle(effective);
      trackChanged = true;
      trackIntent = String(projection.trackIntent || 'inherit');
      resetSeason = projection.resetSeason === true;
      draftScope = String(projection.scope || 'global');
      dirty = true;
      pendingResetStreamId = targetStream;
      pendingResetSize = targetSize;
      pendingResetOffset = targetOffset;
      previewStyle();
      if (String(state.selectedStreamID || '') !== targetStream) {
        call(playback.open, { action: 'set-track', streamId: targetStream });
      } else {
        applyPendingReset(editorSnapshot(), currentPlayback());
      }
      render();
    }

    function openResetChoice() {
      var choices = [{ value: 'media', label: t(seasonAvailable(currentPlayback()) ? 'player.subtitleResetEpisode' : 'player.subtitleResetMedia') }];
      if (seasonAvailable(currentPlayback())) { choices.push({ value: 'season', label: t('player.subtitleResetSeason') }); }
      choices.push({ value: 'cancel', label: t('common.cancel') });
      call(presentation.openChoice, t('player.subtitleReset'), choices, 'cancel', function (choice) {
        if (choice && choice.value !== 'cancel') { applyResetDraft(choice.value); }
      }, function () { render(); });
    }

    function activateSubtitleEditorControl(name) {
      var state = editorSnapshot();
      if (state.applying) { if (name === 'cancel') { closeSubtitleEditor(false); } return; }
      if (!enabled(name, state, currentPlayback())) { return; }
      if (name === 'track') { openSubtitleEditorChoice('track'); }
      else if (name === 'size') { openSubtitleEditorChoice('size'); }
      else if (name === 'background') { openSubtitleEditorChoice('background'); }
      else if (name === 'edge') { openSubtitleEditorChoice('edge'); }
      else if (name === 'render-srt') { confirmRenderingChange('srt'); }
      else if (name === 'render-ass') { confirmRenderingChange('ass'); }
      else if (name === 'offset') { editing = name; render(); }
      else if (name === 'loop' && state.bounds && state.bounds.end > state.bounds.start) { call(playback.open, { action: 'toggle-loop' }); }
      else if (name === 'reset') { openResetChoice(); }
      else if (name === 'apply-season') { closeSubtitleEditor(true, 'season'); }
      else if (name === 'apply') { closeSubtitleEditor(true); }
      else if (name === 'cancel') { closeSubtitleEditor(false); }
    }

    function handleSubtitleEditorKey(event, direction) {
      var state = editorSnapshot();
      var list;
      var name;
      if (destroyed || !state.open) { return false; }
      list = controls();
      name = list[index] && list[index].getAttribute('data-subtitle-editor');
      if (event.keyCode === 27 || event.keyCode === 461) {
        if (editing) { editing = ''; render(); }
        else { closeSubtitleEditor(false); }
        return true;
      }
      if (state.applying) { return true; }
      if (event.keyCode === 415) { if (snapshot().paused) { call(playback.toggle); } return true; }
      if (event.keyCode === 19) { if (!snapshot().paused) { call(playback.toggle); } return true; }
      if (editing) {
        if (!enabled(editing, state, currentPlayback())) { editing = ''; render(); return true; }
        if (event.keyCode === 13) { editing = ''; render(); }
        else if (direction === 'up' || direction === 'down') {
          editing = '';
          moveFocus(direction);
          render();
        } else if (direction === 'left' || direction === 'right') {
          if (editing === 'offset') { adjustOffset(direction === 'left' ? -100 : 100); }
        }
        return true;
      }
      if (name === 'timeline' && enabled(name, state, currentPlayback()) && (direction === 'left' || direction === 'right')) { seek(direction === 'left' ? -1 : 1); }
      else if (direction === 'up' || direction === 'down' || direction === 'left' || direction === 'right') { moveFocus(direction); render(); }
      else if (event.keyCode === 13) { activateSubtitleEditorControl(name); }
      return true;
    }

    function pointerFocus(button) {
      var list = controls();
      var controlIndexValue;
      if (destroyed) { return false; }
      for (controlIndexValue = 0; controlIndexValue < list.length; controlIndexValue += 1) {
        if (list[controlIndexValue] === button) {
          if (!enabled(list[controlIndexValue].getAttribute('data-subtitle-editor'))) { return false; }
          if (editing && list[index] !== button) { editing = ''; }
          index = controlIndexValue;
          break;
        }
      }
      render();
      return true;
    }

    function setViewOpen(openValue) { ensureView().setOpen(openValue === true); }
    function renderOverlay(cues, positionMs, offsetMs, size) { ensureView().renderOverlay(cues, positionMs, offsetMs, size); }
    function hideOverlay() { ensureView().hideOverlay(); }
    function hideSurface() { setViewOpen(false); hideOverlay(); }

    function destroy() {
      if (destroyed) { return; }
      if (styleOriginal) { call(settings.restoreStyle, styleOriginal); }
      styleOriginal = null;
      styleDraft = null;
      trackChanged = false;
      trackIntent = '';
      loadedPresentation = null;
      dirty = false;
      resetSeason = false;
      editing = '';
      clearPendingReset();
      destroyed = true;
      if (view) { view.setOpen(false); view.hideOverlay(); }
    }

    return {
      open: openSubtitleEditor,
      update: update,
      render: render,
      handleKey: handleSubtitleEditorKey,
      pointerFocus: pointerFocus,
      setViewOpen: setViewOpen,
      renderOverlay: renderOverlay,
      hideOverlay: hideOverlay,
      hideSurface: hideSurface,
      destroy: destroy
    };
  }

  return { create: create };
}));
