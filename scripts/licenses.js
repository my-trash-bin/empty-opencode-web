'use strict';
const fs = require('node:fs');
const path = require('node:path');
module.exports = function collectLicenses(source, output) {
const notices = [];
const seen = new Set();
function licenses(modules, physicalOnly) {
  if (!fs.existsSync(modules)) return;
  for (const item of fs.readdirSync(modules, { withFileTypes: true })) {
    const name = item.name;
    if (name.startsWith('.')) continue;
    if (physicalOnly && !item.isDirectory()) continue;
    const entry = path.join(modules, name);
    if (name.startsWith('@')) { licenses(entry, physicalOnly); continue; }
    const real = fs.realpathSync(entry);
    if (seen.has(real)) continue;
    seen.add(real);
    const manifest = path.join(real, 'package.json');
    if (!fs.existsSync(manifest)) continue;
    const pkg = JSON.parse(fs.readFileSync(manifest, 'utf8'));
    const files = fs.readdirSync(real).filter(file => /^(license|licence|copying|notice)(\.|$)/i.test(file));
    notices.push('\n=== ' + pkg.name + '@' + pkg.version + ' (' + JSON.stringify(pkg.license || 'see package source') + ') ===\n');
    for (const file of files) if (fs.statSync(path.join(real, file)).isFile()) notices.push(fs.readFileSync(path.join(real, file), 'utf8'));
    if (!physicalOnly) licenses(path.join(real, 'node_modules'));
  }
}
const store = path.join(source, 'node_modules', '.bun');
if (fs.existsSync(store)) {
  // Every installed package has one physical directory in Bun's isolated store.
  // Skip dependency symlinks to avoid repeatedly walking the same graph.
  for (const entry of fs.readdirSync(store)) licenses(path.join(store, entry, 'node_modules'), true);
} else licenses(path.join(source, 'node_modules'));
fs.writeFileSync(path.join(output, 'THIRD-PARTY-LICENSES.txt'), notices.join('\n'));
};
