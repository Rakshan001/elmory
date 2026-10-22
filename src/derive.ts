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

/**
 * Whether a committed tombstone for `id` is trusted on its own: `addedBy` reports a signer for
 * its path that the trust ledger names. The one rule for the Deriver and the index (I3).
 */
export function committedTombstoneTrusted(id: string, addedBy: ReadonlyMap<string, AddedBy>, trust: Trust): boolean {
  const signer = addedBy.get(`.elmory/tombstones/${id}`)?.signer;
  return !!signer && trust.signers.has(signer);
}

/**
 * Whether an approval may refuse the committed tombstone of `id` (I3, N2): it is not trusted, and
 * git positively says no trusted signature stands behind it: its path has no credit (no commit
 * left these bytes, or they are uncommitted), the replay check voided the credit (no signature
 * was asked about), or the credited commit is unsigned (`%G?` = `N`). Any other answer (a good
 * signature by a key the ledger does not list, an expired or revoked key, gpg or ssh-keygen
 * missing, an unreadable allowed-signers file) cannot be judged here, and the forget stands.
 * The one rule for the Deriver, the index and `approve` (fail closed).
 */
export function forgetRefusable(id: string, addedBy: ReadonlyMap<string, AddedBy>, trust: Trust): boolean {
  if (committedTombstoneTrusted(id, addedBy, trust)) return false;
  const credit = addedBy.get(`.elmory/tombstones/${id}`);
  return credit === undefined || credit.status === undefined || credit.status === 'N';
}

/** The ledger's latest word on `id` is `approved` (a later `rejected` drops it, see Store.readTrust). */
export function approvedHere(trust: Trust, id: string): boolean {
  return trust.approved.has(id) && !trust.rejected.has(id);
}

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
  /** ids named only by an untrusted tombstone, and not approved here (an approval refuses that forget) */
  private readonly forgetUntrusted = new Set<string>();
  /** One tombstone per id: the local copy when there is one, else the committed copy. */
  private readonly tombs: Tombstone[];
  /** Chain nodes: every record and every trusted tombstone id. */
  private readonly nodes = new Set<string>();
  /** Undirected supersedes edges between nodes, from effective superseders and trusted tombstones only. */
  private readonly adj = new Map<string, Set<string>>();
  /** target → records (any trust) whose `supersedes` names it */
  private readonly recordSupersededBy = new Map<string, string[]>();
  /** target → trusted tombstones whose `supersedes` names it */
  private readonly tombSupersededBy = new Map<string, string[]>();
  /** record id → index of its strongly connected component in the dependency graph */
  private readonly scc = new Map<string, number>();
  /** records on a dependency cycle (through `cites` and/or effective `supersedes`) */
  private readonly cyclic = new Set<string>();
  private readonly slotMemo = new Map<string, string | null>();
  private readonly baseMemo = new Map<string, Promise<Base>>();
  private readonly stateMemo = new Map<string, Promise<Derived>>();

  constructor(input: DeriveInput) {
    this.input = input;
    // A tombstone's text is not bound to its name, so a committed copy is only ever judged on
    // its own: when a local twin exists, the local text is the one that counts (an unsigned edit
    // of the committed file must not add edges).
    const byId = new Map<string, Tombstone>();
    for (const t of input.tombstones) {
      const prev = byId.get(t.id);
      if (prev === undefined || (prev.committed && !t.committed)) byId.set(t.id, t);
    }
    this.tombs = [...byId.values()];
    for (const t of this.tombs) {
      if (this.tombstoneTrusted(t)) this.forgotten.add(t.id);
      // An untrusted forget of a record the user approved here is refused (I3): the approval is
      // the review §8 asks for, and the record keeps its evidence-based state. Only when git
      // positively says the forget is unsigned (forgetRefusable, N2); otherwise it stands.
      else if (!(approvedHere(input.trust, t.id) && forgetRefusable(t.id, input.addedBy, input.trust))) this.forgetUntrusted.add(t.id);
    }

    for (const id of input.records.keys()) this.nodes.add(id);
    for (const id of this.forgotten) this.nodes.add(id);

    for (const row of input.records.values()) {
      // Only an effective superseder (trusted, non-candidate) joins chains: an untrusted record
      // naming two unrelated heads must not merge them into one chain and make both conflict.
      // A record withheld only by an untrusted forget keeps its slot (see slotCandidate).
      const effective = this.slotCandidate(row.id) === null;
      for (const target of new Set(row.supersedes)) {
        if (!this.nodes.has(target)) continue; // unknown id: the edge is absent
        push(this.recordSupersededBy, target, row.id); // every record: the unreviewed label needs it
        if (effective) this.link(row.id, target);
      }
    }
    for (const t of this.tombs) {
      if (!this.forgotten.has(t.id)) continue;
      for (const target of new Set(t.supersedes)) {
        if (!this.nodes.has(target)) continue;
        push(this.tombSupersededBy, target, t.id);
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

  /**
   * This copy, judged on its own: local → true; committed → true when `addedBy` reports a trusted
   * signer for its path. A local twin does not make the committed copy's text trusted.
   */
  tombstoneTrusted(t: Tombstone): boolean {
    if (!t.committed) return true;
    return committedTombstoneTrusted(t.id, this.input.addedBy, this.input.trust);
  }

  /**
   * Ids of the connected component over the supersedes edges of trusted, non-candidate records
   * and trusted tombstones (tombstone nodes included), sorted.
   */
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

  /**
   * `heads()` minus everything a new write can neither be served beside nor supersede:
   * candidates (rejected, untrusted, edited, forget requested by an untrusted commit), forgotten
   * records and tombstone-only nodes. The write-time conflict check runs on this.
   */
  liveHeads(chain: string[]): string[] {
    return this.heads(chain).filter(
      (id) => this.input.records.has(id) && !this.forgotten.has(id) && this.staticCandidate(id) === null,
    );
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
    return !(this.recordSupersededBy.get(id) ?? []).some((s) => this.slotCandidate(s) === null);
  }

  /**
   * Steps 1–2 for the record's place in its chain, without recursion: the candidate reason, or
   * null when the record is an effective superseder. An untrusted forget is not a reason here: it
   * withholds the record itself (staticCandidate) but the record keeps its slot, so the older
   * value is not brought back (§6.3) by an unsigned commit (§8 V3).
   */
  private slotCandidate(id: string): string | null {
    if (this.slotMemo.has(id)) return this.slotMemo.get(id) ?? null;
    const row = this.input.records.get(id);
    let reason: string | null;
    if (!row) reason = 'not-found';
    else if (row.candidate !== null) reason = row.candidate;
    else {
      const t = this.trustOf(id);
      reason = t.trusted ? null : (t.reason ?? 'untrusted');
    }
    this.slotMemo.set(id, reason);
    return reason;
  }

  /** Steps 1–2: the candidate reason, or null when the record may be served. */
  private staticCandidate(id: string): string | null {
    return this.slotCandidate(id) ?? (this.forgetUntrusted.has(id) ? FORGET_UNTRUSTED : null);
  }

  /**
   * The records `computeBase(id)` awaits, and nothing else: effective superseders and the cited
   * records it recurses into. Mirrors computeBase's early returns so a cycle is only reported
   * where evaluation would actually wait on itself.
   */
  private deps(id: string): string[] {
    const row = this.input.records.get(id);
    if (!row || this.slotCandidate(id) !== null || this.forgotten.has(id) || this.tombSupersededBy.has(id)) return [];
    const out = (this.recordSupersededBy.get(id) ?? []).filter((s) => this.slotCandidate(s) === null);
    for (const c of row.cites) {
      if (this.input.records.has(c) && !this.forgotten.has(c) && this.isHead(c) && this.staticCandidate(c) === null) out.push(c);
    }
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
    // 1–2: candidate (an untrusted forget is applied in derive(): the slot is judged here)
    const cand = this.slotCandidate(id);
    if (cand !== null) return { state: 'candidate', reason: cand, evidence: [] };
    // 3: forgotten
    if (this.forgotten.has(id)) return { state: 'forgotten', reason: null, evidence: [] };
    // 4: superseded — by a trusted tombstone, or by a trusted record whose slot holds here
    // (it holds itself, or something newer above it does: §6.3 "newest member that holds").
    const tomb = this.tombSupersededBy.get(id)?.[0];
    if (tomb !== undefined) return { state: 'superseded', reason: `superseded by ${tomb}`, evidence: [] };
    for (const s of (this.recordSupersededBy.get(id) ?? []).filter((x) => this.slotCandidate(x) === null).sort()) {
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
      // Forgotten before head: §4.6 puts stale before suspect, and a forgotten record is gone.
      if (!this.input.records.has(c) || this.forgotten.has(c)) problems.push({ state: 'stale', reason: 'cited record gone' });
      else if (!this.isHead(c)) problems.push({ state: 'suspect', reason: 'basis replaced' });
      else if (this.staticCandidate(c) !== null) problems.push({ state: 'suspect', reason: 'cited record does not hold' });
      else if (this.sameCycle(id, c)) continue; // already suspect: cycle
      else {
        const b = await this.baseOf(c);
        if (b.state === 'holds') continue;
        if (b.state === 'stale' || b.state === 'unknown') problems.push({ state: b.state, reason: 'cited record does not hold' });
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
    // An untrusted forget withholds the record itself; its slot is still judged by baseOf for others.
    const base: Base =
      this.slotCandidate(id) === null && this.forgetUntrusted.has(id)
        ? { state: 'candidate', reason: FORGET_UNTRUSTED, evidence: [] }
        : await this.baseOf(id);
    let state: State;
    if (base.state !== 'holds') state = base.state;
    else {
      // 6: conflict when another global head of the same chain also holds here (a head withheld
      // by an untrusted forget still holds its slot, so it still makes this one conflict)
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
      (s) => this.slotCandidate(s) !== null && this.trustOf(s).reason !== 'rejected',
    );
    if (unreviewed) out.add(LABEL_UNREVIEWED);
    return [...out];
  }
}
