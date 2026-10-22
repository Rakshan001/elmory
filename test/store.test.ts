import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { type Exec, defaultExec, gitCommonDir } from '../src/exec.js';
import { FORMAT_VERSION, RecordError, type ElmoryRecord, recordId, serialize } from '../src/record.js';
import { Store, resolveLayout } from '../src/store.js';

const dirs: string[] = [];

function tmp(): string {
  const d = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'elmory-store-')));
  dirs.push(d);
  return d;
}

afterEach(() => {
  vi.restoreAllMocks();
  for (const d of dirs.splice(0)) {
    fs.rmSync(d, { recursive: true, force: true });
  }
});

async function gitWorktree(): Promise<{ wt: string; common: string }> {
  const wt = tmp();
  const res = await defaultExec('git', ['init', '-q'], { cwd: wt });
  expect(res.code).toBe(0);
  const common = await gitCommonDir(defaultExec, wt);
  if (common === null) throw new Error('git init did not produce a repo');
  return { wt, common };
}

function plainStore(): Store {
  const store = new Store(resolveLayout(tmp(), null));
  store.ensureDirs();
  return store;
}

function note(n: number): ElmoryRecord {
  return {
    type: 'memory/note',
    title: `Note ${n}`,
    version: FORMAT_VERSION,
    recorded: `2026-10-22T10:00:0${n}Z`,
    observer: 'agent:test',
    supersedes: [],
    cites: [],
    sources: [],
    body: `Body of note ${n}.`,
  };
}

const tmpFiles = (dir: string): string[] => fs.readdirSync(dir).filter((f) => f.startsWith('.tmp-'));

describe('exec', () => {
  it('gitCommonDir returns null outside a repo and the .git dir inside one', async () => {
    expect(await gitCommonDir(defaultExec, tmp())).toBeNull();
    const { wt, common } = await gitWorktree();
    expect(common).toBe(path.join(wt, '.git'));
    fs.mkdirSync(path.join(wt, 'sub'));
    expect(await gitCommonDir(defaultExec, path.join(wt, 'sub'))).toBe(path.join(wt, '.git'));
  });

  it('gitCommonDir throws when git fails inside a repo and returns null outside one', async () => {
    const failing: Exec = async () => ({ stdout: '', stderr: 'fatal: boom', code: 128 });
    const { wt } = await gitWorktree();
    fs.mkdirSync(path.join(wt, 'deep', 'er'), { recursive: true });
    await expect(gitCommonDir(failing, wt)).rejects.toThrow('git failed inside a repository: fatal: boom');
    await expect(gitCommonDir(failing, path.join(wt, 'deep', 'er'))).rejects.toThrow(/inside a repository/);
    // a .git file (linked worktree) counts too
    const linked = tmp();
    fs.writeFileSync(path.join(linked, '.git'), 'gitdir: /nowhere\n');
    await expect(gitCommonDir(failing, linked)).rejects.toThrow(/inside a repository/);
    expect(await gitCommonDir(failing, tmp())).toBeNull();
    const missingGit: Exec = async () => {
      throw Object.assign(new Error('spawn git ENOENT'), { code: 'ENOENT' });
    };
    await expect(gitCommonDir(missingGit, wt)).rejects.toThrow(/inside a repository/);
    expect(await gitCommonDir(missingGit, tmp())).toBeNull();
  });

  it('defaultExec resolves non-zero exits and rejects a missing binary', async () => {
    const cwd = tmp();
    const res = await defaultExec(process.execPath, ['-e', 'process.stderr.write("e"); process.exit(3)'], { cwd });
    expect(res).toEqual({ stdout: '', stderr: 'e', code: 3 });
    await expect(defaultExec('elmory-no-such-binary-xyz', [], { cwd })).rejects.toThrow();
  });
});

describe('resolveLayout', () => {
  it('resolveLayout puts pending under the common dir with git and under .elmory without', async () => {
    const { wt, common } = await gitWorktree();
    const g = resolveLayout(wt, common);
    expect(g.worktree).toBe(wt);
    expect(g.commonDir).toBe(common);
    expect(g.facts).toBe(path.join(wt, '.elmory', 'facts'));
    expect(g.tombstones).toBe(path.join(wt, '.elmory', 'tombstones'));
    expect(g.pending).toBe(path.join(common, 'elmory', 'pending'));
    expect(g.local).toBe(path.join(common, 'elmory', 'local'));
    expect(g.archive).toBe(path.join(common, 'elmory', 'archive'));
    expect(g.trust).toBe(path.join(common, 'elmory', 'trust'));
    expect(g.localTombstones).toBe(path.join(common, 'elmory', 'tombstones'));
    expect(g.projectId).toBe(createHash('sha256').update(common).digest('hex').slice(0, 16));

    const plain = tmp();
    const p = resolveLayout(plain, null);
    expect(p.commonDir).toBeNull();
    expect(p.facts).toBe(path.join(plain, '.elmory', 'facts'));
    expect(p.pending).toBe(path.join(plain, '.elmory', 'pending'));
    expect(p.trust).toBe(path.join(plain, '.elmory', 'trust'));
    expect(p.projectId).toMatch(/^[0-9a-f]{16}$/);
    expect(p.projectId).toBe(createHash('sha256').update(plain).digest('hex').slice(0, 16));
  });

  it('resolves the worktree through realpath', () => {
    const real = tmp();
    const link = path.join(tmp(), 'link');
    fs.symlinkSync(real, link);
    expect(resolveLayout(link, null).worktree).toBe(real);
  });
});

describe('Store records', () => {
  it('writeRecord writes <id>.md whose text equals serialize(r)', () => {
    const store = plainStore();
    const r = note(1);
    const id = store.writeRecord('pending', r);
    expect(id).toBe(recordId(r));
    const file = path.join(store.layout.pending, `${id}.md`);
    expect(fs.readFileSync(file, 'utf8')).toBe(serialize(r));
    expect(tmpFiles(store.layout.pending)).toEqual([]);

    const got = store.readRecord(id);
    expect(got).toEqual({ id, area: 'pending', path: file, text: serialize(r) });
  });

  it('writeRecord is idempotent for the same record', () => {
    const store = plainStore();
    const a = store.writeRecord('local', note(1));
    const b = store.writeRecord('local', note(1));
    expect(a).toBe(b);
    expect(fs.readdirSync(store.layout.local)).toEqual([`${a}.md`]);
  });

  it('writeRecord refuses a record that fails lint', () => {
    const store = plainStore();
    const bad = { ...note(1), body: '' };
    expect(() => store.writeRecord('pending', bad)).toThrow(RecordError);
    try {
      store.writeRecord('pending', bad);
    } catch (e) {
      expect((e as RecordError).reason).toBe('lint');
    }
    expect(fs.readdirSync(store.layout.pending)).toEqual([]);
  });

  it.skipIf(process.platform === 'win32' || process.getuid?.() === 0)(
    'leaves no temp file behind on failure',
    () => {
      const store = plainStore();
      fs.chmodSync(store.layout.pending, 0o555);
      try {
        expect(() => store.writeRecord('pending', note(1))).toThrow();
        expect(tmpFiles(store.layout.pending)).toEqual([]);
      } finally {
        fs.chmodSync(store.layout.pending, 0o755);
      }
    },
  );

  it('removes the temp file when the rename fails', () => {
    const store = plainStore();
    vi.spyOn(fs, 'renameSync').mockImplementation(() => {
      throw new Error('boom');
    });
    expect(() => store.writeRecord('pending', note(1))).toThrow('boom');
    expect(fs.readdirSync(store.layout.pending)).toEqual([]);
  });

  it('readRecord returns the text exactly as on disk and searches facts, pending, local', () => {
    const store = plainStore();
    const id = store.writeRecord('local', note(2));
    const file = path.join(store.layout.local, `${id}.md`);
    fs.appendFileSync(file, 'hand edit   \r\n');
    const got = store.readRecord(id);
    expect(got?.area).toBe('local');
    expect(got?.text).toBe(serialize(note(2)) + 'hand edit   \r\n');
    expect(store.readRecord('f_' + 'a'.repeat(26))).toBeNull();
    expect(store.readRecord('../../etc/passwd')).toBeNull();
  });

  it('listRecords lists facts, pending and local but not archive or junk', () => {
    const store = plainStore();
    const p = store.writeRecord('pending', note(1));
    const l = store.writeRecord('local', note(2));
    const a = store.writeRecord('pending', note(3));
    store.archive(a);
    fs.writeFileSync(path.join(store.layout.pending, 'README.md'), 'junk');
    fs.writeFileSync(path.join(store.layout.pending, `.tmp-${p}-1-x`), 'junk');
    const list = store.listRecords();
    expect(list.map((s) => [s.id, s.area]).sort()).toEqual([
      [l, 'local'],
      [p, 'pending'],
    ].sort());
    expect(list.find((s) => s.id === p)?.text).toBe(serialize(note(1)));
  });

  it('publish moves pending records into the worktree facts dir', async () => {
    const { wt, common } = await gitWorktree();
    const store = new Store(resolveLayout(wt, common));
    store.ensureDirs();
    const a = store.writeRecord('pending', note(1));
    const b = store.writeRecord('pending', note(2));
    const c = store.writeRecord('pending', note(3));

    expect(store.publish([a, 'f_' + 'z'.repeat(26)])).toEqual([a]);
    expect(fs.existsSync(path.join(wt, '.elmory', 'facts', `${a}.md`))).toBe(true);
    expect(fs.existsSync(path.join(common, 'elmory', 'pending', `${a}.md`))).toBe(false);
    expect(store.readRecord(a)?.area).toBe('facts');

    expect(store.publish().sort()).toEqual([b, c].sort());
    expect(fs.readdirSync(store.layout.pending)).toEqual([]);
    expect(fs.readFileSync(path.join(store.layout.facts, `${b}.md`), 'utf8')).toBe(serialize(note(2)));
    expect(store.publish()).toEqual([]);
  });

  it('publish falls back to copy + unlink on EXDEV', () => {
    const store = plainStore();
    const id = store.writeRecord('pending', note(1));
    const real = fs.renameSync;
    let exdev = 0;
    vi.spyOn(fs, 'renameSync').mockImplementation((from, to) => {
      if (String(from).startsWith(store.layout.pending)) {
        exdev++;
        throw Object.assign(new Error('cross-device link'), { code: 'EXDEV' });
      }
      real(from, to);
    });
    expect(store.publish()).toEqual([id]);
    expect(exdev).toBe(1);
    expect(fs.readFileSync(path.join(store.layout.facts, `${id}.md`), 'utf8')).toBe(serialize(note(1)));
    expect(fs.readdirSync(store.layout.pending)).toEqual([]);
    expect(tmpFiles(store.layout.facts)).toEqual([]);
  });

  it('archive and restore move records between areas', () => {
    const store = plainStore();
    const id = store.writeRecord('pending', note(1));
    expect(store.archive(id)).toEqual(['pending']);
    expect(store.readRecord(id)).toBeNull();
    expect(fs.existsSync(path.join(store.layout.archive, `${id}.md`))).toBe(true);
    expect(store.restore(id)).toEqual(['pending']);
    expect(store.readRecord(id)?.area).toBe('pending');
    expect(fs.readdirSync(store.layout.archive)).toEqual([]);
    expect(() => store.restore(id)).toThrow();
    expect(() => store.archive('f_' + 'q'.repeat(26))).toThrow();
  });

  it('an archived local record is restored into local, never pending', () => {
    const store = plainStore();
    const id = store.writeRecord('local', note(1));
    expect(store.archive(id)).toEqual(['local']);
    expect(store.readRecord(id)).toBeNull();
    expect(fs.existsSync(path.join(store.layout.archive, 'local', `${id}.md`))).toBe(true);
    expect(fs.existsSync(path.join(store.layout.archive, `${id}.md`))).toBe(false);
    expect(store.restore(id)).toEqual(['local']);
    expect(store.readRecord(id)?.area).toBe('local');
    expect(fs.existsSync(path.join(store.layout.pending, `${id}.md`))).toBe(false);
    expect(store.publish([id])).toEqual([]);
    expect(store.archive(id)).toEqual(['local']);
    expect(store.unlink(id)).toEqual(['archive']);
    expect(() => store.restore(id)).toThrow(RecordError);
  });

  it('unlink removes a record from every area', () => {
    const store = plainStore();
    const id = store.writeRecord('pending', note(1));
    store.writeRecord('local', note(1));
    fs.copyFileSync(path.join(store.layout.pending, `${id}.md`), path.join(store.layout.facts, `${id}.md`));
    fs.copyFileSync(path.join(store.layout.pending, `${id}.md`), path.join(store.layout.archive, `${id}.md`));
    expect(store.unlink(id).sort()).toEqual(['archive', 'facts', 'local', 'pending']);
    expect(store.readRecord(id)).toBeNull();
    expect(fs.existsSync(path.join(store.layout.archive, `${id}.md`))).toBe(false);
    expect(store.unlink(id)).toEqual([]);
  });
});

describe('Store symlinks', () => {
  const posixOnly = it.skipIf(process.platform === 'win32');

  posixOnly('a symlinked facts/<id>.md pointing outside the area is ignored', () => {
    const store = plainStore();
    const outside = path.join(tmp(), 'outside.md');
    fs.writeFileSync(outside, serialize(note(1)));
    const id = recordId(note(1));
    fs.symlinkSync(outside, path.join(store.layout.facts, `${id}.md`));
    expect(store.listRecords()).toEqual([]);
    expect(store.readRecord(id)).toBeNull();
    expect(store.unlink(id)).toEqual([]);
    expect(fs.existsSync(outside)).toBe(true);
  });

  posixOnly('symlinked area directories are skipped on read and refused on write', () => {
    const store = plainStore();
    const elsewhere = tmp();
    const id = recordId(note(1));
    fs.writeFileSync(path.join(elsewhere, `${id}.md`), serialize(note(1)));
    fs.rmSync(store.layout.pending, { recursive: true });
    fs.symlinkSync(elsewhere, store.layout.pending);
    expect(store.listRecords()).toEqual([]);
    expect(store.readRecord(id)).toBeNull();
    expect(store.publish()).toEqual([]);
    expect(store.publish([id])).toEqual([]);
    expect(() => store.archive(id)).toThrow(RecordError);
    expect(store.unlink(id)).toEqual([]);
    expect(() => store.writeRecord('pending', note(2))).toThrow(RecordError);
    expect(fs.readdirSync(elsewhere)).toEqual([`${id}.md`]);
  });

  posixOnly('symlinked pending, archive and tombstone entries are not moved or read', () => {
    const store = plainStore();
    const outside = path.join(tmp(), 'x.md');
    fs.writeFileSync(outside, serialize(note(1)));
    const id = recordId(note(1));
    fs.symlinkSync(outside, path.join(store.layout.pending, `${id}.md`));
    fs.symlinkSync(outside, path.join(store.layout.archive, `${id}.md`));
    fs.symlinkSync(outside, path.join(store.layout.localTombstones, id));
    expect(store.publish()).toEqual([]);
    expect(() => store.archive(id)).toThrow(RecordError);
    expect(() => store.restore(id)).toThrow(RecordError);
    expect(store.readTombstones()).toEqual([]);
    expect(() => store.writeRecord('pending', note(1))).toThrow(RecordError);
    expect(fs.existsSync(path.join(store.layout.facts, `${id}.md`))).toBe(false);
  });

  posixOnly('publish refuses a symlinked facts directory', () => {
    const store = plainStore();
    const id = store.writeRecord('pending', note(1));
    const elsewhere = tmp();
    fs.rmSync(store.layout.facts, { recursive: true });
    fs.symlinkSync(elsewhere, store.layout.facts);
    expect(() => store.publish()).toThrow(RecordError);
    expect(fs.readdirSync(elsewhere)).toEqual([]);
    expect(store.readRecord(id)?.area).toBe('pending');
  });
});

describe('Store trust and tombstones', () => {
  it('trust ledger round-trips written, approved, rejected and signer lines', async () => {
    const { wt, common } = await gitWorktree();
    const store = new Store(resolveLayout(wt, common));
    const a = 'f_' + 'a'.repeat(26);
    const b = 'f_' + 'b'.repeat(26);
    expect(store.readTrust()).toEqual({
      written: new Set(),
      approved: new Set(),
      rejected: new Set(),
      signers: new Set(),
    });
    store.appendTrust(`written ${a}`);
    store.appendTrust(`approved ${b}`);
    store.appendTrust(`rejected ${a}`);
    store.appendTrust('signer ssh-ed25519 AAAAC3Nza key@host');
    const t = store.readTrust();
    expect(t.written).toEqual(new Set([a]));
    expect(t.approved).toEqual(new Set([b]));
    expect(t.rejected).toEqual(new Set([a]));
    expect(t.signers).toEqual(new Set(['ssh-ed25519 AAAAC3Nza key@host']));
    expect(fs.readFileSync(path.join(common, 'elmory', 'trust'), 'utf8')).toBe(
      `written ${a}\napproved ${b}\nrejected ${a}\nsigner ssh-ed25519 AAAAC3Nza key@host\n`,
    );
    expect(() => store.appendTrust(`written ${a}\napproved ${b}`)).toThrow();
  });

  it('trust ledger: the latest line for an id wins (approve after reject re-trusts)', async () => {
    const { wt, common } = await gitWorktree();
    const store = new Store(resolveLayout(wt, common));
    const a = 'f_' + 'a'.repeat(26);
    store.appendTrust(`approved ${a}`);
    store.appendTrust(`rejected ${a}`);
    expect(store.readTrust().rejected).toEqual(new Set([a]));
    store.appendTrust(`approved ${a}`);
    const t = store.readTrust();
    expect(t.rejected).toEqual(new Set());
    expect(t.approved).toEqual(new Set([a]));
    store.appendTrust(`rejected ${a}`);
    expect(store.readTrust().rejected).toEqual(new Set([a]));
  });

  it('tombstones round-trip in both dirs', async () => {
    const { wt, common } = await gitWorktree();
    const store = new Store(resolveLayout(wt, common));
    const a = 'f_' + 'a'.repeat(26);
    const b = 'f_' + 'b'.repeat(26);
    const c = 'f_' + 'c'.repeat(26);
    expect(store.readTombstones()).toEqual([]);
    store.writeTombstone(a, [b, c], 'committed');
    store.writeTombstone(b, [], 'local');
    expect(fs.readFileSync(path.join(wt, '.elmory', 'tombstones', a), 'utf8')).toBe(`supersedes: [${b}, ${c}]\n`);
    expect(fs.readFileSync(path.join(common, 'elmory', 'tombstones', b), 'utf8')).toBe('supersedes: []\n');
    const got = store.readTombstones().sort((x, y) => x.id.localeCompare(y.id));
    expect(got).toEqual([
      { id: a, supersedes: [b, c], committed: true },
      { id: b, supersedes: [], committed: false },
    ]);
    expect(() => store.writeTombstone('../evil', [], 'local')).toThrow();
  });

  it('tombstones without git are read once from the shared .elmory dir', () => {
    const store = plainStore();
    const a = 'f_' + 'a'.repeat(26);
    store.writeTombstone(a, [], 'local');
    expect(store.readTombstones()).toEqual([{ id: a, supersedes: [], committed: false }]);
  });
});

describe('review fixes', () => {
  const A = 'f_' + 'a'.repeat(26);
  const B = 'f_' + 'b'.repeat(26);
  const posixOnly = it.skipIf(process.platform === 'win32');

  it('appendTrust adds a missing newline before appending', () => {
    const store = plainStore();
    fs.writeFileSync(store.layout.trust, `written ${A}`);
    store.appendTrust(`approved ${B}`);
    expect(fs.readFileSync(store.layout.trust, 'utf8')).toBe(`written ${A}\napproved ${B}\n`);
    const t = store.readTrust();
    expect(t.written).toEqual(new Set([A]));
    expect(t.approved).toEqual(new Set([B]));
  });

  it('malformed trust lines are skipped with a warning', () => {
    const store = plainStore();
    fs.writeFileSync(
      store.layout.trust,
      [`written  ${A}`, 'written garbage', 'bogus line', `written ${A}  `, `approved ${B}\r`, 'signer key one', '', ''].join('\n'),
    );
    const t = store.readTrust();
    expect(t.written).toEqual(new Set([A]));
    expect(t.approved).toEqual(new Set([B]));
    expect(t.signers).toEqual(new Set(['key one']));
    expect(store.warnings).toHaveLength(3);
    expect(store.warnings.every((w) => w.includes('trust'))).toBe(true);
  });

  it('malformed tombstone files still count (fail closed) with a warning; non-id names are skipped', () => {
    const store = plainStore();
    const C = 'f_' + 'c'.repeat(26);
    store.writeTombstone(A, [B], 'local');
    fs.writeFileSync(path.join(store.layout.localTombstones, B), 'garbage\n');
    fs.writeFileSync(path.join(store.layout.localTombstones, C), 'supersedes: ["x", f_nope]\n');
    fs.writeFileSync(path.join(store.layout.localTombstones, 'not-an-id'), 'supersedes: []\n');
    expect(store.readTombstones()).toEqual([
      { id: A, supersedes: [B], committed: false },
      { id: B, supersedes: [], committed: false },
      { id: C, supersedes: [], committed: false },
    ]);
    expect(store.warnings).toHaveLength(2);
    expect(store.warnings.join('\n')).toContain(B);
    expect(store.warnings.join('\n')).toContain(C);
  });

  it('writeRecord leaves a hand-edited <id>.md untouched (records are immutable)', () => {
    const store = plainStore();
    const id = store.writeRecord('pending', note(1));
    const file = path.join(store.layout.pending, `${id}.md`);
    fs.appendFileSync(file, 'edited\n');
    const before = fs.readFileSync(file, 'utf8');
    expect(store.writeRecord('pending', note(1))).toBe(id);
    expect(fs.readFileSync(file, 'utf8')).toBe(before);
  });

  it('ensureDirs removes .tmp-* files older than an hour in every area', () => {
    const store = plainStore();
    const l = store.layout;
    const old = new Date(Date.now() - 2 * 3600_000);
    const areas = [l.facts, l.tombstones, l.pending, l.local, l.archive, l.localTombstones];
    for (const dir of areas) {
      fs.writeFileSync(path.join(dir, `.tmp-${A}-1-old`), 'x');
      fs.utimesSync(path.join(dir, `.tmp-${A}-1-old`), old, old);
      fs.writeFileSync(path.join(dir, `.tmp-${A}-1-new`), 'x');
    }
    fs.writeFileSync(path.join(l.pending, 'keep.txt'), 'x');
    fs.utimesSync(path.join(l.pending, 'keep.txt'), old, old);
    store.ensureDirs();
    for (const dir of areas) expect(tmpFiles(dir)).toEqual([`.tmp-${A}-1-new`]);
    expect(fs.existsSync(path.join(l.pending, 'keep.txt'))).toBe(true);
  });

  posixOnly('a symlinked <worktree>/.elmory: reads return nothing, writes and publish throw', async () => {
    const { wt, common } = await gitWorktree();
    const elsewhere = tmp();
    const id = recordId(note(1));
    fs.mkdirSync(path.join(elsewhere, 'facts'));
    fs.mkdirSync(path.join(elsewhere, 'tombstones'));
    fs.writeFileSync(path.join(elsewhere, 'facts', `${id}.md`), serialize(note(1)));
    fs.writeFileSync(path.join(elsewhere, 'tombstones', A), 'supersedes: []\n');
    fs.symlinkSync(elsewhere, path.join(wt, '.elmory'));

    const store = new Store(resolveLayout(wt, common));
    expect(store.listRecords()).toEqual([]);
    expect(store.readRecord(id)).toBeNull();
    expect(store.readTombstones()).toEqual([]);

    const pid = store.writeRecord('pending', note(2)); // pending lives under the common dir: fine
    const symlinkError = (fn: () => unknown): void => {
      try {
        fn();
      } catch (e) {
        expect(e).toBeInstanceOf(RecordError);
        expect((e as RecordError).reason).toBe('symlink');
        return;
      }
      throw new Error('expected a RecordError');
    };
    symlinkError(() => store.publish());
    symlinkError(() => store.writeTombstone(B, [], 'committed'));
    symlinkError(() => store.ensureDirs());
    expect(store.readRecord(pid)?.area).toBe('pending');
    expect(fs.readdirSync(path.join(elsewhere, 'facts'))).toEqual([`${id}.md`]);
    expect(fs.readdirSync(path.join(elsewhere, 'tombstones'))).toEqual([A]);
  });

  posixOnly('without git a symlinked .elmory also refuses pending writes and trust', () => {
    const wt = tmp();
    const elsewhere = tmp();
    fs.mkdirSync(path.join(elsewhere, 'pending'));
    fs.writeFileSync(path.join(elsewhere, 'trust'), `approved ${A}\n`);
    fs.symlinkSync(elsewhere, path.join(wt, '.elmory'));
    const store = new Store(resolveLayout(wt, null));
    expect(() => store.writeRecord('pending', note(1))).toThrow(RecordError);
    expect(() => store.appendTrust(`written ${A}`)).toThrow(RecordError);
    expect(store.readTrust().approved).toEqual(new Set());
    expect(fs.readdirSync(path.join(elsewhere, 'pending'))).toEqual([]);
  });
});
