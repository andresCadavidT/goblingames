// Leak gate for the self-built bee-sdk (library; the CLI is scan-paths-cli.mjs, which always runs):
// fails if a build artifact still carries a machine path or the builder's user name (rustc embeds
// panic locations / debug paths; --remap-path-prefix must strip them). Replaces upstream's
// `leak_check` (scripts/build_wasm.sh), which relies on `strings` and silently passes on Git for
// Windows (research doc §F.2).
import { readFileSync } from 'node:fs';
import { homedir, userInfo } from 'node:os';
import { basename } from 'node:path';

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Patterns that must never appear in a published artifact (case-insensitive). */
export function defaultPatterns({ home = homedir(), user = safeUser() } = {}) {
  const pats = [
    { name: 'windows-users-dir', re: /[a-z]:(?:\\\\|\\|\/)users(?:\\\\|\\|\/)/gi },
    { name: 'mac-users-dir', re: /\/Users\/[^/\0]/g },
  ];
  if (user && user.length >= 3) {
    // Whole token only: the BIP39 wordlists compiled into the SDK contain e.g. 'andrea' (Italian),
    // which is not a leak; a path segment or a bare name is.
    pats.push({ name: `user-name(${user})`, re: new RegExp(`(?<![a-z0-9])${escape(user)}(?![a-z0-9])`, 'gi') });
    pats.push({ name: `unix-home(${user})`, re: new RegExp(`/home/${escape(user)}`, 'gi') });
  }
  if (home && home.length >= 4) {
    // Both separator styles: rustc on Windows may print either.
    for (const v of new Set([home, home.replaceAll('\\', '/'), home.replaceAll('/', '\\')])) {
      pats.push({ name: 'home-dir', re: new RegExp(escape(v), 'gi') });
    }
  }
  return pats;
}

function safeUser() {
  try {
    return userInfo().username;
  } catch {
    return process.env.USERNAME || process.env.USER || '';
  }
}

/**
 * Text views of the raw bytes, each with a char-index -> byte-offset map:
 * latin1 (1 char per byte: UTF-8/ASCII strings) and UTF-16LE at both byte alignments
 * (e.g. `C\0:\0\\\0U\0s\0e\0r\0s\0` from wide-char Windows APIs).
 */
function views(buf) {
  const b = Buffer.from(buf);
  return [
    { enc: 'latin1', text: b.toString('latin1'), byte: (i) => i },
    { enc: 'utf16le', text: b.toString('utf16le'), byte: (i) => 2 * i },
    // Copy before decoding: Node 24.19 kills the process (exit 127, no output) when decoding a large
    // odd-length UTF-16LE view at an odd byte offset, e.g. a 33642-byte .d.ts.
    { enc: 'utf16le+1', text: Buffer.from(b.subarray(1)).toString('utf16le'), byte: (i) => 2 * i + 1 },
  ];
}

/** Scans raw bytes in every view; `offset` is a byte offset into `buf`. */
export function scanBuffer(buf, patterns) {
  const hits = [];
  for (const { enc, text, byte } of views(buf)) {
    for (const { name, re } of patterns) {
      const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
      for (const m of text.matchAll(g)) {
        const from = Math.max(0, m.index - 40);
        const ctx = text.slice(from, m.index + m[0].length + 60).replace(/[^\x20-\x7e]/g, '.');
        hits.push({ pattern: name, encoding: enc, offset: byte(m.index), match: m[0], context: ctx });
      }
    }
  }
  return hits.sort((a, b) => a.offset - b.offset);
}

/** CLI body. Exit 0 = clean (and the last stdout line is `scan-paths: OK <n> files`), 1 = leaks, 2 = usage. */
export function main(argv, { log = console.log, err = console.error } = {}) {
  const files = [];
  const extra = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--forbid') {
      const v = argv[++i];
      if (!v) return usage(err);
      extra.push({ name: `forbid(${v})`, re: new RegExp(escape(v), 'gi') });
    } else if (argv[i].startsWith('-')) {
      return usage(err);
    } else files.push(argv[i]);
  }
  if (files.length === 0) return usage(err);
  const patterns = [...defaultPatterns(), ...extra];
  let total = 0;
  for (const f of files) {
    const hits = scanBuffer(readFileSync(f), patterns);
    total += hits.length;
    if (hits.length === 0) {
      log(`OK: no machine paths in ${basename(f)}`);
      continue;
    }
    err(`LEAK: ${hits.length} hit(s) in ${f}`);
    for (const h of hits.slice(0, 20)) err(`  @${h.offset} [${h.pattern}/${h.encoding}] ${h.context}`);
  }
  if (total > 0) {
    err(`scan-paths: LEAK ${total} hit(s) in ${files.length} files`);
    return 1;
  }
  // build.sh requires this exact line: a scan that silently did not run cannot pass the gate.
  log(`scan-paths: OK ${files.length} files`);
  return 0;
}

function usage(err) {
  err('usage: node tools/bee-sdk/scan-paths-cli.mjs [--forbid <text>]... <file>...');
  return 2;
}
