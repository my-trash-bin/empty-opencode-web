'use strict';

// Opt-in integration test. Creates and deletes only its own temporary PTY.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const https = require('node:https');
const crypto = require('node:crypto');
const path = require('node:path');
const { createServer } = require('../server');

test('portable HTTPS proxy supports real OpenCode tickets and terminal output', {
  skip: !process.env.OPENCODE_TEST_UPSTREAM,
  timeout: 30000
}, async t => {
  const origin = process.env.OPENCODE_TEST_ORIGIN || 'https://localhost:4096';
  const server = createServer({ https: true,
    cert: path.resolve(__dirname, '../certs/localhost.pem'),
    key: path.resolve(__dirname, '../certs/localhost-key.pem'),
    upstream: process.env.OPENCODE_TEST_UPSTREAM });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = 'https://127.0.0.1:' + server.address().port;
  let pty;
  t.after(async () => {
    try { if (pty) await fetch(base + '/pty/' + pty.id + '?directory=/workspace', { method: 'DELETE' }); }
    finally { server.shutdown(); }
  });
  const page = await fetch(base);
  assert.equal(page.status, 200);
  const html = await page.text();
  const script = html.match(/src="([^"]+\.js)"/);
  assert.ok(script, 'UI must include a JavaScript entry asset');
  assert.equal((await fetch(new URL(script[1], base))).status, 200);
  const created = await fetch(base + '/pty?directory=/workspace', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin },
    body: JSON.stringify({ title: 'portable-launcher-integration-test' })
  });
  assert.equal(created.status, 200);
  pty = await created.json();
  const response = await fetch(base + '/pty/' + pty.id + '/connect-token?directory=/workspace', {
    method: 'POST', headers: { Origin: origin, 'x-opencode-ticket': '1' }
  });
  assert.equal(response.status, 200);
  const ticket = await response.json();
  assert.ok(ticket.ticket);
  await new Promise((resolve, reject) => {
    const req = https.request(base + '/pty/' + pty.id + '/connect?directory=/workspace&ticket=' + encodeURIComponent(ticket.ticket), {
      headers: { Origin: origin, Connection: 'Upgrade', Upgrade: 'websocket',
        'Sec-WebSocket-Version': '13', 'Sec-WebSocket-Key': crypto.randomBytes(16).toString('base64') }
    });
    const timer = setTimeout(() => { req.destroy(); reject(new Error('Terminal output timed out')); }, 15000);
    req.on('error', err => { clearTimeout(timer); reject(err); });
    req.on('response', res => { clearTimeout(timer); res.resume(); reject(new Error('Upgrade rejected: ' + res.statusCode)); });
    req.on('upgrade', (res, socket, head) => {
      let pending = Buffer.alloc(0);
      let output = '';
      function receive(chunk) {
        pending = Buffer.concat([pending, chunk]);
        while (pending.length >= 2) {
          let length = pending[1] & 127;
          let offset = 2;
          if (length === 126) { if (pending.length < 4) return; length = pending.readUInt16BE(2); offset = 4; }
          if (length === 127) { if (pending.length < 10) return; length = Number(pending.readBigUInt64BE(2)); offset = 10; }
          if (pending.length < offset + length) return;
          const opcode = pending[0] & 15;
          if (opcode === 1 || opcode === 2 || opcode === 0) output += pending.subarray(offset, offset + length).toString('utf8');
          pending = pending.subarray(offset + length);
          if (output.includes('portable-verified')) { clearTimeout(timer); socket.destroy(); resolve(); return; }
        }
      }
      socket.on('error', err => { clearTimeout(timer); reject(err); });
      socket.on('data', receive);
      if (head.length) receive(head);
      const payload = Buffer.from("printf 'portable-%s\\n' 'verified'\n");
      const mask = crypto.randomBytes(4);
      const frame = Buffer.alloc(6 + payload.length);
      frame[0] = 0x81;
      frame[1] = 0x80 | payload.length;
      mask.copy(frame, 2);
      for (let i = 0; i < payload.length; i++) frame[i + 6] = payload[i] ^ mask[i % 4];
      socket.write(frame);
    });
    req.end();
  });
});
