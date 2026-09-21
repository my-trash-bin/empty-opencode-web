# Contributing

Use English for documentation and source comments. Keep the portable runtime free of npm dependencies and native modules.

## Validation

Use Node.js 22+ to run `node --test test/server.test.js`. Use Git and Bun 1.3.14 to build with `node scripts/build-ui.js`. Test on a spare port rather than stopping another local instance. Verify HTTPS, PTY ticket issuance, WebSocket shell input/output, and remote-server selection before releasing.

CI tests Linux, macOS, and Windows. Android needs a physical Termux/browser check; legacy runtime syntax checks are not device testing.

An optional real-backend check is available:

```sh
NODE_EXTRA_CA_CERTS=/path/to/rootCA.pem OPENCODE_TEST_UPSTREAM=https://localhost:4096 node --test test/live-backend.test.js
```

It starts a temporary HTTPS listener on an unused port and removes only its own test PTY. It requires the local mkcert files, built UI, and a backend with `/workspace`. `OPENCODE_TEST_ORIGIN` defaults to `https://localhost:4096`; set it to an origin the target already allows. It does not restart the backend.

## Update OpenCode

Update the exact version and commit in `upstream.json`. Match Dockerfile, build tooling, documentation, and workflow paths. Build from a fresh `.build/opencode` directory. Never replace pinned assets with a live upstream website. Validate token issuance as well as the WebSocket itself.

## Publish

Review Git changes before uploading. Never commit certificates, local configuration, caches, or backend data. Build the portable bundle, test it, and attach the archive to a GitHub Release if desired. CI only creates Actions artifacts; publishing is a separate maintainer action. Preserve upstream licenses in every bundle.
