(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PloffSubtitleSync = factory();
  }
}(this, function () {
  'use strict';

  var TEXT_CODECS = ['srt', 'subrip', 'webvtt', 'vtt'];
  var ASS_CODECS = ['ass', 'ssa'];

  function codecFor(track) {
    return String(track && (track.format || track.codec) || '').toLowerCase();
  }

  function externalTrack(track) {
    var source = track && track.source;
    var external = track && track.external;
    if (!track || source === 'internal' || track.location === 'embedded' || external === false || external === '0' || external === 0) { return false; }
    return external === true || external === '1' || source === 'external' || !!track.key;
  }

  function classify(track) {
    var codec = codecFor(track);
    var textSupported = TEXT_CODECS.indexOf(codec) !== -1;
    var assSupported = ASS_CODECS.indexOf(codec) !== -1;
    var supported = textSupported || assSupported;
    var external = externalTrack(track);
    return {
      supported: supported,
      editorSupported: supported,
      kind: textSupported ? (external ? 'external-text' : 'embedded-text') :
        (assSupported ? (external ? 'external-ass' : 'embedded-ass') : 'unsupported'),
      codec: codec
    };
  }

  function editorCapabilities(track, options) {
    var values = options || {};
    var classification = classify(track);
    var tracks = values.tracks || [];
    var local = classification.supported && values.local === true;
    var text = classification.kind === 'external-text' || classification.kind === 'embedded-text';
    var hasText = false;
    var hasAss = false;
    var index;
    var candidate;
    for (index = 0; index < tracks.length; index += 1) {
      candidate = classify(tracks[index]);
      if (candidate.kind === 'external-text' || candidate.kind === 'embedded-text') { hasText = true; }
      if (candidate.kind === 'external-ass' || candidate.kind === 'embedded-ass') { hasAss = true; }
    }
    return {
      supported: classification.supported,
      local: local,
      track: true,
      size: local,
      background: local && text,
      edge: local && text,
      offset: classification.supported,
      loop: classification.supported,
      timeline: classification.supported,
      renderSrt: hasText,
      renderAss: hasAss
    };
  }

  function trackById(tracks, id) {
    var index;
    for (index = 0; index < (tracks || []).length; index += 1) {
      if (String(tracks[index].id || '') === String(id || '')) { return tracks[index]; }
    }
    return null;
  }

  function advancedEditorSupported(track) {
    return classify(track).editorSupported;
  }

  function availability(selectedId, tracks, failedIds) {
    var selected = trackById(tracks, selectedId);
    var index;
    var classification;
    if (selected) {
      classification = classify(selected);
      if (!classification.supported || classification.editorSupported === false || failedIds && failedIds[selected.id]) {
        return { enabled: false, reason: 'unsupported', track: selected };
      }
      return { enabled: true, reason: '', track: selected };
    }
    for (index = 0; index < (tracks || []).length; index += 1) {
      classification = classify(tracks[index]);
      if (classification.supported && classification.editorSupported !== false && !(failedIds && failedIds[tracks[index].id])) {
        return { enabled: true, reason: '', track: null };
      }
    }
    return { enabled: false, reason: 'unsupported', track: null };
  }

  function timestamp(value) {
    var normalized = String(value || '').replace(',', '.');
    var parts = normalized.split(':');
    var hours = 0;
    var minutes = 0;
    var seconds;
    if (parts.length === 3) {
      hours = Number(parts[0]);
      minutes = Number(parts[1]);
      seconds = Number(parts[2]);
    } else if (parts.length === 2) {
      minutes = Number(parts[0]);
      seconds = Number(parts[1]);
    } else {
      return NaN;
    }
    if (!isFinite(hours) || !isFinite(minutes) || !isFinite(seconds)) { return NaN; }
    return Math.round((hours * 3600 + minutes * 60 + seconds) * 1000);
  }

  var ASS_OVERRIDE_BLOCK = /\{\\[^}\r\n]*\}/g;

  function normalizeCueText(value) {
    var text = String(value || '').replace(/^\s+|\s+$/g, '');
    var overrideBlocks = text.match(ASS_OVERRIDE_BLOCK);
    var blockIndex;
    var alignmentMatches;
    var alignmentMatch;
    var result = { text: text.replace(ASS_OVERRIDE_BLOCK, '').replace(/^\s+|\s+$/g, '') };
    for (blockIndex = 0; blockIndex < (overrideBlocks || []).length; blockIndex += 1) {
      alignmentMatches = overrideBlocks[blockIndex].match(/\\an([1-9])/ig);
      if (alignmentMatches && alignmentMatches.length) {
        alignmentMatch = alignmentMatches[alignmentMatches.length - 1].match(/([1-9])$/);
        if (alignmentMatch) { result.alignment = Number(alignmentMatch[1]); }
      }
    }
    return result;
  }

  function parse(text) {
    var blocks = String(text || '').replace(/\r/g, '').split(/\n\s*\n/);
    var cues = [];
    blocks.forEach(function (block) {
      var lines = block.split('\n');
      var timingIndex = -1;
      var timing;
      var sides;
      var start;
      var end;
      var index;
      for (index = 0; index < lines.length; index += 1) {
        if (lines[index].indexOf('-->') !== -1) { timingIndex = index; break; }
      }
      if (timingIndex === -1) { return; }
      timing = lines[timingIndex];
      sides = timing.split('-->');
      if (sides.length !== 2) { return; }
      start = timestamp(sides[0].replace(/^\s+|\s+$/g, ''));
      end = timestamp(sides[1].replace(/^\s+|\s+$/g, '').split(/\s+/)[0]);
      if (!isFinite(start) || !isFinite(end) || start < 0 || end <= start) { return; }
      var normalized = normalizeCueText(lines.slice(timingIndex + 1).join('\n').replace(/^\s+|\s+$/g, ''));
      var cue = {
        start: start,
        end: end,
        text: normalized.text
      };
      if (normalized.alignment !== undefined) { cue.alignment = normalized.alignment; }
      cues.push(cue);
    });
    cues.sort(function (left, right) { return left.start - right.start; });
    return cues.filter(function (cue) { return !!cue.text; });
  }

  function shift(cues, offsetMs) {
    var offset = Number(offsetMs || 0);
    return (cues || []).map(function (cue) {
      var shifted = {
        start: cue.start + offset,
        end: cue.end + offset,
        text: cue.text
      };
      if (cue.alignment !== undefined) { shifted.alignment = cue.alignment; }
      return shifted;
    });
  }

  function active(cues, absoluteMs, offsetMs) {
    var time = Number(absoluteMs || 0);
    var offset = Number(offsetMs || 0);
    return (cues || []).filter(function (cue) {
      return time >= cue.start + offset && time < cue.end + offset;
    });
  }

  function loopBounds(positionSeconds, durationSeconds) {
    var duration = Math.max(0, Number(durationSeconds || 0));
    var end = Math.max(0, Number(positionSeconds || 0));
    if (duration > 0) { end = Math.min(duration, end); }
    return { start: Math.max(0, end - 5), end: end };
  }

  function adjust(offsetMs, deltaMs) {
    return Math.max(-600000, Math.min(600000, Math.round(Number(offsetMs || 0) + Number(deltaMs || 0))));
  }

  return {
    active: active,
    advancedEditorSupported: advancedEditorSupported,
    adjust: adjust,
    availability: availability,
    classify: classify,
    editorCapabilities: editorCapabilities,
    loopBounds: loopBounds,
    parse: parse,
    shift: shift,
    trackById: trackById
  };
}));
