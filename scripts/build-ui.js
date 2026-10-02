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
const entrySource = path.join(appDirectory, 'src', 'entry.tsx');
let originalApp;
let originalEntry;
try {
  const buildArgs = ['run', 'build'];
  originalEntry = fs.readFileSync(entrySource, 'utf8');
  let patchedEntry = originalEntry.replace(
    'const getDefaultUrl = () => {\n  const lsDefault = readDefaultServerUrl()\n  if (lsDefault) return lsDefault\n  return getCurrentUrl()\n}',
    `const getDefaultUrl = (hasLauncherBackend: boolean) => {
  const lsDefault = readDefaultServerUrl()
  if (lsDefault) return lsDefault
  if (hasLauncherBackend) return getCurrentUrl()
  // Keep the provider initialized while server.current remains empty.
  return "opencode://unconfigured"
}

// A portable/static build has no implicit API server. Only register the page
// origin when the launcher explicitly reports that its backend proxy is on.
const hasLauncherBackend = async () => {
  // Versioned Pages builds have no launcher endpoint. Avoid even a one-off
  // health request to the static host.
  if (import.meta.env.BASE_URL !== "/") return false
  try {
    const response = await fetch(new URL("/__launcher/health", location.origin), {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(2000),
    })
    if (!response.ok || !response.headers.get("content-type")?.includes("application/json")) return false
    const status = await response.json()
    return status?.healthy === true && status?.upstream === true
  } catch {
    return false
  }
}`,
  );
  patchedEntry = patchedEntry.replace(
    'void loadInitialLocale().then((locale) => {',
    'void Promise.all([loadInitialLocale(), hasLauncherBackend()]).then(([locale, launcherBackend]) => {',
  );
  patchedEntry = patchedEntry.replace(
    'defaultServer={ServerConnection.Key.make(getDefaultUrl())}\n              canonicalLocalServer={ServerConnection.key(server)}\n              servers={[server]}',
    'defaultServer={ServerConnection.Key.make(getDefaultUrl(launcherBackend))}\n              canonicalLocalServer={ServerConnection.key(server)}\n              servers={launcherBackend ? [server] : []}',
  );
  if (patchedEntry === originalEntry ||
      !patchedEntry.includes('servers={launcherBackend ? [server] : []}') ||
      !patchedEntry.includes('hasLauncherBackend()') ||
      !patchedEntry.includes('opencode://unconfigured')) {
    throw new Error('The pinned OpenCode entry point no longer matches the backend adapter.');
  }
  fs.writeFileSync(entrySource, patchedEntry);
  originalApp = fs.readFileSync(appSource, 'utf8');
  let patched = originalApp.replace(
    'import { DialogProvider } from "@opencode-ai/ui/context/dialog"',
    'import { DialogProvider, useDialog } from "@opencode-ai/ui/context/dialog"',
  );
  patched = patched.replace(
    'import { CommandProvider, useCommand, type CommandOption } from "@/context/command"',
    'import { CommandProvider, useCommand, type CommandOption } from "@/context/command"\nimport { DialogSelectServer } from "@/components/dialog-select-server"',
  );
  patched = patched.replace(
    'export function AppInterface(props: {',
    `function DisconnectedServer() {
  const dialog = useDialog()
  const language = useLanguage()
  return (
    <div class="h-full w-full flex items-center justify-center">
      <button
        type="button"
        class="px-4 py-2 rounded-md bg-surface-raised-base hover:bg-surface-raised-base-hover text-text-strong"
        onClick={() => dialog.show(() => <DialogSelectServer />)}
      >
        {language.t("dialog.server.add.button")}
      </button>
    </div>
  )
}

export function AppInterface(props: {`,
  );
  patched = patched.replace('<Show when={server.key} keyed>', '<Show when={server.current} keyed>');
  patched = patched.replace(
    '                          <Show when={useSettings().general.newLayoutDesigns()} fallback={routerProps.children}>\n                            <NewAppLayout serverScoped={props.serverScoped}>{routerProps.children}</NewAppLayout>\n                          </Show>',
    `                          <Show when={useServer().current} fallback={routerProps.children}>
                            <Show when={useSettings().general.newLayoutDesigns()} fallback={routerProps.children}>
                              <NewAppLayout serverScoped={props.serverScoped}>{routerProps.children}</NewAppLayout>
                            </Show>
                          </Show>`,
  );
  const routesStart = patched.indexOf('function Routes(');
  if (routesStart === -1) throw new Error('The pinned OpenCode routes were not found.');
  let routes = patched.slice(routesStart);
  routes = routes.replace(
    '  return (\n    <>',
    '  return (\n    <Show when={useServer().current} fallback={<Route path="*" component={DisconnectedServer} />}>\n      <>',
  );
  routes = routes.replace(
    '      <Route path="/new-session" component={DraftRoute} />\n    </>\n  )\n}\n\nfunction NewLayoutLegacySessionRedirect',
    '      <Route path="/new-session" component={DraftRoute} />\n      </>\n    </Show>\n  )\n}\n\nfunction NewLayoutLegacySessionRedirect',
  );
  patched = patched.slice(0, routesStart) + routes;
  if (patched === originalApp ||
      !patched.includes('component={DisconnectedServer}') ||
      !patched.includes('<DialogSelectServer />') ||
      !patched.includes('<Show when={server.current} keyed>')) {
    throw new Error('The pinned OpenCode app no longer matches the disconnected-server adapter: ' + JSON.stringify({
      changed: patched !== originalApp,
      fallback: patched.includes('component={DisconnectedServer}'),
      dialog: patched.includes('<DialogSelectServer />'),
      current: patched.includes('<Show when={server.current} keyed>'),
    }));
  }
  if (pagesBase) {
    patched = patched.replace('  Navigate,\n  Route,', '  HashRouter,\n  Navigate,\n  Route,');
    patched = patched.replace('component={props.router ?? Router}', 'component={props.router ?? HashRouter}');
    if (!patched.includes('component={props.router ?? HashRouter}')) {
      throw new Error('The pinned OpenCode router no longer matches the Pages adapter.');
    }
    buildArgs.push('--base=' + pagesBase);
  }
  fs.writeFileSync(appSource, patched);
  run('bun', buildArgs, appDirectory);
} finally {
  if (originalApp !== undefined) fs.writeFileSync(appSource, originalApp);
  if (originalEntry !== undefined) fs.writeFileSync(entrySource, originalEntry);
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
