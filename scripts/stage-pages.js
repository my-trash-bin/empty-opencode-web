'use strict';

const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const pin = require('../upstream.json');
const config = require('../pages.json');
const targetArgument = process.argv[2];

if (!targetArgument) throw new Error('Usage: node scripts/stage-pages.js PATH_TO_GH_PAGES_WORKTREE');
const source = path.join(root, 'dist', 'pages', 'v', pin.version);
const targetRoot = path.resolve(targetArgument);
const versionsRoot = path.join(targetRoot, 'v');
const target = path.join(versionsRoot, pin.version);

if (!fs.existsSync(path.join(source, 'index.html'))) throw new Error('Build the Pages artifact first with: just pages-build');
if (fs.existsSync(target)) throw new Error(`Refusing to overwrite published version ${pin.version}`);

const manifestPath = path.join(targetRoot, 'versions.json');
const manifest = fs.existsSync(manifestPath)
  ? JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
  : { default: config.defaultVersion, versions: [] };
if (!Array.isArray(manifest.versions)) throw new Error('Invalid versions.json in Pages worktree');
if (!manifest.versions.includes(pin.version)) manifest.versions.push(pin.version);
manifest.versions.sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
manifest.default = config.defaultVersion;
if (!manifest.versions.includes(manifest.default)) {
  throw new Error(`Default version ${manifest.default} has not been staged`);
}

fs.mkdirSync(versionsRoot, { recursive: true });
fs.cpSync(source, target, { recursive: true });
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
fs.writeFileSync(path.join(targetRoot, '.nojekyll'), '');

const redirect = `./v/${encodeURIComponent(manifest.default)}/`;
const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta http-equiv="refresh" content="0; url=${redirect}">
    <title>OpenCode Web</title>
    <script>location.replace(${JSON.stringify(redirect)} + location.search + location.hash)</script>
  </head>
  <body><a href="${redirect}">Open OpenCode Web ${manifest.default}</a></body>
</html>
`;
fs.writeFileSync(path.join(targetRoot, 'index.html'), html);
console.log(`Staged OpenCode Web ${pin.version} in ${target}`);
