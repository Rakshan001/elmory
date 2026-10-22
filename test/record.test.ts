import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { base32 } from '../src/base32.js';
import {
  FORMAT_VERSION,
  RecordError,
  type ElmoryRecord,
  type Tag,
  isRecordId,
  lint,
  parse,
  recordId,
  serialize,
} from '../src/record.js';

const ID_A = 'f_' + 'a'.repeat(26);
const ID_B = 'f_' + 'b2'.repeat(13);

function fact(overrides: Partial<ElmoryRecord> = {}): ElmoryRecord {
  return {
    type: 'memory/fact',
    title: 'Auth tokens are checked in middleware',
    version: FORMAT_VERSION,
    recorded: '2026-10-21T10:02:00.123Z',
    observer: 'agent:claude-code',
    tag: 'convention',
    key: 'auth.check_location',
    supersedes: [ID_A],
    cites: [ID_B],
    sources: [
      {
        resource: 'src/auth/middleware.ts',
        quote: 'sha256:' + 'a9'.repeat(32),
        anchor: '9f3b1c2d7e01',
        tokens: 23,
        commit: '1a2b3c4',
      },
      { resource: 'src/legacy.ts', legacyFile: '0123456789ab' },
    ],
    legacyId: 'baton:42',
    imported: true,
    body: 'Every API request goes through `checkToken()` in the auth middleware.',
    ...overrides,
  };
}

function note(overrides: Partial<ElmoryRecord> = {}): ElmoryRecord {
  return {
    type: 'memory/note',
    title: 'Prefer small PRs',
    version: FORMAT_VERSION,
    recorded: '2026-10-21T11:00:00Z',
    observer: 'human:rakshan',
    supersedes: [],
    cites: [],
    sources: [],
    body: 'Keep pull requests under 400 lines.',
    ...overrides,
  };
}

describe('base32', () => {
  it('encodes RFC 4648 test vectors in lowercase without padding', () => {
    const enc = (s: string): string => base32(new TextEncoder().encode(s));
    expect(enc('')).toBe('');
    expect(enc('f')).toBe('my');
    expect(enc('fo')).toBe('mzxq');
    expect(enc('foo')).toBe('mzxw6');
    expect(enc('foob')).toBe('mzxw6yq');
    expect(enc('fooba')).toBe('mzxw6ytb');
    expect(enc('foobar')).toBe('mzxw6ytboi');
  });
});

describe('serialize / parse', () => {
  it('serialize then parse round-trips a fact', () => {
    const r = fact();
    const { record, readOnly } = parse(serialize(r));
    expect(readOnly).toBe(false);
    expect(record).toEqual(r);
  });

  it('serialize then parse round-trips a note', () => {
    const r = note();
    const { record, readOnly } = parse(serialize(r));
    expect(readOnly).toBe(false);
    expect(record).toEqual(r);
  });

  it('writes the canonical shape with keys in fixed order', () => {
    const text = serialize(fact());
    expect(text).toBe(
      [
        '---',
        'sources:',
        '  - resource: src/auth/middleware.ts',
        `    x-elmory-quote: "sha256:${'a9'.repeat(32)}"`,
        '    x-elmory-anchor: 9f3b1c2d7e01',
        '    x-elmory-tokens: 23',
        '    x-elmory-commit: 1a2b3c4',
        '  - resource: src/legacy.ts',
        '    x-elmory-legacy-file: 0123456789ab',
        'title: "Auth tokens are checked in middleware"',
        'type: memory/fact',
        'x-elmory: 1',
        `x-elmory-cites: [${ID_B}]`,
        'x-elmory-imported: true',
        'x-elmory-key: auth.check_location',
        'x-elmory-legacy-id: "baton:42"',
        'x-elmory-observer: "agent:claude-code"',
        'x-elmory-recorded: "2026-10-21T10:02:00.123Z"',
        `x-elmory-supersedes: [${ID_A}]`,
        'x-elmory-tag: convention',
        '---',
        'Every API request goes through `checkToken()` in the auth middleware.',
        '',
      ].join('\n'),
    );
    const n = serialize(note());
    expect(n).toContain('sources: []\n');
    expect(n).toContain('x-elmory-cites: []\n');
    expect(n).not.toContain('x-elmory-tag');
    expect(n).not.toContain('x-elmory-key');
  });

  it('round-trips awkward strings', () => {
    const r = note({
      title: `a: b #c "d" 'e'`,
      observer: ' leading space',
      key: 'k',
      body: 'line one   \r\nline two\t\r\n\r\n\r\n',
    });
    const text = serialize(r);
    expect(text).not.toContain('\r');
    const { record } = parse(text);
    expect(record.title).toBe(`a: b #c "d" 'e'`);
    expect(record.observer).toBe(' leading space');
    expect(record.body).toBe('line one\nline two');
    expect(text.endsWith('---\nline one\nline two\n')).toBe(true);
    // canonical text is a fixed point
    expect(serialize(record)).toBe(text);
  });

  it('round-trips list items that need quoting', () => {
    const r = note({ supersedes: ['a, b', 'c]d', ''] });
    expect(parse(serialize(r)).record.supersedes).toEqual(['a, b', 'c]d', '']);
  });

  it('accepts comment lines and any key order', () => {
    const text = [
      '---',
      '# a comment',
      'type: memory/note',
      'x-elmory: 1',
      '  # an indented comment',
      'title: hello',
      'x-elmory-observer: me',
      'x-elmory-recorded: "2026-10-21T11:00:00Z"',
      '---',
      'Body.',
      '',
    ].join('\n');
    const { record } = parse(text);
    expect(record.title).toBe('hello');
    expect(record.sources).toEqual([]);
    expect(record.supersedes).toEqual([]);
    expect(record.cites).toEqual([]);
    expect(record.body).toBe('Body.');
  });

  it('parse of version 2 is readOnly', () => {
    const text = serialize(note({ version: 2 })).replace('---\nsources', '---\nx-elmory-future: [1, 2]\nsources');
    const { record, readOnly } = parse(text);
    expect(readOnly).toBe(true);
    expect(record.version).toBe(2);
  });

  it('parse rejects a record whose frontmatter has an unknown key', () => {
    const text = serialize(note()).replace('---\nsources', '---\nx-elmory-bogus: 1\nsources');
    expect(() => parse(text)).toThrow(RecordError);
    try {
      parse(text);
    } catch (e) {
      expect((e as RecordError).reason).toBe('frontmatter');
    }
  });

  it('parse rejects malformed frontmatter', () => {
    const good = serialize(note());
    const bad = [
      'no frontmatter at all',
      good.replace('---\nsources', '---\ntitle: dup\nsources'), // duplicate key
      good.replace('title: "Prefer small PRs"', 'title: Prefer small PRs'),
      good.replace('title: "Prefer small PRs"', 'title: "unterminated'),
      good.replace('x-elmory: 1', 'x-elmory: one'),
      good.replace('sources: []', 'sources: [x'),
      good.replace(/\n---\n(?=Keep)/, '\n'),
    ];
    for (const t of bad) expect(() => parse(t), t).toThrow(RecordError);
  });

  it('parse rejects a source item with an unknown key', () => {
    const text = serialize(fact()).replace('    x-elmory-tokens: 23', '    x-elmory-tokens: 23\n    x-elmory-color: red');
    expect(() => parse(text)).toThrow(RecordError);
  });
});

describe('recordId', () => {
  it('recordId is stable and has the right shape', () => {
    const a = recordId(fact());
    const b = recordId(fact());
    expect(a).toBe(b);
    expect(isRecordId(a)).toBe(true);
    const expected = 'f_' + base32(createHash('sha256').update(serialize(fact()), 'utf8').digest()).slice(0, 26);
    expect(a).toBe(expected);
  });

  it('recordId changes when recorded changes', () => {
    expect(recordId(fact())).not.toBe(recordId(fact({ recorded: '2026-10-21T10:02:00.124Z' })));
  });

  it('isRecordId rejects other shapes', () => {
    expect(isRecordId(ID_A)).toBe(true);
    expect(isRecordId('f_' + 'a'.repeat(25))).toBe(false);
    expect(isRecordId('f_' + 'A'.repeat(26))).toBe(false);
    expect(isRecordId('f_' + '1'.repeat(26))).toBe(false);
    expect(isRecordId('../f_' + 'a'.repeat(26))).toBe(false);
  });
});

describe('lint', () => {
  it('passes clean records', () => {
    expect(lint(fact())).toEqual([]);
    expect(lint(note())).toEqual([]);
  });

  it('flags a body over 2000 chars', () => {
    expect(lint(note({ body: 'x'.repeat(2001) }))).toHaveLength(1);
    expect(lint(note({ body: 'x'.repeat(2000) }))).toEqual([]);
    expect(lint(note({ body: '' }))).toHaveLength(1);
  });

  it('flags a fact with no sources', () => {
    expect(lint(fact({ sources: [] }))).toHaveLength(1);
  });

  it('flags a note with a source', () => {
    expect(lint(note({ sources: [{ resource: 'a.ts', legacyFile: '0123456789ab' }] }))).toHaveLength(1);
  });

  it('flags a bad key', () => {
    expect(lint(note({ key: 'Bad Key' }))).toHaveLength(1);
  });

  it('flags a bad id in supersedes', () => {
    expect(lint(note({ supersedes: ['f_nope'] }))).toHaveLength(1);
    expect(lint(note({ cites: ['f_nope'] }))).toHaveLength(1);
  });

  it('flags .. and absolute paths in resource', () => {
    const src = (resource: string): ElmoryRecord =>
      fact({ sources: [{ resource, legacyFile: '0123456789ab' }] });
    expect(lint(src('../outside.ts'))).toHaveLength(1);
    expect(lint(src('src/../../x.ts'))).toHaveLength(1);
    expect(lint(src('/etc/passwd'))).toHaveLength(1);
    expect(lint(src('src/ok..name.ts'))).toEqual([]);
  });

  it('flags type, title, observer, recorded and tag', () => {
    expect(lint(note({ type: 'memory/other' as unknown as ElmoryRecord['type'] }))).not.toEqual([]);
    expect(lint(note({ title: '' }))).toHaveLength(1);
    expect(lint(note({ title: 'x'.repeat(201) }))).toHaveLength(1);
    expect(lint(note({ observer: '' }))).toHaveLength(1);
    expect(lint(note({ recorded: '2026-10-21T11:00:00+02:00' }))).toHaveLength(1);
    expect(lint(note({ recorded: 'yesterday' }))).toHaveLength(1);
    expect(lint(note({ tag: 'opinion' as unknown as Tag }))).toHaveLength(1);
  });
});

describe('review fixes', () => {
  it('escapes U+2028 and U+2029 so a lint-clean record always parses back', () => {
    const r = fact({
      title: 'a\u2028b',
      observer: 'x\u2029y',
      legacyId: 'l\u2028',
      supersedes: [],
      cites: [],
      sources: [
        { resource: 'src/a\u2029.ts', quote: 'sha256:00', anchor: '000000000000', tokens: 3, commit: 'c\u2028' },
      ],
    });
    expect(lint(r)).toEqual([]);
    const text = serialize(r);
    expect(text).not.toMatch(/[\u2028\u2029]/);
    expect(text).toContain('title: "a\\u2028b"');
    const back = parse(text).record;
    expect(back).toEqual(r);
    expect(serialize(back)).toBe(text);
    // a hand-written raw U+2028 inside a quoted value is accepted too
    expect(parse(text.replace('a\\u2028b', 'a\u2028b')).record.title).toBe('a\u2028b');
  });

  it('treats an undefined optional as absent and never writes "undefined"', () => {
    const plain = fact({ sources: [{ resource: 'a.ts', quote: 'sha256:00', anchor: 'ab', tokens: 3, commit: 'c1' }] });
    const withUndefined = {
      ...plain,
      tag: undefined,
      key: undefined,
      legacyId: undefined,
      imported: undefined,
      sources: [{ resource: 'a.ts', quote: 'sha256:00', anchor: 'ab', tokens: 3, commit: 'c1', legacyFile: undefined }],
    } as unknown as ElmoryRecord;
    const { tag: _t, key: _k, legacyId: _l, imported: _i, ...stripped } = plain;
    expect(serialize(withUndefined)).toBe(serialize(stripped as ElmoryRecord));
    expect(serialize(withUndefined)).not.toContain('undefined');
    expect(serialize(withUndefined)).toContain('x-elmory-quote: "sha256:00"');
  });

  it('lint flags a source missing the fields for its kind, and serialize refuses it', () => {
    const bare = fact({ sources: [{ resource: 'a.ts' } as unknown as ElmoryRecord['sources'][number]] });
    expect(lint(bare).length).toBeGreaterThan(0);
    expect(() => serialize(bare)).toThrow(RecordError);
    const emptyLegacy = fact({ sources: [{ resource: 'a.ts', legacyFile: '' }] });
    expect(lint(emptyLegacy)).toHaveLength(1);
  });

  it('a fact is a canonical fixed point and keeps its id through parse', () => {
    const text = serialize(fact());
    const back = parse(text).record;
    expect(serialize(back)).toBe(text);
    expect(recordId(back)).toBe(recordId(fact()));
  });
});
