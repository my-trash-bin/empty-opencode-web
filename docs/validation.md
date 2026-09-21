# Validation record

Prepared on 2026-09-21 for OpenCode Web 1.18.31.

## Completed locally

- Built the official UI from commit `014614d35b397775e5d397a490fc72368c894ec2` with Bun 1.3.14 and the frozen upstream lockfile.
- Passed automated runtime tests on Windows Node.js 24 and Linux Node.js 22: SPA routing, asset MIME types, missing/private paths, API forwarding, streaming, WebSocket upgrade/data forwarding, and configuration validation.
- Passed the opt-in integration test through a temporary portable HTTPS proxy connected to the existing OpenCode 1.18.31 backend: HTML and JavaScript delivery, JSON PTY ticket issuance, and actual shell output over WebSocket.
- Kept the existing Docker services running without restart during this work.

## Not yet verified on physical devices

- macOS execution is covered by the prepared CI matrix but was not run on a Mac during local development.
- Android/Termux and legacy Dory were not exercised on a physical phone. Termux instructions use its official maintained Node.js package; legacy syntax compatibility is not a device support guarantee.
- Browser UI interaction was not automated during this work; validation focused on server behavior, built assets, and the actual terminal API flow.

Before publishing a release, run the CI matrix and verify remote-server selection and terminal rendering in the target browsers.
