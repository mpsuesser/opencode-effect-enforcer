---
name: effect-rpc-server
description: Serve RpcGroup contracts with Effect's RpcServer — handler layers (RpcGroup.toLayer/toLayerHandler), protocol layers (HTTP, WebSocket, TCP, stdio, worker), RpcSerialization, server middleware, streaming results, interruption and shutdown semantics, RpcTest. Use when implementing the server side of an Effect RPC API, mounting RPC on an HttpRouter or existing HTTP app, choosing a wire format, implementing RpcMiddleware, handling client aborts, or testing RPC handlers.
---

You are an Effect TypeScript expert specializing in serving RPC groups with `RpcServer` from `effect/unstable/rpc`.

Everything ships from the `effect` package under `effect/unstable/rpc` — there is no `@effect/rpc` package in v4. This skill covers the **server side**: implementing handlers, transports, serialization, middleware, and lifecycle. For defining `Rpc`/`RpcGroup` contracts see the `effect-rpc-api` skill; for building clients see the `effect-rpc-client` skill; for cluster entities see the `effect-rpc-cluster` skill; for `HttpRouter`/`HttpServer` fundamentals see the `effect-http-server` skill.

## Effect Source Reference

The Effect v4 source is at `~/.cache/effect-v4/`. Read it directly when in doubt — these modules change between betas.

Key files:

- `packages/effect/src/unstable/rpc/RpcServer.ts` — `make`, `makeNoSerialization`, `layer`, `layerHttp`, every `layerProtocol*` / `makeProtocol*`, `toHttpEffect*`, the `Protocol` service
- `packages/effect/src/unstable/rpc/RpcGroup.ts` — `toLayer`, `toLayerHandler`, `toHandlers`, `accessHandler`, `of`, handler type derivation
- `packages/effect/src/unstable/rpc/Rpc.ts` — `ServerClient`, `Handler`, `ToHandlerFn`, `ResultFrom`, `fork`, `uninterruptible`, `ServicesServer`
- `packages/effect/src/unstable/rpc/RpcMiddleware.ts` — `Service` constructor, server middleware function shape, `layerClient`
- `packages/effect/src/unstable/rpc/RpcSerialization.ts` — `json`, `ndjson`, `jsonRpc`, `ndJsonRpc`, `msgPack` parsers and their layers
- `packages/effect/src/unstable/rpc/RpcMessage.ts` — the wire vocabulary (`Request`, `Ack`, `Interrupt`, `Eof`, `Chunk`, `Exit`, `Defect`, `ClientEnd`)
- `packages/effect/src/unstable/rpc/RpcWorker.ts` — `InitialMessage` for worker transports
- `packages/effect/src/unstable/rpc/RpcTest.ts` — in-process test client
- `packages/effect/src/unstable/rpc/RpcSchema.ts` — `ClientAbort` cause annotation, stream schema markers
- `packages/platform-node/test/RpcServer.test.ts` + `test/fixtures/rpc-{schemas,e2e}.ts` — the best end-to-end reference for real wiring across http/ws/tcp transports and every serialization
- `packages/platform-browser/test/fixtures/rpc-worker.ts` — minimal worker-side server entrypoint

## Core Model

A running RPC server is four layers snapped together:

```
RpcGroup.toLayer(handlers)        → Layer<Rpc.ToHandler<Rpcs>>      (your logic)
Layer.succeed(MyMiddleware)(...)  → Layer<Rpc.Middleware<Rpcs>>     (wraps handlers)
RpcServer.layerProtocol*          → Layer<RpcServer.Protocol>       (transport)
RpcSerialization.layer*           → Layer<RpcSerialization>         (wire format)

RpcServer.layer(group, options?)  → consumes all four, runs forever
```

`RpcServer.layer` decodes incoming `Request` messages with the rpc's payload schema, runs the matching handler (wrapped in middleware and a per-request `Scope`), and encodes the resulting `Exit` — or stream `Chunk`s — back through the protocol. A handler is just a function:

```ts
// Rpc.ToHandlerFn — what you write for each rpc tag
(
	payload: Rpc.Payload<R>,
	options: {
		readonly client: Rpc.ServerClient; // client.id: number; client.annotations; client.annotate(key, value)
		readonly requestId: RpcMessage.RequestId; // branded bigint
		readonly headers: Headers; // transport headers merged with per-call headers
		readonly rpc: R;
	}
) =>
	| Effect<Success | Deferred<Success, Error>, Error, R> // non-stream rpc
	| Stream<Elem, Error, R> // stream rpc
	| Effect<Queue.Dequeue<Elem, Error | Cause.Done>, Error, R>; // stream rpc, queue form
```

Imports used throughout:

```ts
import { Cause, Context, Deferred, Effect, Layer, Queue, Schema, Stream } from 'effect';
import { Headers, HttpRouter } from 'effect/unstable/http';
import {
	Rpc,
	RpcGroup,
	RpcMessage,
	RpcMiddleware,
	RpcSchema,
	RpcSerialization,
	RpcServer,
	RpcTest,
	RpcWorker
} from 'effect/unstable/rpc';
```

Running example group (definition details belong to the `effect-rpc-api` skill):

```ts
class User extends Schema.Class<User>('User')({
	id: Schema.String,
	name: Schema.String
}) {}

class GetUser extends Rpc.make('GetUser', {
	success: User,
	payload: { id: Schema.String }
}) {}

class StreamUsers extends Rpc.make('StreamUsers', {
	success: User, // element type when stream: true
	payload: { id: Schema.String },
	stream: true
}) {}

const UserRpcs = RpcGroup.make(GetUser, StreamUsers);
```

---

## 1. Implementing Handlers

### `group.toLayer(handlers | Effect<handlers>)` — the 80% case

Build every handler at once. The build argument can be a plain handlers object or an Effect (for pulling dependencies). Always wrap the object in `group.of(...)` so type errors point at the offending handler:

```ts
const UsersLive = UserRpcs.toLayer(
	Effect.gen(function* () {
		const db = yield* Database;
		return UserRpcs.of({
			GetUser: (payload, { headers, client }) => db.findUser(payload.id),
			StreamUsers: (payload) => db.changeFeed(payload.id) // Stream<User>
		});
	})
);
// Layer<Rpc.ToHandler<typeof GetUser | typeof StreamUsers>, never, Database>
```

The services captured when the layer builds are stored alongside each handler and provided automatically on every request — handler `R` beyond middleware-provided services becomes a requirement of the layer, not of the server.

Handlers run with a **per-request `Scope`** already in context: `Effect.addFinalizer` / `Effect.forkScoped` inside a handler are scoped to that single request and cleaned up when it completes, fails, or is interrupted. `Scope` never appears in the layer's requirements.

### Handler metadata

The second argument carries request metadata. `client` is a `Rpc.ServerClient` — not a raw number:

```ts
GetUser: (payload, { client, requestId, headers }) =>
	Effect.gen(function* () {
		yield* Effect.annotateCurrentSpan({ clientId: client.id });
		// client.annotations is a Context.Context<never> middleware may have extended
		return yield* db.findUser(payload.id);
	});
```

### Deferred responses

A non-stream handler may succeed with a `Deferred<Success, Error>` instead of the value. The server completes the handler fiber immediately (releasing its concurrency permit) and sends the final `Exit` only when the deferred resolves — invisible to the client:

```ts
GetUserDeferred: (payload) => {
	const deferred = Deferred.makeUnsafe<User>();
	// complete later — from a webhook, another fiber, a queue worker...
	Deferred.doneUnsafe(deferred, Effect.succeed(new User({ id: '1', name: 'John' })));
	return Effect.succeed(deferred);
};
```

### `Rpc.fork` and `Rpc.uninterruptible` — handler wrappers

These wrap the handler's *return value* (they are not rpc options):

```ts
GetUser: (payload) => db.findUser(payload.id).pipe(Rpc.fork), // skip the concurrency semaphore
Charge: (payload) => chargeOnce(payload).pipe(Rpc.uninterruptible), // run even through aborts/shutdown
Both: (payload) => work(payload).pipe(Rpc.wrap({ fork: true, uninterruptible: true }))
```

`Rpc.fork` exempts one handler from the server's `concurrency` semaphore. `Rpc.uninterruptible` forks the handler fiber uninterruptibly, so client aborts and server shutdown cannot cancel it mid-flight.

### `group.toLayerHandler(tag, handler | Effect<handler>)` — one handler per layer

Keeps handlers with wildly different dependencies in separate files. The server requires the union `Rpc.ToHandler<Rpcs>`, so a missing tag is a compile error at the composition site:

```ts
const GetUserLive = UserRpcs.toLayerHandler(
	'GetUser',
	Effect.gen(function* () {
		const db = yield* Database;
		return (payload) => db.findUser(payload.id);
	})
);
const HandlersLive = Layer.mergeAll(GetUserLive, StreamUsersLive);
```

### `group.toHandlers(handlers)` — raw context form

Returns `Effect<Context.Context<Rpc.ToHandler<R>>>` instead of a Layer. Use when providing handlers manually to `RpcServer.make` or composing contexts by hand.

### `group.accessHandler(tag)` — call one handler directly

Resolves a single handler with its captured services already attached. The returned function takes `(payload, { client, requestId, headers })` — the `rpc` field is injected for you (pass a fresh mutable object; the implementation assigns `options.rpc`). The easiest way to unit-test one handler:

```ts
const user = yield* UserRpcs.accessHandler('GetUser').pipe(
	Effect.flatMap((handler) =>
		handler(
			{ id: 'u1' },
			{
				client: new Rpc.ServerClient(0),
				requestId: RpcMessage.RequestId(1n),
				headers: Headers.empty
			}
		)
	),
	Effect.provide(UsersLive)
);
```

---

## 2. Starting a Server — `RpcServer.layer` / `make` / `layerHttp`

### `RpcServer.layer(group, options?)`

Transport-agnostic. Requires a `Protocol`, the handlers, any middleware implementations, and `Rpc.ServicesServer<Rpcs>` (services your schemas need to decode payloads / encode results — usually `never`):

```ts
const ServerLayer = RpcServer.layer(UserRpcs, {
	concurrency: 'unbounded', // default
	disableFatalDefects: false, // default — see below
	disableTracing: false,
	spanPrefix: 'RpcServer', // span per request: `${spanPrefix}.${tag}`
	spanAttributes: { service: 'users' }
}).pipe(
	Layer.provide(UsersLive),
	Layer.provide(RpcServer.layerProtocolHttp({ path: '/rpc' })),
	Layer.provide(RpcSerialization.layerNdjson)
	// the http/websocket protocols additionally need HttpRouter (see §3)
);
```

Option semantics (verified against `makeNoSerialization`):

- **`concurrency: number | 'unbounded'`** (default `'unbounded'`) — a single `Semaphore` for the **whole server instance**, shared across all clients and requests; it is not per-connection. `Rpc.fork(...)` opts an individual handler out.
- **`disableFatalDefects: boolean`** (default `false`) — by default a defect in a handler (a `die` with no interruption) is treated as a protocol-level fault: the server sends a connection `Defect` message and the client fails **every in-flight request on that connection** with `Cause.die`. With `true`, the defect is delivered as that one request's `Exit`. Production servers usually want `true`. Either way the defect crosses the wire encoded with the rpc's defect schema — the default `Schema.Defect()` keeps an `Error`'s name/message but drops stacks; declare `defect: Schema.Defect({ includeStack: true })` on the contract (see the `effect-rpc-api` skill) to preserve them.
- **Undecodable payloads** never reach the handler: the server answers that one request with a die exit carrying the schema issue string (regardless of `disableFatalDefects`); the connection stays up.
- **`disableTracing` / `spanPrefix` / `spanAttributes`** — each request runs in a span named `${spanPrefix}.${tag}` (default prefix `RpcServer`), with the client's span as parent when the transport supports span propagation.

`RpcServer.make(group, options?)` is the Effect form — `Effect<never, ...>` that runs the server loop forever; `layer` is exactly `Layer.effectDiscard(Effect.forkScoped(make(group, options)))`.

### `RpcServer.layerHttp({ group, path, protocol?, ...options })` — one-call HTTP setup

Note the different calling convention: the group goes **inside** the options object, and `protocol` defaults to `'websocket'`, not `'http'`:

```ts
const ServerLayer = RpcServer.layerHttp({
	group: UserRpcs,
	path: '/rpc',
	protocol: 'http', // or 'websocket' (the default!)
	disableFatalDefects: true
}).pipe(
	Layer.provide(UsersLive),
	Layer.provide(RpcSerialization.layerNdjson)
);
```

### Serving multiple groups

`layer`/`layerHttp` take exactly one group. Either merge the contracts — `UserRpcs.merge(AdminRpcs)` (see the `effect-rpc-api` skill) — and serve one server, or build a complete `RpcServer.layer(...)` + `layerProtocolHttp({ path })` composition per group at distinct paths and `Layer.mergeAll` them: each composition encapsulates its own `Protocol`, so several can register routes on the same `HttpRouter` without clashing.

### Full Node wiring

The protocol layers register routes on `HttpRouter`; `HttpRouter.serve` provides the router and turns it into an HTTP app:

```ts
import { createServer } from 'node:http';
import { NodeHttpServer, NodeRuntime } from '@effect/platform-node';

const Main = HttpRouter.serve(ServerLayer).pipe(
	Layer.provide(NodeHttpServer.layer(createServer, { port: 3000 }))
);

NodeRuntime.runMain(Layer.launch(Main));
```

See the `effect-http-server` skill for `HttpRouter.serve` options (middleware, `disableLogger`, `disableListenLog`) and adding sibling routes.

---

## 3. Protocol Layers — Picking a Transport

| Layer | Requires | supportsAck | span propagation | transferables |
|---|---|---|---|---|
| `RpcServer.layerProtocolHttp({ path })` | `RpcSerialization`, `HttpRouter` | no | no | no |
| `RpcServer.layerProtocolWebsocket({ path })` | `RpcSerialization`, `HttpRouter` | yes | yes | no |
| `RpcServer.layerProtocolSocketServer` | `RpcSerialization`, `SocketServer` | yes | yes | no |
| `RpcServer.layerProtocolStdio` | `RpcSerialization`, `Stdio` | yes | yes | no |
| `RpcServer.layerProtocolWorkerRunner` | `WorkerRunner.WorkerRunnerPlatform` | yes | yes | yes |

`supportsAck` is what enables **stream backpressure** (§7). Each layer has a `makeProtocol*` Effect counterpart for inline composition, and `makeProtocolWithHttpEffect` / `makeProtocolWithHttpEffectWebsocket` return `{ protocol, httpEffect }` when you need both (§5).

- **HTTP** (`layerProtocolHttp`) registers a `POST` route. Each HTTP request is a short-lived client: all messages in the body are processed, then the response is either buffered or streamed depending on serialization framing (§4). HTTP request headers are prepended to every rpc request's headers — so `authorization` etc. is visible to middleware without client cooperation.
- **WebSocket** (`layerProtocolWebsocket`) registers a `GET` route that upgrades the connection. Upgrade-request headers are merged into every rpc's headers. Full duplex, acks, span propagation.
- **TCP** (`layerProtocolSocketServer`) serves raw sockets:

```ts
import { NodeSocketServer } from '@effect/platform-node';

const TcpServer = RpcServer.layer(UserRpcs).pipe(
	Layer.provide(UsersLive),
	Layer.provide(RpcServer.layerProtocolSocketServer),
	Layer.provide(NodeSocketServer.layer({ port: 9000 })),
	Layer.provide(RpcSerialization.layerMsgPack) // must be a framed format (§4)
);
```

`SocketServer` layers and the raw socket surface underneath are covered by the `effect-socket` skill.

- **Stdio** (`layerProtocolStdio`) serves RPC over the current process's stdin/stdout — for CLI subprocess protocols (LSP-style tooling, plugin hosts). When stdin ends, the protocol interrupts the server fiber so the process can exit:

```ts
import { NodeRuntime, NodeStdio } from '@effect/platform-node';

const StdioMain = RpcServer.layer(UserRpcs).pipe(
	Layer.provide(UsersLive),
	Layer.provide(RpcServer.layerProtocolStdio),
	Layer.provide(RpcSerialization.layerNdjson),
	Layer.provide(NodeStdio.layer)
);

NodeRuntime.runMain(Layer.launch(StdioMain));
```

- **Worker** — see §9.

### Inspecting the live protocol

`RpcServer.Protocol` is a `Context.Service` you can read to branch on transport capabilities (tests use this to skip backpressure assertions on HTTP):

```ts
const { supportsAck, supportsTransferables, supportsSpanPropagation, clientIds, initialMessage } =
	yield* RpcServer.Protocol;
```

---

## 4. Serialization — Picking a Wire Format

Provide exactly one `RpcSerialization` layer. The load-bearing property is `includesFraming` — whether the format can split a byte stream back into messages:

| Layer | Content-Type | Framed? | Notes |
|---|---|---|---|
| `RpcSerialization.layerJson` | `application/json` | no | whole-payload JSON |
| `RpcSerialization.layerNdjson` | `application/ndjson` | yes | newline-delimited JSON |
| `RpcSerialization.layerJsonRpc({ contentType? })` | `application/json` | no | JSON-RPC 2.0 interop |
| `RpcSerialization.layerNdJsonRpc({ contentType? })` | `application/json-rpc` | yes | JSON-RPC 2.0, newline-framed |
| `RpcSerialization.layerMsgPack` | `application/msgpack` | yes | binary, smallest; msgpackr `useRecords: true` |

Rules, verified against the protocol implementations and the e2e matrix:

- **Raw TCP sockets need a framed format** (`ndjson`, `ndJsonRpc`, `msgPack`). Plain `json` cannot split the byte stream — decoding breaks as soon as two messages share a chunk.
- **WebSocket frames messages itself**, so *any* format works there — the e2e suite runs ws with json, ndjson, msgpack, and jsonRpc.
- **HTTP POST works with both**, with different response behavior: with an **unframed** format the server buffers all responses and returns one JSON array when every request finishes (a streaming rpc arrives as one big batch at the end); with a **framed** format the server returns a chunked streaming response and chunks arrive incrementally. Use `layerNdjson` (or msgpack) over HTTP if you serve streaming rpcs.
- The response `content-type` is the serialization's `contentType`.
- `RpcSerialization.layerJsonRpc()` / `layerNdJsonRpc()` speak JSON-RPC 2.0: rpc tags map to `method`, batched arrays are preserved, and internal signals travel as `@effect/rpc/Ack`-style methods. Use for interop with non-Effect JSON-RPC clients.
- `RpcSerialization.makeMsgPack(options)` customizes msgpackr (`useRecords`, `useFloat32`, ...); wrap with `Layer.succeed(RpcSerialization.RpcSerialization)(RpcSerialization.makeMsgPack({ ... }))`.

Client and server must use the **same** serialization.

---

## 5. Embedding in an Existing HTTP App

When you want the RPC handler as a value to mount yourself — alongside other routes, behind your own middleware, or in a Fetch-style handler — use the `toHttpEffect` helpers instead of `layerProtocolHttp`.

`RpcServer.toHttpEffect(group, options?)` starts the server in the current `Scope` and returns the request-handling Effect (`Effect<HttpServerResponse, never, Scope | HttpServerRequest>`). `toHttpEffectWebsocket` is the upgrade-handler equivalent. Options are `disableTracing` / `spanPrefix` / `spanAttributes` / `disableFatalDefects` — note there is **no `concurrency` option** on these two.

```ts
const RpcRoute = Layer.effectDiscard(
	Effect.gen(function* () {
		const router = yield* HttpRouter.HttpRouter;
		const rpcHandler = yield* RpcServer.toHttpEffect(UserRpcs, {
			disableFatalDefects: true
		});
		yield* router.add('POST', '/rpc', rpcHandler);
	})
).pipe(Layer.provide([UsersLive, RpcSerialization.layerNdjson]));

// merge with your other route layers and serve as usual
const Main = HttpRouter.serve(Layer.mergeAll(RpcRoute, HealthRoutes)).pipe(
	Layer.provide(NodeHttpServer.layer(createServer, { port: 3000 }))
);
```

`Layer.effectDiscard` supplies the `Scope` that keeps the forked RPC server alive for the lifetime of the layer.

Lower still: `RpcServer.makeProtocolWithHttpEffect` / `makeProtocolWithHttpEffectWebsocket` give you `{ protocol, httpEffect }` so you can provide the `Protocol` to `RpcServer.make` yourself — useful when one process must mount the same server behind several routes or compose with a hand-built runtime.

---

## 6. Implementing Middleware

A middleware is a `Context.Service` whose value is a function wrapping handler execution. Definition (shared with the contract — see the `effect-rpc-api` skill) and server implementation:

```ts
class CurrentUser extends Context.Service<CurrentUser, User>()('CurrentUser') {}

class Unauthorized extends Schema.ErrorClass<Unauthorized>('Unauthorized')({
	_tag: Schema.tag('Unauthorized')
}) {}

class AuthMiddleware extends RpcMiddleware.Service<AuthMiddleware, {
	provides: CurrentUser; // injected into the handler
	requires: never; // services the middleware itself needs at runtime
	clientError: never; // error type only the client-side wrapper can produce
}>()('AuthMiddleware', {
	error: Unauthorized, // wire-encodable failure this middleware may produce
	requiredForClient: true // clients must provide RpcMiddleware.layerClient(...) or fail to compile
}) {}

// Attach: per-rpc `rpc.middleware(AuthMiddleware)` or whole-group `group.middleware(AuthMiddleware)`
const SecureRpcs = UserRpcs.middleware(AuthMiddleware);
```

### Server implementation layer

The middleware function receives `(effect, options)` where `options` is `{ client, requestId, rpc, payload, headers }` (note: `payload` is `unknown` here — middleware is generic over rpcs). Provide it as a Layer:

```ts
const AuthLive = Layer.effect(AuthMiddleware)(
	Effect.gen(function* () {
		const tokens = yield* TokenService; // middleware dependencies
		return AuthMiddleware.of((effect, { headers, client }) =>
			tokens.verify(headers.authorization).pipe(
				Effect.mapError(() => new Unauthorized()),
				Effect.flatMap((user) => {
					client.annotate(CurrentUser, user); // optional: visible to later requests' middleware via client.annotations
					return Effect.provideService(effect, CurrentUser, user);
				})
			)
		);
	})
);
// dependency-free middleware: Layer.succeed(AuthMiddleware)(AuthMiddleware.of(...))
```

Then `Layer.provide(AuthLive)` to `RpcServer.layer` along with the handlers — the server's `Rpc.Middleware<Rpcs>` requirement makes forgetting it a compile error.

### Semantics

- **Ordering**: middlewares are applied in attach order, each wrapping the previous result — so the **last attached middleware is outermost** and runs first on the way in; services it provides are visible to earlier-attached middleware and the handler. In the platform fixture, `Rpc.make(...).middleware(TimingMiddleware)` inside a group with `.middleware(AuthMiddleware)` runs Auth (outer) then Timing (inner).
- **Failure**: failing with the declared `error` schema becomes that request's `Exit` and is typed on the client. Dying inside middleware follows the same fatal-defect rules as handlers (§2).
- **Streams**: for stream rpcs the middleware wraps the *entire stream-running effect* — it runs once per request and stays active for the stream's lifetime; provided services reach the stream handler.
- **Chaining**: a middleware config may declare `requires: SomeService` that another middleware `provides` — the type system forces the providing middleware to be attached too.
- **Cross-cutting observability**: middleware with no `provides` is the place for metrics/timing — wrap with `Effect.tap` / `Effect.tapDefect` / `Effect.ensuring`:

```ts
class TimingMiddleware extends RpcMiddleware.Service<TimingMiddleware>()('TimingMiddleware') {}

const TimingLive = Layer.succeed(TimingMiddleware)(
	TimingMiddleware.of((effect) =>
		effect.pipe(
			Effect.tap(Metric.update(rpcSuccesses, 1)),
			Effect.tapDefect(() => Metric.update(rpcDefects, 1)),
			Effect.ensuring(Metric.update(rpcCount, 1))
		)
	)
);
```

`requiredForClient: true` middlewares additionally need `RpcMiddleware.layerClient(...)` on every client (including `RpcTest`) — see the `effect-rpc-client` skill.

---

## 7. Streaming Handlers

A `stream: true` rpc's handler returns either a `Stream` or an Effect producing a `Queue.Dequeue`:

```ts
// Stream form — simplest
StreamUsers: (payload) =>
	db.changeFeed(payload.id).pipe(Stream.map((row) => new User(row)));

// Queue form — push values from background fibers; the per-request Scope cleans up
StreamUsers: Effect.fnUntraced(function* (payload) {
	const queue = yield* Queue.bounded<User, Cause.Done>(16);
	yield* Effect.addFinalizer(() => Effect.log('subscription closed'));
	yield* pollSource(payload.id, queue).pipe(Effect.forkScoped); // dies with the request
	return queue;
});
```

Semantics, verified against `RpcServer.makeNoSerialization`:

- The server batches available values into `Chunk` messages (`Stream.runForEachArray` / `Queue.takeAll`), so one message can carry many elements.
- **Backpressure** exists only on ack-supporting transports (everything except plain HTTP): after writing a chunk the server waits for the client's `Ack` before pulling more. Over plain HTTP the producer is never throttled.
- **Ending**: a `Stream` ending ends the response; for the queue form call `Queue.end(queue)` — `Cause.Done` is the end-of-stream signal, and `Queue.end` only typechecks when the queue's error channel includes it, so create the queue as `Queue.bounded<User, Cause.Done>(16)`. The client then sees the stream complete with a final void `Exit`.
- **Failures**: failing the stream with the rpc's declared error fails the client's stream with that typed error.
- The client consumes the result as a `Stream` by default or a `Queue.Dequeue` with `{ asQueue: true }` — see the `effect-rpc-client` skill.

---

## 8. Interruption, Client Aborts & Graceful Shutdown

### Client aborts

When a client interrupts an in-flight call (or a streaming subscription), the server interrupts the handler fiber with the `RpcSchema.ClientAbort` cause annotation. The request scope closes and finalizers run. To distinguish a client abort from server shutdown, inspect the cause's interrupt reasons:

```ts
Never: () =>
	Effect.never.pipe(
		Effect.onExit((exit) => {
			const clientAborted =
				exit._tag === 'Failure' &&
				exit.cause.reasons.some(
					(r) => r._tag === 'Interrupt' && r.annotations.has(RpcSchema.ClientAbort.key)
				);
			return Effect.log(clientAborted ? 'client cancelled' : 'other interrupt');
		})
	);
```

`Effect.onInterrupt` only receives interruptor fiber ids — use `Effect.onExit` / `Effect.onError` when you need the annotation.

### Disconnects

- **HTTP**: if the request's scope closes before responses finish (client went away), the protocol sends an `Interrupt` for every request id from that HTTP call.
- **Sockets/WebSockets**: a closed connection is pushed to the protocol's `disconnects` queue; the server interrupts all of that client's in-flight fibers.
- An `Interrupt` for an unknown/finished request id is answered with `Exit.interrupt()` — interruption is idempotent.

### `Rpc.uninterruptible`

Handlers that must complete (payment capture, append-then-ack) should return `value.pipe(Rpc.uninterruptible)` — the fiber is forked uninterruptibly, so client aborts and shutdown wait for it.

### Graceful shutdown

When the server layer's scope closes (e.g. `NodeRuntime.runMain` received SIGINT):

1. New messages are rejected (`Effect.interrupt`).
2. Every in-flight handler fiber is interrupted — **without** the `ClientAbort` annotation; `Rpc.uninterruptible` handlers run to completion.
3. Each finished request's final `Exit` (interrupt or result) is still flushed to its client, then a `ClientEnd` is sent per client.
4. The server's finalizer waits on a latch until every client has been ended — shutdown does not race the final writes.

---

## 9. Worker-Backed Servers

Run the RPC server inside a Web/Node worker; the parent process is the client (`RpcClient.layerProtocolWorker` — see the `effect-rpc-client` skill). The worker protocol does its own structured-clone transport, so **no `RpcSerialization` layer is needed** and `supportsTransferables` is true.

Worker entrypoint (browser shown; for Node use `NodeWorkerRunner.layer` from `@effect/platform-node`):

```ts
// worker.ts
import { BrowserWorkerRunner } from '@effect/platform-browser';
import { Effect, Layer } from 'effect';
import { RpcServer } from 'effect/unstable/rpc';

const MainLive = RpcServer.layer(UserRpcs).pipe(
	Layer.provide(UsersLive),
	Layer.provide(RpcServer.layerProtocolWorkerRunner),
	Layer.provide(BrowserWorkerRunner.layer)
);

Effect.runFork(Layer.launch(MainLive));
```

### Initial message

A worker client can send one schema-encoded value before any rpc traffic — spawn-time config without an extra round-trip. Server side, read it before/while serving:

```ts
class WorkerConfig extends Schema.Class<WorkerConfig>('WorkerConfig')({
	apiUrl: Schema.String
}) {}

// inside the worker (requires RpcServer.Protocol in context):
const config = yield* RpcWorker.initialMessage(WorkerConfig);
// fails with NoSuchElementError if the parent provided none
```

The parent provides it with `RpcWorker.layerInitialMessage(WorkerConfig, buildEffect)` on the client protocol. Only the worker protocol supports initial messages — `protocol.initialMessage` is `Option.none()` everywhere else.

---

## 10. Testing Servers

### `RpcTest.makeClient(group)` — in-process, no transport

Wires `RpcServer.makeNoSerialization` to a no-serialization client. Requests, stream chunks, acks, interrupts, headers, and middleware all behave like production (acks are enabled, so backpressure is testable). Required context: `Scope | Rpc.ToHandler<Rpcs> | Rpc.Middleware<Rpcs> | Rpc.MiddlewareClient<Rpcs>` — handler layers, middleware layers, **and** any `requiredForClient` client layers:

```ts
import { assert, it } from '@effect/vitest';
import { RpcClient } from 'effect/unstable/rpc';

class UsersClient extends Context.Service<
	UsersClient,
	RpcClient.RpcClient<RpcGroup.Rpcs<typeof SecureRpcs>>
>()('UsersClient') {
	static layerTest = Layer.effect(UsersClient)(RpcTest.makeClient(SecureRpcs)).pipe(
		Layer.provide([UsersLive, AuthLive, TimingLive, AuthClient]) // AuthClient = RpcMiddleware.layerClient(...)
	);
}

it.effect('GetUser', () =>
	Effect.gen(function* () {
		const client = yield* UsersClient;
		const user = yield* client.GetUser({ id: '1' });
		assert.deepStrictEqual(user, new User({ id: '1', name: 'Logged in user' }));
	}).pipe(Effect.provide(UsersClient.layerTest)));
```

`makeClient` accepts `{ flatten?: boolean }` mirroring `RpcClient.make`.

### Transport integration tests

For exercising a real transport in-process, use `NodeHttpServer.layerTest` (provides both `HttpServer` and `HttpClient` on a random port) under your normal server+client layers — `packages/platform-node/test/RpcServer.test.ts` is the template; it runs one shared e2e suite against http/ws/tcp with the serializations each transport supports (plain json only over ws).

### Unit-testing one handler

Use `group.accessHandler(tag)` (§1) — no client, no protocol, just the handler with its services.

---

## 11. Custom Protocols & `makeNoSerialization`

### Custom `Protocol`

`RpcServer.Protocol.make` (built on the `withRun` buffering helper) builds a transport from a callback that receives `writeRequest` — the function you call with decoded `FromClientEncoded` messages. You return the rest of the service:

```ts
const myProtocol = RpcServer.Protocol.make((writeRequest) =>
	Effect.gen(function* () {
		const disconnects = yield* Queue.make<number>();
		// wire your transport: on inbound data → writeRequest(clientId, message)
		return {
			disconnects,
			send: (clientId, response, _transferables) => sendToTransport(clientId, response),
			end: (clientId) => Effect.void,
			clientIds: Effect.sync(() => connectedIds),
			initialMessage: Effect.succeedNone,
			supportsAck: true,
			supportsTransferables: false,
			supportsSpanPropagation: false
		};
	})
);
```

Writes made before the server loop starts are buffered and replayed — you don't need to sequence startup manually. The message vocabulary lives in `RpcMessage` (`FromClientEncoded` = `Request | Ack | Interrupt | Ping | Eof`; `FromServerEncoded` = `Chunk | Exit | Defect | Pong | ClientProtocolError`).

### `RpcServer.makeNoSerialization(group, options)`

The decoded core with no transport at all: you push `FromClient<Rpcs>` messages via the returned `server.write(clientId, message)` / `server.disconnect(clientId)`, and receive decoded `FromServer<Rpcs>` responses through `options.onFromServer`. Extra options beyond `make`: `disableSpanPropagation`, `disableClientAcks` (the serialized `make` derives both from the protocol's capabilities). This is what `RpcTest` and the cluster runtime build on — reach for it for in-process bridges where schema encoding would be wasted.

---

## Key Patterns

### Production HTTP server (handlers + auth middleware + http protocol)

```ts
// server/main.ts
import { createServer } from 'node:http';
import { NodeHttpServer, NodeRuntime } from '@effect/platform-node';
import { Effect, Layer } from 'effect';
import { HttpRouter } from 'effect/unstable/http';
import { RpcSerialization, RpcServer } from 'effect/unstable/rpc';
import { SecureRpcs } from '../domain/rpc.ts';

const UsersLive = SecureRpcs.toLayer(
	Effect.gen(function* () {
		const db = yield* Database;
		return SecureRpcs.of({
			GetUser: (payload) => db.findUser(payload.id),
			StreamUsers: (payload) => db.changeFeed(payload.id)
		});
	})
);

const RpcLayer = RpcServer.layerHttp({
	group: SecureRpcs,
	path: '/rpc',
	protocol: 'http',
	disableFatalDefects: true
}).pipe(
	Layer.provide([UsersLive, AuthLive]),
	Layer.provide(RpcSerialization.layerNdjson) // framed → streaming rpcs stream over HTTP
);

const Main = HttpRouter.serve(RpcLayer).pipe(
	Layer.provide(NodeHttpServer.layer(createServer, { port: 3000 }))
);

NodeRuntime.runMain(Layer.launch(Main));
```

Switch `protocol: 'websocket'` (and have clients connect a socket) to gain acks/backpressure and span propagation with no other changes.

### RPC endpoint inside a larger router

```ts
const RpcRoute = Layer.effectDiscard(
	Effect.gen(function* () {
		const router = yield* HttpRouter.HttpRouter;
		yield* router.add('POST', '/rpc', yield* RpcServer.toHttpEffect(UserRpcs, {
			disableFatalDefects: true
		}));
	})
).pipe(Layer.provide([UsersLive, RpcSerialization.layerNdjson]));

const Main = HttpRouter.serve(Layer.mergeAll(RpcRoute, ApiRoutes, HealthRoute)).pipe(
	Layer.provide(NodeHttpServer.layer(createServer, { port: 3000 }))
);
```

### Streaming subscription with cleanup and abort logging

```ts
StreamUsers: Effect.fnUntraced(function* (payload) {
	const queue = yield* Queue.bounded<User, Cause.Done>(16);

	yield* Effect.addFinalizer(() => Effect.log('feed closed', { id: payload.id }));

	yield* db.subscribe(payload.id, (row) => Queue.offerUnsafe(queue, new User(row))).pipe(
		Effect.forkScoped // tied to this request; interrupted on client abort
	);

	return queue;
});
```

### Read-heavy group with bounded writes

```ts
const ServerLayer = RpcServer.layer(StoreRpcs, { concurrency: 1 }).pipe(
	Layer.provide(
		StoreRpcs.toLayer(
			Effect.gen(function* () {
				const state = yield* Ref.make(initialState);
				return StoreRpcs.of({
					// reads bypass the server-wide semaphore
					Get: () => Ref.get(state).pipe(Rpc.fork),
					// writes serialize through concurrency: 1 and survive aborts
					Put: (payload) =>
						Ref.update(state, applyPut(payload)).pipe(Rpc.uninterruptible)
				});
			})
		)
	)
);
```

## Common Mistakes

1. **Importing from `@effect/rpc`.** v3 habit; the package does not exist in v4. Everything is `effect/unstable/rpc` (and platform layers come from `@effect/platform-node` / `-bun` / `-browser`).
2. **Forgetting `protocol: 'http'` on `layerHttp`.** The default is `'websocket'` — your `POST /rpc` curl returns 404 and only a `GET` upgrade route exists. Also note `layerHttp` takes `{ group, path, ... }` as one options bag, while `layer(group, options)` takes the group positionally.
3. **Providing handlers/middleware but no `Protocol` or `RpcSerialization`.** `RpcServer.layer` requires all of: handler layer(s), middleware implementation layers, a `layerProtocol*`, and (for non-worker protocols) a `RpcSerialization.layer*`. Missing ones surface as unresolved layer requirements.
4. **`layerJson` on a raw TCP socket server.** No framing — decode breaks when messages span chunks. Sockets need `layerNdjson`, `layerNdJsonRpc()`, or `layerMsgPack`. (WebSocket is fine with `layerJson` — ws frames messages itself.)
5. **Streaming rpcs over `layerProtocolHttp` + `layerJson` and wondering why chunks arrive all at once.** Unframed HTTP buffers the whole response until every request in the call finishes. Use a framed serialization to get a chunked streaming response, and remember HTTP has no acks → no backpressure either way.
6. **Leaving `disableFatalDefects: false` in production.** One handler `die` then nukes every in-flight request on that connection with a connection-level defect. Set `true` to confine defects to the failing request.
7. **Assuming `concurrency` is per-client.** It is one semaphore per server instance shared by all clients. Use `Rpc.fork` to exempt cheap read handlers instead of raising the global limit.
8. **Treating `Rpc.fork`/`Rpc.uninterruptible` as rpc options.** They wrap the handler's *returned* Effect/Stream: `db.get(id).pipe(Rpc.fork)`. There is no `{ fork: true }` key on `Rpc.make`.
9. **Typing the handler metadata as `clientId: number`.** It is `client: Rpc.ServerClient` with `client.id`, `client.annotations`, and `client.annotate(key, value)`.
10. **Implementing middleware as `(payload, next) => ...`.** Server middleware is `(effect, { client, requestId, rpc, payload, headers }) => Effect` — you wrap the already-built handler effect (and `payload` is `unknown`). The `{ request, next }` shape belongs to client middleware (`RpcMiddleware.layerClient`).
11. **Expecting first-attached middleware to run first.** The last attached middleware is outermost. `group.middleware(M)` also only affects rpcs already in the group — rpcs `.add(...)`ed later don't get it.
12. **Forgetting client middleware layers in `RpcTest.makeClient`.** Its context includes `Rpc.MiddlewareClient<Rpcs>` — every `requiredForClient: true` middleware needs its `RpcMiddleware.layerClient` provided alongside the handler and server-middleware layers.
13. **Detecting client aborts with `Effect.onInterrupt`.** Its callback only gets interruptor ids. Inspect the exit: `exit.cause.reasons.some((r) => r._tag === 'Interrupt' && r.annotations.has(RpcSchema.ClientAbort.key))`. Server-shutdown interrupts do *not* carry the annotation.
14. **Ending a queue-form stream by failing it.** Use `Queue.end(queue)` (the `Cause.Done` signal) for a clean end-of-stream; a typed failure fails the client's stream instead. `Queue.end` requires `Cause.Done` in the queue's error channel — `Queue.bounded<User, Cause.Done>(16)` — or it won't typecheck.
15. **Calling `RpcServer.toHttpEffect` outside a scope.** It forks the server with `Effect.forkScoped` — build it inside `Layer.effectDiscard` (or another `Scope`-providing context) or the server dies immediately. Also note it has no `concurrency` option; use `layer`/`layerHttp` if you need one.
