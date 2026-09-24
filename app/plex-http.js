(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PloffPlexHttp = factory();
  }
}(this, function () {
  'use strict';

  function errorFrom(value, status, transportFailure) {
    var error = typeof value === 'function' ? value(status) : new Error(String(value || 'Plex request failed'));
    if (!error || typeof error !== 'object') { error = new Error(String(error || 'Plex request failed')); }
    if (status !== undefined && status !== null) { error.status = Number(status); }
    error.transportFailure = transportFailure === true;
    return error;
  }

  function transportError(error) {
    var value = error && typeof error === 'object' ? error : new Error(String(error || 'Plex request failed'));
    value.transportFailure = true;
    return value;
  }

  function request(rootObject, options, callback) {
    var root = rootObject || {};
    var values = options || {};
    var xhr;
    var nativeAbort;
    var finished = false;
    var header;
    var defer = root.setTimeout || setTimeout;

    function releaseHandlers() {
      if (!xhr) { return; }
      xhr.onreadystatechange = null;
      xhr.onerror = null;
      xhr.ontimeout = null;
    }

    function closeRequest() {
      releaseHandlers();
      xhr = null;
      nativeAbort = null;
    }

    function finish(error, text) {
      var response;
      if (finished) { return; }
      finished = true;
      response = xhr;
      closeRequest();
      callback(error || null, text || '', response);
    }

    try {
      xhr = new root.XMLHttpRequest();
      nativeAbort = xhr.abort;
      xhr.open(values.method || 'GET', values.url || '', true);
      xhr.timeout = Number(values.timeout || 0);
      for (header in (values.headers || {})) {
        if (Object.prototype.hasOwnProperty.call(values.headers, header) && xhr.setRequestHeader) {
          xhr.setRequestHeader(header, values.headers[header]);
        }
      }
      xhr.onreadystatechange = function () {
        if (!xhr || xhr.readyState !== 4) { return; }
        if (xhr.status >= 200 && xhr.status < 300) { finish(null, xhr.responseText); }
        else { finish(errorFrom(values.statusError, xhr.status, xhr.status === 0)); }
      };
      xhr.onerror = function () { finish(errorFrom(values.networkError, null, true)); };
      xhr.ontimeout = function () { finish(errorFrom(values.timeoutError, null, true)); };
      xhr.send(values.body === undefined ? null : values.body);
    } catch (error) {
      defer(function () { finish(transportError(error)); }, 0);
    }

    return {
      abort: function () {
        if (finished) { return; }
        finished = true;
        try {
          if (nativeAbort) { nativeAbort.call(xhr); }
        } finally { closeRequest(); }
      }
    };
  }

  return { request: request };
}));
