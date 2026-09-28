# The proxy wedge of 2026-09-27

On 2026-09-27 about eleven Claude sessions shared one Figma plugin through the
monorail proxy. Two things went wrong:

1. **Under parallel use, calls stopped answering for the rest of the day.** A
   probe or css call stayed "busy" for at least 21 minutes (16:46 to 17:07+).
   Later calls failed with `Probe timed out`, `Timeout waiting for CSS
   extraction` or "Another probe is in progress".
2. **After the proxy was restarted, nothing came back by itself.** The plugin
   had to be re-run by hand, and none of the eleven live MCP servers
   reconnected. Right after the restart the proxy reported 0 plugins and 0
   upstreams.

This note gives the causes (file:line at `4f70a20`, the code before the fix),
how they were reproduced, what changed, and what still needs a person.

The first round of fixes (§3) was reviewed and stress-tested the same night.
The review found that the proxy was open to any web page and the local
network, that the fix traded wedges for interleaved edits and for callers
failing instead of waiting, and that a cancelled call still held the plugin.
A second round on 2026-09-28 closed those findings (§8). Where §3 and §8
differ (`busy`, what a sender's disconnect does, direct mode), §8 is current.
§4 to §7 describe the state after both rounds.

Earlier diagnoses: `www-redesign/eval-2026-09-27/design-how.md` §7,
`design-integrate.md` §5.2 and `tooling.md` §1.1. They were right about the
proxy lock and the ignored `busy`. What they missed is the plugin paths that
never reply (§1.4) and that nothing reconnects (§2).

## How the pieces talk

```
Figma plugin (code.ts ⇄ ui.html)  ──ws──▶  proxy :9876 (downstream)
                                            proxy :9877 (upstream)  ◀──ws──  MCP server × N (one per Claude session)
```

Each Claude session runs its own MCP server (`src/index.ts`). The first
server that finds no proxy spawns one (`src/proxy.ts`), detached. The plugin
UI (`ui.html`) owns the WebSocket and relays messages to and from the
sandboxed plugin code (`code.ts`) with `postMessage`.

## Reproduction

`test/fake-plugin.js` is a WebSocket client on the downstream port that
answers each request like the real plugin, after a delay, or never
(`nodeId: "hang"`, `"slow:<ms>"`). `test/repro-wedge.js` drives a proxy with
several fake upstreams and real MCP servers, all on ephemeral ports, and
prints a timeline. It never touches the live 9876/9877.

```sh
# the code before the fix: build 4f70a20 somewhere and copy its dist/ to tmp/head/dist
node test/repro-wedge.js --dist tmp/head/dist --ui-rev 4f70a20
# the current build
npm run build && node test/repro-wedge.js
```

Scenario E runs `figma-plugin/ui.html` itself (from the working tree, or from
`--ui-rev`) in a VM against the proxy, using Node's `ws` as the browser
WebSocket (`test/ui-harness.js`).

At `4f70a20` (condensed):

```
A  agent-1 sends get-css to a node whose handler never replies
A  agent-2 got busy in 4ms: {"type":"busy","message":"Another session has an inflight request. Retry shortly."}
A  status-query: {"pluginCount":1,"upstreamCount":4,"activeUpstream":"agent-1","files":[]}
A  agent-1 heard back: nothing
A  other agents over ~6s: 36 busy, 0 answered
B  monorail_css returned after 30.0s: Error extracting CSS: Timeout waiting for CSS extraction
C  call 1: monorail_css on node "slow:33000" → Timeout waiting for CSS extraction
C  call 2: monorail_css on node "B" → ✓ CSS for "node slow:33000"
D  4s after proxy restart: {"pluginCount":0,"upstreamCount":0}
D  monorail_css after restart → Error: No Figma plugin connected.
E  ui.html (4f70a20) connected: pluginCount=1
E  5s after proxy restart: pluginCount=0; the UI's status label says "Disconnected"
```

- **A** is the wedge. One request the plugin never answers holds the lock
  forever: 36 busy replies and 0 answers. Status can't say who holds it.
- **B**: the proxy says busy in 4ms, and the server waits 30 seconds and then
  reports a timeout.
- **C**: the late reply to call 1 resolves call 2, so call 2 returns the
  wrong node's CSS.
- **D**: after a restart the server never comes back.
- **E**: after a restart the plugin UI never comes back either.

The current build's run is in §3.

## 1. Why calls stopped answering

### 1.1 One global lock with no timeout and no ids (proxy)

- `src/proxy.ts:50`: `let inflight: Inflight | null`. That is one slot for
  every session, every plugin and every request type. `Inflight`
  (`:40-43`) records only the upstream and downstream ids, with no request
  id, type or start time.
- `:287-302`: a request takes the slot and is forwarded. Nothing ever sets a
  deadline on it.
- The slot is freed in only three places: a reply of any response type from
  any plugin (`:169-175`), the plugin disconnecting (`:196`), or the
  requesting server disconnecting (`:322`). So if the reply never comes, and
  nobody disconnects, the slot stays taken for good. Every other session gets
  `busy` (`:288`) until someone restarts the proxy. That is what happened
  from 16:46.
- `:169-175`: a reply is matched to nothing. Whatever arrives next clears the
  slot and goes to the slot's owner. `:322` frees the slot when a session
  disconnects even though the plugin is still working, so that session's late
  reply can land on the next session's request.
- `:252-262`: `status-response` has no holder, age or TTL, so nobody could
  see who held the lock or for how long.
- `:334-350`: the heartbeat pings upstreams and never checks for pongs. It
  never pings the plugin at all. A half-open plugin socket (after sleep, or a
  Figma tab gone without a close frame) stays "connected" and keeps getting
  picked as the most recent plugin. Every request sent to it is lost.

### 1.2 The server ignores `busy` and errors (server)

- `src/index.ts:3207-3209`: `busy` is only logged. The pending request isn't
  rejected, so the caller waits the full `REQUEST_TIMEOUT_MS = 30000`
  (`:3137`) and gets "Timeout waiting for …", which reads like a plugin
  problem.
- `:3319`: the proxy's `{type:"error"}` replies ("No Figma plugin connected",
  "Not registered") fall through to "Unknown message type". That is also a
  silent 30-second wait.

### 1.3 Pending requests keyed by type (server)

- `src/index.ts:3135`: `pendingRequests = new Map<RequestType, …>`, one
  entry per type per process. Sub-agents in one Claude Code process share one
  MCP server, so sibling sub-agents blocked each other: `:3145` returned
  "Another probe is in progress" five times in a row on 2026-09-27.
- `:3162`: `resolvePendingRequest(type, …)` resolves whichever request of
  that type is waiting. After a timeout, the plugin's late reply resolves the
  *next* call of the same type with the old payload (scenario C). No request
  carried an id.
- `:3137`: one flat 30-second timeout for everything, including a
  `getCSSAsync` on a large node or a probe that walks a big subtree.

### 1.4 Plugin paths that never reply (plugin)

Any request the plugin doesn't answer holds the lock from §1.1 forever.
Three kinds of path never answered:

- `figma-plugin/code.ts:5499-5502`: the outer `catch` of the message handler
  only calls `figma.notify`. Handlers with no try of their own around their
  setup code (`export-ir` from `:3416`, `patch-elements`, `capture-template`,
  `get-component-info`, `delete-slides`, `apply-ir`) sent no reply when they
  threw.
- `code.ts:3102-3111`: `apply-ir` returns after a notify when the IR is
  missing or doesn't parse.
- `figma-plugin/ui.html:776`: the UI relays `template-captured` with
  `JSON.parse(msg.template)`. The plugin's error replies (`code.ts:3570`,
  `:3597`, "Slide not found") carry no `template`, so the parse throws in the
  UI and nothing goes back. `ui.html:742` does the same with `exported`.
- `ui.html:610-613`: `push-ir` without `autoApply` only shows a toast.
  Nothing replies, yet the proxy took the lock for it (`push-ir` is a request
  type at `proxy.ts:59-64`). Meanwhile `monorail_push` (`index.ts:1404`) sent
  `push-ir` without waiting, so a push the proxy refused as busy still
  reported "✓ Pushed".

Which request held the lock at 16:46 wasn't logged, and the proxy of that
day is gone. The eval reports put a heavy probe (the Governance subtree, 171
line nodes) just before the lockup. A slow or failed plugin reply combined
with §1.1 explains every symptom, and each path above wedges the lock the
same way in the fake-plugin harness.

### 1.5 The probe cut results silently

`code.ts:5378`, `:5380`: `safeJson` kept 50 items per array and 80 keys per
object and gave no sign that it had cut anything. `:5403` did the same at
200 names in `globals`. Two tree dumps came back as exactly 50 of 56 rows
and were read as complete.

## 2. Why nothing came back after the proxy restart

- **The servers never reconnect.** `src/index.ts:3434-3455`
  (`startConnection`) connects to the proxy once, at startup. The socket's
  `close` handler (`:3339-3352`) sets `connectedPlugin = null` and does
  nothing else. From then on every tool answers "No Figma plugin connected"
  until the Claude session restarts (scenario D; live: 0 upstreams after the
  restart).
- **The plugin UI never reconnects.** `ui.html:692-694` connects once, 500ms
  after the plugin opens. `ws.onclose` (`:671-676`) updates the status label
  and sets `ws = null`. Only a click on the status dot, or re-running the
  plugin, connects again.
- **Status said "connected" anyway.** `index.ts:1135`, `:1148`: in proxy
  mode "connected" meant the socket to the *proxy* was open, so
  `monorail_status` printed "✓ Figma plugin connected" with zero plugins
  attached.
- **The sessions were indistinguishable.** `index.ts:3335` labels a session
  with `TERM_PROGRAM`, so all eleven registered as "tmux"
  (`activeUpstream: "tmux"`).
- **The proxy logs went nowhere.** A spawned proxy ran with
  `stdio: "ignore"` (`index.ts:3415`).

## 3. What changed (first round)

The same repro on the first-round build (condensed; the second round answers
agent-2 with `queued` instead of `busy`, see §8):

```
A  agent-2 got busy in 1ms: {"type":"busy","retryable":true,"retryAfterMs":250,
     "holder":{"type":"get-css","label":"agent-1","ageMs":51,"ttlMs":3000,"expiresInMs":2949}, …}
A  agent-1 heard back: {"type":"error","code":"PROXY_TTL_EXPIRED","message":"… did not answer get-css within 3.0s (proxy TTL) …"}
A  other agents over ~6s: 30 busy, 6 answered (first at +3.6s)
B  monorail_css returned after 10.0s: get-css: the Figma plugin is busy: get-css from "holder" has held it
     for 10.5s (released within 19.5s). Retried 35× over 10.0s; this is retryable, so try again shortly.
C  call 1 → ✓ CSS for "node slow:33000"   (css now waits up to 90s)
C  call 2 → ✓ CSS for "node B"
D  4s after proxy restart: {"pluginCount":1,"upstreamCount":1, …}
D  monorail_css after restart → ✓ CSS for "node after"
E  5s after proxy restart: pluginCount=1
```

| Commit | Concern |
|---|---|
| `fix: proxy tracks each request by id with a TTL and answers busy at once` | `src/proxy.ts`, `shared/protocol.ts` |
| `fix: server matches replies by request id and reconnects to the proxy` | `src/index.ts` |
| `fix: plugin answers every request, and echoes its id` | `figma-plugin/code.ts`, `ui.html` |
| `feat: plugin UI reconnects to the proxy with backoff` | `figma-plugin/ui.html` |
| `fix: monorail_probe marks every cut instead of stopping at 50 silently` | `shared/probe.ts`, plugin and server |
| `test: fake-plugin harness, bridge tests and the proxy wedge write-up` | this note, the fake plugin, the repro, and the tests |

The second round's commits are listed in §8.

### Protocol 2

Every request may carry three new fields (`shared/protocol.ts`):

- `requestId` is the sender's id. The reply echoes it.
- `timeoutMs` is how long the sender waits. The proxy uses it as the
  request's TTL.
- `clientLabel` says who is asking. It is shown to anyone the request makes
  wait.

The proxy's replies to a sender:

```jsonc
{ "type": "busy", "requestId": "…", "retryable": true, "retryAfterMs": 250,
  "holder": { "type": "get-css", "label": "www-redesign@tmux pid 5678", "ageMs": 2100, "ttlMs": 90000, "expiresInMs": 87900 },
  "message": "Figma plugin busy: get-css from \"…\" has been in flight for 2.1s (the proxy releases it within 87.9s). Retry shortly." }
{ "type": "error", "code": "PROXY_TTL_EXPIRED" | "PLUGIN_DISCONNECTED" | "NO_PLUGIN" | "NOT_REGISTERED",
  "retryable": true, "requestId": "…", "requestType": "get-css", "message": "…" }
```

### Proxy

- It keeps one request in flight *per plugin*, tracked by id, with a TTL.
  The plugin sandbox runs one thing at a time, and a reply from an older
  plugin build can only be matched to "the request in flight". When the TTL
  runs out, the entry is released, logged, and kept in `recentExpired`. The
  sender gets `PROXY_TTL_EXPIRED`.
- `busy` goes out at once, names the holder and says when it will be
  released.
- The plugin sees the proxy's own id (`px-N`), so ids from different
  sessions can't collide. Replies are matched by that id. For plugin builds
  without ids, the proxy matches by the reply type of the request in flight.
  A late or wrong reply is dropped and recorded in `recentLate` or
  `orphanReplies`. It is never handed to someone else.
- When the sender disconnects, its request stays in flight until the plugin
  answers or the TTL runs out, because the plugin is still working on it.
  When the plugin disconnects, the request fails at once with
  `PLUGIN_DISCONNECTED`.
- The heartbeat pings both sides and drops a socket after two missed pongs.
- `status-response` keeps every old field and adds `protocol`, `pid`,
  `uptimeMs`, `plugins` (with `features` and `busy`), `upstreams`,
  `inflight` (the holder), `recentExpired`, `recentLate` and
  `orphanReplies`.
- `push-ir` with `autoApply: false` no longer takes the lock.
- `hello` and `selection-changed` go to every session, not only the last one
  to make a request.
- It binds 9877 before 9876 and exits cleanly on `EADDRINUSE`. When several
  servers spawn a proxy at once, one wins both ports and the rest exit.

### MCP server

- Every request goes through `pluginRequest()`. It has its own id, and
  `busy`, `error` and the reply all settle *that* request. Sibling
  sub-agents no longer block each other, and a late reply can't resolve a
  different call.
- On `busy` it retries with jitter for up to 10 seconds
  (`MONORAIL_BUSY_RETRY_MS`), then fails with a retryable error that names
  the holder.
- Each request type has its own timeout (`DEFAULT_TIMEOUT_MS`): 90 seconds
  for `get-css` and `export-node`, 120 for probes, 30 to 60 for the rest.
  `monorail_css`, `monorail_export` and `monorail_probe` take `timeout_ms`.
  `MONORAIL_TIMEOUT_MS` overrides them all. Each error says which limit
  fired: the proxy TTL, the server-side timeout (the proxy TTL plus 2
  seconds, reached only if the proxy never reports), busy, a disconnect, or
  no plugin.
- When the link to the proxy closes, in-flight calls fail at once with "the
  connection to the monorail proxy closed". The server then reconnects with
  jittered exponential backoff (250ms to 10s,
  `MONORAIL_RECONNECT_MIN_MS`/`MAX_MS`). If nothing is listening it starts
  a proxy, at most once every 15 seconds (`MONORAIL_SPAWN_COOLDOWN_MS`;
  `MONORAIL_PROXY_SPAWN=0` turns this off). It drops a link the proxy has
  gone silent on for three heartbeats. A tool call made during a reconnect
  waits up to 3 seconds for it.
- Behind a protocol 1 proxy, or in direct mode, it sends one request at a
  time, so replies without ids still match.
- The label is `<cwd basename>@<TERM_PROGRAM> pid <pid>`, or
  `MONORAIL_HOST_LABEL`.
- `monorail_status` asks the proxy. It reports the plugin build and file,
  the proxy (pid, protocol, uptime, session count), this session, who holds
  the plugin and for how long, and recent TTL expiries. When the proxy has no
  plugin, it says so.
- `monorail_push` waits for `applied` when `autoApply` is on.
- A spawned proxy logs to `~/Library/Logs/monorail-proxy.log`
  (`MONORAIL_PROXY_LOG`). The server exits when its stdin closes, so it
  doesn't keep reconnecting on behalf of a session that's gone.

### Plugin

- `code.ts` wraps the handler's `postMessage`. Every reply echoes the
  request's `requestId`. A `finally` block posts
  `{ type: <expected>, success: false, error }` if the handler posted
  nothing, so every request gets exactly one reply.
- `ui.html` carries `requestId` in both directions. It parses the IR and
  the template defensively, and forwards `success`/`error` on the replies
  whose relays used to drop them.
- `ui.html` reconnects when the socket closes, with jittered backoff from
  500ms to 10s. A Disconnect the user asked for, or an unticked Auto-connect
  box, stops it.
- `hello` reports version `0.2.0` and features
  `["request-id", "auto-reconnect"]`. `monorail_status` uses this to flag an
  older build.
- `monorail_probe` marks every cut. A cut list ends with
  `"[… N more items, M in all: …]"` and a cut object gets a `"…"` key. The
  reply carries `truncated` and `truncation`, and the server prints a warning
  line above the JSON. For older plugin builds the server flags lists of
  exactly 50 items as possibly cut. `max_items`, `max_keys` and `max_depth`
  raise the limits.

## 4. Compatibility

| Sender ↔ receiver | Works? | Notes |
|---|---|---|
| new server ↔ new proxy ↔ new plugin | yes | ids end to end, the queue, cancel, writes held past their TTL, the plugin's own queue |
| new server ↔ new proxy ↔ **plugin 0.2.0** (ids, no queue) | yes | the proxy still holds writes past their TTL, so edits don't interleave. A read released at its TTL can run alongside the next request in that build. |
| new server ↔ new proxy ↔ **plugin 0.1.x** (no ids) | yes | matched by reply type, one request at a time; a sender's cancel or disconnect doesn't release the plugin early. A reply after its TTL, while a request of the same type is in flight, can still be misattributed. |
| **server from before 2026-09-28** ↔ new proxy | **no** | it sends no token: every call fails with `UNAUTHORIZED` and says to restart the session or `/mcp` reconnect |
| script ↔ new proxy | with a token | it must send `token` (the contents of `~/.monorail/token`) in `register`. Without `protocol: 3` it waits in the queue silently and gets its reply without a requestId, as before; it never sees `busy`. |
| new server ↔ **older proxy** (protocol 1-2) | yes | the server retries `busy` until its own deadline and `NO_PLUGIN` for 3s. An older proxy has none of the checks in §8. |

## 5. What happens to the servers that are already running

An MCP server loads `dist/` into memory when its session starts. Rebuilding
doesn't change it, and nothing on the proxy side can upgrade it: **every
session started before the second round needs a restart, or `/mcp` and
reconnect monorail, to use the plugin.**

At the second-round restart (2026-09-28 04:56 UTC) twelve MCP server
processes were alive:

- Ten started on 2026-09-23 to 09-27 (nine tōryō sessions in `~/Code/www`,
  one shisho session in `~/Code/bigboss`). They run code from before the
  first round, lost their socket at the first restart on 09-27, and never
  reconnect.
- Two banto sessions in `~/Code/bigboss` (server pids 4929 and 7300, started
  09-28 00:21 local) run the first-round build. They reconnected to the new
  proxy at once and were refused: they send no token. Their calls fail with
  `UNAUTHORIZED` and an explanation until those sessions restart.

A new session, or `/mcp` reconnect, starts the current build, which
registers with the token.

## 6. Operating it

- **Restart the proxy:** `kill` the pid that `lsof -nP -iTCP:9877 -sTCP:LISTEN`
  (or `monorail_status`) shows. A running server brings one back within
  about a second, or start it by hand:
  `cd ~/Code/monorail-mcp && nohup node dist/src/proxy.js >> ~/Library/Logs/monorail-proxy.log 2>&1 &`.
  Sessions and the plugin reconnect by themselves.
- **Pair the plugin (once):** run `monorail_status` in any current session.
  It prints a pairing code; paste it into the Pair field in the Monorail
  plugin window. From then on only paired plugins get requests
  (`~/.monorail/pairing-enforced` records that). Without a session at hand:
  `node -e "import('$HOME/Code/monorail-mcp/dist/src/auth.js').then(a=>console.log(a.pairingCodeFor(a.readOrCreateToken())))"`.
- **The token:** `~/.monorail/token` (mode 0600), created on first use.
  Deleting it rotates the token and the pairing code: restart the sessions
  and pair again.
- **Plugin build:** re-run the plugin in Figma after `code.ts` or `ui.html`
  changes. `monorail_status` flags a build without the request queue.
- **Who holds the plugin, and who waits:** `monorail_status`, or send
  `{"type":"status-query","token":"…"}` to :9877.
- **Logs:** `~/Library/Logs/monorail-proxy.log` has timestamps, refused
  handshakes and registrations (with their Origin), pairing, queue
  timeouts, TTL expiries, writes held past their TTL, cancels, and late or
  orphan replies.
- **Knobs:** `MONORAIL_TIMEOUT_MS`, `MONORAIL_WRITE_HOLD_MS` (120000),
  `MONORAIL_NO_PLUGIN_WAIT_MS` (3000), `MONORAIL_QUEUE_LIMIT` (64),
  `MONORAIL_HEARTBEAT_MS`, `MONORAIL_SPAWN_COOLDOWN_MS` (1000, doubling),
  `MONORAIL_PROXY_SPAWN=0`, `MONORAIL_DIRECT=1`, `MONORAIL_HOME`.

## 7. Not fixed here

- **An eval that blocks the plugin's thread.** A synchronous `findAll` on a
  huge page blocks the plugin itself. A read's TTL frees the queue, but the
  plugin can't answer anyone until the work finishes, and a time budget
  inside the probe can't interrupt synchronous code.
- **Pairing isn't enforced until someone pairs.** Until the code is pasted
  once, a page that opens a sandboxed iframe (Origin `null`) can still
  connect to :9876 as the plugin and receive requests. Pairing closes that;
  it was left opt-in so that the upgrade didn't cut off the plugin that was
  running.
- **Local processes of the same user** can read the token and drive the
  plugin. The token keeps out browsers, other users and sandboxed apps, not
  code already running as you.
- **Scripts that talk to :9877 directly** must now send the token.
  `www-redesign/eval-2026-09-27/harness/lib/monorail.mjs` doesn't (it's in
  another repo, so it wasn't changed here): it fails with the proxy's
  `UNAUTHORIZED` message until its `register` carries
  `token: fs.readFileSync(os.homedir() + '/.monorail/token', 'utf8').trim()`.
- **Plugin 0.1.x builds and late replies of the same type:** see §4.
- **`ui.html` drops `stepSeconds`, `buildMode` and `transition`** on its
  `apply-primitives` relay (`ui.html:646` at `4f70a20`), although `code.ts`
  reads them. `monorail_primitives`' `step_seconds`, `build_mode` and
  `transition` never reach the plugin. It's unrelated to the wedge and it's a
  Figma write path, so it's left for its own change.
- **`fileKey` is always null** without `enablePrivatePluginApi`
  (`tooling.md` §1.1), so routing by file can't work. With two files open,
  requests go to the (paired) plugin that connected last.

## 8. The second round (2026-09-28)

An independent review of the first round (verdict: ship with fixes) reran the
fixer's claims and stress-tested the build: 8 real MCP servers, raw
protocol 1 clients, rude clients that disconnect mid-request, a fake plugin
that is fast, slow, silent or late, and four faults (proxy SIGTERM, SIGSTOP
for 20s, SIGKILL, plugin socket dropped). Nothing hung and nothing was
misrouted, but it found the problems below. Each fix is its own commit.

| Severity | Finding | Fix | Commit |
|---|---|---|---|
| high | Both ports listened on every interface and took any handshake. A web page could register on :9877 and run `apply-probe` eval in the plugin, or connect to :9876 as a fake plugin and receive every session's requests (browsers don't apply CORS to WebSockets). | Loopback only (127.0.0.1 and ::1). :9877 refuses any Origin; both refuse a non-loopback Host. `register` needs the token in `~/.monorail/token`. :9876 accepts Origin `null` or figma.com, and once a plugin has paired, only paired plugins get requests. Direct mode is opt-in. | `e0798e7` |
| medium | When a TTL expired the proxy sent the next request while the plugin was still working, and the async handlers interleaved at every await: two writes could land on one document at once. | The plugin runs one request at a time (`3562467`). The proxy holds the plugin for a write past its TTL until it answers, up to `WRITE_HOLD_MS` (`bb8112c`). | `3562467`, `bb8112c` |
| medium | Cancelling a tool call didn't release the plugin: an aborted 30s probe still held it, and other sessions failed BUSY. | Each call's abort signal withdraws its request: dropped from the queue, released at once if it's a read in flight, kept until it answers if it's a write. A sender's disconnect is handled the same way. | `0753f0f` |
| medium | No queue, only polling: a busy caller retried for 10s and failed even with a 120s timeout, so 117 of 338 calls failed BUSY, and protocol 1 clients got 7 answers from 408 sends. | One FIFO queue; each request keeps its own deadline (its timeoutMs from arrival) and hears `queued`. The worst-case wait is stated in the `timeout_ms` descriptions. | `bb8112c` |
| low | NO_PLUGIN failed at once, so every call failed during a 0.5s plugin reconnect. | A request waits up to 3s for a plugin; a read in flight when the plugin drops is re-queued. | `bb8112c` |
| low | One server in direct mode trapped every other server in an endless respawn loop. | No automatic direct mode. Spawning backs off (1s doubling to 60s) and resets on connect. | `e0798e7`, `80b31be` |
| low | The watchdog used the server's own heartbeat setting, not the proxy's. | The proxy says `heartbeatMs` in `registered`. | `80b31be` |
| low | After two proxy deaths within 15s, nobody restarted the proxy until the 15s cooldown ended. | The cooldown starts at 1s. | `80b31be` |

The stress run also showed that queueing protocol 3 senders while answering
older ones `busy` starved the older ones completely (0 answers from 386
sends). They now wait in the same queue, silently. That is part of `bb8112c`.

### Protocol 3

- `register` carries `token` and `protocol: 3`, and `registered` returns `heartbeatMs`.
- A request waits in the queue. A protocol 3 sender hears
  `{ type: "queued", requestId, position, holder, deadlineInMs, message }`.
  Its reply, or an error, arrives within its `timeoutMs`.
- `{ type: "cancel", requestId }` withdraws a request.
- New error codes: `QUEUE_TIMEOUT` (nothing was sent to Figma), `QUEUE_FULL`,
  `UNAUTHORIZED`, `CANCELLED`.
- For a write, `PROXY_TTL_EXPIRED` now says that the plugin may still be
  applying it and that other requests wait until it answers.
- The plugin's hello carries `pairingCode` and the features `serial`,
  `cancel` and `pairing`. `{ type: "pair", code }` pairs a connected plugin.
  `hello-ack` and `pair-result` say `paired`, `pairingEnforced` and
  `pairingRequired`.
- `status-response` adds `queue`, `inflight[].state` (`inflight` or
  `overdue`), `plugins[].paired`, `routable` and `origin`, and
  `pairingEnforced`. Without the token it holds only the version and counts.

### Tests and the stress rerun

`npm test` passes 156 of 156, including 48 new tests. They cover the queue,
deadlines, write holds, cancel, handshake checks, the token, pairing (proxy,
plugin UI and clientStorage), and the plugin's request queue. Each of the
five commits builds and passes the suite on its own. The plugin typecheck is
clean, and `check:bundle` matches.

The reviewer's scenario was rerun against the final build with production
defaults, except a 5s heartbeat, an 8s timeout for tools without
`timeout_ms`, and a 4s write hold so that silent writes release within the
run. It added writes (12% of calls, some slow, late or silent), callers that
cancel after 0.1 to 3s (16%), a browser-Origin client and a tokenless client
every 5s, and an impostor plugin (Origin `null`, not paired) next to the
paired one. Two minutes, the same four faults:

| | reviewer's run (first round) | this run |
|---|---|---|
| calls | 338 | 371 |
| unfinished, misrouted, unrecognised errors | 0, 0, 0 | 0, 0, 0 |
| BUSY | 117 | 0 |
| NO_PLUGIN | 64 (34 in a 0.5s plugin reconnect) | 0 |
| failed at their own deadline in the queue (QUEUE_TIMEOUT) | — | 121 |
| cancelled by the caller | — | 64 |
| protocol 1 client answers | 7 of 408 sends | 20 of 24 sends (the rest lost to the two proxy kills) |
| a request reaching the plugin while a write was still running | not measured | 0 |
| attacker or impostor requests that reached the plugin | not measured | 0 (36 refused) |
| recovery after SIGTERM / SIGCONT / SIGKILL | 205ms / 525ms / 307ms | 207ms / 725ms / 309ms |

The fake plugin answers one request in ten after 1.5 to 4s, and one in eight
never or after its TTL. Under that load there is more demand than the plugin
can serve, so queue timeouts replace the busy failures. Each one comes at the
call's own deadline and says who held the plugin. The slowest call finished
2.7s past its timeout, during the SIGSTOP, inside the stated
timeout + 2s grace + 3s link wait.

### The live restart

At 04:56:32 UTC the first-round proxy (pid 20114) was stopped with nothing
in flight, and the current build was started by hand (pid 30429, 0.3.0,
protocol 3). It listens on 127.0.0.1 and ::1 for both ports, and created
`~/.monorail/token` (0600). Within 60ms the two banto sessions reconnected and
were refused, since they send no token. The Figma plugin reconnected by
itself 0.9s later. It was already the current build (0.3.0: `serial`,
`cancel`, `pairing`, re-run in Figma at 04:54), with Origin `null`, unpaired.
A new-build server registered, `monorail_status` reported the plugin, and a
`find-nodes` read returned in 183ms. A connection to the LAN address was
refused, and browser-Origin handshakes on both ports got 401.
