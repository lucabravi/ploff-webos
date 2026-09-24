'use strict';

/* global window */

var userAgent = 'Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/53.0.2785.34 Safari/537.36 WebAppManager';

function strictMode() {
  return process.env.PLOFF_E2E_STRICT_CHROME53 !== '0';
}

function install(context, options) {
  var values = options || {};
  var strict = values.strict === undefined ? strictMode() : values.strict === true;
  return context.addInitScript(function (profile) {
    var disabled = [];

    function disable(name) {
      var current;
      if (!profile.strict || typeof window[name] === 'undefined') { return; }
      current = window[name];
      try {
        window[name] = undefined;
        if (typeof window[name] !== 'undefined') {
          Object.defineProperty(window, name, { configurable: true, value: undefined });
        }
        if (typeof window[name] === 'undefined') { disabled.push(name); }
      } catch (_error) {
        try {
          Object.defineProperty(window, name, { configurable: true, value: undefined });
          if (typeof window[name] === 'undefined') { disabled.push(name); }
        } catch (_defineError) {
          window[name] = current;
        }
      }
    }

    /* Chrome 53 has no WebAssembly, ResizeObserver, or OffscreenCanvas. Keep
     * fetch/Promise/URLSearchParams intact: those APIs already exist there and
     * removing them would test a browser older than the target. */
    disable('WebAssembly');
    disable('ResizeObserver');
    disable('OffscreenCanvas');
    window.__PLOFF_E2E_PROFILE__ = {
      name: 'chrome53-compatible',
      strict: profile.strict,
      disabledApis: disabled,
      userAgent: navigator.userAgent,
      startedAt: Date.now()
    };
  }, { strict: strict });
}

module.exports = {
  install: install,
  strictMode: strictMode,
  userAgent: userAgent
};
