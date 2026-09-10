'use strict';

// Only the browser transport is simulated; callers use the real Plex clients/parsers.
function create() {
  var requests = [];
  function XMLHttpRequest() {
    requests.push(this);
    this.headers = {};
    this.abortCount = 0;
  }
  XMLHttpRequest.prototype.open = function (method, url) { this.method = method; this.url = url; };
  XMLHttpRequest.prototype.setRequestHeader = function (name, value) { this.headers[name] = value; };
  XMLHttpRequest.prototype.send = function (body) { this.body = body; };
  XMLHttpRequest.prototype.abort = function () {
    this.abortCount += 1;
    this.readyState = 4;
    this.status = 0;
    if (this.onreadystatechange) { this.onreadystatechange(); }
  };
  function respond(index, body, status) {
    var xhr = requests[index];
    xhr.status = status === undefined ? 200 : status;
    xhr.responseText = body;
    xhr.readyState = 4;
    if (xhr.onreadystatechange) { xhr.onreadystatechange(); }
  }
  return { root: { XMLHttpRequest: XMLHttpRequest }, requests: requests, respond: respond };
}

module.exports = { create: create };
