// The package version, shared by both front ends so `elmory --version` and the MCP handshake agree.

import fs from 'node:fs';

/** The version in the package.json next to dist/, or 'unknown' when it cannot be read. */
export function packageVersion(): string {
  try {
    const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version?: unknown };
    return typeof pkg.version === 'string' ? pkg.version : 'unknown';
  } catch {
    return 'unknown';
  }
}
