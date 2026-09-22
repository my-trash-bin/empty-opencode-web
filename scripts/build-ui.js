'use strict';

// Build tools run on a development machine; they are not required in Dory.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const pin = require('../upstream.json');
const source = path.join(root, '.build', 'opencode');
const pagesBase = process.env.OPENCODE_WEB_PAGES_BASE;
const output = process.env.OPENCODE_WEB_OUTPUT ? path.resolve(root, process.env.OPENCODE_WEB_OUTPUT) : path.join(root, 'public');
function run(command, args, cwd) {
  return execFileSync(command, args, { cwd: cwd || root, stdio: 'inherit', env: { ...process.env, OPENCODE_CHANNEL: 'latest', HUSKY: '0' } });
}
if (execFileSync('bun', ['--version'], { encoding: 'utf8' }).trim() !== pin.bun) throw new Error('Use Bun ' + pin.bun);
fs.mkdirSync(path.dirname(source), { recursive: true });
if (!fs.existsSync(source)) run('git', ['clone', '--depth', '1', '--branch', 'v' + pin.version, pin.repository, source]);
const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: source, encoding: 'utf8' }).trim();
if (commit !== pin.commit) throw new Error('Unexpected upstream commit. Move .build/opencode aside before rebuilding.');
if (pagesBase && (!/^\/[A-Za-z0-9._~/-]+\/$/.test(pagesBase) || pagesBase.includes('//') || pagesBase.includes('/../'))) {
  throw new Error('OPENCODE_WEB_PAGES_BASE must be an absolute, normalized URL path ending in /.');
}
// The frontend does not need backend PTY, tree-sitter, Electron, or Git hooks.
run('bun', ['install', '--frozen-lockfile', '--ignore-scripts'], source);
const appDirectory = path.join(source, 'packages', 'app');
const appSource = path.join(appDirectory, 'src', 'app.tsx');
let originalApp;
try {
  const buildArgs = ['run', 'build'];
  if (pagesBase) {
    originalApp = fs.readFileSync(appSource, 'utf8');
    let patched = originalApp.replace('  Navigate,\n  Route,', '  HashRouter,\n  Navigate,\n  Route,');
    patched = patched.replace('component={props.router ?? Router}', 'component={props.router ?? HashRouter}');
    if (patched === originalApp || !patched.includes('component={props.router ?? HashRouter}')) {
      throw new Error('The pinned OpenCode router no longer matches the Pages adapter.');
    }
    fs.writeFileSync(appSource, patched);
    buildArgs.push('--base=' + pagesBase);
  }
  run('bun', buildArgs, appDirectory);
} finally {
  if (originalApp !== undefined) fs.writeFileSync(appSource, originalApp);
}
fs.rmSync(output, { recursive: true, force: true });
fs.cpSync(path.join(source, 'packages', 'app', 'dist'), output, { recursive: true, filter: file => !file.endsWith('.map') });
if (pagesBase) {
  const indexPath = path.join(output, 'index.html');
  const index = fs.readFileSync(indexPath, 'utf8').replaceAll('content="/', `content="${pagesBase}`);
  fs.writeFileSync(indexPath, index);

  const manifestPath = path.join(output, 'site.webmanifest');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  manifest.id = pagesBase;
  manifest.start_url = pagesBase;
  manifest.scope = pagesBase;
  for (const icon of manifest.icons || []) {
    if (typeof icon.src === 'string' && icon.src.startsWith('/')) icon.src = pagesBase + icon.src.slice(1);
  }
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
}
fs.copyFileSync(path.join(source, 'LICENSE'), path.join(output, 'OPENCODE-LICENSE.txt'));
require('./licenses')(source, output);
const info = pagesBase ? { ...pin, pagesBase, router: 'hash' } : pin;
fs.writeFileSync(path.join(output, 'build-info.json'), JSON.stringify(info, null, 2) + '\n');
console.log('Built OpenCode Web ' + pin.version + ' at ' + pin.commit);
