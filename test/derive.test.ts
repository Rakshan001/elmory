import { describe, expect, it } from 'vitest';
import type { RecordRow } from '../src/cache.js';
import { Deriver, type DeriveInput, FORGET_UNTRUSTED, FORGET_UNVERIFIABLE } from '../src/derive.js';
import type { EvidenceDetail, EvidenceReport, Outcome } from '../src/evidence.js';
import type { AddedBy } from '../src/git.js';
import type { RecordType, Source } from '../src/record.js';
import type { Tombstone, Trust } from '../src/store.js';

interface RecOpts {
  supersedes?: string[];
  cites?: string[];
  key?: string | null;
  type?: RecordType;
  area?: RecordRow['area'];
  candidate?: string | null;
  title?: string;
  recorded?: string;
  sources?: Source[];
}

const QUOTE: Source = { resource: 'src/auth.ts', quote: 'sha256:aa', anchor: '9f3b1c2d7e01', tokens: 12, commit: 'abc1234' };

function rec(id: string, o: RecOpts = {}): RecordRow {
  const type = o.type ?? 'memory/fact';
  const sources = o.sources ?? (type === 'memory/fact' ? [QUOTE] : []);
  return {
    id,
    area: o.area ?? 'local',
    type,
    title: o.title ?? `title ${id}`,
    body: `body ${id}`,
    key: o.key ?? null,
    tag: null,
    observer: 'agent:test',
    recorded: o.recorded ?? '2026-10-21T10:02:00.123Z',
    supersedes: o.supersedes ?? [],
    cites: o.cites ?? [],
    sources,
    paths: sources.map((s) => s.resource),
    candidate: o.candidate ?? null,
    flagged: false,
    text: '',
  };
}

interface SetupOpts {
  tombstones?: Tombstone[];
  /** ids left out of `trust.written` */
  untrusted?: string[];
  trust?: Partial<Trust>;
  addedBy?: Map<string, AddedBy>;
  /** per-id evidence outcome: one for every source, or one per source; `holds` by default */
  outcomes?: Record<string, OutcomeSpec | OutcomeSpec[]>;
}

type OutcomeSpec = Outcome | { outcome: Outcome; detail: EvidenceDetail };

function report(set: OutcomeSpec, path: string): EvidenceReport {
  const { outcome, detail } = typeof set === 'string' ? { outcome: set, detail: set === 'holds' ? 'found' : 'not-found' } : set;
  return { outcome, detail, path } as EvidenceReport;
}

function setup(rows: RecordRow[], o: SetupOpts = {}): { d: Deriver; calls: string[] } {
  const untrusted = new Set(o.untrusted ?? []);
  const trust: Trust = {
    written: new Set(rows.map((r) => r.id).filter((id) => !untrusted.has(id))),
    approved: new Set(),
    rejected: new Set(),
    signers: new Set(),
    ...o.trust,
  };
  const calls: string[] = [];
  const evidence = async (row: RecordRow): Promise<EvidenceReport[]> => {
    calls.push(row.id);
    const set = o.outcomes?.[row.id] ?? 'holds';
    return row.sources.map((s, i) => report(Array.isArray(set) ? (set[i] ?? 'holds') : set, s.resource));
  };
  const input: DeriveInput = {
    records: new Map(rows.map((r) => [r.id, r])),
    tombstones: o.tombstones ?? [],
    trust,
    addedBy: o.addedBy ?? new Map(),
    evidence,
  };
  return { d: new Deriver(input), calls };
}

const NEWER_FAILS = 'a newer value exists but does not hold on this branch';
const UNREVIEWED = 'an unreviewed newer value exists';

describe('derive', () => {
  it('a lone trusted fact is active and head', async () => {
    const { d } = setup([rec('A', { key: 'k' })]);
    const s = await d.state('A');
    expect(s).toMatchObject({ id: 'A', state: 'active', reason: null, trusted: true, trustSource: 'written', head: true });
    expect(s.labels).toEqual(['evidence unchanged since 2026-10-21']);
    expect(s.evidence).toEqual([{ outcome: 'holds', detail: 'found', path: 'src/auth.ts' }]);
    expect(d.chainOf('A')).toEqual(['A']);
    expect(d.chainOf('k')).toEqual(['A']);
  });

  it('A then B then A: the third record is the only head and the first two are superseded', async () => {
    const { d } = setup([
      rec('R1', { key: 'k', title: 'A' }),
      rec('R2', { key: 'k', title: 'B', supersedes: ['R1'] }),
      rec('R3', { key: 'k', title: 'A', supersedes: ['R2'] }),
    ]);
    expect([...d.chainOf('k')].sort()).toEqual(['R1', 'R2', 'R3']);
    expect(d.heads(d.chainOf('k'))).toEqual(['R3']);
    const all = await d.all();
    expect(all.get('R1')?.state).toBe('superseded');
    expect(all.get('R2')?.state).toBe('superseded');
    expect(all.get('R3')).toMatchObject({ state: 'active', head: true });
  });

  it('caller time is ignored', async () => {
    const { d } = setup([
      rec('X', { recorded: '2026-10-21T10:00:00.000Z' }),
      rec('Y', { recorded: '2020-01-01T00:00:00.000Z', supersedes: ['X'] }),
    ]);
    expect(d.heads(d.chainOf('X'))).toEqual(['Y']);
    expect((await d.state('X')).state).toBe('superseded');
    expect((await d.state('Y')).state).toBe('active');
  });

  it('fork: two heads that hold are both conflict', async () => {
    const { d } = setup([rec('X'), rec('B', { supersedes: ['X'] }), rec('C', { supersedes: ['X'] })]);
    expect([...d.heads(d.chainOf('X'))].sort()).toEqual(['B', 'C']);
    expect((await d.state('B')).state).toBe('conflict');
    expect((await d.state('C')).state).toBe('conflict');
    expect((await d.state('X')).state).toBe('superseded');
  });

  it('resolve: a record superseding both heads leaves one head', async () => {
    const { d } = setup([
      rec('X'),
      rec('B', { supersedes: ['X'] }),
      rec('C', { supersedes: ['X'] }),
      rec('D', { supersedes: ['B', 'C'] }),
    ]);
    expect(d.heads(d.chainOf('X'))).toEqual(['D']);
    const all = await d.all();
    expect(all.get('D')?.state).toBe('active');
    expect(all.get('B')?.state).toBe('superseded');
    expect(all.get('C')?.state).toBe('superseded');
  });

  it('an untrusted superseder does not hide X; X is active with the unreviewed label', async () => {
    const { d } = setup([rec('X'), rec('Y', { area: 'facts', supersedes: ['X'] })], { untrusted: ['Y'] });
    const y = await d.state('Y');
    expect(y).toMatchObject({ state: 'candidate', reason: 'untrusted', trusted: false, trustSource: null });
    const x = await d.state('X');
    expect(x).toMatchObject({ state: 'active', head: true });
    expect(x.labels).toContain(UNREVIEWED);
  });

  it('an untrusted record superseding two unrelated heads does not merge their chains', async () => {
    const { d } = setup([rec('X', { key: 'x' }), rec('Y', { key: 'y' }), rec('U', { area: 'facts', supersedes: ['X', 'Y'] })], {
      untrusted: ['U'],
    });
    expect(d.chainOf('X')).toEqual(['X']);
    expect(d.chainOf('Y')).toEqual(['Y']);
    expect(d.chainOf('U')).toEqual(['U']);
    for (const id of ['X', 'Y']) {
      const s = await d.state(id);
      expect(s).toMatchObject({ state: 'active', head: true });
      expect(s.labels).toContain(UNREVIEWED);
    }
    expect((await d.state('U')).state).toBe('candidate');
  });

  it('forget B in A←B←C: C head, A superseded, B forgotten', async () => {
    const { d } = setup(
      [rec('A'), rec('B', { supersedes: ['A'] }), rec('C', { supersedes: ['B'] })],
      { tombstones: [{ id: 'B', supersedes: ['A'], committed: false }] },
    );
    expect(d.heads(d.chainOf('A'))).toEqual(['C']);
    expect((await d.state('A')).state).toBe('superseded');
    expect((await d.state('B')).state).toBe('forgotten');
    expect((await d.state('C'))).toMatchObject({ state: 'active', head: true });
  });

  it('forget the head: chain abstains, A stays superseded', async () => {
    // B's file is deleted by forget; only its tombstone remains as a chain node.
    const { d } = setup([rec('A', { key: 'k' })], { tombstones: [{ id: 'B', supersedes: ['A'], committed: false }] });
    expect([...d.chainOf('k')].sort()).toEqual(['A', 'B']);
    expect(d.heads(d.chainOf('k'))).toEqual(['B']);
    const a = await d.state('A');
    expect(a).toMatchObject({ state: 'superseded', head: false });
    expect((await d.state('B')).state).toBe('forgotten');
    const served = [...(await d.all()).values()].filter((s) => s.state === 'active' || s.state === 'conflict');
    expect(served).toEqual([]);
  });

  it('newer head does not hold here: older member served with the label', async () => {
    const { d } = setup([rec('A'), rec('B', { supersedes: ['A'] })], { outcomes: { B: 'stale' } });
    const b = await d.state('B');
    expect(b).toMatchObject({ state: 'stale', head: true });
    const a = await d.state('A');
    expect(a).toMatchObject({ state: 'active', head: false });
    expect(a.labels).toContain(NEWER_FAILS);
  });

  it('a held newer member further up the chain still supersedes the oldest', async () => {
    // A ← B ← C with B failing here but C holding: the newest member that holds is C.
    const { d } = setup([rec('A'), rec('B', { supersedes: ['A'] }), rec('C', { supersedes: ['B'] })], {
      outcomes: { B: 'suspect' },
    });
    expect((await d.state('C')).state).toBe('active');
    expect((await d.state('B')).state).toBe('superseded');
    expect((await d.state('A')).state).toBe('superseded');
  });

  it('a record that supersedes and cites the same id is suspect, and the older value is served', async () => {
    const { d } = setup([rec('Y'), rec('X', { supersedes: ['Y'], cites: ['Y'] })]);
    expect(await d.state('X')).toMatchObject({ state: 'suspect', reason: 'basis replaced', head: true });
    const y = await d.state('Y');
    expect(y).toMatchObject({ state: 'active', reason: null, head: false });
    expect(y.labels).toContain(NEWER_FAILS);
  });

  it('cites that evaluation never follows do not make a cycle', async () => {
    // T supersedes Y and cites U; U cites Y. Y is not a head, so U never waits on Y.
    for (const untrusted of [['U'], []]) {
      const { d } = setup(
        [rec('Y'), rec('T', { supersedes: ['Y'], cites: ['U'] }), rec('U', { area: 'facts', cites: ['Y'] })],
        { untrusted },
      );
      const y = await d.state('Y');
      expect(y).toMatchObject({ state: 'active', reason: null });
      expect(y.labels).toContain(NEWER_FAILS);
      expect((await d.state('T')).reason).not.toBe('cycle');
      expect((await d.state('U')).reason).not.toBe('cycle');
    }
    // An untrusted record's cites never change a trusted record's answer.
    const without = setup([rec('Y'), rec('T', { supersedes: ['Y'], cites: ['U'] }), rec('U', { area: 'facts' })], {
      untrusted: ['U'],
    });
    const withCite = setup(
      [rec('Y'), rec('T', { supersedes: ['Y'], cites: ['U'] }), rec('U', { area: 'facts', cites: ['Y'] })],
      { untrusted: ['U'] },
    );
    expect(await withCite.d.state('Y')).toEqual(await without.d.state('Y'));
    expect(await withCite.d.state('T')).toEqual(await without.d.state('T'));
  });

  it('citation pin: cited head replaced → suspect basis replaced; cited record forgotten → stale', async () => {
    const pinned = setup([rec('C', { title: 'the base' }), rec('X', { cites: ['C'] })]);
    const ok = await pinned.d.state('X');
    expect(ok.state).toBe('active');
    expect(ok.labels).toContain('builds on the base');

    const replaced = setup([rec('C'), rec('C2', { supersedes: ['C'] }), rec('X', { cites: ['C'] })]);
    expect(await replaced.d.state('X')).toMatchObject({ state: 'suspect', reason: 'basis replaced' });

    const gone = setup([rec('X', { cites: ['C'] })], { tombstones: [{ id: 'C', supersedes: [], committed: false }] });
    expect(await gone.d.state('X')).toMatchObject({ state: 'stale', reason: 'cited record gone' });

    const forgottenButPresent = setup([rec('C'), rec('X', { cites: ['C'] })], {
      tombstones: [{ id: 'C', supersedes: [], committed: false }],
    });
    expect(await forgottenButPresent.d.state('X')).toMatchObject({ state: 'stale', reason: 'cited record gone' });

    // Forgotten and also superseded: gone wins over basis replaced (stale before suspect).
    const forgottenAndReplaced = setup([rec('C'), rec('C2', { supersedes: ['C'] }), rec('X', { cites: ['C'] })], {
      tombstones: [{ id: 'C', supersedes: [], committed: false }],
    });
    expect(await forgottenAndReplaced.d.state('X')).toMatchObject({ state: 'stale', reason: 'cited record gone' });

    const failing = setup([rec('C'), rec('X', { cites: ['C'] })], { outcomes: { C: 'suspect' } });
    expect((await failing.d.state('X')).state).toBe('suspect');
  });

  it('cycle through cites is suspect', async () => {
    const rows = [rec('A', { cites: ['B'] }), rec('B', { cites: ['A'] }), rec('C', { cites: ['A'] })];
    const first = setup(rows);
    expect(await first.d.state('A')).toMatchObject({ state: 'suspect', reason: 'cycle' });
    expect(await first.d.state('B')).toMatchObject({ state: 'suspect', reason: 'cycle' });
    expect((await first.d.state('C')).state).toBe('suspect');
    // The answer must not depend on which member is asked first.
    const second = setup(rows);
    expect(await second.d.state('C')).toEqual(await first.d.state('C'));
    expect(await second.d.state('B')).toEqual(await first.d.state('B'));
  });

  it('a supersedes cycle has no head and every member is suspect', async () => {
    const { d } = setup([rec('A', { supersedes: ['B'] }), rec('B', { supersedes: ['A'] })]);
    expect(d.heads(d.chainOf('A'))).toEqual([]);
    expect(await d.state('A')).toMatchObject({ state: 'suspect', reason: 'cycle' });
    expect(await d.state('B')).toMatchObject({ state: 'suspect', reason: 'cycle' });
  });

  it('edited file (row.candidate=\'edited\') is candidate', async () => {
    const { d, calls } = setup([rec('A', { candidate: 'edited' })]);
    expect(await d.state('A')).toMatchObject({ state: 'candidate', reason: 'edited', trusted: true });
    expect(calls).toEqual([]);
  });

  it('untrusted committed tombstone makes the record candidate, not forgotten', async () => {
    const t: Tombstone = { id: 'A', supersedes: [], committed: true };
    const { d } = setup([rec('A', { area: 'facts' })], { tombstones: [t] });
    expect(d.tombstoneTrusted(t)).toBe(false);
    expect(await d.state('A')).toMatchObject({ state: 'candidate', reason: 'forget requested by an untrusted commit' });

    const signed = setup([rec('A', { area: 'facts' })], {
      tombstones: [t],
      trust: { signers: new Set(['FP1']) },
      addedBy: new Map([['.elmory/tombstones/A', { commit: 'c'.repeat(40), signer: 'FP1' }]]),
    });
    expect(signed.d.tombstoneTrusted(t)).toBe(true);
    expect((await signed.d.state('A')).state).toBe('forgotten');

    // The local twin is what makes A forgotten; the committed copy is still judged on its own.
    const twin = setup([rec('A', { area: 'facts' })], { tombstones: [t, { id: 'A', supersedes: [], committed: false }] });
    expect(twin.d.tombstoneTrusted(t)).toBe(false);
    expect((await twin.d.state('A')).state).toBe('forgotten');
  });

  it('an approval and a committed forget: binding, untrusted or unverifiable by git status (N2)', async () => {
    const t: Tombstone = { id: 'A', supersedes: [], committed: true };
    const sha = 'c'.repeat(40);
    const credit = (status: string, signer: string | null = null): Map<string, AddedBy> =>
      new Map([['.elmory/tombstones/A', { commit: sha, signer, status }]]);
    const judge = async (addedBy: Map<string, AddedBy>, approval: 'none' | 'plain' | 'commit') => {
      const trust: Partial<Trust> = {
        signers: new Set(['FP1']),
        approved: new Set(approval === 'none' ? [] : ['A']),
        approvedCommits: new Map(approval === 'commit' ? [['A', new Set([sha])]] : []),
      };
      const { d } = setup([rec('A', { area: 'facts' })], { tombstones: [t], trust, addedBy });
      const s = await d.state('A');
      return s.state === 'candidate' ? s.reason : s.state;
    };
    // binding: a good signature by a listed key; nothing lifts it
    for (const a of ['none', 'plain', 'commit'] as const) expect(await judge(credit('G', 'FP1'), a)).toBe('forgotten');
    // untrusted (positively): unsigned, bad, a key the ledger does not list, no credit; a plain approval lifts it
    for (const by of [credit('N'), credit('B'), credit('G', 'FP9'), new Map<string, AddedBy>()]) {
      expect(await judge(by, 'none')).toBe(FORGET_UNTRUSTED);
      expect(await judge(by, 'plain')).toBe('active');
    }
    // unverifiable: only an approval naming the commit lifts it
    for (const status of ['E', 'U', 'X', 'Y', 'R', '?', '']) {
      expect(await judge(credit(status), 'none')).toBe(FORGET_UNVERIFIABLE);
      expect(await judge(credit(status), 'plain')).toBe(FORGET_UNVERIFIABLE);
      expect(await judge(credit(status), 'commit')).toBe('active');
    }
  });

  it('an unsigned edit of a committed tombstone with a local twin does not supersede anything', async () => {
    // F was forgotten and committed; an unsigned commit then edits .elmory/tombstones/F to name V.
    const committed: Tombstone = { id: 'F', supersedes: ['V'], committed: true };
    const local: Tombstone = { id: 'F', supersedes: [], committed: false };
    for (const tombstones of [
      [committed, local],
      [local, committed],
    ]) {
      const { d } = setup([rec('V', { area: 'facts' })], { tombstones });
      expect(d.chainOf('V')).toEqual(['V']);
      expect(await d.state('V')).toMatchObject({ state: 'active', head: true, reason: null });
    }
    // Without the edit the local text still carries its own edges.
    const honest = setup([rec('V')], { tombstones: [{ ...committed }, { ...local, supersedes: ['V'] }] });
    expect(await honest.d.state('V')).toMatchObject({ state: 'superseded', reason: 'superseded by F' });
  });

  it('an untrusted tombstone on a head withholds it but does not bring back the older value', async () => {
    const tomb: Tombstone = { id: 'X', supersedes: ['A'], committed: true };
    const rows = [rec('A', { area: 'facts' }), rec('X', { area: 'facts', supersedes: ['A'] })];
    const { d } = setup(rows, { tombstones: [tomb] });
    expect(await d.state('X')).toMatchObject({ state: 'candidate', reason: FORGET_UNTRUSTED, trusted: true });
    const a = await d.state('A');
    expect(a).toMatchObject({ state: 'superseded', reason: 'superseded by X', head: false });
    expect(a.labels).not.toContain(UNREVIEWED);
    expect(d.heads(d.chainOf('A'))).toEqual(['X']);
    expect(d.liveHeads(d.chainOf('A'))).toEqual([]);
    const served = [...(await d.all()).values()].filter((s) => s.state === 'active' || s.state === 'conflict');
    expect(served).toEqual([]);

    // X is judged on its own evidence for its slot: when it fails here, A is served with the
    // newer-value label, not the unreviewed one.
    const failing = setup(rows, { tombstones: [tomb], outcomes: { X: 'stale' } });
    const a2 = await failing.d.state('A');
    expect(a2).toMatchObject({ state: 'active', head: false });
    expect(a2.labels).toContain(NEWER_FAILS);
    expect(a2.labels).not.toContain(UNREVIEWED);

    // A co-head withheld this way still holds its slot: the other head stays in conflict.
    const fork = setup([...rows, rec('Y', { supersedes: ['A'] })], { tombstones: [tomb] });
    expect((await fork.d.state('Y')).state).toBe('conflict');
    expect((await fork.d.state('X')).state).toBe('candidate');
  });

  it('liveHeads leaves out candidates, rejected records and forgotten heads', async () => {
    const keyed = setup(
      [rec('A', { key: 'k' }), rec('U', { key: 'k', area: 'facts' }), rec('R', { key: 'k' }), rec('E', { key: 'k', candidate: 'edited' })],
      { untrusted: ['U'], trust: { rejected: new Set(['R']) } },
    );
    const chain = keyed.d.chainOf('k');
    expect(keyed.d.heads(chain)).toEqual(['A', 'E', 'R', 'U']);
    expect(keyed.d.liveHeads(chain)).toEqual(['A']);

    // Forget the head C of a keyed chain: its file is gone and only the tombstone node is left.
    const gone = setup([rec('A', { key: 'k' })], { tombstones: [{ id: 'C', supersedes: ['A'], committed: false }] });
    expect(gone.d.heads(gone.d.chainOf('k'))).toEqual(['C']);
    expect(gone.d.liveHeads(gone.d.chainOf('k'))).toEqual([]);

    // Forgotten but still visible (e.g. in this worktree's committed facts): not live either.
    const present = setup([rec('A', { key: 'k' }), rec('C', { key: 'k', supersedes: ['A'] })], {
      tombstones: [{ id: 'C', supersedes: ['A'], committed: false }],
    });
    expect(present.d.heads(present.d.chainOf('k'))).toEqual(['C']);
    expect(present.d.liveHeads(present.d.chainOf('k'))).toEqual([]);
  });

  it('signed commit by a trusted signer is trusted; forged author is not', async () => {
    const rows = [rec('S', { area: 'facts' }), rec('F', { area: 'facts' }), rec('O', { area: 'facts' })];
    const { d } = setup(rows, {
      untrusted: ['S', 'F', 'O'],
      trust: { signers: new Set(['FP1']) },
      addedBy: new Map([
        ['.elmory/facts/S.md', { commit: 'a'.repeat(40), signer: 'FP1' }],
        // A forged author name gives no verified signature: signer is null.
        ['.elmory/facts/F.md', { commit: 'b'.repeat(40), signer: null }],
        ['.elmory/facts/O.md', { commit: 'c'.repeat(40), signer: 'FP-other' }],
      ]),
    });
    expect(d.trustOf('S')).toEqual({ trusted: true, source: 'signed', reason: null });
    expect(await d.state('S')).toMatchObject({ state: 'active', trustSource: 'signed' });
    expect(d.trustOf('F')).toEqual({ trusted: false, source: null, reason: 'untrusted' });
    expect(await d.state('F')).toMatchObject({ state: 'candidate', reason: 'untrusted' });
    expect((await d.state('O')).state).toBe('candidate');

    const rejected = setup([rec('R')], { trust: { rejected: new Set(['R']) } });
    expect(await rejected.d.state('R')).toMatchObject({ state: 'candidate', reason: 'rejected', trusted: false });
  });

  it('a note is active with the not-code-checked label', async () => {
    const { d, calls } = setup([rec('N', { type: 'memory/note' })]);
    const n = await d.state('N');
    expect(n).toMatchObject({ state: 'active', evidence: [] });
    expect(n.labels).toEqual(['not code-checked · recorded 2026-10-21']);
    expect(calls).toEqual([]);
  });

  it('stale beats suspect beats unknown across own sources and cites, reason from detail', async () => {
    const q = (resource: string): Source => ({ ...QUOTE, resource });
    const three = [q('a.ts'), q('b.ts'), q('c.ts')];
    const UNKNOWN = { outcome: 'unknown', detail: 'too-large' } as const;
    const SUSPECT = { outcome: 'suspect', detail: 'not-unique' } as const;
    const STALE = { outcome: 'stale', detail: 'deleted' } as const;
    const { d } = setup(
      [
        rec('A', { sources: three }),
        rec('B', { sources: three }),
        rec('C', { sources: three }),
        rec('S'),
        rec('K'),
        rec('X', { sources: [q('x.ts')], cites: ['S'] }),
        rec('Y', { sources: [q('y.ts')], cites: ['K'] }),
      ],
      {
        outcomes: {
          A: [UNKNOWN, SUSPECT, STALE],
          B: [UNKNOWN, 'holds', SUSPECT],
          C: ['holds', UNKNOWN, 'holds'],
          S: STALE,
          K: UNKNOWN,
          X: UNKNOWN,
          Y: SUSPECT,
        },
      },
    );
    expect(await d.state('A')).toMatchObject({ state: 'stale', reason: 'deleted' });
    expect(await d.state('B')).toMatchObject({ state: 'suspect', reason: 'not-unique' });
    expect(await d.state('C')).toMatchObject({ state: 'unknown', reason: 'too-large' });
    // Own evidence and a cite fail differently: the more severe one wins, whichever side it is on.
    expect(await d.state('X')).toMatchObject({ state: 'stale', reason: 'cited record does not hold' });
    expect(await d.state('Y')).toMatchObject({ state: 'suspect', reason: 'not-unique' });
    const legacy = setup([rec('L', { sources: [{ resource: 'a.txt', legacyFile: '0123456789ab' }] })]);
    expect((await legacy.d.state('L')).labels).toEqual(['whole file unchanged since 2026-10-21']);
  });

  it('two non-head members can both be served beside the label; only co-heads conflict', async () => {
    // (a) X ← A, X ← B, R supersedes A and B but fails here: the fork shows again, each with the label.
    const a = setup(
      [rec('X'), rec('A', { supersedes: ['X'] }), rec('B', { supersedes: ['X'] }), rec('R', { supersedes: ['A', 'B'] })],
      { outcomes: { R: 'stale' } },
    );
    expect(a.d.heads(a.d.chainOf('X'))).toEqual(['R']);
    for (const id of ['A', 'B']) {
      const s = await a.d.state(id);
      expect(s).toMatchObject({ state: 'active', head: false });
      expect(s.labels).toContain(NEWER_FAILS);
    }
    expect((await a.d.state('X')).state).toBe('superseded');

    // (b) X ← A (a head that holds) and X ← B ← C with C failing: A is the only head that holds.
    const b = setup(
      [rec('X'), rec('A', { supersedes: ['X'] }), rec('B', { supersedes: ['X'] }), rec('C', { supersedes: ['B'] })],
      { outcomes: { C: 'stale' } },
    );
    expect(b.d.heads(b.d.chainOf('X'))).toEqual(['A', 'C']);
    const aHead = await b.d.state('A');
    expect(aHead).toMatchObject({ state: 'active', head: true });
    expect(aHead.labels).not.toContain(NEWER_FAILS);
    const bOld = await b.d.state('B');
    expect(bOld).toMatchObject({ state: 'active', head: false });
    expect(bOld.labels).toContain(NEWER_FAILS);
    expect((await b.d.state('C')).state).toBe('stale');

    // Two heads that hold are never both active.
    const c = setup(
      [rec('X'), rec('A', { supersedes: ['X'] }), rec('B', { supersedes: ['X'] }), rec('C', { supersedes: ['B'] })],
    );
    expect((await c.d.state('A')).state).toBe('conflict');
    expect((await c.d.state('C')).state).toBe('conflict');
    expect((await c.d.state('B')).state).toBe('superseded');
  });

  it('unknown supersedes ids are ignored, and state is memoised', async () => {
    const { d, calls } = setup([rec('A', { supersedes: ['f_nowhere'] })]);
    expect(d.chainOf('A')).toEqual(['A']);
    expect((await d.state('A')).state).toBe('active');
    await d.state('A');
    await d.all();
    expect(calls).toEqual(['A']);
  });
});
