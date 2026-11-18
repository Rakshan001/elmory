import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  anchorHash,
  buildAnchorMap,
  checkQuoteAtWrite,
  containsSecret,
  isPathShaped,
  isLongEnough,
  locate,
  quoteHash,
  tokenize,
} from '../src/quote.js';

const QUOTE = 'export function totalPrice(items: Item[], taxRate: number): number {';

function fileWith(...middle: string[]): string {
  return ['import { Item } from "./item";', '', ...middle, '', 'export const VERSION = 3;', ''].join('\n');
}

/** Write-checks `quoteText` against `before`, then locates it in `after`. */
function locateAfter(before: string, quoteText: string, after: string): string {
  const w = checkQuoteAtWrite(before, quoteText);
  if (!w.ok) throw new Error(`write refused: ${w.reason}`);
  return locate(buildAnchorMap(after), w);
}

describe('tokenize', () => {
  it('drops whitespace', () => {
    expect(tokenize('  const   x\t=\n  1 ;')).toEqual(['const', 'x', '=', '1', ';']);
  });

  it('splits word runs from single punctuation characters', () => {
    expect(tokenize('a.b_c(1)=>x')).toEqual(['a', '.', 'b_c', '(', '1', ')', '=', '>', 'x']);
  });

  it("tokenises 'a', \"a\" and `a` identically", () => {
    const expected = ['f', '(', '"', 'a', '"', ')'];
    expect(tokenize("f('a')")).toEqual(expected);
    expect(tokenize('f("a")')).toEqual(expected);
    expect(tokenize('f(`a`)')).toEqual(expected);
  });

  it('drops a trailing comma before ) in foo(a, b,)', () => {
    expect(tokenize('foo(a, b,)')).toEqual(tokenize('foo(a, b)'));
  });

  it('drops a trailing comma before ] in [1, 2,]', () => {
    expect(tokenize('[1, 2,]')).toEqual(tokenize('[1, 2]'));
  });

  it('drops a trailing comma before } across whitespace and newlines', () => {
    expect(tokenize('{ a: 1,\n  b: 2,\n}')).toEqual(tokenize('{ a: 1, b: 2 }'));
  });

  it('keeps a comma that is not before a closing bracket', () => {
    expect(tokenize('f(a, b)')).toContain(',');
  });

  it('returns no tokens for blank text', () => {
    expect(tokenize(' \n\t ')).toEqual([]);
  });

  it('keeps an emoji or other astral character as one token', () => {
    expect(tokenize('a😀b')).toEqual(['a', '😀', 'b']);
    expect(tokenize('𝑥 = 1')).toEqual(['𝑥', '=', '1']);
  });

  it('tells two different emoji apart in quote and anchor hashes', () => {
    const a = tokenize('const face = "😀";');
    const b = tokenize('const face = "😎";');
    expect(quoteHash(a)).not.toBe(quoteHash(b));
    expect(anchorHash(a)).not.toBe(anchorHash(b));
  });
});

describe('hashes', () => {
  it('quoteHash is sha256 of the tokens joined by U+001F', () => {
    const expected = 'sha256:' + createHash('sha256').update('a\u001fb', 'utf8').digest('hex');
    expect(quoteHash(['a', 'b'])).toBe(expected);
    expect(quoteHash(['a', 'b'])).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(quoteHash(['a', 'b'])).not.toBe(quoteHash(['ab']));
  });

  it('anchorHash is 12 hex chars and equal for the same first 8 tokens', () => {
    const a = anchorHash(tokenize('a b c d e f g h i j'));
    const b = anchorHash(tokenize('a b c d e f g h X Y Z'));
    expect(a).toMatch(/^[0-9a-f]{12}$/);
    expect(a).toBe(b);
    expect(anchorHash(tokenize('a b c d e f g X'))).not.toBe(a);
  });

  it('anchorHash is FNV-1a 64 masked to 53 bits, rendered as its low 48 bits', () => {
    // Published FNV-1a 64 vector: fnv1a64("a") = 0xaf63dc4c8601ec8c.
    expect(anchorHash(['a'])).toBe('dc4c8601ec8c');
  });

  it('anchorHash uses fewer tokens when the quote has fewer than 8', () => {
    expect(anchorHash(['x', 'y', 'z'])).toMatch(/^[0-9a-f]{12}$/);
    expect(anchorHash(['x', 'y', 'z'])).not.toBe(anchorHash(['x', 'y']));
  });
});

describe('isLongEnough', () => {
  it('accepts export const FACT_CAP = 500;', () => {
    expect(isLongEnough('export const FACT_CAP = 500;')).toBe(true);
  });

  it('rejects return x;', () => {
    expect(isLongEnough('return x;')).toBe(false);
  });

  it('accepts 16 short tokens', () => {
    expect(isLongEnough('a\nb\nc\nd\ne\nf\ng\nh\ni\nj\nk\nl\nm\nn\no\np')).toBe(true);
  });

  it('rejects 15 short tokens over several lines', () => {
    expect(isLongEnough('a\nb\nc\nd\ne\nf\ng\nh\ni\nj\nk\nl\nm\nn\no')).toBe(false);
  });

  it('rejects a one-liner with enough characters but fewer than 3 word tokens', () => {
    expect(isLongEnough('superLongIdentifierName_xyz();')).toBe(false);
  });
});

describe('containsSecret', () => {
  it('flags known key formats', () => {
    expect(containsSecret('key = AKIAABCDEFGHIJKLMNOP')).toBe(true);
    expect(containsSecret('t = ghp_' + 'a'.repeat(36))).toBe(true);
    expect(containsSecret('t = github_pat_' + 'A1_'.repeat(8))).toBe(true);
    expect(containsSecret('t = sk-' + 'x'.repeat(24))).toBe(true);
    expect(containsSecret('t = xoxb-1234567890-abc')).toBe(true);
    expect(containsSecret('-----BEGIN RSA PRIVATE KEY-----')).toBe(true);
    expect(containsSecret('k = AIza' + 'b'.repeat(35))).toBe(true);
  });

  it('does not take a kebab-case identifier ending in "sk-" for an sk- key', () => {
    expect(containsSecret('import { mount } from "./disk-management-utils-volume";')).toBe(false);
    expect(containsSecret('const id = task-runner-scheduler-queue-worker;')).toBe(false);
    expect(containsSecret('key: "sk-' + 'x'.repeat(24) + '"')).toBe(true);
  });

  it('flags a high-entropy string literal of 20+ characters', () => {
    expect(containsSecret('const k = "q8Zr2Lx9Vt4Bn7Mw1Ks5Jd3H";')).toBe(true);
  });

  it('does not flag a low-entropy or short literal', () => {
    expect(containsSecret('const msg = "Something went wrong while loading";')).toBe(false);
    expect(containsSecret('const k = "q8Zr2Lx9";')).toBe(false);
  });

  it('applies the entropy rule per whitespace-separated word, so prose is exempt', () => {
    expect(containsSecret('const s = "The quick brown fox jumps over the lazy dog";')).toBe(false);
    expect(containsSecret('const k = "aZ3kQ9xL2mW7pR4tV8bN1cF6hJ0dG5sY";')).toBe(true);
    expect(containsSecret('const k = "token ghp_' + 'a'.repeat(36) + '";')).toBe(true);
  });

  it('flags a prose literal with an embedded 32-char high-entropy word', () => {
    expect(containsSecret('log("token is aZ3kQ9xL2mW7pR4tV8bN1cF6hJ0dG5sY for now");')).toBe(true);
  });

  it('flags a JWT', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U';
    expect(containsSecret(`headers.set(auth, ${jwt});`)).toBe(true);
  });

  it('flags a Bearer or Basic credential', () => {
    expect(containsSecret('Authorization: Bearer abcdefghijklmnopqrstuvwx')).toBe(true);
    expect(containsSecret('Authorization: Basic dXNlcm5hbWU6cGFzc3dvcmQxMjM=')).toBe(true);
    expect(containsSecret('const scheme = Bearer;')).toBe(false);
  });

  it('does not flag apiKey: process.env.STRIPE_API_KEY,', () => {
    expect(containsSecret('apiKey: process.env.STRIPE_API_KEY,')).toBe(false);
  });

  it('lets a long file path in a literal through, but only a path-shaped one', () => {
    expect(containsSecret('see `src/components/dashboard/DataTableWrapper.tsx` for it')).toBe(false);
    expect(containsSecret('import x from "./web/src/features/settings/DesktopProjectPanel";')).toBe(false);
    expect(containsSecret('open `src/app/(dashboard)/admin/users/[id]/page.tsx`')).toBe(false);
    expect(isPathShaped('docs/superpowers/specs/2026-11-05-paired-benchmark-design.md')).toBe(true);
    // not paths: URL, credentials, a token cut into chunks by "/"
    expect(isPathShaped('https://example.com/src/quote.ts')).toBe(false);
    expect(isPathShaped('user@host/src/quote.ts')).toBe(false);
    expect(isPathShaped('wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY')).toBe(false);
    expect(isPathShaped('9f8e7d6c/5b4a3f2e/1d0c9b8a/7f6e5d4c')).toBe(false);
    expect(isPathShaped('aZ3kQ9xL/2mW7pR4t/V8bN1cF6/hJ0dG5sY')).toBe(false);
    expect(containsSecret('const u = "https://h.example.com/k3j9x2m4/p8q1w7e5/z6r0t2y4/b5n8v1c3";')).toBe(true);
    expect(containsSecret('const p = "aZ3kQ9xL/2mW7pR4t/V8bN1cF6/hJ0dG5sY";')).toBe(true);
  });

  it('sets aside a trailing :line[:col] and a leading @ before the path test', () => {
    expect(containsSecret('see `src/components/dashboard/DataTable.tsx:37` for it')).toBe(false);
    expect(containsSecret('see `src/components/dashboard/DataTable.tsx:37:12` for it')).toBe(false);
    expect(containsSecret('import { T } from "@/components/dashboard/DataTableWrapper";')).toBe(false);
    expect(isPathShaped('user@host/components/dashboard/DataTable')).toBe(false);
    expect(isPathShaped('host:8080/components/dashboard/DataTable')).toBe(false);
  });

  it('still flags secrets that are laid out like a path', () => {
    for (const w of [
      'keys/ab12cd/ef34gh/ij56kl/mn78op/qr90st',
      'x/ab.12.cd.34.ef.56.gh.78.ij.90.kl.12.mn',
      'admin/Welcome2024/Summer2025Winter',
      'secret/prod/db/CorrectHorseBatteryStaple2024',
      'lic/jlle-9362-wdag-1576-spwe-2655',
      'k/BMWTO-MTRJU-QPXHV-KDNSL-WZCGF',
      'keys/QZXVKJWPFHGTRMBNLCYD',
      'keys/qzxvkjwpfhgtrmbnlcydaeiu',
      'k3j9/x2m4/p8q1/w7e5/z6r0/t2y4',
      'vokuzare/mipolenu/tacifoda/buwegyxi',
    ]) {
      expect(isPathShaped(w), w).toBe(false);
      expect(containsSecret('const p = `' + w + '`;'), w).toBe(true);
    }
  });

  it('flags an AWS secret access key, Stripe live keys and npm tokens', () => {
    const aws = 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY';
    expect(containsSecret(`aws_secret_access_key = ${aws}`)).toBe(true);
    expect(containsSecret(`k = ${aws}`)).toBe(true);
    expect(containsSecret('const k = `' + aws + '`;')).toBe(true);
    expect(containsSecret('key: sk_live_' + 'a1B2'.repeat(6))).toBe(true);
    expect(containsSecret('key: rk_live_' + 'a1B2'.repeat(6))).toBe(true);
    expect(containsSecret('_authToken=npm_' + 'a1B2'.repeat(9))).toBe(true);
    expect(containsSecret('key: sk_test_' + 'a1B2'.repeat(6))).toBe(true);
    expect(containsSecret('WEBHOOK=whsec_' + 'a1B2'.repeat(8))).toBe(true);
    // plain mixed-case alphanumerics are not an AWS key just because "secret" is nearby
    expect(containsSecret('the secret is handleUserAuthenticationCallbackV2Wrapper1 here')).toBe(false);
    // a 40-char git SHA and a 40-char path run are not AWS keys, even beside the word secret
    expect(containsSecret('secret rotation landed in 3f2a9c1b4d5e6f708192a3b4c5d6e7f8091a2b3c')).toBe(false);
    expect(containsSecret('risk_live_dashboard_overview_panel_wrapper')).toBe(false);
  });
});

describe('checkQuoteAtWrite', () => {
  it('accepts a unique quote and returns its hashes and token count', () => {
    const text = fileWith(QUOTE, '  return 0;', '}');
    const tokens = tokenize(QUOTE);
    expect(checkQuoteAtWrite(text, QUOTE)).toEqual({
      ok: true,
      quote: quoteHash(tokens),
      anchor: anchorHash(tokens),
      tokens: tokens.length,
    });
  });

  it('refuses a quote that is too short', () => {
    expect(checkQuoteAtWrite('return x;', 'return x;')).toEqual({ ok: false, reason: 'too-short' });
  });

  it('refuses a duplicate line with count: 2', () => {
    const line = 'export const FACT_CAP = 500;';
    expect(checkQuoteAtWrite(fileWith(line, line), line)).toEqual({ ok: false, reason: 'not-unique', count: 2 });
  });

  it('refuses a missing quote', () => {
    expect(checkQuoteAtWrite(fileWith('const a = 1;'), QUOTE)).toEqual({ ok: false, reason: 'not-found' });
  });

  it('refuses const token = "ghp_..." as a secret', () => {
    const line = 'const token = "ghp_' + 'aB3dE5gH7jK9mN1pQ3rS5tU7vW9xY1zA3bC5' + '";';
    expect(checkQuoteAtWrite(fileWith(line), line)).toEqual({ ok: false, reason: 'secret' });
  });

  it('accepts apiKey: process.env.STRIPE_API_KEY,', () => {
    const line = 'apiKey: process.env.STRIPE_API_KEY,';
    const text = 'const stripe = new Stripe({\n  ' + line + '\n  timeout: 30,\n});\n';
    expect(checkQuoteAtWrite(text, line)).toMatchObject({ ok: true });
  });
});

describe('locate', () => {
  const before = fileWith(QUOTE, '  return items.reduce((s, i) => s + i.price, 0) * (1 + taxRate);', '}');

  it('finds the quote in the unchanged file', () => {
    expect(locateAfter(before, QUOTE, before)).toBe('found');
  });

  it('survives re-wrapped whitespace', () => {
    const after = before.replace(QUOTE, 'export function totalPrice(\n  items: Item[],\n  taxRate: number\n): number {');
    expect(locateAfter(before, QUOTE, after)).toBe('found');
  });

  it("survives Prettier turning single quotes into double quotes", () => {
    const q = "const DEFAULT_REGION = process.env.REGION ?? 'eu-west-1';";
    const b = fileWith(q);
    expect(locateAfter(b, q, b.replace("'eu-west-1'", '"eu-west-1"'))).toBe('found');
  });

  it('survives an added trailing comma', () => {
    const q = 'const total = computeTotal(items, taxRate, discount);';
    const b = fileWith(q);
    expect(locateAfter(b, q, b.replace('discount)', 'discount,\n)'))).toBe('found');
  });

  it('survives the quote moving to the end of the file', () => {
    const q = 'export const FACT_CAP = 500;';
    const b = fileWith(q, 'const other = 1;');
    const after = b.replace(q, '') + '\n' + q + '\n';
    expect(locateAfter(b, q, after)).toBe('found');
  });

  it('reports not-found after an identifier rename', () => {
    expect(locateAfter(before, QUOTE, before.replace('taxRate: number', 'vatRate: number'))).toBe('not-found');
  });

  it('reports not-found after a comment is inserted inside the quote', () => {
    const after = before.replace('taxRate: number)', 'taxRate: number /* percent */)');
    expect(locateAfter(before, QUOTE, after)).toBe('not-found');
  });

  it('reports not-unique after the line is duplicated', () => {
    const q = 'export const FACT_CAP = 500;';
    const b = fileWith(q);
    expect(locateAfter(b, q, b.replace(q, `${q}\n${q}`))).toBe('not-unique');
  });

  it('reports not-unique for a duplicated quote of 8+ tokens', () => {
    expect(locateAfter(before, QUOTE, before + '\n' + QUOTE + '\n')).toBe('not-unique');
  });

  it('reports not-found for an empty file', () => {
    expect(locateAfter(before, QUOTE, '')).toBe('not-found');
  });

  // A regression guard, not a benchmark. The measured time is logged; about 270 ms on an idle
  // dev machine. Every quote must be found in every run; the 5 s bound is checked only under
  // `npm run test:timing`, since a loaded machine can miss it with nothing wrong.
  it('5000 quotes over 200 files all locate (timing: under 5 s)', () => {
    const files: string[] = [];
    const quotes: { file: number; quote: string; anchor: string; tokens: number }[] = [];
    for (let f = 0; f < 200; f++) {
      const lines: string[] = [];
      for (let l = 0; l < 150; l++) {
        lines.push(`export const value_${f}_${l} = compute(input${l % 7}, "key-${l}", ${f * l});`);
      }
      files.push(lines.join('\n'));
      for (let k = 0; k < 25; k++) {
        const tokens = tokenize(lines[k * 6] ?? '');
        quotes.push({ file: f, quote: quoteHash(tokens), anchor: anchorHash(tokens), tokens: tokens.length });
      }
    }

    const start = performance.now();
    const results: string[] = [];
    for (let f = 0; f < files.length; f++) {
      const map = buildAnchorMap(files[f] ?? '');
      for (const q of quotes) if (q.file === f) results.push(locate(map, q));
    }
    const elapsed = performance.now() - start;

    expect(results).toHaveLength(5000);
    expect(results.every((r) => r === 'found')).toBe(true);
    console.log(`timing: 5000 quotes over 200 files located in ${elapsed.toFixed(0)} ms`);
    if (process.env.ELMORY_TIMING === '1') expect(elapsed).toBeLessThan(5000);
  });
});
