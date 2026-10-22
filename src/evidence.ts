// Does a source hold in this worktree? (spec §4.2, §4.3 "At read", §6.1.) Results are keyed by
// content, so worktrees with the same bytes share them; everything per-worktree is the stat
// cache entry and the per-request memo.

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Cache, RenameResultJson, StatKey } from './cache.js';
import type { Git } from './git.js';
import { type AnchorMap, buildAnchorMap, locate } from './quote.js';
import type { LegacyFileSource, QuoteSource, Source } from './record.js';

export type Outcome = 'holds' | 'suspect' | 'stale' | 'unknown';

export type EvidenceDetail =
  | 'found'
  | 'not-found'
  | 'not-unique'
  | 'deleted'
  | 'renamed'
  | 'unreachable-commit'
  | 'too-large'
  | 'unreadable'
  | 'legacy-match'
  | 'legacy-mismatch';

/** `path` is where the source was checked: the new path when the file was renamed. */
export interface EvidenceReport {
  outcome: Outcome;
  detail: EvidenceDetail;
  path: string;
}

/** Files over this size are never read at check time (§4.3 read step 5). */
const MAX_BYTES = 1024 * 1024;

type Probe =
  | { kind: 'missing' }
  | { kind: 'unreadable' }
  | { kind: 'ok'; abs: string; stat: StatKey };

const sha256 = (b: Buffer): string => createHash('sha256').update(b).digest('hex');

function isLegacy(s: Source): s is LegacyFileSource {
  return 'legacyFile' in s;
}

/** A repo-relative path that cannot name anything outside the worktree by its spelling. */
function safeRelative(rel: string): boolean {
  if (rel === '' || path.isAbsolute(rel) || rel.startsWith('\\') || /^[A-Za-z]:/.test(rel)) return false;
  return !rel.split(/[/\\]/).includes('..');
}

export class Evidence {
  readonly #root: string;
  readonly #cache: Cache;
  readonly #git: Git | null;
  // Per-request memo; resetMemo() clears it.
  #probes = new Map<string, Probe>();
  #ids = new Map<string, string | null>();
  #maps = new Map<string, AnchorMap>();
  #renames = new Map<string, Record<string, RenameResultJson>>();
  #tree: Promise<string | null> | null = null;

  constructor(opts: { worktree: string; cache: Cache; git: Git | null }) {
    this.#root = fs.realpathSync(opts.worktree);
    this.#cache = opts.cache;
    this.#git = opts.git;
  }

  resetMemo(): void {
    this.#probes.clear();
    this.#ids.clear();
    this.#maps.clear();
    this.#renames.clear();
    this.#tree = null;
  }

  /** sha256 hex of the file's bytes, via the stat cache (§4.3 read step 1); null when missing or unreadable. */
  contentId(relPath: string): string | null {
    const memo = this.#ids.get(relPath);
    if (memo !== undefined) return memo;
    const p = this.#probe(relPath);
    let id: string | null = null;
    if (p.kind === 'ok') {
      id = this.#cache.statLookup(this.#root, relPath, p.stat);
      if (id === null) {
        try {
          // Stat was taken before this read: a later edit changes the stat, so the entry just misses.
          id = sha256(fs.readFileSync(p.abs));
          this.#cache.statPut(this.#root, relPath, p.stat, id);
        } catch {
          id = null;
        }
      }
    }
    this.#ids.set(relPath, id);
    return id;
  }

  async check(src: Source): Promise<EvidenceReport> {
    return isLegacy(src) ? this.#checkLegacy(src) : this.#checkQuote(src, src.resource, true);
  }

  async checkAll(sources: Source[]): Promise<EvidenceReport[]> {
    // Sequential so the memo (anchor maps, rename maps) is shared rather than raced.
    const out: EvidenceReport[] = [];
    for (const s of sources) out.push(await this.check(s));
    return out;
  }

  #probe(relPath: string): Probe {
    const memo = this.#probes.get(relPath);
    if (memo !== undefined) return memo;
    let p: Probe;
    if (!safeRelative(relPath)) {
      p = { kind: 'unreadable' };
    } else {
      const abs = path.join(this.#root, relPath);
      try {
        const st = fs.statSync(abs);
        // A symlink may point anywhere; only files that resolve inside the worktree are read.
        const real = fs.realpathSync(abs);
        if (!st.isFile() || !real.startsWith(this.#root + path.sep)) p = { kind: 'unreadable' };
        else p = { kind: 'ok', abs, stat: { mtimeMs: st.mtimeMs, ctimeMs: st.ctimeMs, size: st.size, ino: st.ino } };
      } catch (e) {
        const code = (e as NodeJS.ErrnoException).code;
        p = code === 'ENOENT' || code === 'ENOTDIR' ? { kind: 'missing' } : { kind: 'unreadable' };
      }
    }
    this.#probes.set(relPath, p);
    return p;
  }

  async #checkQuote(src: QuoteSource, relPath: string, followRename: boolean): Promise<EvidenceReport> {
    const report = (outcome: Outcome, detail: EvidenceDetail): EvidenceReport => ({ outcome, detail, path: relPath });
    const p = this.#probe(relPath);
    if (p.kind === 'missing') {
      if (!followRename) return report('stale', 'deleted');
      const r = await this.#rename(src.commit, relPath);
      if (r.status === 'unknown') return report('unknown', 'unreachable-commit');
      // 'same' with the file gone means it was removed from this worktree's working tree.
      if (r.status !== 'renamed' || r.newPath === undefined) return report('stale', 'deleted');
      const moved = await this.#checkQuote(src, r.newPath, false);
      return moved.detail === 'found' ? { ...moved, detail: 'renamed' } : moved;
    }
    if (p.kind === 'unreadable') return report('unknown', 'unreadable');
    if (p.stat.size > MAX_BYTES) return report('unknown', 'too-large');

    const id = this.contentId(relPath);
    if (id === null) return report('unknown', 'unreadable');
    let result = this.#cache.getEvidence(id, src.quote);
    if (result === null) {
      const map = this.#anchorMap(p.abs, id);
      if (map === null) return report('unknown', 'unreadable');
      result = locate(map, src);
      this.#cache.putEvidence(id, src.quote, result);
    }
    return result === 'found' ? report('holds', 'found') : report('suspect', result);
  }

  /** One anchor map per content id per request. Null when the bytes no longer match `contentId`. */
  #anchorMap(abs: string, contentId: string): AnchorMap | null {
    const memo = this.#maps.get(contentId);
    if (memo !== undefined) return memo;
    let bytes: Buffer;
    try {
      bytes = fs.readFileSync(abs);
    } catch {
      return null;
    }
    // The file changed since it was hashed: a result computed now would be stored under the wrong id.
    if (sha256(bytes) !== contentId) return null;
    const map = buildAnchorMap(bytes.toString('utf8'));
    this.#maps.set(contentId, map);
    return map;
  }

  async #checkLegacy(src: LegacyFileSource): Promise<EvidenceReport> {
    const relPath = src.resource;
    const report = (outcome: Outcome, detail: EvidenceDetail): EvidenceReport => ({ outcome, detail, path: relPath });
    const p = this.#probe(relPath);
    // A legacy source has no commit to look a rename up from.
    if (p.kind === 'missing') return report('stale', 'deleted');
    if (p.kind === 'unreadable') return report('unknown', 'unreadable');
    if (p.stat.size > MAX_BYTES) return report('unknown', 'too-large');
    let bytes: Buffer;
    try {
      bytes = fs.readFileSync(p.abs);
    } catch {
      return report('unknown', 'unreadable');
    }
    const sha1 = createHash('sha1').update(bytes).digest('hex').slice(0, 12);
    return sha1 === src.legacyFile ? report('holds', 'legacy-match') : report('suspect', 'legacy-mismatch');
  }

  /**
   * Where `relPath` as of `commit` is at HEAD, cached per (commit, HEAD tree). `unknown` is never
   * persisted: the commit may become reachable after a fetch without the tree changing.
   */
  async #rename(commit: string, relPath: string): Promise<RenameResultJson> {
    const git = this.#git;
    if (git === null) return { status: 'deleted' };
    this.#tree ??= git.tree();
    const tree = await this.#tree;
    if (tree === null) return git.renameLookup(commit, relPath);

    const key = `${commit}\0${tree}`;
    let map = this.#renames.get(key);
    if (map === undefined) {
      map = this.#cache.getRename(commit, tree) ?? {};
      this.#renames.set(key, map);
    }
    const known = map[relPath];
    if (known !== undefined) return known;
    const r = await git.renameLookup(commit, relPath);
    const entry: RenameResultJson = r.newPath === undefined ? { status: r.status } : { status: r.status, newPath: r.newPath };
    if (entry.status !== 'unknown') {
      map[relPath] = entry;
      this.#cache.putRename(commit, tree, map);
    }
    return entry;
  }
}
