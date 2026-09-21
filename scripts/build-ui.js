'use strict';

// Build tools run on a development machine; they are not required in Dory.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const pin = require('../upstream.json');
const source = path.join(root, '.build', 'opencode');
function run(command, args, cwd) {
  return execFileSync(command, args, { cwd: cwd || root, stdio: 'inherit', env: { ...process.env, OPENCODE_CHANNEL: 'latest', HUSKY: '0' } });
}
if (execFileSync('bun', ['--version'], { encoding: 'utf8' }).trim() !== pin.bun) throw new Error('Use Bun ' + pin.bun);
fs.mkdirSync(path.dirname(source), { recursive: true });
if (!fs.existsSync(source)) run('git', ['clone', '--depth', '1', '--branch', 'v' + pin.version, pin.repository, source]);
const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: source, encoding: 'utf8' }).trim();
if (commit !== pin.commit) throw new Error('Unexpected upstream commit. Move .build/opencode aside before rebuilding.');
// The frontend does not need backend PTY, tree-sitter, Electron, or Git hooks.
run('bun', ['install', '--frozen-lockfile', '--ignore-scripts'], source);
run('bun', ['run', 'build'], path.join(source, 'packages', 'app'));
const output = path.join(root, 'public');
fs.rmSync(output, { recursive: true, force: true });
fs.cpSync(path.join(source, 'packages', 'app', 'dist'), output, { recursive: true, filter: file => !file.endsWith('.map') });
fs.copyFileSync(path.join(source, 'LICENSE'), path.join(output, 'OPENCODE-LICENSE.txt'));
require('./licenses')(source, output);
fs.writeFileSync(path.join(output, 'build-info.json'), JSON.stringify(pin, null, 2) + '\n');
console.log('Built OpenCode Web ' + pin.version + ' at ' + pin.commit);
