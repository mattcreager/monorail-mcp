/**
 * Who may talk to the proxy (node-only; the Figma plugin never imports this).
 *
 * Until 2026-09-28 both proxy ports listened on every interface and took any
 * handshake. Browsers don't apply CORS to WebSockets, so any web page the user
 * visited could open ws://localhost:9877, register, and run `apply-probe` eval
 * inside the Figma plugin, or connect to :9876 as a fake plugin and receive
 * every session's requests. Three things close that:
 *
 * 1. Loopback only. Both ports bind 127.0.0.1 and ::1, never a wildcard.
 * 2. Handshake checks. The upstream port (MCP servers, scripts) refuses any
 *    handshake that carries an Origin header: browsers always send one, Node
 *    `ws` clients never do. The plugin port accepts only the origins a Figma
 *    plugin UI can have (`null`, or a figma.com page) or none. Both refuse a
 *    Host header that isn't a loopback name (DNS rebinding).
 * 3. Secrets. An MCP server proves it runs as this user by sending the token
 *    in ~/.monorail/token (mode 0600) when it registers. The Figma plugin
 *    proves it was paired by the user: its pairing code is derived from the
 *    token, shown by `monorail_status`, and pasted once into the plugin
 *    window. See docs/proxy-wedge-2026-09.md §8.
 */

import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";

/** Where the token and the pairing flag live. MONORAIL_HOME overrides (tests use a temp dir). */
export function monorailHome(): string {
  return process.env.MONORAIL_HOME || path.join(os.homedir(), ".monorail");
}

export function tokenPath(): string {
  return path.join(monorailHome(), "token");
}

function pairingFlagPath(): string {
  return path.join(monorailHome(), "pairing-enforced");
}

const TOKEN_RE = /^[0-9a-f]{64}$/;

function ensureHome(): void {
  const dir = monorailHome();
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  try { fs.chmodSync(dir, 0o700); } catch { /* not ours to change */ }
}

/**
 * The shared secret, created on first use. Creation is atomic (write a temp
 * file, then hard-link it into place), so several servers and a proxy starting
 * at once agree on one token and nobody reads a half-written file.
 */
export function readOrCreateToken(): string {
  const file = tokenPath();
  try {
    const t = fs.readFileSync(file, "utf8").trim();
    if (TOKEN_RE.test(t)) {
      try { if ((fs.statSync(file).mode & 0o077) !== 0) fs.chmodSync(file, 0o600); } catch { /* best effort */ }
      return t;
    }
    // Present but not a token (hand-edited, truncated): replace it.
    const fresh = crypto.randomBytes(32).toString("hex");
    const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(tmp, fresh + "\n", { mode: 0o600 });
    fs.renameSync(tmp, file);
    return fresh;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
  }
  ensureHome();
  const fresh = crypto.randomBytes(32).toString("hex");
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, fresh + "\n", { mode: 0o600 });
  try {
    fs.linkSync(tmp, file);
    return fresh;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
    return readOrCreateToken(); // someone else won the race; use theirs
  } finally {
    try { fs.unlinkSync(tmp); } catch { /* already gone */ }
  }
}

/** Constant-time string comparison. */
export function safeEqual(a: unknown, b: string): boolean {
  if (typeof a !== "string") return false;
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

/**
 * The code the user pastes into the plugin window. Derived from the token, so
 * it changes when the token does, and knowing it doesn't reveal the token.
 */
export function pairingCodeFor(token: string): string {
  const hex = crypto.createHmac("sha256", token).update("monorail plugin pairing v1").digest("hex").slice(0, 16);
  return hex.match(/.{4}/g)!.join("-");
}

/** Accept the code with or without dashes, spaces or capitals. */
export function normalizePairingCode(code: unknown): string {
  return typeof code === "string" ? code.toLowerCase().replace(/[^0-9a-f]/g, "") : "";
}

export function pairingCodeMatches(code: unknown, token: string): boolean {
  return safeEqual(normalizePairingCode(code), normalizePairingCode(pairingCodeFor(token)));
}

/**
 * Pairing is enforced once any plugin has paired successfully: from then on an
 * unpaired plugin gets no requests. Before that (a plugin build from before
 * pairing, or a user who hasn't pasted the code yet) plugins are served as
 * they were, so upgrading the proxy doesn't cut off a plugin that is already
 * running. Delete ~/.monorail/pairing-enforced to go back to that.
 */
export function pairingEnforced(): boolean {
  return fs.existsSync(pairingFlagPath());
}

export function enforcePairing(): void {
  ensureHome();
  fs.writeFileSync(pairingFlagPath(), `paired ${new Date().toISOString()}\n`, { mode: 0o600 });
}

// --- Handshake checks ---

const LOOPBACK_NAMES = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

/** The Host header names this machine (or is absent, as for some raw clients). */
export function isLoopbackHost(host: string | undefined): boolean {
  if (!host) return true;
  const name = host.startsWith("[") ? host.slice(0, host.indexOf("]") + 1) : host.split(":")[0];
  return LOOPBACK_NAMES.has(name.toLowerCase());
}

/** Upstream (MCP servers, scripts): no browser, so no Origin at all. */
export function upstreamOriginAllowed(origin: string | undefined): boolean {
  return origin === undefined;
}

const FIGMA_ORIGIN = /^https:\/\/([a-z0-9-]+\.)*figma\.com$/i;

/** Downstream (the Figma plugin UI): a sandboxed iframe (origin "null"), a figma.com page, or a non-browser client. */
export function downstreamOriginAllowed(origin: string | undefined): boolean {
  return origin === undefined || origin === "null" || FIGMA_ORIGIN.test(origin);
}

/** Addresses both proxy ports (and a direct-mode server) listen on. */
export const LOOPBACK_ADDRESSES = ["127.0.0.1", "::1"] as const;
