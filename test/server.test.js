'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const { createServer, readConfig } = require('../server');

async function fixture(t, upstream) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'opencode-launcher-test-'));
  fs.writeFileSync(path.join(dir, 'index.html'), '<html>pinned UI</html>');
  fs.mkdirSync(path.join(dir, 'assets'));
  fs.writeFileSync(path.join(dir, 'assets', 'test.wasm'), Buffer.from([0, 97, 115, 109]));
  const server = createServer({ https: false, upstream }, dir);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.shutdown(); fs.rmSync(dir, { recursive: true, force: true }); });
  return 'http://127.0.0.1:' + server.address().port;
}

test('serves SPA deep links and WASM, rejects missing assets and private paths', async t => {
  const base = await fixture(t);
  assert.match(await (await fetch(base + '/server/example/session/test')).text(), /pinned UI/);
  const wasm = await fetch(base + '/assets/test.wasm');
  assert.equal(wasm.headers.get('content-type'), 'application/wasm');
  assert.equal((await fetch(base + '/assets/missing.js')).status, 404);
  assert.equal((await fetch(base + '/.git/config')).status, 403);
  assert.equal((await fetch(base + '/%5c..%5cconfig.json')).status, 403);
  assert.equal((await fetch(base + '/', { method: 'POST' })).status, 405);
  assert.equal((await fetch(base + '/', { method: 'HEAD' })).headers.get('content-length'), '22');
});

test('does not report an absent backend as healthy', async t => {
  const base = await fixture(t);
  assert.equal((await fetch(base + '/global/health')).status, 503);
  assert.equal((await (await fetch(base + '/__launcher/health')).json()).healthy, true);
});

test('proxies API bodies, Origin, status and streaming responses', async t => {
  const backend = http.createServer((req, res) => {
    if (req.url === '/event') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      res.write('data: first\n\n');
      const timer = setTimeout(() => res.end('data: second\n\n'), 300);
      res.on('close', () => clearTimeout(timer));
      return;
    }
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => { res.writeHead(201, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ body, origin: req.headers.origin, url: req.url })); });
  });
  await new Promise(resolve => backend.listen(0, '127.0.0.1', resolve));
  t.after(() => { backend.closeAllConnections(); backend.close(); });
  const base = await fixture(t, 'http://127.0.0.1:' + backend.address().port);
  const response = await fetch(base + '/pty?directory=%2Fworkspace', { method: 'POST', headers: { Origin: base }, body: '{"title":"test"}' });
  assert.equal(response.status, 201);
  assert.deepEqual(await response.json(), { body: '{"title":"test"}', origin: base, url: '/pty?directory=%2Fworkspace' });
  const events = await fetch(base + '/event');
  const reader = events.body.getReader();
  assert.equal(new TextDecoder().decode((await reader.read()).value), 'data: first\n\n');
  await reader.cancel();
});

test('forwards WebSocket upgrades, ticket query and bidirectional data', async t => {
  const backend = http.createServer();
  const peers = new Set();
  backend.on('upgrade', (req, socket, head) => {
    peers.add(socket);
    socket.on('close', () => peers.delete(socket));
    assert.equal(req.url, '/pty/pty_test/connect?ticket=test-ticket');
    assert.equal(req.headers.origin, 'https://localhost:4096');
    const accept = crypto.createHash('sha1').update(req.headers['sec-websocket-key'] + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
    socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + accept + '\r\n\r\n');
    // Raw tunnel bytes verify forwarding independently of a WebSocket library.
    if (head.length) socket.write(head);
    socket.on('data', data => socket.write(data));
  });
  await new Promise(resolve => backend.listen(0, '127.0.0.1', resolve));
  t.after(() => { peers.forEach(socket => socket.destroy()); backend.close(); });
  const base = await fixture(t, 'http://127.0.0.1:' + backend.address().port);
  await new Promise((resolve, reject) => {
    const req = http.request(base + '/pty/pty_test/connect?ticket=test-ticket', { headers: {
      Connection: 'Upgrade', Upgrade: 'websocket', Origin: 'https://localhost:4096',
      'Sec-WebSocket-Key': crypto.randomBytes(16).toString('base64'), 'Sec-WebSocket-Version': '13'
    } });
    const timer = setTimeout(() => { req.destroy(); reject(new Error('Upgrade timed out')); }, 3000);
    req.on('error', reject);
    req.on('upgrade', (res, socket) => {
      assert.equal(res.statusCode, 101);
      socket.once('data', chunk => { clearTimeout(timer); assert.equal(chunk.toString(), 'terminal-probe'); socket.destroy(); resolve(); });
      socket.write('terminal-probe');
    });
    req.end();
  });
});

test('configuration rejects public bindings, invalid ports and unknown options', t => {
  assert.throws(() => readConfig(['--port', '0']), /port/);
  assert.throws(() => readConfig(['--unexpected']), /Unknown/);
  assert.throws(() => readConfig(['--config', 'does-not-exist.json']), /not found/);
  assert.equal(readConfig(['--http', '--port', '4097']).https, false);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'opencode-config-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'config.json');
  fs.writeFileSync(file, JSON.stringify({ host: '0.0.0.0' }));
  assert.throws(() => readConfig(['--config', file]), /loopback/);
  fs.writeFileSync(file, JSON.stringify({ cert: 'local.pem' }));
  assert.equal(readConfig(['--config', file]).cert, path.join(dir, 'local.pem'));
});
