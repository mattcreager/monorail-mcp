/**
 * Serialising what monorail_probe returns: turn any value from the plugin
 * sandbox into JSON the plugin can post, within size limits, and say so
 * whenever a limit cut something.
 *
 * The first version capped arrays at 50 items and objects at 80 keys and said
 * nothing. On 2026-09-27 two tree dumps came back cut at exactly 50 rows (50
 * of 56 TEXT nodes), and the only workaround was returning one joined string.
 * Now a cut array ends with a marker item, a cut object gets a "…" key, and
 * the reply carries a `truncation` report the server turns into a warning.
 *
 * Bundled into the plugin (figma-plugin/code.ts) and tested from dist/.
 */

export interface ProbeLimits {
  /** Items kept per array. */
  maxItems: number;
  /** Keys kept per object. */
  maxKeys: number;
}

export const DEFAULT_PROBE_LIMITS: Readonly<ProbeLimits> = { maxItems: 50, maxKeys: 80 };
export const MAX_PROBE_ITEMS = 10_000;
export const MAX_PROBE_KEYS = 10_000;
export const MAX_PROBE_DEPTH = 12;
/** The marker key a cut object gets. */
export const MORE_KEYS = '…';

export interface Truncation {
  /** Arrays cut at maxItems. */
  arrays: number;
  /** Objects cut at maxKeys. */
  objects: number;
  /** Arrays and objects shown as "[array n]" / "[object T]" because the depth ran out. */
  depth: number;
  /** Up to five places something was cut, e.g. "$.result.texts: 56 items, kept 50". */
  examples: string[];
  limits: ProbeLimits & { depth: number };
}

function clampInt(v: unknown, fallback: number, min: number, max: number): number {
  const n = typeof v === 'number' && Number.isFinite(v) ? Math.floor(v) : fallback;
  return Math.min(max, Math.max(min, n));
}

export function clampDepth(v: unknown, fallback: number): number {
  return clampInt(v, fallback, 1, MAX_PROBE_DEPTH);
}

/**
 * A safeJson(value, depth) bound to one probe call, plus the report of what it
 * cut across every value it serialised.
 */
export function createSafeJson(limits: Partial<ProbeLimits> = {}) {
  const maxItems = clampInt(limits.maxItems, DEFAULT_PROBE_LIMITS.maxItems, 1, MAX_PROBE_ITEMS);
  const maxKeys = clampInt(limits.maxKeys, DEFAULT_PROBE_LIMITS.maxKeys, 1, MAX_PROBE_KEYS);
  let deepest = 0;
  const truncation: Truncation = { arrays: 0, objects: 0, depth: 0, examples: [], limits: { maxItems, maxKeys, depth: 0 } };
  const note = (path: string, what: string) => {
    if (truncation.examples.length < 5) truncation.examples.push(`${path}: ${what}`);
  };

  function safeJson(v: unknown, depth = 3, path = '$'): unknown {
    deepest = Math.max(deepest, depth);
    const seen = new WeakSet<object>();
    const walk = (x: any, d: number, path: string): unknown => {
      if (x === null || typeof x !== 'object') {
        if (typeof x === 'function') return `[fn ${x.name || 'anonymous'}]`;
        if (typeof x === 'symbol' || typeof x === 'bigint') return String(x);
        return x;
      }
      if (seen.has(x)) return '[circular]';
      if (d <= 0) {
        truncation.depth++;
        note(path, 'depth limit');
        return Array.isArray(x) ? `[array ${x.length}]` : `[object ${x.type ?? x.constructor?.name ?? ''}]`;
      }
      seen.add(x);
      if (Array.isArray(x)) {
        const out: unknown[] = x.slice(0, maxItems).map((item, i) => walk(item, d - 1, `${path}[${i}]`));
        if (x.length > maxItems) {
          truncation.arrays++;
          note(path, `${x.length} items, kept ${maxItems}`);
          out.push(`[… ${x.length - maxItems} more items, ${x.length} in all: raise max_items, or return a string]`);
        }
        return out;
      }
      const keys = Object.keys(x);
      const out: Record<string, unknown> = {};
      for (const k of keys.slice(0, maxKeys)) {
        try {
          out[k] = walk(x[k], d - 1, `${path}.${k}`);
        } catch (e) {
          out[k] = `[throws: ${e instanceof Error ? e.message : String(e)}]`;
        }
      }
      if (keys.length > maxKeys) {
        truncation.objects++;
        note(path, `${keys.length} keys, kept ${maxKeys}`);
        out[MORE_KEYS] = `${keys.length - maxKeys} more keys, ${keys.length} in all: raise max_keys, or return a string`;
      }
      return out;
    };
    return walk(v, depth, path);
  }

  /** Cut a list of names (not a JSON value) the same way, marking the cut. */
  function capList(names: string[], max: number, path: string): string[] {
    if (names.length <= max) return names;
    truncation.arrays++;
    note(path, `${names.length} names, kept ${max}`);
    return [...names.slice(0, max), `[… ${names.length - max} more, ${names.length} in all]`];
  }

  return {
    safeJson,
    capList,
    /** The report for the reply, or undefined when nothing was cut. */
    report(): { truncated: boolean; truncation?: Truncation } {
      truncation.limits.depth = deepest;
      const cut = truncation.arrays + truncation.objects;
      if (cut === 0 && truncation.depth === 0) return { truncated: false };
      return { truncated: cut > 0, truncation };
    },
  };
}

/**
 * One line (or none) for the top of a probe result.
 *
 * `reply` is the plugin's probe-result. A plugin build from before the marker
 * sends no `truncation`, so for those, flag arrays of exactly 50 items and
 * objects of exactly 80 keys: that's where the old caps cut, silently.
 */
export function describeTruncation(reply: Record<string, unknown>): string | null {
  const t = reply.truncation as Truncation | undefined;
  if (t && typeof t === 'object') {
    const parts: string[] = [];
    if (t.arrays) parts.push(`${t.arrays} list${t.arrays === 1 ? '' : 's'} cut at ${t.limits?.maxItems} items`);
    if (t.objects) parts.push(`${t.objects} object${t.objects === 1 ? '' : 's'} cut at ${t.limits?.maxKeys} keys`);
    const where = t.examples?.length ? ` (${t.examples.join('; ')})` : '';
    if (parts.length) {
      return `⚠ Truncated: ${parts.join(', ')}${where}. Raise max_items / max_keys, or return one string, to get everything.`;
    }
    if (t.depth) {
      return `Note: ${t.depth} value${t.depth === 1 ? '' : 's'} below depth ${t.limits?.depth} shown as [array n] / [object T]. Raise max_depth to expand them.`;
    }
    return null;
  }
  // Older plugin build: no report, so look for the old silent caps.
  const suspects: string[] = [];
  const seen = new WeakSet<object>();
  const scan = (x: unknown, path: string) => {
    if (!x || typeof x !== 'object' || seen.has(x) || suspects.length >= 3) return;
    seen.add(x);
    if (Array.isArray(x)) {
      if (x.length === DEFAULT_PROBE_LIMITS.maxItems) suspects.push(`${path} has exactly ${x.length} items`);
      x.forEach((v, i) => scan(v, `${path}[${i}]`));
      return;
    }
    const keys = Object.keys(x);
    if (keys.length === DEFAULT_PROBE_LIMITS.maxKeys) suspects.push(`${path} has exactly ${keys.length} keys`);
    for (const k of keys) scan((x as Record<string, unknown>)[k], `${path}.${k}`);
  };
  scan(reply.result ?? reply.values ?? reply, '$');
  if (suspects.length === 0) return null;
  return `⚠ Possibly truncated: ${suspects.join('; ')}. This plugin build cuts lists at 50 items and objects at 80 keys without saying so; re-run the plugin in Figma to get the build that marks cuts, or return one string.`;
}
