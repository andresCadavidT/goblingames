# Source code of the Bee Engine SDK `6.0.0-ng.3` bundled in goblingames

goblingames for Windows ships a WebAssembly build of the official Acki Nacki **Bee Engine** SDK
(`bee_sdk`), version `6.0.0-ng.3`. Bee Engine is free software under the **GNU Affero General Public
License v3** ([LICENSE.md](LICENSE.md), [NOTICE.md](NOTICE.md)). This folder is the Corresponding Source of
that build: every goblingames release that bundles it links here, and a release that bundles another build
gets its own folder next to this one.

| What | Where |
|---|---|
| Upstream source | [gosh-sh/bee-engine](https://github.com/gosh-sh/bee-engine), tag `v6.0.0`, commit `015bc466613e7b7c41f272dc16ba0cacbf0e4d93` |
| Our changes to it | [`patches/bee-sdk/*.patch`](patches/bee-sdk/), applied in file-name order |
| The dependency graph used | [`patches/bee-sdk/Cargo.lock`](patches/bee-sdk/Cargo.lock) and its provenance, [`LOCK-INFO.json`](patches/bee-sdk/LOCK-INFO.json) |
| The build scripts | [`tools/bee-sdk/`](tools/bee-sdk/) |
| What the app bundles | [`BUILD-INFO.json`](BUILD-INFO.json): upstream commit, the sha256 of each patch and of `Cargo.lock` |

## Rebuild it

Requirements: `git`, `node`, Rust with `rustup` and the `wasm32-unknown-unknown` target, and `wasm-pack`
(on Windows, run it from Git Bash).

```bash
git clone https://github.com/andresCadavidT/goblingames.git
cd goblingames/source/bee-sdk-6.0.0-ng.3
bash tools/bee-sdk/build.sh
```

The script clones bee-engine at the commit above into `.build/`, checks and applies the patches, builds
`bee_sdk` with `wasm-pack build --target web --release -- --locked` and writes the package to
`packages/bee-sdk/` (`bee_sdk.js`, `bee_sdk_bg.wasm`, its typings and a fresh `BUILD-INFO.json`).
`bash tools/bee-sdk/build.sh --no-patches` builds plain upstream for comparison.

The patches must stay byte-exact (their sha256 is checked); the site repository's `.gitattributes` keeps
`source/` out of line-ending conversion.
