# Empty OpenCode Web

A portable local OpenCode Web launcher for Linux, macOS, Windows, and Android. Run with Node.js, or use the optional Docker stack.

UI and backend version: **1.18.31**, commit `014614d35b397775e5d397a490fc72368c894ec2`. No model, provider account, or web password is configured by this project. AI requests and terminals run on the OpenCode backend you connect to.

## Choose a mode

| Mode | Requirements | Commands run on |
| --- | --- | --- |
| Portable UI + remote backend | Node.js and portable bundle | Remote server |
| Portable UI + local backend | Node.js and OpenCode 1.18.31 | Your Linux/macOS/Windows host |
| Android (Termux recommended) | Termux, Node.js, portable bundle | Remote server |
| Docker | Docker Compose v2 and mkcert | OpenCode container |

The portable runtime has zero npm dependencies. Use a current Node.js LTS release. Runtime source also targets Node.js 10.15+ for legacy compatibility; build/test tools need Node.js 22 and Bun 1.3.14. Modern browser support is a separate requirement.

## Portable quick start

Download the `empty-opencode-web-portable` artifact from **Actions → Validate and package**, or use a maintainer-provided release archive. Extract to a writable directory. Unlike a source checkout, this bundle already contains `public/index.html` and all UI assets.

```sh
node server.js --http
```

Open <http://127.0.0.1:4096> and add your remote OpenCode server through the UI's server selector. Without a backend, the default local server is intentionally unavailable; this launcher does not simulate the OpenCode API. For HTTPS follow the next section. Add `--port 4097` if another service already uses 4096.

### HTTPS

Install [mkcert](https://github.com/FiloSottile/mkcert) on your desktop, then run from the extracted directory:

```sh
mkdir -p certs
mkcert -install
mkcert -cert-file certs/localhost.pem -key-file certs/localhost-key.pem localhost 127.0.0.1 ::1
node server.js
```

Open <https://localhost:4096> or <https://127.0.0.1:4096>. PEM paths must be files, not directories. Certificates and `config.json` are excluded from source control and packaging. Never distribute your CA private key.

### Optional backend proxy

Copy `config.example.json` to `config.json` and set `upstream`, or run:

```sh
node server.js --upstream https://your-opencode-server.example
```

The local UI origin now forwards API requests, streaming responses, and terminal WebSockets to that server. The proxy preserves browser Origin and authentication headers and validates upstream TLS certificates. Do not put credentials in the upstream URL. Configure authentication through OpenCode's normal connection flow.

For an upstream using a private CA, use `NODE_EXTRA_CA_CERTS=/path/to/rootCA.pem` when starting Node. Do not disable TLS validation. An upstream path prefix works only if its reverse proxy supports that prefix consistently.

### Local backend without Docker

On Linux or macOS, install the matching backend and start it from your intended working directory:

```sh
npm install -g opencode-ai@1.18.31
opencode serve --hostname 127.0.0.1 --port 4095 --cors https://localhost:4096 --cors https://127.0.0.1:4096
```

In another terminal:

```sh
node server.js --upstream http://127.0.0.1:4095
```

This uses OpenCode's normal host configuration and files; it is not isolated like Docker. A dedicated OS account can provide separate credentials and files. Android's portable mode does not require the native OpenCode executable.

## Android

Use maintained **Termux + Node.js LTS**. See [Android setup](docs/android.md) for installation, storage, certificates, background operation, and the legacy Dory fallback. Build on a desktop or CI; no compiler, npm install, or Bun is needed on the phone.

## CORS and remote connections

HTTPS does not change the target's CORS policy. The target OpenCode server must allow the browser's exact origin, including scheme and port. Example:

```sh
opencode serve --hostname 127.0.0.1 --port 4095 --cors https://localhost:4096 --cors https://127.0.0.1:4096
```

This also applies to proxy mode: terminal tickets validate Origin. For HTTP mode allow `http://127.0.0.1:4096`. A remote backend needs its own HTTPS and authentication. Direct browser connections from an HTTPS page to an HTTP remote server may be blocked as mixed content.

On Android, localhost means the phone. Use your remote machine's reachable HTTPS name for the backend. Match backend versions where possible; incompatible terminal APIs can produce blank panels.

## Configuration

`config.json` is optional. Its paths resolve relative to that file. CLI options override it.

| Setting | Default | Meaning |
| --- | --- | --- |
| host | 127.0.0.1 | Loopback only; localhost and ::1 also accepted |
| port | 4096 | Local listening port |
| https | true | Load PEM certificate and key |
| cert | certs/localhost.pem | Server certificate |
| key | certs/localhost-key.pem | Server private key |
| upstream | null | Optional backend HTTP(S) URL |

Options: `--http`, `--port NUMBER`, `--upstream URL`, `--config FILE`, `--help`. Stop with Ctrl+C. `/__launcher/health` reports launcher health; `/global/health` reports the proxied backend.

## Docker (optional)

From a source checkout, the Docker configuration runs independently of the portable launcher. It uses OpenCode 1.18.31 with its matching embedded UI and a Caddy TLS proxy. Install [Docker](https://docs.docker.com/engine/install/) and [mkcert](https://github.com/FiloSottile/mkcert), make sure Docker is running, then run the environment's one-click recipe from Git Bash (Windows) or a terminal (macOS/Linux):

```sh
just start
```

Running `just` without a recipe lists the available commands. `just start` and `just docker` are equivalent. Arguments after the recipe name are forwarded to the environment script, for example:

```sh
just docker --no-start
just docker --force-certs
just docker --project-name my-project
```

The current repository has a Docker environment script; Android and other environment-specific recipes can be added later using the same pattern. If `just` is unavailable, invoke that script directly:

```sh
sh scripts/setup-docker.sh
```

The script installs the mkcert local CA trust (an operating-system confirmation may appear), creates the localhost certificate, validates the Compose configuration, and builds and starts the `empty-opencode-web` project. It is safe to rerun and reuses existing certificate files. Use `--force-certs` to replace them, `--no-start` to only prepare and validate, or `--project-name NAME` to override the project name for that run.

Access <https://localhost:4096>. Only loopback HTTPS is published. Windows users should run the script in Git Bash; no Windows-specific script is required.

Common management commands are:

```sh
docker compose ps
docker compose logs -f opencode https
docker compose down
```

Workspace and OpenCode data persist in named volumes; host credentials are not mounted. `docker compose down -v` permanently deletes those volumes. This repository's `mise.toml` can install `just` and `mkcert` with `mise install`. When using mise without shell activation, run `mise exec -- just`; prefix direct Docker commands with `mise exec --` as needed.

## Build and package

For a source checkout, install Node.js 22+, Git, and Bun 1.3.14:

```sh
node scripts/build-ui.js
node --test test/server.test.js
node scripts/release.js
```

The build verifies the upstream commit and frozen lockfile, builds the official UI, and records provenance in `public/build-info.json`. Source maps are excluded. The runtime never fetches a newer UI from app.opencode.ai.

Packaging uses an allowlist and produces `dist/empty-opencode-web-1.18.31/` and a `.tar.gz`. GitHub Actions tests Linux/macOS/Windows and uploads a downloadable ZIP artifact. It does not publish a GitHub Release. See [Contributing](CONTRIBUTING.md).

See [Validation record](docs/validation.md) for completed checks and untested device combinations.

## Troubleshooting

- Blank terminal: check target logs for `/pty/.../connect-token`. HTML instead of JSON indicates incompatible UI/backend versions. Check allowed origins and WebSocket proxying too.
- Default server offline: set upstream or select a remote server. A UI-only launcher cannot create shells.
- Missing public directory: use a portable artifact or build the UI.
- TLS failure: check certificate files and browser trust.
- Port in use: select another port. This launcher never restarts another server.
- Android process stops: see the battery restrictions in the Android guide.

## Attribution

Independent launcher; not an official OpenCode distribution. See [Third-party notices](THIRD_PARTY_NOTICES.md), [OpenCode source](https://github.com/anomalyco/opencode/tree/v1.18.31), [mkcert](https://github.com/FiloSottile/mkcert), and [Caddy](https://caddyserver.com/docs/).
