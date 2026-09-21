'use strict';

// Keep the runtime dependency-free and compatible with older Dory Node.js builds.
var fs = require('fs');
var path = require('path');
var http = require('http');
var https = require('https');
var URL = require('url').URL;
var root = __dirname;
var mime = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json',
  '.wasm': 'application/wasm', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2',
  '.ttf': 'font/ttf', '.mp3': 'audio/mpeg', '.wav': 'audio/wav',
  '.webmanifest': 'application/manifest+json'
};
var api = /^\/(global|pty|session|project|provider|config|auth|event|path|file|find|vcs|command|agent|skill|mcp|lsp|formatter|permission|question|experimental|instance|log|doc|tui|worktree|workspace|account|tool)(\/|$)/;

function readConfig(args) {
  var configFile = path.join(root, 'config.json');
  var overrides = {};
  for (var i = 0; i < args.length; i++) {
    var arg = args[i];
    if (arg === '--http') overrides.https = false;
    else if (arg === '--config' || arg === '--port' || arg === '--upstream') {
      if (!args[i + 1]) throw new Error('Missing value for ' + arg);
      var value = args[++i];
      if (arg === '--config') configFile = path.resolve(value);
      else overrides[arg.slice(2)] = arg === '--port' ? Number(value) : value;
    } else throw new Error('Unknown option: ' + arg);
  }
  var config = { host: '127.0.0.1', port: 4096, https: true,
    cert: 'certs/localhost.pem', key: 'certs/localhost-key.pem', upstream: null };
  if (fs.existsSync(configFile)) Object.assign(config, JSON.parse(fs.readFileSync(configFile, 'utf8')));
  else if (args.indexOf('--config') !== -1) throw new Error('Config file not found: ' + configFile);
  Object.assign(config, overrides);
  if (['127.0.0.1', '::1', 'localhost'].indexOf(config.host) === -1) throw new Error('host must be a loopback address');
  if (!Number.isInteger(config.port) || config.port < 1 || config.port > 65535) throw new Error('port must be between 1 and 65535');
  if (typeof config.https !== 'boolean') throw new Error('https must be a boolean');
  config.cert = path.resolve(path.dirname(configFile), config.cert);
  config.key = path.resolve(path.dirname(configFile), config.key);
  return config;
}

function createServer(config, publicDir) {
  publicDir = fs.realpathSync(publicDir || path.join(root, 'public'));
  var upstream = config.upstream ? new URL(config.upstream) : null;
  if (upstream && (['http:', 'https:'].indexOf(upstream.protocol) === -1 || upstream.username || upstream.password || upstream.search || upstream.hash)) {
    throw new Error('upstream must be an HTTP(S) URL without credentials, query, or fragment');
  }
  var sockets = new Set();
  function track(socket) { sockets.add(socket); socket.on('close', function () { sockets.delete(socket); }); }
  function reply(res, status, message) {
    res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ error: message }));
  }
  function proxyOptions(req) {
    var headers = Object.assign({}, req.headers, {
      host: upstream.host,
      'x-forwarded-host': req.headers.host,
      'x-forwarded-proto': config.https ? 'https' : 'http'
    });
    delete headers['proxy-authorization'];
    delete headers['proxy-connection'];
    return { protocol: upstream.protocol, hostname: upstream.hostname.replace(/^\[|\]$/g, ''),
      port: upstream.port || (upstream.protocol === 'https:' ? 443 : 80),
      method: req.method, path: upstream.pathname.replace(/\/$/, '') + req.url, headers: headers };
  }
  function request(req, res) {
    var pathname;
    try { pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); }
    catch (_) { return reply(res, 400, 'Invalid URL'); }
    if (pathname === '/__launcher/health') {
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ healthy: true, version: require('./upstream.json').version, upstream: !!upstream }));
    }
    if (api.test(pathname)) {
      if (!upstream) return reply(res, 503, 'No backend configured. Connect a remote server in the UI or set upstream in config.json.');
      var outgoing = (upstream.protocol === 'https:' ? https : http).request(proxyOptions(req), function (incoming) {
        res.writeHead(incoming.statusCode, incoming.headers);
        incoming.pipe(res);
        incoming.on('error', function () { res.destroy(); });
      });
      outgoing.on('error', function () { if (!res.headersSent) reply(res, 502, 'Backend connection failed'); else res.destroy(); });
      req.on('aborted', function () { outgoing.destroy(); });
      res.on('close', function () { outgoing.destroy(); });
      req.pipe(outgoing);
      return;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') return reply(res, 405, 'Method not allowed');
    if (pathname.indexOf('\0') !== -1 || pathname.indexOf('\\') !== -1 || pathname.split('/').some(function (part) { return part.charAt(0) === '.'; })) return reply(res, 403, 'Forbidden path');
    var file = path.resolve(publicDir, '.' + pathname);
    if (file !== publicDir && file.indexOf(publicDir + path.sep) !== 0) return reply(res, 403, 'Forbidden path');
    try {
      if (!fs.statSync(file).isFile()) throw new Error('Not a file');
    } catch (_) {
      // Only navigation routes receive the SPA fallback; missing assets must fail.
      if (pathname.indexOf('/assets/') === 0 || path.extname(pathname)) return reply(res, 404, 'Asset not found');
      file = path.join(publicDir, 'index.html');
    }
    try {
      file = fs.realpathSync(file);
      if (file.indexOf(publicDir + path.sep) !== 0) return reply(res, 403, 'Forbidden path');
      var stat = fs.statSync(file);
      res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream',
        'Content-Length': stat.size, 'X-Content-Type-Options': 'nosniff',
        'Cache-Control': path.basename(file) === 'index.html' ? 'no-cache' : 'public, max-age=3600' });
      if (req.method === 'HEAD') return res.end();
      fs.createReadStream(file).on('error', function () { res.destroy(); }).pipe(res);
    } catch (_) { reply(res, 404, 'File not found'); }
  }
  var server = config.https ? https.createServer({ cert: fs.readFileSync(config.cert), key: fs.readFileSync(config.key) }, request) : http.createServer(request);
  server.on('connection', track);
  server.on('upgrade', function (req, socket, head) {
    if (!upstream || !/^\/pty\/[^/]+\/connect(?:\?|$)/.test(req.url)) {
      socket.end('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n');
      return;
    }
    var outgoing = (upstream.protocol === 'https:' ? https : http).request(proxyOptions(req));
    outgoing.on('upgrade', function (incoming, remote, remoteHead) {
      track(remote);
      var headers = 'HTTP/1.1 101 Switching Protocols\r\n';
      for (var i = 0; i < incoming.rawHeaders.length; i += 2) headers += incoming.rawHeaders[i] + ': ' + incoming.rawHeaders[i + 1] + '\r\n';
      socket.write(headers + '\r\n');
      if (remoteHead.length) socket.write(remoteHead);
      if (head.length) remote.write(head);
      remote.on('error', function () { socket.destroy(); });
      socket.on('error', function () { remote.destroy(); });
      remote.on('close', function () { socket.destroy(); });
      socket.on('close', function () { remote.destroy(); });
      socket.pipe(remote).pipe(socket);
    });
    outgoing.on('response', function (incoming) { socket.end('HTTP/1.1 ' + incoming.statusCode + ' Backend Rejected\r\nConnection: close\r\n\r\n'); incoming.resume(); });
    outgoing.on('error', function () { socket.destroy(); });
    socket.on('error', function () { outgoing.destroy(); });
    outgoing.end();
  });
  server.shutdown = function () { sockets.forEach(function (socket) { socket.destroy(); }); server.close(); };
  return server;
}

if (require.main === module) {
  if (process.argv.indexOf('--help') !== -1) {
    console.log('Usage: node server.js [--http] [--port 4096] [--upstream URL] [--config FILE]\nDefaults: HTTPS, loopback only, config.json. See README.md for certificates and Dory setup.');
  } else {
    try {
      var config = readConfig(process.argv.slice(2));
      var server = createServer(config);
      server.on('error', function (err) { console.error('Cannot start launcher: ' + err.message); process.exitCode = 1; });
      server.listen(config.port, config.host, function () {
        console.log('OpenCode Web ' + require('./upstream.json').version + ': ' + (config.https ? 'https' : 'http') + '://' + (config.host === '::1' ? '[::1]' : config.host) + ':' + config.port);
        console.log(config.upstream ? 'Backend proxy enabled.' : 'UI only: connect your OpenCode server in the browser.');
      });
      ['SIGINT', 'SIGTERM'].forEach(function (signal) { process.on(signal, function () { server.shutdown(); }); });
    } catch (err) { console.error('Cannot start launcher: ' + err.message + '\nUse a release bundle or build the UI first. For HTTPS, create the certificate files described in README.md.'); process.exitCode = 1; }
  }
}

module.exports = { createServer: createServer, readConfig: readConfig };
