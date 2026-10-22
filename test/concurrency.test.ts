import fs from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { Elmory } from '../src/api.js';
import { cleanupDirs, factInput, rememberChild, repo } from './helpers/children.js';

const opened: Elmory[] = [];

afterEach(() => {
  for (const e of opened.splice(0)) e.close();
  cleanupDirs();
});

async function open(worktree: string, cacheDir: string): Promise<Elmory> {
  const e = await Elmory.open({ worktree, cacheDir, observer: 'agent:test' });
  opened.push(e);
  return e;
}

describe('CAS across processes', () => {
  it('ten writers supersede one head: exactly one wins, nine get CONFLICT', async () => {
    const { wt, cacheDir } = await repo();
    const e = await open(wt, cacheDir);
    const head = (await e.remember(factInput('token check'))).id;

    const children = Array.from({ length: 10 }, (_, i) =>
      rememberChild(wt, cacheDir, factInput(`token check v${i + 2}`, { supersedes: [head] }), { wait: true }),
    );
    await Promise.all(children.map((c) => c.ready));
    for (const c of children) c.go();
    const results = await Promise.all(children.map((c) => c.done));

    for (const r of results) expect(r, r.err).toMatchObject({ code: 0 });
    const outs = results.map((r) => r.out).sort();
    expect(outs).toEqual([...Array<string>(9).fill('CONFLICT'), 'OK']);

    // One successor on disk and in the ledger; the losers wrote nothing.
    await e.sync();
    const ids = e.store.listRecords().map((r) => r.id);
    expect(ids).toHaveLength(2);
    const written = fs.readFileSync(e.layout.trust, 'utf8').split('\n').filter((l) => l.startsWith('written '));
    expect(written).toHaveLength(2);
    const winner = ids.find((id) => id !== head) as string;
    const d = await e.deriver();
    expect((await d.state(head)).state).toBe('superseded');
    expect((await d.state(winner)).state).toBe('active');
    expect(d.heads(d.chainOf(head))).toEqual([winner]);
  }, 60000);
});
