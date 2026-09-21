'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const pin = require('../upstream.json');
const info = JSON.parse(fs.readFileSync(path.join(root, 'public', 'build-info.json'), 'utf8'));
if (info.commit !== pin.commit || info.version !== pin.version) throw new Error('Rebuild the UI before packaging.');
const name = 'empty-opencode-web-' + pin.version;
const output = path.join(root, 'dist', name);
if (path.dirname(output) !== path.join(root, 'dist')) throw new Error('Invalid release output path');
fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(output, { recursive: true });
// Use an allowlist so certificates, local configuration, and source caches never ship.
for (const file of ['server.js', 'package.json', 'upstream.json', 'config.example.json', 'README.md', 'LICENSE', 'CONTRIBUTING.md', 'THIRD_PARTY_NOTICES.md', 'docs', 'public']) {
  fs.cpSync(path.join(root, file), path.join(output, file), { recursive: true });
}
fs.mkdirSync(path.join(output, 'certs'), { recursive: true });
execFileSync('tar', ['-czf', name + '.tar.gz', name], { cwd: path.join(root, 'dist'), stdio: 'inherit' });
console.log('Release directory: ' + output);
