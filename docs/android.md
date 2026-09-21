# Android setup

## Recommended: Termux

Install from a source listed in the [official Termux installation guide](https://github.com/termux/termux-app#installation), such as F-Droid or official GitHub releases. Follow its Android-version requirements. Keep Termux and its plugins from the same source because signing keys differ.

```sh
pkg update
pkg install nodejs-lts unzip
node --version
termux-setup-storage
```

Grant shared-storage access, download the portable ZIP artifact, and extract into Termux's private home directory:

```sh
mkdir -p ~/empty-opencode-web
unzip ~/storage/downloads/empty-opencode-web-portable.zip -d ~/empty-opencode-web
cd ~/empty-opencode-web
node server.js --http
```

If your archive has a top-level directory, enter it instead. Open <http://127.0.0.1:4096> in your Android browser and select the remote backend. Configure the target to allow this HTTP origin. No npm install is necessary. Termux maintains [nodejs-lts](https://github.com/termux/termux-packages/blob/master/packages/nodejs-lts/build.sh); recent versions package npm separately, but this launcher does not need it.

Do not copy desktop Linux Node or OpenCode executables to Android. Native executables and libraries are platform-specific. The portable UI runs on the phone; terminal shells run on the connected backend.

## HTTPS

1. On a trusted desktop, create localhost certificates with the README's mkcert commands.
2. Privately copy `localhost.pem` and `localhost-key.pem` into the phone's `~/empty-opencode-web/certs/` directory. Keep keys out of Git and public archives.
3. Find the public `rootCA.pem` in `mkcert -CAROOT`. Never transfer `rootCA-key.pem`.
4. Install that public CA through Android's **Install certificate / CA certificate** settings. Menu names vary; a copy named `rootCA.crt` may be required. Only install your own trusted CA.
5. Run `node server.js`, open <https://localhost:4096>, and confirm the browser trusts the certificate normally. Some browsers or managed devices reject user CAs; use an approved browser or explicit loopback HTTP mode instead.

Android's CA store is not necessarily Node's outbound trust store. For a private-CA upstream:

```sh
NODE_EXTRA_CA_CERTS=/absolute/path/to/rootCA.pem node server.js --upstream https://your-server.example
```

The localhost certificate identifies the phone's launcher, not the remote backend. Publicly trusted upstreams normally need no extra CA configuration.

Create the `certs` directory with `mkdir -p certs` if the archive extractor omitted the empty directory.

## Background operation

Keep the Termux session running. Android may stop background processes. Use `termux-wake-lock` while working and `termux-wake-unlock` afterward if needed, and review the official battery-optimization guidance. A wake lock does not override every manufacturer's process restrictions. Ctrl+C stops the launcher.

## Legacy Dory fallback

Dory is not the recommended path. Check its actual Node version; bundled runtimes can be obsolete. Runtime source targets Node.js 10.15+, but that does not make an end-of-life runtime secure or guarantee a specific Dory release works.

If the app supports that runtime or newer, copy the entire portable bundle, choose `server.js` as the entry point, and copy `config.example.json` to `config.json` with `https` set to `false` for initial testing. The app must permit local sockets and file access. Paths are based on script/config locations, not the launch working directory. HTTPS also requires readable PEM files and browser trust.

Termux plus a current Node.js LTS is the recommended path. Physical Android/Dory device testing is separate from the desktop automated suite; do not infer device certification from syntax compatibility.
