import type { RecordRow } from './cache.js';
import type { EvidenceReport } from './evidence.js';
import type { AddedBy } from './git.js';
import type { Tombstone, Trust } from './store.js';

export type State = 'candidate' | 'forgotten' | 'superseded' | 'conflict' | 'stale' | 'suspect' | 'unknown' | 'active';
export type TrustSource = 'written' | 'approved' | 'signed';

export interface Derived {
  id: string;
  state: State;
  /** e.g. 'edited', 'untrusted', 'rejected', 'forget requested by an untrusted commit', 'basis replaced', 'cycle', 'not-found' */
  reason: string | null;
  trusted: boolean;
  trustSource: TrustSource | null;
  /** A global head of its chain. */
  head: boolean;
  /** §4.2 evidence labels plus the chain labels of §6.3. */
  labels: string[];
  evidence: EvidenceReport[];
}

export interface DeriveInput {
  /** Everything this worktree sees (facts + pending + local). */
  records: Map<string, RecordRow>;
  tombstones: Tombstone[];
  trust: Trust;
  /** Repo-relative path → who added it (committed records and tombstones only). */
  addedBy: Map<string, AddedBy>;
  /** The record's own sources, in order. */
  evidence: (row: RecordRow) => Promise<EvidenceReport[]>;
}

export const FORGET_UNTRUSTED = 'forget requested by an untrusted commit';
export const LABEL_NEWER_FAILS = 'a newer value exists but does not hold on this branch';
export const LABEL_UNREVIEWED = 'an unreviewed newer value exists';

/** Steps 1–5 of §4.6; `holds` means the record would be `active` or `conflict`. */
type BaseState = Exclude<State, 'conflict' | 'active'> | 'holds';
interface Base {
  state: BaseState;
  reason: string | null;
  evidence: EvidenceReport[];
}
type Problem = { state: 'stale' | 'suspect' | 'unknown'; reason: string };
const SEVERITY: readonly Problem['state'][] = ['stale', 'suspect', 'unknown'];

function push(map: Map<string, string[]>, key: string, value: string): void {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

/**
 * Derives one `State` per record for one worktree (spec §4.5, §4.6, §6.3, §8). Pure over its
 * input: no I/O beyond the injected evidence function. Results are memoised per instance, so
 * build a new Deriver per request.
 */
export class Deriver {
  private readonly input: DeriveInput;
  /** ids named by a trusted tombstone */
  private readonly forgotten = new Set<string>();
  /** ids named only by untrusted tombstones */
  private readonly forgetUntrusted = new Set<string>();
  /** Chain nodes: every record and every trusted tombstone id. */
  private readonly nodes = new Set<string>();
  /** Undirected supersedes edges between nodes. */
  private readonly adj = new Map<string, Set<string>>();
  /** target → records (any trust) whose `supersedes` names it */
  private readonly recordSupersededBy = new Map<string, string[]>();
  /** target → trusted tombstones whose `supersedes` names it */
  private readonly tombSupersededBy = new Map<string, string[]>();
  /** record id → index of its strongly connected component in the dependency graph */
  private readonly scc = new Map<string, number>();
  /** records on a dependency cycle (through `cites` and/or effective `supersedes`) */
  private readonly cyclic = new Set<string>();
  private readonly staticMemo = new Map<string, string | null>();
  private readonly baseMemo = new Map<string, Promise<Base>>();
  private readonly stateMemo = new Map<string, Promise<Derived>>();

  constructor(input: DeriveInput) {
    this.input = input;
    const committedOnly: Tombstone[] = [];
    for (const t of input.tombstones) {
      if (this.tombstoneTrusted(t)) this.forgotten.add(t.id);
      else committedOnly.push(t);
    }
    for (const t of committedOnly) if (!this.forgotten.has(t.id)) this.forgetUntrusted.add(t.id);

    for (const id of input.records.keys()) this.nodes.add(id);
    for (const id of this.forgotten) this.nodes.add(id);

    for (const row of input.records.values()) {
      for (const target of new Set(row.supersedes)) {
        if (!this.nodes.has(target)) continue; // unknown id: the edge is absent
        push(this.recordSupersededBy, target, row.id);
        this.link(row.id, target);
      }
    }
    for (const t of input.tombstones) {
      if (!this.forgotten.has(t.id) || !this.tombstoneTrusted(t)) continue;
      for (const target of new Set(t.supersedes)) {
        if (!this.nodes.has(target)) continue;
        const list = this.tombSupersededBy.get(target);
        if (!list?.includes(t.id)) push(this.tombSupersededBy, target, t.id);
        this.link(t.id, target);
      }
    }
    this.findCycles();
  }

  trustOf(id: string): { trusted: boolean; source: TrustSource | null; reason: string | null } {
    const { trust, records, addedBy } = this.input;
    if (trust.rejected.has(id)) return { trusted: false, source: null, reason: 'rejected' };
    if (trust.written.has(id)) return { trusted: true, source: 'written', reason: null };
    if (trust.approved.has(id)) return { trusted: true, source: 'approved', reason: null };
    if (records.get(id)?.area === 'facts') {
      const signer = addedBy.get(`.elmory/facts/${id}.md`)?.signer;
      if (signer && trust.signers.has(signer)) return { trusted: true, source: 'signed', reason: null };
    }
    return { trusted: false, source: null, reason: 'untrusted' };
  }

  /** Local → true; committed → true when a local twin exists or its adding commit is signed by a trusted key. */
  tombstoneTrusted(t: Tombstone): boolean {
    if (!t.committed) return true;
    if (this.input.tombstones.some((o) => o.id === t.id && !o.committed)) return true;
    const signer = this.input.addedBy.get(`.elmory/tombstones/${t.id}`)?.signer;
    return !!signer && this.input.trust.signers.has(signer);
  }

  /** Ids of the connected component over supersedes edges (records and tombstone nodes), sorted. */
  chainOf(idOrKey: string): string[] {
    const starts = this.nodes.has(idOrKey)
      ? [idOrKey]
      : [...this.input.records.values()].filter((r) => r.key === idOrKey).map((r) => r.id);
    const seen = new Set<string>(starts);
    const queue = [...starts];
    for (let next = queue.pop(); next !== undefined; next = queue.pop()) {
      for (const n of this.adj.get(next) ?? []) {
        if (!seen.has(n)) {
          seen.add(n);
          queue.push(n);
        }
      }
    }
    return [...seen].sort();
  }

  /** Members not superseded by a trusted, non-candidate record or a trusted tombstone. */
  heads(chain: string[]): string[] {
    return chain.filter((id) => this.isHead(id));
  }

  /** Memoised; the §4.6 table, first match wins. */
  state(id: string): Promise<Derived> {
    let p = this.stateMemo.get(id);
    if (!p) {
      p = this.derive(id);
      this.stateMemo.set(id, p);
      p.catch(() => this.stateMemo.delete(id));
    }
    return p;
  }

  async all(): Promise<Map<string, Derived>> {
    const out = new Map<string, Derived>();
    for (const id of [...this.input.records.keys()].sort()) out.set(id, await this.state(id));
    return out;
  }

  private link(a: string, b: string): void {
    for (const [x, y] of [
      [a, b],
      [b, a],
    ] as const) {
      const set = this.adj.get(x);
      if (set) set.add(y);
      else this.adj.set(x, new Set([y]));
    }
  }

  private isHead(id: string): boolean {
    if (!this.nodes.has(id)) return false;
    if (this.tombSupersededBy.has(id)) return false;
    return !(this.recordSupersededBy.get(id) ?? []).some((s) => this.staticCandidate(s) === null);
  }

  /** Steps 1–2 without recursion: the candidate reason, or null when the record may be served. */
  private staticCandidate(id: string): string | null {
    if (this.staticMemo.has(id)) return this.staticMemo.get(id) ?? null;
    const row = this.input.records.get(id);
    let reason: string | null;
    if (!row) reason = 'not-found';
    else if (row.candidate !== null) reason = row.candidate;
    else {
      const t = this.trustOf(id);
      reason = !t.trusted ? (t.reason ?? 'untrusted') : this.forgetUntrusted.has(id) ? FORGET_UNTRUSTED : null;
    }
    this.staticMemo.set(id, reason);
    return reason;
  }

  /** Records whose state decides this record's base state: effective superseders and cited records. */
  private deps(id: string): string[] {
    const row = this.input.records.get(id);
    if (!row) return [];
    const out = (this.recordSupersededBy.get(id) ?? []).filter((s) => this.staticCandidate(s) === null);
    for (const c of row.cites) if (this.input.records.has(c)) out.push(c);
    return out;
  }

  /** Iterative Tarjan over `deps`; members of a non-trivial component (or a self-loop) are cyclic. */
  private findCycles(): void {
    const index = new Map<string, number>();
    const low = new Map<string, number>();
    const onStack = new Set<string>();
    const stack: string[] = [];
    let counter = 0;
    let comp = 0;
    for (const root of [...this.input.records.keys()].sort()) {
      if (index.has(root)) continue;
      const work: { id: string; deps: string[]; i: number }[] = [];
      const enter = (id: string): void => {
        index.set(id, counter);
        low.set(id, counter);
        counter++;
        stack.push(id);
        onStack.add(id);
        work.push({ id, deps: this.deps(id), i: 0 });
      };
      enter(root);
      while (work.length > 0) {
        const top = work[work.length - 1] as { id: string; deps: string[]; i: number };
        if (top.i < top.deps.length) {
          const d = top.deps[top.i++] as string;
          if (d === top.id) this.cyclic.add(d);
          if (!index.has(d)) enter(d);
          else if (onStack.has(d)) low.set(top.id, Math.min(low.get(top.id) as number, index.get(d) as number));
          continue;
        }
        work.pop();
        const parent = work[work.length - 1];
        if (parent) low.set(parent.id, Math.min(low.get(parent.id) as number, low.get(top.id) as number));
        if (low.get(top.id) === index.get(top.id)) {
          const members: string[] = [];
          let m: string | undefined;
          do {
            m = stack.pop() as string;
            onStack.delete(m);
            this.scc.set(m, comp);
            members.push(m);
          } while (m !== top.id);
          if (members.length > 1) for (const x of members) this.cyclic.add(x);
          comp++;
        }
      }
    }
  }

  private sameCycle(a: string, b: string): boolean {
    return this.cyclic.has(a) && this.scc.get(a) === this.scc.get(b);
  }

  private baseOf(id: string): Promise<Base> {
    let p = this.baseMemo.get(id);
    if (!p) {
      p = this.computeBase(id);
      this.baseMemo.set(id, p);
      p.catch(() => this.baseMemo.delete(id));
    }
    return p;
  }

  /**
   * Steps 1–5. Recursion follows `deps` only, skipping members of the record's own cycle, so it
   * walks a DAG and never waits on itself.
   */
  private async computeBase(id: string): Promise<Base> {
    const row = this.input.records.get(id);
    if (!row) throw new RangeError(`unknown record: ${id}`);
    // 1–2: candidate
    const cand = this.staticCandidate(id);
    if (cand !== null) return { state: 'candidate', reason: cand, evidence: [] };
    // 3: forgotten
    if (this.forgotten.has(id)) return { state: 'forgotten', reason: null, evidence: [] };
    // 4: superseded — by a trusted tombstone, or by a trusted record whose slot holds here
    // (it holds itself, or something newer above it does: §6.3 "newest member that holds").
    const tomb = this.tombSupersededBy.get(id)?.[0];
    if (tomb !== undefined) return { state: 'superseded', reason: `superseded by ${tomb}`, evidence: [] };
    for (const s of (this.recordSupersededBy.get(id) ?? []).filter((x) => this.staticCandidate(x) === null).sort()) {
      if (this.sameCycle(id, s)) continue;
      const b = await this.baseOf(s);
      if (b.state === 'holds' || b.state === 'superseded') return { state: 'superseded', reason: `superseded by ${s}`, evidence: [] };
    }
    // 5: own evidence, then cycle, then cites
    const evidence = row.sources.length > 0 ? await this.input.evidence(row) : [];
    const problems: Problem[] = [];
    for (const r of evidence) if (r.outcome !== 'holds') problems.push({ state: r.outcome, reason: r.detail });
    if (this.cyclic.has(id)) problems.push({ state: 'suspect', reason: 'cycle' });
    for (const c of row.cites) {
      if (!this.input.records.has(c)) problems.push({ state: 'stale', reason: 'cited record gone' });
      else if (!this.isHead(c)) problems.push({ state: 'suspect', reason: 'basis replaced' });
      else if (this.sameCycle(id, c)) continue; // already suspect: cycle
      else {
        const b = await this.baseOf(c);
        if (b.state === 'holds') continue;
        if (b.state === 'forgotten') problems.push({ state: 'stale', reason: 'cited record gone' });
        else if (b.state === 'stale' || b.state === 'unknown') problems.push({ state: b.state, reason: 'cited record does not hold' });
        else problems.push({ state: 'suspect', reason: 'cited record does not hold' });
      }
    }
    for (const sev of SEVERITY) {
      const p = problems.find((x) => x.state === sev);
      if (p) return { state: p.state, reason: p.reason, evidence };
    }
    return { state: 'holds', reason: null, evidence };
  }

  private async derive(id: string): Promise<Derived> {
    const row = this.input.records.get(id);
    const t = this.trustOf(id);
    const head = this.isHead(id);
    if (!row) {
      if (!this.forgotten.has(id)) throw new RangeError(`unknown record: ${id}`);
      return { id, state: 'forgotten', reason: null, trusted: t.trusted, trustSource: t.source, head, labels: [], evidence: [] };
    }
    const base = await this.baseOf(id);
    let state: State;
    if (base.state !== 'holds') state = base.state;
    else {
      // 6: conflict when another global head of the same chain also holds here
      state = 'active';
      if (head) {
        for (const other of this.heads(this.chainOf(id))) {
          if (other === id || !this.input.records.has(other)) continue;
          if ((await this.baseOf(other)).state === 'holds') {
            state = 'conflict';
            break;
          }
        }
      }
    }
    return {
      id,
      state,
      reason: base.reason,
      trusted: t.trusted,
      trustSource: t.source,
      head,
      labels: this.labels(row, state, head, base.evidence),
      evidence: base.evidence,
    };
  }

  private labels(row: RecordRow, state: State, head: boolean, evidence: EvidenceReport[]): string[] {
    const date = row.recorded.slice(0, 10);
    const out = new Set<string>();
    row.sources.forEach((src, i) => {
      if (evidence[i]?.outcome !== 'holds') return;
      out.add('legacyFile' in src ? `whole file unchanged since ${date}` : `evidence unchanged since ${date}`);
    });
    for (const c of row.cites) {
      const cited = this.input.records.get(c);
      if (cited) out.add(`builds on ${cited.title}`);
    }
    if (row.type === 'memory/note' && row.sources.length === 0) out.add(`not code-checked · recorded ${date}`);
    // Active but not a global head: every trusted newer member fails here (otherwise step 4 hit).
    if (state === 'active' && !head) out.add(LABEL_NEWER_FAILS);
    const unreviewed = (this.recordSupersededBy.get(row.id) ?? []).some(
      (s) => this.staticCandidate(s) !== null && this.trustOf(s).reason !== 'rejected',
    );
    if (unreviewed) out.add(LABEL_UNREVIEWED);
    return [...out];
  }
}
