'use strict';

const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const pin = require('../upstream.json');
const config = require('../pages.json');

if (!/^[A-Za-z0-9._-]+$/.test(config.repositoryPath)) throw new Error('Invalid pages.json repositoryPath');
if (!/^\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?$/.test(pin.version)) throw new Error('Invalid upstream version');

const relativeOutput = path.join('dist', 'pages', 'v', pin.version);
const env = {
  ...process.env,
  OPENCODE_WEB_PAGES_BASE: `/${config.repositoryPath}/v/${pin.version}/`,
  OPENCODE_WEB_OUTPUT: relativeOutput,
};

execFileSync(process.execPath, [path.join(__dirname, 'build-ui.js')], { cwd: root, env, stdio: 'inherit' });
console.log(`Pages artifact: ${path.join(root, relativeOutput)}`);
