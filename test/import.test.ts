import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ConflictError, Elmory, RefusedError } from '../src/api.js';
import { defaultExec } from '../src/exec.js';

const dirs: string[] = [];
const opened: Elmory[] = [];
const NOW = '2026-10-22T10:00:00.000Z';

function tmp(): string {
  const d = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'elmory-import-')));
  dirs.push(d);
  return d;
}

afterEach(() => {
  for (const e of opened.splice(0)) e.close();
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

async function git(cwd: string, ...args: string[]): Promise<void> {
  const res = await defaultExec('git', args, { cwd });
  if (res.code !== 0) throw new Error(`git ${args.join(' ')} failed: ${res.stderr}`);
}

const sha = (b: string) => createHash('sha1').update(Buffer.from(b)).digest('hex').slice(0, 12);

async function setup(): Promise<{ wt: string; e: Elmory; content: string }> {
  const wt = path.join(tmp(), 'repo');
  fs.mkdirSync(path.join(wt, 'src'), { recursive: true });
  await git(wt, 'init', '-q');
  await git(wt, 'config', 'user.name', 'Tester');
  await git(wt, 'config', 'user.email', 'tester@example.com');
  await git(wt, 'config', 'commit.gpgsign', 'false');
  const content = 'export const answer = 42;\n';
  fs.writeFileSync(path.join(wt, 'src/a.ts'), content);
  await git(wt, 'add', '-A');
  await git(wt, 'commit', '-q', '--no-verify', '-m', 'init');
  const e = await Elmory.open({ worktree: wt, cacheDir: tmp(), now: () => NOW, observer: 'agent:test' });
  opened.push(e);
  return { wt, e, content };
}

const base = {
  title: 'Answer constant',
  text: 'The answer constant lives in a.ts.',
  recorded: '2026-01-02T03:04:05.000Z',
  legacyId: 'baton-old-1',
};

describe('Elmory.import', () => {
  it('import writes a legacy-file fact that holds while the sha1 matches', async () => {
    const { e, content } = await setup();
    const r = await e.import({ ...base, legacyFiles: [{ file: 'src/a.ts', sha1_12: sha(content) }] });
    expect(r.state).toBe('active');
    expect(r.labels.some((l) => l.startsWith('whole file unchanged since'))).toBe(true);
  });

  it('a mismatching sha1 is not served as active', async () => {
    const { e } = await setup();
    const r = await e.import({ ...base, legacyFiles: [{ file: 'src/a.ts', sha1_12: '0'.repeat(12) }] });
    expect(r.state).toBe('suspect');
  });

  it('empty legacyFiles writes a note', async () => {
    const { e } = await setup();
    const r = await e.import({ ...base, legacyFiles: [] });
    expect(r.labels).toContain('not code-checked · recorded 2026-01-02');
    const rec = fs.readFileSync(path.join(e.layout.pending, `${r.id}.md`), 'utf8');
    expect(rec).toContain('type: memory/note');
  });

  it('a secret in the text is refused', async () => {
    const { e } = await setup();
    const key = 'AKIA' + 'IOSFODNN7EXAMPLE';
    await expect(e.import({ ...base, text: `use ${key} here`, legacyFiles: [] })).rejects.toMatchObject({
      reason: 'secret',
    });
  });

  it('rejects bad input', async () => {
    const { e } = await setup();
    await expect(e.import({ ...base, legacyFiles: [{ file: 'src/a.ts', sha1_12: 'ABC' }] })).rejects.toBeInstanceOf(RefusedError);
    await expect(e.import({ ...base, recorded: 'nope', legacyFiles: [] })).rejects.toBeInstanceOf(RefusedError);
    await expect(e.import({ ...base, recorded: '2026-01-02', legacyFiles: [] })).rejects.toBeInstanceOf(RefusedError);
    await expect(e.import({ ...base, legacyId: '', legacyFiles: [] })).rejects.toBeInstanceOf(RefusedError);
  });

  it('the record is findable by its legacy id', async () => {
    const { e } = await setup();
    const r = await e.import({ ...base, legacyFiles: [] });
    const found = await e.about('baton-old-1');
    if (found.abstain) throw new Error('expected a hit');
    expect(found.served.map((x) => x.id)).toEqual([r.id]);
  });

  it('a legacy-id line in the body does not match', async () => {
    const { e } = await setup();
    await e.import({ ...base, text: 'x\nx-elmory-legacy-id: other-id\ny', legacyFiles: [] });
    expect((await e.about('other-id')).abstain).toBe(true);
  });

  it('imported and legacyId round-trip through the record file', async () => {
    const { e, content } = await setup();
    const r = await e.import({ ...base, legacyFiles: [{ file: 'src/a.ts', sha1_12: sha(content) }] });
    const text = fs.readFileSync(path.join(e.layout.pending, `${r.id}.md`), 'utf8');
    expect(text).toContain('x-elmory-imported: true');
    expect(text).toContain('x-elmory-legacy-id: baton-old-1');
    expect(text).toContain('x-elmory-recorded: "2026-01-02T03:04:05.000Z"');
  });

  it('the trust ledger records the import as written', async () => {
    const { e } = await setup();
    const r = await e.import({ ...base, legacyFiles: [] });
    expect(e.store.readTrust().written.has(r.id)).toBe(true);
  });

  it('supersedes is compare-and-swapped against the current head', async () => {
    const { e } = await setup();
    const a = await e.import({ ...base, legacyFiles: [] });
    await e.import({ ...base, legacyId: 'old-2', text: 'second', supersedes: [a.id], legacyFiles: [] });
    await expect(
      e.import({ ...base, legacyId: 'old-3', text: 'third', supersedes: [a.id], legacyFiles: [] }),
    ).rejects.toBeInstanceOf(ConflictError);
  });
});
