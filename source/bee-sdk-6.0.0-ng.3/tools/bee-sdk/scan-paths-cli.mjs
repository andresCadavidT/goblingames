#!/usr/bin/env node
// CLI for the bee-sdk leak gate (logic in scan-paths.mjs). It runs unconditionally: no
// "am I the main module?" check that a junction, symlink or drive-letter case could defeat.
// Usage: node tools/bee-sdk/scan-paths-cli.mjs [--forbid <text>]... <file>...
import { main } from './scan-paths.mjs';

process.exitCode = main(process.argv.slice(2));
