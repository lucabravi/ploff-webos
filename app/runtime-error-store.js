(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) { module.exports = factory(); }
  else { root.PloffRuntimeErrorStore = factory(); }
}(this, function () {
  'use strict';

  var MAX_ERRORS = 12;
  var MAX_FIELD = 220;

  function text(value, diagnosticsState) {
    var result;
    try {
      result = diagnosticsState && typeof diagnosticsState.sanitizeText === 'function' ? diagnosticsState.sanitizeText(value) : String(value || '');
    } catch (error) {
      result = String(value || '');
    }
    result = result.replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, '[ip]');
    result = result.replace(/[\r\n]+/g, ' ');
    return result.length > MAX_FIELD ? result.slice(0, MAX_FIELD - 3) + '...' : result;
  }

  function number(value) {
    var result = Number(value || 0);
    return isFinite(result) && result >= 0 ? result : 0;
  }

  function create(options) {
    var values = options || {};
    var platformRoot = values.root || {};
    var diagnosticsState = values.DiagnosticsState;
    var errors = [];
    var destroyed = false;
    var listeners = [];

    function addListener(name, handler) {
      if (typeof platformRoot.addEventListener !== 'function') { return; }
      platformRoot.addEventListener(name, handler, false);
      listeners.push({ name: name, handler: handler });
    }

    function record(value, metadata) {
      var source = value && typeof value === 'object' ? value : {};
      var extra = metadata || {};
      var message = source.message || (value && typeof value !== 'object' ? value : '');
      var stack = source.stack || extra.stack || (source.error && source.error.stack) || '';
      var item;
      if (destroyed || (!message && !stack)) { return; }
      item = {
        type: text(source.type || extra.type || 'error', diagnosticsState),
        message: text(message, diagnosticsState),
        source: text(source.source || source.filename || extra.source, diagnosticsState),
        line: number(source.line || source.lineno || extra.line),
        column: number(source.column || source.colno || extra.column),
        stack: text(stack, diagnosticsState)
      };
      errors.push(item);
      while (errors.length > MAX_ERRORS) { errors.shift(); }
    }

    function handleError(event, source, line, column, error) {
      var item;
      if (event && typeof event === 'object') {
        if (!event.message && !event.error) { return false; }
        item = {
          type: 'error',
          message: event.message || (event.error && event.error.message),
          source: event.filename || event.source,
          line: event.lineno,
          column: event.colno,
          error: event.error,
          stack: event.error && event.error.stack
        };
      } else {
        item = { type: 'error', message: event, source: source, line: line, column: column, error: error, stack: error && error.stack };
      }
      record(item);
      return false;
    }

    function handleRejection(event) {
      var reason = event && event.reason;
      if (reason && typeof reason === 'object') {
        record({ type: 'unhandledrejection', message: reason.message || String(reason), stack: reason.stack });
      } else {
        record({ type: 'unhandledrejection', message: reason });
      }
      return false;
    }

    function snapshot() {
      return errors.map(function (item) {
        return {
          type: item.type,
          message: item.message,
          source: item.source,
          line: item.line,
          column: item.column,
          stack: item.stack
        };
      });
    }

    function destroy() {
      var index;
      if (destroyed) { return; }
      destroyed = true;
      if (typeof platformRoot.removeEventListener === 'function') {
        for (index = 0; index < listeners.length; index += 1) {
          platformRoot.removeEventListener(listeners[index].name, listeners[index].handler, false);
        }
      }
      listeners = [];
      errors = [];
    }

    addListener('error', handleError);
    addListener('unhandledrejection', handleRejection);

    return { record: record, snapshot: snapshot, destroy: destroy };
  }

  return { MAX_ERRORS: MAX_ERRORS, create: create };
}));
