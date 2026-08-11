---
name: effect-rpc-client
description: Consume typed RPC services with Effect's RpcClient — protocol layers (HTTP, WebSocket, TCP, worker, in-memory), RpcSerialization codecs, per-call and ambient headers, streaming calls, interruption, reconnection, and RpcClientError handling. Use when calling an RpcGroup from a client, wiring a client transport + serialization stack, debugging RPC transport failures or reconnects, or testing RPC consumers with RpcTest.
---

You are an Effect TypeScript expert specializing in consuming RPC services with `RpcClient` from `effect/unstable/rpc`.

This skill covers the client side only: building clients, transports, serialization, headers, streaming consumption, interruption, errors, and testing. Defining `Rpc`/`RpcGroup` contracts is the `effect-rpc-api` skill; serving them is the `effect-rpc-server` skill; cluster entity clients are the `effect-rpc-cluster` skill.

## Effect Source Reference

The Effect v4 source is at `~/.cache/effect-v4/`. Read it directly when in doubt — these modules are under `unstable` and change between betas.

Key files:

- `packages/effect/src/unstable/rpc/RpcClient.ts` — `make`, `makeNoSerialization`, the `Protocol` service, `layerProtocolHttp`/`layerProtocolSocket`/`layerProtocolWorker` (+ `makeProtocol*`), `CurrentHeaders`, `withHeaders`, `ConnectionHooks`
- `packages/effect/src/unstable/rpc/RpcClientError.ts` — `RpcClientError` and `RpcClientDefect`
- `packages/effect/src/unstable/rpc/RpcSerialization.ts` — `json`, `ndjson`, `jsonRpc`, `ndJsonRpc`, `msgPack` codecs, their layers, the `Parser` interface and `includesFraming`
- `packages/effect/src/unstable/rpc/RpcTest.ts` — `makeClient` in-process test client
- `packages/effect/src/unstable/rpc/RpcWorker.ts` — `InitialMessage`, `layerInitialMessage`, `initialMessage`
- `packages/effect/src/unstable/rpc/RpcMessage.ts` — wire vocabulary: `Request`, `Ack`, `Interrupt`, `Chunk`, `Exit`, `Defect`, `Ping`/`Pong`, `ClientProtocolError`, `RequestId`
- `packages/effect/src/unstable/socket/Socket.ts` — `Socket` service, `layerWebSocket`, `WebSocketConstructor`
- `packages/platform-node/test/RpcServer.test.ts` + `test/fixtures/rpc-e2e.ts` + `test/fixtures/rpc-schemas.ts` — the best end-to-end reference: every transport × serialization combination, headers, streams, interrupts, defects
- `packages/platform-browser/test/RpcWorker.test.ts` + `test/fixtures/rpc-worker.ts` — worker transport end to end

## Core Model

A client is assembled from three replaceable layers plus your shared `RpcGroup` definition:

```
RpcClient.make(group)                      typed methods, spans, request ids
	requires: Protocol                        ← RpcClient.layerProtocolHttp / Socket / Worker
		requires: RpcSerialization              ← RpcSerialization.layerJson / Ndjson / MsgPack / JsonRpc
		requires: transport service             ← HttpClient | Socket.Socket | WorkerPlatform + Spawner
```

`RpcClient.make(group)` returns an `Effect` producing an object with one method per rpc tag. Each method encodes the payload with the rpc's schema, sends a `Request` envelope through the `Protocol`, and decodes the server's `Exit` (or stream `Chunk`s) back into a typed `Effect` or `Stream`:

```ts
// The generated client type — one method per tag
type RpcClient<Rpcs extends Rpc.Any, E = never> = {
	readonly [Tag in Rpcs['_tag']]: (payload, options?) => Effect<Success, RpcError | E | MiddlewareErrors, R>;
	// stream rpcs return Stream<A, E', R> instead (or Effect<Queue.Dequeue<...>> with asQueue)
};
```

`E` is the transport error — `RpcClientError` for every real transport (`RpcClient.make`), `never` for `RpcTest.makeClient`.

Imports used throughout this skill (all rpc modules ship from the `effect` package — there is no `@effect/rpc` in v4):

```ts
import { Cause, Context, Effect, Fiber, Layer, Queue, Schedule, Schema, Stream } from 'effect';
import {
	Rpc,
	RpcClient,
	RpcGroup,
	RpcMiddleware,
	RpcSerialization,
	RpcTest,
	RpcWorker
} from 'effect/unstable/rpc';
import { RpcClientError } from 'effect/unstable/rpc/RpcClientError';
import { FetchHttpClient, Headers, HttpClient, HttpClientRequest } from 'effect/unstable/http';
import { Socket } from 'effect/unstable/socket';
// Platform transports:
import { NodeSocket, NodeWorker } from '@effect/platform-node';
import { BrowserWorker } from '@effect/platform-browser';
```

Note the `RpcClientError` import: the `effect/unstable/rpc` barrel exports `RpcClientError` as a *namespace*; import the class from the module path `effect/unstable/rpc/RpcClientError` (this is what the upstream tests do).

---

## 1. Creating a Client — `RpcClient.make`

```ts
const make: <Rpcs extends Rpc.Any, const Flatten extends boolean = false>(
	group: RpcGroup.RpcGroup<Rpcs>,
	options?: {
		readonly spanPrefix?: string; // default 'RpcClient'; spans named `${spanPrefix}.${tag}`
		readonly spanAttributes?: Record<string, unknown>;
		readonly generateRequestId?: () => RequestId; // default: shared module-level bigint counter
		readonly disableTracing?: boolean; // default false
		readonly flatten?: Flatten; // default false
	}
) => Effect.Effect<
	Flatten extends true ? RpcClient.RpcClient.Flat<Rpcs, RpcClientError> : RpcClient.RpcClient<Rpcs, RpcClientError>,
	never,
	RpcClient.Protocol | Rpc.MiddlewareClient<Rpcs> | Scope
>;
```

Three things to internalize about the requirements:

- **`Protocol`** — provide exactly one `layerProtocol*` (section 4).
- **`Rpc.MiddlewareClient<Rpcs>`** — if any rpc in the group has a middleware declared with `requiredForClient: true`, you must provide its `RpcMiddleware.layerClient(...)` or the `Effect.provide` will not compile.
- **`Scope`** — the client registers a finalizer that interrupts all in-flight requests on close and makes later calls interrupt immediately. Build it inside `Layer.effect` (which supplies the layer's scope) or `Effect.scoped`.

The canonical wrapping is a `Context.Service` so consumers resolve the client by name:

```ts
export class UsersClient extends Context.Service<
	UsersClient,
	RpcClient.RpcClient<RpcGroup.Rpcs<typeof UserRpcs>, RpcClientError>
>()('UsersClient') {
	static readonly layer = Layer.effect(UsersClient)(RpcClient.make(UserRpcs)).pipe(
		Layer.provide(AuthClient) // RpcMiddleware.layerClient for requiredForClient middleware
	);
}
```

`RpcClient.FromGroup<typeof UserRpcs, RpcClientError>` is shorthand for the same client type.

### `flatten: true` — single-function client

The client becomes one function `(tag, payload, options?)` instead of a property-per-tag object. Useful for generic proxying (this is what `AtomRpc` uses internally):

```ts
const client = yield* RpcClient.make(UserRpcs, { flatten: true });
const user = yield* client('GetUser', { id: 'u1' });
```

### `generateRequestId`

Request ids correlate requests with responses on a shared connection. The default is a process-wide incrementing `bigint`. Override only when ids must be globally meaningful (cluster uses snowflakes). The function must return `RequestId` (a branded bigint — construct via `RequestId(1n)` from `effect/unstable/rpc/RpcMessage`).

### Tracing

Unless `disableTracing: true`, every call runs in a span named `${spanPrefix}.${tag}` with `spanAttributes`, and the request envelope carries `traceId`/`spanId`/`sampled` so the server can continue the trace (whether it does depends on the server protocol — see the effect-rpc-server skill).

---

## 2. Calling RPCs — Per-Call Options and Error Channels

Each generated method takes the rpc's payload, then an options bag whose shape differs for stream vs non-stream rpcs:

```ts
// Non-stream rpc
client.GetUser(
	{ id: 'u1' },
	{
		headers: { 'x-tenant': 't1' }, // Headers.Input — per-call headers
		context: Context.empty(), // Context<never> — rarely needed (cluster plumbing)
		discard: true // fire-and-forget: see below
	}
);

// Stream rpc
client.StreamUsers(
	{ id: 'u1' },
	{
		headers: { 'x-tenant': 't1' },
		context: Context.empty(),
		asQueue: true, // return Effect<Queue.Dequeue<...>> instead of Stream
		streamBufferSize: 16 // default 16 — client-side bounded buffer
	}
);
```

A void-payload rpc is callable with no arguments: `client.Ping()`, `client.GetInterrupts()`. The payload parameter is `Rpc.PayloadConstructor<R>` — the payload schema's constructor input, so `Schema.Class` payloads accept plain field objects. Tags containing dots — from `group.prefix('nested.')` or cluster `EntityProxy` groups — need bracket access: `client['nested.test']()` (or use `flatten: true`).

### The full error channel

```
Rpc.Error<R>            your declared rpc error (decoded)
| MiddlewareError          wire errors added by server middleware (e.g. Unauthorized)
| MiddlewareClientError    errors a client-side middleware can produce
| RpcClientError           transport failure (section 8)
```

Server-side defects are *not* in the error channel — they arrive as `Cause.Die` in the failure cause. Inspect with `Effect.sandbox` / `Effect.catchCause`, e.g. `Cause.squash(cause)` after `Effect.sandbox` + `Effect.flip`.

The requirements channel of each call is the payload schema's `EncodingServices` plus the success/error schemas' `DecodingServices` (plus any middleware error schemas' `DecodingServices`) — `never` for plain schemas.

### `discard: true`

Sends the request and skips response handling entirely: the method returns `Effect<void, RpcClientError | MiddlewareErrors>`. The rpc's *declared* error disappears from the channel, but transport and middleware errors remain. No client entry is registered, so the server's exit is dropped on the floor. Use for fire-and-forget commands; over HTTP the POST is still awaited (the response body is just ignored).

---

## 3. Headers

Three layers of headers, merged in this order (later wins on conflict):

1. **Ambient** — the `RpcClient.CurrentHeaders` reference (default `Headers.empty`)
2. **Per-call** — the `headers` option on the method call
3. **Client middleware** — `RpcMiddleware.layerClient` can rewrite `request.headers` last, as the request passes through it

```ts
// Region-scoped ambient headers — merged into CurrentHeaders for the wrapped effect
yield* program.pipe(
	RpcClient.withHeaders({ authorization: `Bearer ${token}`, 'x-tenant': 't1' })
);

// withHeaders is dual: data-first works too
RpcClient.withHeaders(program, { 'x-tenant': 't1' });

// CurrentHeaders is a Context.Reference<Headers.Headers> — set directly if needed
Effect.updateService(program, RpcClient.CurrentHeaders, Headers.merge(Headers.fromInput({ a: 'b' })));
```

**Header names are normalized to lowercase** by `Headers.fromInput`. If you send `{ userId: '123' }`, server middleware must read `headers.userid`. The upstream e2e fixture depends on exactly this.

### Client-side middleware (auth headers and friends)

For middleware declared with `requiredForClient: true`, the client will not compile without a `layerClient`:

```ts
export const AuthClient = RpcMiddleware.layerClient(AuthMiddleware, ({ next, request }) =>
	next({
		...request,
		headers: Headers.set(request.headers, 'authorization', `Bearer ${getToken()}`)
	}));
```

You must call `next(request)`; the middleware wraps the send, it does not replace it. Defining middleware services is covered by the effect-rpc-api skill.

---

## 4. Protocol Layers — Picking a Transport

Provide exactly one of these to satisfy `RpcClient.Protocol`:

| Layer | Requires | supportsAck | Notes |
|---|---|---|---|
| `RpcClient.layerProtocolHttp({ url, transformClient? })` | `RpcSerialization`, `HttpClient` | no | One POST per request. Framed serializations stream the response body, so streaming rpcs work over plain HTTP |
| `RpcClient.layerProtocolSocket({ retryTransientErrors? })` | `RpcSerialization`, `Socket.Socket` | yes | Full duplex; pings every 5s; auto-reconnects (section 9). Works for WebSocket and raw TCP — the `Socket.Socket` layer decides which |
| `RpcClient.layerProtocolWorker(poolOptions)` | `Worker.WorkerPlatform`, `Worker.Spawner` | yes | Pool of workers; supports transferables and `RpcWorker.InitialMessage`; the only protocol layer with an error channel — `WorkerError` (section 10) |

Each has a `makeProtocol*` Effect counterpart (`makeProtocolHttp(client)`, `makeProtocolSocket(options?)`, `makeProtocolWorker(options)`) for inline composition — `makeProtocolSocket` additionally accepts a `retryPolicy: Schedule<any, SocketError>` that the layer constructor does **not** expose.

### HTTP

```ts
const ProtocolLive = RpcClient.layerProtocolHttp({
	url: 'http://localhost:3000/rpc', // the full endpoint URL
	// optional: rewrite the underlying HttpClient (retries, extra headers, url tweaks)
	transformClient: HttpClient.mapRequest(HttpClientRequest.setHeader('x-api-key', key))
}).pipe(
	Layer.provide(RpcSerialization.layerNdjson),
	Layer.provide(FetchHttpClient.layer) // or NodeHttpClient.layerUndici etc.
);
```

`url` is prepended to an empty path, so it must be the complete endpoint. `transformClient` receives the client *after* the url is attached; its request transformations run before the prepend (the upstream test uses `url: ''` + `transformClient: HttpClient.mapRequest(HttpClientRequest.appendUrl('/rpc'))`).

An empty HTTP response body fails the call with `RpcClientDefect` (`'Received empty HTTP response from RPC server'`) rather than hanging.

### WebSocket

```ts
// Node
const ProtocolLive = RpcClient.layerProtocolSocket().pipe(
	Layer.provide(NodeSocket.layerWebSocket('ws://localhost:3000/rpc')),
	Layer.provide(RpcSerialization.layerNdjson)
);

// Browser / anywhere with a global WebSocket
const BrowserProtocolLive = RpcClient.layerProtocolSocket().pipe(
	Layer.provide(Socket.layerWebSocket('wss://api.example.com/rpc')),
	Layer.provide(Socket.layerWebSocketConstructorGlobal),
	Layer.provide(RpcSerialization.layerNdjson)
);
```

`Socket.layerWebSocket(url, { closeCodeIsError?, openTimeout?, protocols? })` requires a `WebSocketConstructor`; `layerWebSocketConstructorGlobal` uses `globalThis.WebSocket`. `NodeSocket.layerWebSocket` bundles the constructor.

### Raw TCP

```ts
const TcpProtocolLive = RpcClient.layerProtocolSocket().pipe(
	Layer.provide(NodeSocket.layerNet({ port: 9000 })),
	Layer.provide(RpcSerialization.layerMsgPack)
);
```

`Socket.Socket` layer construction, the `SocketError` taxonomy, and reconnect internals are covered by the effect-socket skill.

### The `Protocol` service (custom transports)

`RpcClient.Protocol` is a `Context.Service` with this surface:

```ts
{
	readonly run: (clientId: number, f: (data: FromServerEncoded) => Effect<void>) => Effect<never>;
	readonly send: (clientId: number, request: FromClientEncoded, transferables?) => Effect<void, RpcClientError>;
	readonly supportsAck: boolean; // chunk acks → server-side stream backpressure
	readonly supportsTransferables: boolean; // worker-only
}
```

Build your own with `RpcClient.Protocol.make((writeResponse, clientIds) => Effect<Omit<Service, 'run'>>)` — it buffers server responses per client until that client's `run` loop is installed. You rarely need this; prefer `RpcTest` for in-memory wiring (section 11).

---

## 5. Serialization — Pairing Codecs with Transports

`RpcSerialization` is the shared codec service. The load-bearing property is `includesFraming`: framed codecs can split a byte stream into messages; unframed codecs assume the transport delivers whole messages.

| Layer | Content-Type | Framed | Pair with |
|---|---|---|---|
| `RpcSerialization.layerJson` | `application/json` | no | HTTP (response decoded once, as an array); WebSocket (each ws message is one frame already) |
| `RpcSerialization.layerNdjson` | `application/ndjson` | yes (newline) | anything — the safe default; enables streaming over HTTP |
| `RpcSerialization.layerMsgPack` | `application/msgpack` | yes (msgpack frames) | binary transports; smallest payloads; uses msgpackr `useRecords: true` |
| `RpcSerialization.layerJsonRpc({ contentType? })` | `application/json` | no | JSON-RPC 2.0 interop over HTTP/WebSocket; maps rpc tag ↔ `method`, supports batch arrays |
| `RpcSerialization.layerNdJsonRpc({ contentType? })` | `application/json-rpc` | yes (newline) | JSON-RPC 2.0 over sockets |

Rules of thumb, verified by the upstream e2e matrix (http: ndjson/msgpack/ndJsonRpc; ws: ndjson/json/msgpack/jsonRpc; tcp: ndjson/msgpack/ndJsonRpc):

- **Raw TCP needs a framed codec** (`ndjson` / `msgPack` / `ndJsonRpc`) — plain `json` cannot find message boundaries in a byte stream.
- **WebSocket works with any codec** including plain `json`, because the ws transport frames messages itself.
- **HTTP + unframed (`json`/`jsonRpc`)**: the client buffers the whole response and expects a JSON array of response messages — streaming rpcs only flush when the response ends.
- **HTTP + framed (`ndjson`/`msgPack`/`ndJsonRpc`)**: the client incrementally parses the response body — streaming rpc chunks arrive as the server emits them, over a single POST.
- **Client and server must use the same codec.** A msgpack client against a json server garbles both directions.

`RpcSerialization.makeMsgPack(options)` customizes msgpackr (`useRecords`, `useFloat32`, ...); wrap with `Layer.succeed(RpcSerialization.RpcSerialization)(RpcSerialization.makeMsgPack({ useRecords: false }))` if the peer cannot handle msgpackr record extensions.

---

## 6. Consuming Streaming RPCs

A `stream: true` rpc produces a `Stream` on the client (no `Effect` wrapper — run it directly):

```ts
const users = yield* client.StreamUsers({ id: '1' }).pipe(
	Stream.take(5),
	Stream.runCollect
);
```

Mechanics worth knowing:

- Chunks are buffered client-side in a bounded queue (`streamBufferSize`, default 16).
- On transports with `supportsAck` (socket, worker), the client sends an `Ack` after delivering each chunk to the buffer — the server will not emit past the in-flight window, so slow consumers backpressure the producer end to end. Over HTTP there are no acks; the server streams freely.
- Ending consumption early (e.g. `Stream.take`, interruption) closes the stream's scope, which sends an `Interrupt` for the request — the server-side handler is interrupted and its finalizers run.
- The stream fails with the same error channel as effect rpcs (declared error | middleware errors | `RpcClientError`).

### `asQueue: true`

Returns `Effect<Queue.Dequeue<A, E | Cause.Done>, never, Scope | ...>` instead of a `Stream` — use when you need manual chunk-level control:

```ts
const program = Effect.scoped(
	Effect.gen(function* () {
		const queue = yield* client.StreamUsers({ id: '1' }, { asQueue: true });
		const users: Array<User> = [];
		// drain: Queue.take fails with Cause.Done when the stream ends
		yield* Queue.take(queue).pipe(
			Effect.flatMap((user) => Effect.sync(() => users.push(user))),
			Effect.forever,
			Effect.catchIf(Cause.isDone, () => Effect.void)
		);
		// closing the scope early interrupts the request server-side
		return users;
	})
);
```

End-of-stream is signaled as `Cause.Done` in the queue's error channel, not as a value — guard with `Cause.isDone`, or `Effect.catchTag('Done', ...)` (`Done` is tagged; this is how the cluster `Runners` module drains upstream). The `Scope` requirement is how the request's lifetime is tied to your code — keep the scope open while consuming.

---

## 7. Interruption and Abort Propagation

Interruption is a first-class protocol message, not just a local cancel:

- **Effect rpcs** — interrupting the calling fiber interrupts the in-flight send and dispatches an `Interrupt` envelope to the server (best-effort, with a 1-second internal timeout so shutdown never hangs on a dead connection).
- **Stream rpcs** — the `Interrupt` is sent from a scope finalizer when the stream/queue scope closes for any reason (early `Stream.take`, fiber interrupt, error).
- **HTTP transport** — the protocol drops `Interrupt` messages (`send` ignores everything but `Request`). Interruption still propagates: interrupting the fiber aborts the underlying HTTP request, and the server interrupts the handler when the connection drops. The observable difference: there is no graceful interrupt message, just an aborted request.
- **Client scope close** — all in-flight requests resume as interrupted, `Interrupt`s are sent where the transport supports it, and any later call on the client returns `Effect.interrupt`.

```ts
const fiber = yield* client.Never().pipe(Effect.forkChild);
yield* Effect.sleep('500 millis');
yield* Fiber.interrupt(fiber); // server-side handler's onInterrupt/finalizers run
```

On the server, a client-initiated interrupt carries the `RpcSchema.ClientAbort` annotation in the cause so handlers can distinguish client cancel from server shutdown — see the effect-rpc-server skill.

---

## 8. Error Handling — the `RpcClientError` Taxonomy

`RpcClientError` is a `Schema.ErrorClass` with `_tag: 'RpcClientError'` and a `reason` union. Its `message` is `` `${reason._tag}: ${reason.message}` ``.

| `reason._tag` | Transport | Meaning |
|---|---|---|
| `'HttpError'` | HTTP | `HttpClientErrorSchema`: has `kind: 'EncodeError' \| 'DecodeError' \| 'TransportError' \| 'InvalidUrlError' \| 'StatusCodeError' \| 'EmptyBodyError'` and optional `cause` |
| `'SocketOpenError'` | socket | failed to (re)connect, includes ping timeouts |
| `'SocketReadError'` / `'SocketWriteError'` | socket | I/O failure on a live connection |
| `'SocketCloseError'` | socket | connection closed (has `code`) |
| `'WorkerSpawnError'` / `'WorkerSendError'` / `'WorkerReceiveError'` / `'WorkerUnknownError'` | worker | worker lifecycle failures |
| `'RpcClientDefect'` | any | protocol bug: undecodable message, empty HTTP response, non-array unframed response; has `message` + `cause` |

Handling strategy — recover from your domain errors by tag, treat `RpcClientError` as retryable-or-fatal at the edge:

```ts
const getUser = (id: string) =>
	client.GetUser({ id }).pipe(
		Effect.catchTag('UserNotFound', () => Effect.succeed(guestUser)), // domain error
		Effect.retry({
			// transport-only retry with backoff
			while: (e) => e._tag === 'RpcClientError' && e.reason._tag !== 'RpcClientDefect',
			schedule: Schedule.exponential('200 millis').pipe(Schedule.take(3))
		})
	);
```

Semantics to remember:

- **`ClientProtocolError` fails everything in flight.** When a socket dies or a worker crashes, every pending request on that connection fails with the same `RpcClientError`. Requests are *not* replayed after reconnect — retry at the call site.
- **Server defects are `Cause.Die`, not typed failures.** `Effect.catchTag` will not see them; use `Effect.sandbox`/`Effect.catchAllCause`. What survives the wire depends on the rpc's `defect` schema (see the effect-rpc-api skill).
- **Whole-connection defects** (server-side fatal defects when the server runs without `disableFatalDefects`) arrive as a `Defect` message and kill every in-flight request on the connection as `Cause.Die`.
- `RpcTest.makeClient` clients have `E = never` — no transport error channel, only your rpc errors and middleware errors.

---

## 9. Connection Lifecycle, Reconnection, and `ConnectionHooks`

The socket protocol owns a long-lived connection loop:

- **Keepalive** — the client sends `Ping` every 5 seconds; a missing `Pong` by the next tick fails the connection with a `SocketOpenError` (kind `'Timeout'`) and triggers reconnect.
- **Reconnect policy** — the loop retries with `Schedule.exponential(500, 1.5)` capped at 5s between attempts, forever, by default. Customize via `makeProtocolSocket({ retryPolicy })` + `Layer.effect(RpcClient.Protocol)(...)` — the `layerProtocolSocket` constructor only exposes `retryTransientErrors`.
- **Failure broadcast** — on a connection error, all in-flight requests fail with `RpcClientError`, and subsequent `send`s fail fast with the same error until the socket reopens.
- **`retryTransientErrors: true`** — `SocketOpenError` failures (failure to connect, and ping timeouts, which are classified as open errors) are not broadcast: pending requests stay pending across reconnect attempts instead of failing. Read/write/close errors on an established connection still fail in-flight requests.

```ts
const ProtocolLive = RpcClient.layerProtocolSocket({ retryTransientErrors: true }).pipe(
	Layer.provide(NodeSocket.layerWebSocket('ws://localhost:3000/rpc')),
	Layer.provide(RpcSerialization.layerNdjson)
);
```

### `ConnectionHooks`

An optional `Context.Service` the socket and worker protocols pick up if present:

```ts
const HooksLive = Layer.succeed(RpcClient.ConnectionHooks)({
	onConnect: Effect.logInfo('rpc connected'), // socket: every (re)connect; worker: once after pool warm-up
	onDisconnect: Effect.logWarning('rpc disconnected') // socket only; runs when a connection ends
});

// Provide it alongside the protocol layer:
const ProtocolWithHooks = ProtocolLive.pipe(Layer.provideMerge(HooksLive));
```

Use `onConnect` to refresh auth state or re-subscribe after a reconnect. The HTTP protocol never invokes hooks (there is no connection).

---

## 10. Worker Transports and `RpcWorker.InitialMessage`

`layerProtocolWorker` runs the *server* inside workers and the client in the parent. Pool options come in two shapes:

```ts
// Fixed-size pool
RpcClient.layerProtocolWorker({ size: 4, concurrency: 1, targetUtilization: 1 });

// Elastic pool
RpcClient.layerProtocolWorker({
	minSize: 1,
	maxSize: 8,
	timeToLive: '60 seconds', // idle workers above minSize are released
	concurrency: 1
});
```

`concurrency` is requests-per-worker; a request checks a worker out of the pool until its `Exit` arrives. The protocol supports transferables (below) and acks. The pool spawns its minimum eagerly at startup via a background fiber — all `size` workers for the fixed pool, `minSize` for the elastic pool — and protocol initialization blocks until the first worker is ready (then `ConnectionHooks.onConnect` runs). That eager first spawn is why `layerProtocolWorker` is the only protocol layer with a non-`never` error channel: handle or `Layer.orDie` the `WorkerError` when composing the final layer. On worker crash, a `ClientProtocolError` is broadcast — every in-flight request on the protocol fails, not just the crashed worker's — and the worker is respawned (retried every second).

```ts
// Node parent
const WorkerClient = UsersClient.layer.pipe(
	Layer.provide(RpcClient.layerProtocolWorker({ size: 1 })),
	Layer.provide(NodeWorker.layer((id) => new WorkerThreads.Worker('./worker.js')))
);

// Browser parent
const BrowserClient = UsersClient.layer.pipe(
	Layer.provide(RpcClient.layerProtocolWorker({ size: 1 })),
	Layer.provide(BrowserWorker.layer(() => new Worker(new URL('./worker.ts', import.meta.url))))
);
```

No `RpcSerialization` is needed — structured clone carries the messages. The worker side runs `RpcServer.layerProtocolWorkerRunner` (see the effect-rpc-server skill).

Transferables: to move binary data instead of copying it, wrap fields in the shared contract with `Transferable` from `effect/unstable/workers` — `Transferable.Uint8Array` transfers the backing `ArrayBuffer`, `Transferable.ImageData`/`Transferable.MessagePort` are prebuilt, and `Transferable.schema(s, (encoded) => [encoded.buffer])` wraps any schema with a custom transfer-list extractor. Transfer only happens on protocols with `supportsTransferables: true` — the worker protocol only.

### Typed startup config — `RpcWorker.InitialMessage`

Send one schema-encoded value at spawn time, before any rpc traffic:

```ts
class WorkerConfig extends Schema.Class<WorkerConfig>('WorkerConfig')({
	apiUrl: Schema.String,
	tenantId: Schema.String
}) {}

// Parent: provide alongside the worker protocol
const InitialMessageLive = RpcWorker.layerInitialMessage(
	WorkerConfig,
	Effect.succeed(new WorkerConfig({ apiUrl: '/api', tenantId: 't1' }))
);

const ClientLive = UsersClient.layer.pipe(
	Layer.provide(RpcClient.layerProtocolWorker({ size: 4 })),
	Layer.provide(InitialMessageLive),
	Layer.provide(NodeWorker.layer(spawnWorker))
);
```

The build effect runs once per spawned worker and its result is encoded with the schema's JSON codec (transferables are collected automatically). Inside the worker, read it with `RpcWorker.initialMessage(WorkerConfig)` — server-side detail, see the effect-rpc-server skill.

---

## 11. Testing — `RpcTest.makeClient`

In-process client + server pair over the no-serialization path. Requests, stream chunks, acks, interrupts, headers, and middleware all flow through the real machinery — no network, no codecs:

```ts
import { it } from '@effect/vitest';

export class UsersClient extends Context.Service<
	UsersClient,
	RpcClient.RpcClient<RpcGroup.Rpcs<typeof UserRpcs>, RpcClientError>
>()('UsersClient') {
	static readonly layer = Layer.effect(UsersClient)(RpcClient.make(UserRpcs)).pipe(
		Layer.provide(AuthClient)
	);
	// Same service shape — swap the layer, not the call sites
	static readonly layerTest = Layer.effect(UsersClient)(RpcTest.makeClient(UserRpcs)).pipe(
		Layer.provide([UsersLive, AuthLive, AuthClient])
	);
}

it.effect('GetUser', () =>
	Effect.gen(function* () {
		const client = yield* UsersClient;
		const user = yield* client.GetUser({ id: '1' });
		expect(user.id).toBe('1');
	}).pipe(Effect.provide(UsersClient.layerTest)));
```

Signature: `RpcTest.makeClient(group, options?: { flatten? })` with required context `Scope | Rpc.ToHandler<Rpcs> | Rpc.Middleware<Rpcs> | Rpc.MiddlewareClient<Rpcs>` — i.e. the handler layers, any *server* middleware layers, **and** any client middleware layers. Forgetting the client middleware layer is the classic confusing type error.

The test client's `E` is `never`: transport errors cannot occur, so tests exercise only your declared errors, middleware errors, and defects. To also test serialization and transport semantics, build a real client+server pair against `NodeHttpServer.layerTest` exactly as `packages/platform-node/test/RpcServer.test.ts` does.

### `RpcClient.makeNoSerialization` (advanced)

The primitive under `RpcTest`: builds a client from a raw decoded-message channel and returns `{ client, write }`, where you implement `onFromClient` (deliver messages toward a server) and call `write` with `FromServer` messages. Extra options over `make`: `supportsAck` (default `true`). Use it to bridge a client onto an exotic in-process channel; otherwise prefer `RpcTest.makeClient`.

---

## Key Patterns

### HTTP client service, end to end

```ts
// client.ts — UserRpcs comes from the shared contract module (effect-rpc-api skill)
import { Context, Effect, Layer } from 'effect';
import { FetchHttpClient } from 'effect/unstable/http';
import { RpcClient, RpcGroup, RpcSerialization } from 'effect/unstable/rpc';
import { RpcClientError } from 'effect/unstable/rpc/RpcClientError';
import { AuthClient, UserRpcs } from './contract.ts';

export class UsersClient extends Context.Service<
	UsersClient,
	RpcClient.RpcClient<RpcGroup.Rpcs<typeof UserRpcs>, RpcClientError>
>()('UsersClient') {
	static readonly layer = Layer.effect(UsersClient)(
		RpcClient.make(UserRpcs, { spanPrefix: 'UsersClient' })
	).pipe(
		Layer.provide(AuthClient),
		Layer.provide(RpcClient.layerProtocolHttp({ url: 'https://api.example.com/rpc' })),
		Layer.provide(RpcSerialization.layerNdjson), // framed → streaming rpcs work over HTTP
		Layer.provide(FetchHttpClient.layer)
	);
}

const program = Effect.gen(function* () {
	const client = yield* UsersClient;
	const user = yield* client.GetUser({ id: 'u1' });
	yield* Effect.logInfo('got', user);
}).pipe(RpcClient.withHeaders({ 'x-request-source': 'cli' }));
```

### Resilient WebSocket client with reconnect hooks

```ts
const ProtocolLive = RpcClient.layerProtocolSocket({ retryTransientErrors: true }).pipe(
	Layer.provide(NodeSocket.layerWebSocket('wss://api.example.com/rpc')),
	Layer.provide(RpcSerialization.layerNdjson),
	Layer.provideMerge(
		Layer.succeed(RpcClient.ConnectionHooks)({
			onConnect: refreshAuthToken,
			onDisconnect: Effect.logWarning('rpc disconnected')
		})
	)
);

export const UsersClientLive = UsersClient.layer.pipe(Layer.provide(ProtocolLive));
```

### Consume a streaming rpc with early exit and call-site retry

```ts
const firstFive = client.StreamUsers({ id: '1' }).pipe(
	Stream.take(5), // closing the stream sends Interrupt to the server
	Stream.runCollect,
	Effect.retry({
		while: (e) => e._tag === 'RpcClientError',
		schedule: Schedule.exponential('250 millis').pipe(Schedule.take(5))
	})
);
```

### Fire-and-forget command with ambient tenant headers

```ts
const enqueue = (job: JobInput) =>
	client.EnqueueJob(job, { discard: true }).pipe(
		// declared rpc error is gone; transport errors remain
		Effect.catchTag('RpcClientError', (e) => Effect.logError('enqueue failed', e.reason))
	);

yield* Effect.forEach(jobs, enqueue, { concurrency: 8 }).pipe(
	RpcClient.withHeaders({ 'x-tenant': tenantId })
);
```

### Worker pool with typed startup config

```ts
const WorkerClientLive = UsersClient.layer.pipe(
	Layer.provide(RpcClient.layerProtocolWorker({ minSize: 1, maxSize: 4, timeToLive: '30 seconds' })),
	Layer.provide(RpcWorker.layerInitialMessage(WorkerConfig, loadWorkerConfig)),
	Layer.provide(BrowserWorker.layer(() => new Worker(new URL('./rpc-worker.ts', import.meta.url))))
);
```

---

## Common Mistakes

1. **Importing from `@effect/rpc`.** Gone in v4 — everything is `effect/unstable/rpc`. And `import { RpcClientError } from 'effect/unstable/rpc'` gives you a *namespace*; import the class from `effect/unstable/rpc/RpcClientError`.
2. **Missing `Scope` for `RpcClient.make`.** The constructor is scoped. Build clients inside `Layer.effect(Tag)(RpcClient.make(group))` or under `Effect.scoped` — providing protocol layers alone will not discharge `Scope`.
3. **Forgetting the client middleware layer.** A group with a `requiredForClient: true` middleware needs `Layer.provide(RpcMiddleware.layerClient(M, ...))` on the client (and in `RpcTest.makeClient`'s context). The compile error points at an unsatisfied `ForClient<M>` requirement — provide the layer, don't cast.
4. **Wrong codec/transport pairing.** Raw TCP + `layerJson` corrupts framing — use `layerNdjson`/`layerMsgPack`/`layerNdJsonRpc`. Over HTTP, unframed `layerJson` buffers the whole response, so streaming rpcs stall until the request ends — use a framed codec. WebSocket alone is fine with any codec (the transport frames messages).
5. **Mismatched client/server serialization.** Both sides share one `RpcSerialization` choice; there is no negotiation. Garbled `RpcClientDefect: Error decoding ...` errors usually mean the codecs differ.
6. **Reading mixed-case header names server-side.** `Headers.fromInput` lowercases keys: send `{ userId: '123' }`, read `headers.userid`. Same for `withHeaders` and middleware `Headers.set`.
7. **Expecting `discard: true` to be error-free.** It only removes the rpc's *declared* error; `RpcClientError` and middleware errors remain, and over HTTP the POST round-trip is still awaited.
8. **Catching server defects with `catchTag`.** Handler `Effect.die`s arrive as `Cause.Die`, not typed failures. Use `Effect.sandbox`/`Effect.catchAllCause`, and remember one server fatal defect can fail *all* in-flight requests on the connection.
9. **Assuming requests survive a reconnect.** A socket/worker failure fails every in-flight call with `RpcClientError`; after reconnect nothing is replayed. Add `Effect.retry` at call sites; `retryTransientErrors: true` only keeps requests pending across *connection-establishment* failures.
10. **Passing `retryPolicy` to `layerProtocolSocket`.** The layer only accepts `{ retryTransientErrors }`. For a custom reconnect schedule use `Layer.effect(RpcClient.Protocol)(RpcClient.makeProtocolSocket({ retryPolicy }))`.
11. **Treating a flattened client like an object client.** With `flatten: true` you call `client('GetUser', payload)`; `client.GetUser(payload)` is not a function. Pick one shape per client.
12. **Waiting for a queue value to signal end-of-stream.** With `asQueue: true`, completion is `Cause.Done` in the `Queue.take` error channel, and the `Dequeue` lives in a `Scope` — closing that scope interrupts the request on the server.
13. **Expecting a graceful interrupt over HTTP.** The HTTP protocol drops `Interrupt` messages; interruption aborts the in-flight POST instead. Server handlers are still interrupted, but only when the connection abort is observed.
14. **`RpcSerialization` provided to the worker protocol.** Worker transports use structured clone — no serialization layer is needed (or used); `RpcSerialization` is for HTTP and socket protocols.
15. **Wrong option key names on `make`.** They are `spanPrefix`, `spanAttributes`, `disableTracing`, `generateRequestId`, `flatten` — there is no `baseUrl`, `headers`, or `serialization` option on `RpcClient.make`; those live on the protocol/serialization layers and per-call options.
