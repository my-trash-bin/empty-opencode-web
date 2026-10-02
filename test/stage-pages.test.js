'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { stagePages } = require('../scripts/stage-pages');

test('staging replaces the selected version and preserves other versions', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'opencode-pages-test-'));
  const source = path.join(dir, 'source');
  const target = path.join(dir, 'target');
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  fs.mkdirSync(source, { recursive: true });
  fs.writeFileSync(path.join(source, 'index.html'), 'new build');
  fs.mkdirSync(path.join(target, 'v', '1.18.31'), { recursive: true });
  fs.writeFileSync(path.join(target, 'v', '1.18.31', 'stale.js'), 'stale');
  fs.mkdirSync(path.join(target, 'v', '1.17.0'), { recursive: true });
  fs.writeFileSync(path.join(target, 'v', '1.17.0', 'index.html'), 'older build');
  fs.writeFileSync(path.join(target, 'versions.json'), JSON.stringify({ default: '1.18.31', versions: ['1.18.31', '1.17.0'] }));

  stagePages(source, target, '1.18.31', '1.18.31');

  assert.equal(fs.readFileSync(path.join(target, 'v', '1.18.31', 'index.html'), 'utf8'), 'new build');
  assert.equal(fs.existsSync(path.join(target, 'v', '1.18.31', 'stale.js')), false);
  assert.equal(fs.readFileSync(path.join(target, 'v', '1.17.0', 'index.html'), 'utf8'), 'older build');
});
