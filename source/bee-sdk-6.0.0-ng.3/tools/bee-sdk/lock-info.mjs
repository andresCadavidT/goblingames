#!/usr/bin/env node
// Provenance of patches/bee-sdk/Cargo.lock (upstream bee-engine commits none, so the dependency graph
// is OURS: resolved once by tools/bee-sdk/build.sh and then enforced with --locked).
//
//   node tools/bee-sdk/lock-info.mjs write <Cargo.lock> <LOCK-INFO.json> <cargo -V> <rustc -V> <wasm-bindgen pin> [resolvedAt ISO]
//
// LOCK-INFO.json records when/with what the lock was resolved, its sha256, the git dependencies that
// are NOT pinned by `rev` in upstream's Cargo.toml (branch / default branch: their SHA is whatever the
// branch HEAD was at resolvedAt) and `audited: false` until someone reviews the lock line by line.
import { createHash } from 'node:crypto';
import { readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const LOCK_NOTE =
  'Upstream gosh-sh/bee-engine commits no Cargo.lock: this lock was resolved by tools/bee-sdk/build.sh ' +
  '(cargo generate-lockfile = latest semver-compatible crates.io versions at resolvedAt, plus the branch-HEAD ' +
  'SHAs of git dependencies not pinned by rev), with the wasm-bindgen family pinned to the version of the npm ' +
  '6.0.0 build. It is NOT the (unknown) graph upstream used for @teamgosh/bee-sdk 6.0.0 and has NOT been ' +
  'audited line by line.';

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

/** Git sources in a Cargo.lock, classified by how upstream's manifests pin them. */
export function gitDeps(lockText) {
  const seen = new Map();
  for (const m of lockText.matchAll(/^source = "git\+([^"?#]+)(?:\?([^"#]*))?#([0-9a-f]+)"/gm)) {
    const [, url, query = '', sha] = m;
    const [kind, ref] = query ? query.split('=') : ['default-branch', 'HEAD'];
    const key = `${url}|${query}|${sha}`;
    if (!seen.has(key)) seen.set(key, { url, pin: kind, ref, sha });
  }
  const all = [...seen.values()].sort((a, b) => a.url.localeCompare(b.url));
  return {
    unpinned: all.filter((d) => d.pin === 'branch' || d.pin === 'default-branch'),
    byTag: all.filter((d) => d.pin === 'tag'),
    byRev: all.filter((d) => d.pin === 'rev'),
  };
}

export function makeLockInfo(lockBuf, { cargo, rustc, wasmBindgenPin, resolvedAt }) {
  return {
    cargoLockSha256: sha256(lockBuf),
    resolvedAt,
    resolvedWith: { cargo, rustc },
    wasmBindgenPin,
    audited: false,
    note: LOCK_NOTE,
    gitDeps: gitDeps(lockBuf.toString('utf8')),
  };
}

/** Reads LOCK-INFO.json and fails if it does not describe this exact Cargo.lock. */
export function readLockInfo(infoPath, lockBuf) {
  const info = JSON.parse(readFileSync(infoPath, 'utf8'));
  const actual = sha256(lockBuf);
  if (info.cargoLockSha256 !== actual) {
    throw new Error(`${infoPath} describes Cargo.lock ${info.cargoLockSha256}, but the lock is ${actual}: regenerate both`);
  }
  return info;
}

const isMain = (() => {
  try {
    return realpathSync(process.argv[1]).toLowerCase() === realpathSync(fileURLToPath(import.meta.url)).toLowerCase();
  } catch {
    return false;
  }
})();

if (isMain) {
  const [cmd, lockPath, outPath, cargo, rustc, wasmBindgenPin, resolvedAt] = process.argv.slice(2);
  if (cmd !== 'write' || !lockPath || !outPath || !cargo || !rustc || !wasmBindgenPin) {
    console.error('usage: node tools/bee-sdk/lock-info.mjs write <Cargo.lock> <LOCK-INFO.json> <cargo -V> <rustc -V> <wasm-bindgen pin> [resolvedAt]');
    process.exit(2);
  }
  const info = makeLockInfo(readFileSync(lockPath), {
    cargo,
    rustc,
    wasmBindgenPin,
    resolvedAt: resolvedAt || new Date().toISOString(),
  });
  writeFileSync(outPath, JSON.stringify(info, null, 2) + '\n');
  console.log(`wrote ${outPath} (${info.gitDeps.unpinned.length} unpinned git deps, audited: false)`);
}
