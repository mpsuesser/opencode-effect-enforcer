---
name: effect-rpc-cluster
description: Build typed RPC endpoints and cluster-distributed entities, singletons, cron jobs, and durable workflows with Effect's RPC and Cluster modules (Rpc/RpcGroup/RpcServer/RpcClient, Entity/Sharding/Singleton, Node/Bun bundles). Use when building RPC services or distributed/clustered Effect systems.
---

You are an Effect TypeScript expert specializing in `effect/unstable/rpc` and `effect/unstable/cluster`.

These modules live under `effect/unstable/*`. There are no `@effect/rpc` or `@effect/cluster` packages in v4 — everything ships from the `effect` package. APIs may move between betas.

## Effect Source Reference

The Effect v4 source is at `~/.cache/effect-v4/`. Read it directly when in doubt — the shape of these modules changes more often than the website docs.

Key files:

- `packages/effect/src/unstable/rpc/Rpc.ts` — `Rpc.make`, custom constructors, `Wrapper`, `ServerClient`, `exitSchema`
- `packages/effect/src/unstable/rpc/RpcGroup.ts` — group construction, handler wiring (`toLayer` / `toHandlers` / `toLayerHandler` / `accessHandler`), prefixing, omit/merge, annotations
- `packages/effect/src/unstable/rpc/RpcServer.ts` — `make`, `layer`, `layerHttp`, every `layerProtocol*` and `toHttpEffect*`
- `packages/effect/src/unstable/rpc/RpcClient.ts` — `make`, `Protocol`, every `layerProtocol*`, `withHeaders`, `CurrentHeaders`, `ConnectionHooks`
- `packages/effect/src/unstable/rpc/RpcMiddleware.ts` — `Service` constructor, `layerClient`
- `packages/effect/src/unstable/rpc/RpcSerialization.ts` — json/ndjson/jsonRpc/ndJsonRpc/msgPack codecs and their layers
- `packages/effect/src/unstable/rpc/RpcTest.ts` — in-process test client
- `packages/effect/src/unstable/rpc/RpcWorker.ts` — `InitialMessage` for worker transports
- `packages/effect/src/unstable/rpc/RpcSchema.ts` — `Stream` schema marker, `ClientAbort` cause annotation
- `packages/effect/src/unstable/rpc/RpcClientError.ts` — client-side error union
- `packages/effect/src/unstable/cluster/Entity.ts` — `Entity.make` / `fromRpcGroup`, handler envelopes, `Replier`, `CurrentAddress`, `keepAlive`, `makeTestClient`
- `packages/effect/src/unstable/cluster/ClusterSchema.ts` — `Persisted`, `Uninterruptible`, `WithTransaction`, `ShardGroup`, `ClientTracingEnabled`, `Dynamic`
- `packages/effect/src/unstable/cluster/ClusterError.ts` — `MailboxFull`, `AlreadyProcessingMessage`, `PersistenceError`, `EntityNotAssignedToRunner`, `MalformedMessage`, `RunnerUnavailable`, `RunnerNotRegistered`
- `packages/effect/src/unstable/cluster/Sharding.ts` — the `Sharding` service surface
- `packages/effect/src/unstable/cluster/ShardingConfig.ts` — config schema + env loader
- `packages/effect/src/unstable/cluster/Singleton.ts` — singleton-per-cluster effects
- `packages/effect/src/unstable/cluster/ClusterCron.ts` — cron-driven singletons
- `packages/effect/src/unstable/cluster/SingleRunner.ts` — single-node sql-backed bundle
- `packages/effect/src/unstable/cluster/TestRunner.ts` — in-memory testing bundle
- `packages/effect/src/unstable/cluster/EntityProxy.ts` + `EntityProxyServer.ts` — entity ↔ RPC/HTTP bridge
- `packages/effect/src/unstable/workflow/WorkflowProxy.ts` + `WorkflowProxyServer.ts` — workflow ↔ RPC/HTTP bridge
- `packages/effect/src/unstable/cluster/ClusterWorkflowEngine.ts` — production workflow engine backed by sharding + storage
- `packages/effect/src/unstable/reactivity/AtomRpc.ts` — reactive RPC client for Atom UIs (see also `effect-atom-rpc` skill)
- `packages/platform-node/src/NodeClusterHttp.ts` / `NodeClusterSocket.ts` — Node "all-in-one" cluster layers
- `packages/platform-bun/src/BunClusterHttp.ts` / `BunClusterSocket.ts` — Bun equivalents
- `packages/platform-node/test/RpcServer.test.ts` + `test/fixtures/rpc-{schemas,e2e}.ts` — best end-to-end reference for real RPC wiring
- `packages/effect/test/cluster/TestEntity.ts` + `test/cluster/Entity.test.ts` — best reference for Entity + makeTestClient

## Imports

```ts
// RPC
import {
	Rpc,
	RpcClient,
	RpcGroup,
	RpcMiddleware,
	RpcSchema,
	RpcSerialization,
	RpcServer,
	RpcTest,
	RpcWorker
} from 'effect/unstable/rpc';
import { RpcClientError } from 'effect/unstable/rpc/RpcClientError';

// Cluster
import {
	ClusterCron,
	ClusterError,
	ClusterSchema,
	Entity,
	EntityProxy,
	EntityProxyServer,
	MessageStorage,
	RunnerHealth,
	Runners,
	RunnerStorage,
	Sharding,
	ShardingConfig,
	SingleRunner,
	Singleton,
	SqlMessageStorage,
	SqlRunnerStorage,
	TestRunner
} from 'effect/unstable/cluster';

// Workflow (see effect-workflow skill for the full surface)
import {
	Activity,
	DurableClock,
	DurableDeferred,
	Workflow,
	WorkflowProxy,
	WorkflowProxyServer
} from 'effect/unstable/workflow';
import { ClusterWorkflowEngine } from 'effect/unstable/cluster';

// Platform "all-in-one" cluster bundles
import { NodeClusterHttp, NodeClusterSocket } from '@effect/platform-node';
// or
import { BunClusterHttp, BunClusterSocket } from '@effect/platform-bun';
```

## Architecture at a Glance

```
                   wire format (json | ndjson | msgpack | jsonRpc | ndJsonRpc)
                                          │
       ┌──────────────┐        Protocol   │   Protocol         ┌──────────────┐
       │  RpcClient   │  ───────────────► │ ◄───────────────── │  RpcServer   │
       │  (make)      │   http/ws/socket/ │   http/ws/socket/  │  (layer)     │
       └──────┬───────┘   stdio/worker    │   stdio/worker     └──────┬───────┘
              │                                                        │
        client middlewares                                       server middlewares
              │                                                        │
              ▼                                                        ▼
     RpcGroup.make(...rpcs)  ◄── shared definition ──►   RpcGroup.toLayer(handlers)


   For distributed actor-style state:

       ┌──────────────────────────┐         entity rpcs travel through
       │  Entity.make(type,rpcs)  │  ───►   MessageStorage (durable) and
       │  ─ toLayer(handlers)     │         routed by Sharding to the
       │  ─ toLayerQueue(...)     │         runner that owns the entityId's shard
       │  ─ client                │
       └──────────────────────────┘
```

Two big invariants:

1. **An `Rpc` is a definition.** The same `Rpc` value can be served by an `RpcServer`, called by an `RpcClient`, mounted in an `Entity`, exposed via `EntityProxy.toRpcGroup`/`toHttpApiGroup`, or driven from `AtomRpc.query`/`mutation`. Define rpcs in a shared module so all sides share types.
2. **`RpcGroup` handlers and `Entity` handlers have different signatures.** RpcGroup handlers take `(payload, options)`; Entity handlers take `(envelope)`. Mixing them up is the most common mistake.

## Defining RPCs

`Rpc.make(tag, options?)` returns an `Rpc` value. It is *both* a value and a constructor — you can use it either way:

```ts
import { Schema } from 'effect';
import { Rpc } from 'effect/unstable/rpc';

// Style A — const value. Compact, fine for ad-hoc rpcs.
export const Ping = Rpc.make('Ping', { success: Schema.String });

// Style B — class extends. Gives the rpc a nominal class identity, useful
// when you want to import it as a type and pattern-match on it.
export class GetUser extends Rpc.make('GetUser', {
	success: User,
	payload: { id: Schema.String }
}) {}
```

Both styles are official. The platform-node test fixtures and the cluster test fixtures use both deliberately. Pick by feel:

- `class extends` when the rpc is shared across many modules and the nominal type helps documentation/imports
- `const` when you're listing a dozen rpcs in one file and the boilerplate hurts more than the nominal type helps

> Note: this is **not** the same as `Workflow.make`, `Activity.make`, `Entity.make`, or `RpcGroup.make` — those all return plain values you assign with `const`. The class-extends pattern is unique to `Rpc.make` (and to `Schema.Class`-style constructors) because `Rpc` declares `new (_: never): {}` in its interface.

### `Rpc.make` options

```ts
Rpc.make(tag, {
	payload?:    Schema.Top | Schema.Struct.Fields,  // struct fields or a Schema
	success?:    Schema.Top,                          // default Schema.Void
	error?:      Schema.Top,                          // default Schema.Never
	defect?:     Schema.Top,                          // default Schema.Defect()
	stream?:     boolean,                             // default false
	primaryKey?: (payload) => string                  // for cluster dedup / persistence
})
```

#### Payload as struct fields vs Schema

Passing a `Schema.Struct.Fields` literal lets `Rpc.make` build the struct for you. Passing a `Schema.Class` (or any `Schema.Top`) lets you reuse a named type:

```ts
// inline fields
Rpc.make('CreateUser', {
	payload: { name: Schema.String, email: Schema.String },
	success: User
});

// named class — preferred when the payload is reused
class CreateUserInput extends Schema.Class<CreateUserInput>('CreateUserInput')({
	name: Schema.String,
	email: Schema.String
}) {}
Rpc.make('CreateUser', { payload: CreateUserInput, success: User });
```

#### `defect` — custom defect schema (round-trip preservation)

By default `Rpc.make` uses `Schema.Defect()`, which round-trips defects as `unknown`. To keep stack traces, custom error names, or other defect properties intact across the wire, set an explicit defect schema:

```ts
import { Schema } from 'effect';

const DiagnosticDefect = Schema.Struct({
	name: Schema.String,
	message: Schema.String,
	stack: Schema.OptionFromNullishOr(Schema.String)
});

const Risky = Rpc.make('Risky', {
	success: Schema.Void,
	defect: Schema.Defect({ includeStack: true })
});
```

The cluster test fixture uses this: a handler does `Effect.die({ message, stack, name: 'CustomDefect' })` and the client receives the full object with stack intact.

#### `primaryKey` — deterministic envelope identity

`primaryKey` is required for cluster persistence to dedupe a request: the same payload that produces the same key will be treated as the same envelope, so retried sends are safe. It also makes `Rpc.make` build a `Schema.Class` for the payload (with `PrimaryKey.symbol` implemented) so `instanceof` works.

```ts
const Charge = Rpc.make('Charge', {
	payload: { invoiceId: Schema.String, amountCents: Schema.Int },
	success: ChargeReceipt,
	error: ChargeError,
	primaryKey: ({ invoiceId }) => invoiceId
});
```

#### `stream: true`

When true, `success` becomes the *element* schema, not the Effect's success. The actual return type the handler must produce is `Stream<success, error, R>` (or an `Effect<Queue.Dequeue<success, error | Cause.Done>, ...>` if the handler wants to control the queue itself). The client sees `Stream<success, error, R>` (default) or `Queue.Dequeue<success, error | Cause.Done>` if you pass `{ asQueue: true }`.

```ts
const Subscribe = Rpc.make('Subscribe', {
	payload: { topic: Schema.String },
	success: EventMessage, // element type
	error: SubscriptionError,
	stream: true
});
```

### Pipeable rpc combinators

An `Rpc` is `Pipeable`. The instance methods you'll actually use:

```ts
Rpc.make('GetUser', { ... })
	.middleware(AuthMiddleware)               // attach middleware
	.annotate(ClusterSchema.Persisted, true)  // single annotation
	.annotateMerge(otherContext)              // merge a Context.Context<I>
	.prefix('users.')                         // becomes 'users.GetUser'
	.setSuccess(NewSuccessSchema)             // swap the success schema
	.setError(NewErrorSchema)                 // swap the error schema
	.setPayload({ id: Schema.String })        // swap the payload schema
```

`prefix` is the right way to namespace rpcs when merging groups. `annotate` puts data on the rpc itself; `RpcGroup` has a separate `annotateRpcs` for marking *every rpc currently in the group*.

### `Rpc.fork` and `Rpc.uninterruptible`

These are **wrappers**, not options. They wrap a handler's *return value* (Effect or Stream) and tell the server to:

- `Rpc.fork(value)` — bypass the server's per-connection concurrency semaphore. Use for read-only or idempotent handlers that should not back up behind sequential ones.
- `Rpc.uninterruptible(value)` — run the handler in `Effect.uninterruptible`. Use for handlers that must complete (cleanup, finalize-then-return) regardless of client cancellation.
- `Rpc.wrap({ fork?, uninterruptible? })(value)` — apply both at once.

```ts
GetCount: () => Ref.get(count).pipe(Rpc.fork);
Charge: (payload) => chargeIdempotent(payload).pipe(Rpc.uninterruptible);
```

If you ever need to introspect: `Rpc.isWrapper(value)`, `Rpc.unwrap(value)`, `Rpc.wrapMap(value, f)`.

### `Rpc.exitSchema(rpc)`

Returns a `Schema.Exit<Success, Error, Defect>` for the rpc that includes any middleware-added errors. Useful for testing serialization or building generic envelope inspectors.

### `Rpc.custom` — higher-order rpc constructors

Rare but powerful: build a constructor that transforms every rpc's success/error schemas. Lets you encode a convention like "every list endpoint returns a paginated wrapper":

```ts
import { Rpc } from 'effect/unstable/rpc';
import { Schema } from 'effect';

interface PaginatedRpc extends Rpc.Custom {
	readonly out: Rpc.Custom.Out<
		Schema.Struct<{
			offset: typeof Schema.Number;
			total: typeof Schema.Number;
			results: Schema.$Array<this['success']>;
		}>,
		this['error']
	>;
}

const paginatedRpc = Rpc.custom<PaginatedRpc>((schemas) => ({
	...schemas,
	success: Schema.Struct({
		offset: Schema.Number,
		total: Schema.Number,
		results: Schema.Array(schemas.success)
	})
}));

// then use exactly like Rpc.make
const ListUsers = paginatedRpc('listUsers', { success: User });
```

## RpcGroup

`RpcGroup.make(...rpcs)` collects rpcs. Variadic — not named.

```ts
const UsersGroup = RpcGroup.make(GetUser, CreateUser, DeleteUser);
```

### Combining groups

```ts
UsersGroup
	.add(ListUsers, UpdateUser) // append rpcs
	.merge(OrdersGroup, PaymentsGroup) // union of groups (later annotations win)
	.omit('DeleteUser') // remove by tag
	.prefix('v2.'); // namespace every rpc
```

`merge` is shallow on both rpcs and group annotations — the *latest* value for any annotation key wins. If you need deeper composition, build the group from scratch.

### Group-level annotations

There are two flavors and both have a `Merge` variant:

```ts
group.annotate(SomeKey, value); // attach to the group itself
group.annotateMerge(context); // merge a Context.Context<I> into the group
group.annotateRpcs(SomeKey, value); // attach to every rpc currently in the group
group.annotateRpcsMerge(context); // merge a Context.Context<I> into every rpc
```

`annotateRpcs*` is the canonical way to mark a whole group `Persisted`, `Uninterruptible`, etc., without touching each rpc:

```ts
const PersistedUsers = UsersGroup.annotateRpcs(ClusterSchema.Persisted, true);
```

### Adding middleware to a group

`group.middleware(M)` appends `M` to *every rpc currently in the group* and returns a new group:

```ts
const AuthedUsers = UsersGroup.middleware(AuthMiddleware);
```

Rpcs added afterward via `.add(...)` won't have the middleware automatically — apply `.middleware(...)` again, or call it on the rpc directly before adding.

## Server-side handlers

A handler for an `RpcGroup` rpc has this shape:

```ts
type Handler<R extends Rpc.Any> = (
	payload: Rpc.Payload<R>,
	options: {
		readonly client: Rpc.ServerClient; // per-connection identity + annotations
		readonly requestId: RequestId;
		readonly headers: Headers;
		readonly rpc: R;
	}
) => Effect<Result, Error, Services> | Stream<Result, Error, Services>;
```

Note: the option is `client: ServerClient`, not `clientId: number`. `ServerClient` exposes `client.id: number` and a mutable `annotations: Context.Context<never>` you can extend with `client.annotate(key, value)` from middleware.

Entity handlers have a *different* signature — see the Entity section.

### Deferred responses

A non-stream handler may return an `Effect` that succeeds with a `Deferred<Success, Error>` instead of the success value directly. The server acknowledges the request but **does not send the final `Exit`** until that `Deferred` completes — useful when the result depends on a later external event and you don't want to hold a streaming connection open:

```ts
import { Deferred, Effect } from 'effect';

GetUserDeferred: () => {
	const deferred = Deferred.makeUnsafe<User>();
	// complete it later — e.g. from a webhook, another fiber, or a queue worker
	Deferred.doneUnsafe(deferred, Effect.succeed(new User({ id: '1', name: 'John' })));
	return Effect.succeed(deferred);
};
```

The client still sees a plain `Effect<Success, Error>`; the deferred round-trip is invisible on the wire.

### `group.toLayer(handlers | Effect<handlers>)`

The 80% case. Build all handlers and turn the result into a Layer that the server picks up:

```ts
const UsersLive = UsersGroup.toLayer(
	Effect.gen(function*() {
		const db = yield* Database;
		return UsersGroup.of({
			GetUser: (payload) => db.findUser(payload.id),
			CreateUser: (payload, { client, headers }) =>
				db
					.createUser(payload)
					.pipe(Effect.tap(() => Effect.logInfo('user created by', client.id))),
			DeleteUser: (payload) => db.deleteUser(payload.id)
		});
	})
);
```

`group.of(handlers)` is a no-op identity helper that *typechecks* the handler shape against the group. Always use it inside `toLayer` so type errors point at the wrong handler.

### `group.toLayerHandler(tag, handler | Effect<handler>)`

Implement *one* handler at a time. Useful when handlers have wildly different dependencies and you want to keep them in separate files:

```ts
const GetUserLive = UsersGroup.toLayerHandler(
	'GetUser',
	Effect.gen(function*() {
		const db = yield* Database;
		return (payload) => db.findUser(payload.id);
	})
);

// Compose them:
const UsersLive = Layer.mergeAll(GetUserLive, CreateUserLive, DeleteUserLive);
```

Each `toLayerHandler` produces `Layer<Rpc.Handler<Tag>, ...>`. The server requires the union `Rpc.ToHandler<Rpcs>` so leaving any tag unimplemented is a compile-time error.

### `group.toHandlers(handlers)`

Returns an `Effect<Context.Context<Rpc.ToHandler<R>>>` — the unprovided form of `toLayer`. Use it when composing manually inside `RpcServer.make` or `RpcTest.makeClient`.

### `group.accessHandler(tag)`

Returns an Effect that resolves to a single handler function with `services` already provided. The handler is callable as `(payload, options)` directly. This is the easiest way to unit-test one rpc handler in isolation:

```ts
import { Headers } from 'effect/unstable/http';
import { RequestId } from 'effect/unstable/rpc/RpcMessage';

const result =
	yield*
	UsersGroup.accessHandler('GetUser').pipe(
		Effect.flatMap((handler) =>
			handler({ id: 'u1' }, {
				client: new Rpc.ServerClient(0),
				requestId: RequestId(1n),
				headers: Headers.empty,
				rpc: GetUser
			})
		),
		Effect.provide(UsersLive)
	);
```

## Running an RPC server

Two layers of API: the **transport-agnostic** server and the **transport-specific** glue.

### `RpcServer.layer(group, options?)` — transport-agnostic

Requires a `Protocol` in context (one of the `RpcServer.layerProtocol*`), the handlers (`Rpc.ToHandler<Rpcs>`), and any middleware (`Rpc.Middleware<Rpcs>`):

```ts
import { Layer } from 'effect';
import { HttpRouter } from 'effect/unstable/http';

const ServerLayer = RpcServer.layer(UsersGroup, {
	concurrency: 'unbounded', // default; set a number to backpressure handlers
	disableTracing: false,
	disableFatalDefects: false, // see below
	spanPrefix: 'RpcServer', // default; controls span naming
	spanAttributes: { service: 'users' }
}).pipe(
	Layer.provide(UsersLive), // handlers
	Layer.provide(RpcServer.layerProtocolHttp({ path: '/rpc' })),
	Layer.provide(RpcSerialization.layerNdjson),
	Layer.provide(HttpRouter.layer)
);
```

Server options:

- **`concurrency: number | 'unbounded'`** (default `'unbounded'`) — semaphore around handler execution. Per-connection. `Rpc.fork(...)` opts a single handler out of this limit.
- **`disableFatalDefects: boolean`** (default `false`) — by default, a `die` inside a handler is treated as a *connection-level* defect and crashes the whole connection's response stream. With `true`, defects come back to the client as a normal `Cause.Die` in the request's exit. Production servers usually want `true`; the cluster fixture uses it.
- **`disableTracing: boolean`** + **`spanPrefix`** + **`spanAttributes`** — span control. Each rpc gets a span named `${spanPrefix}.${rpc._tag}`.

### `RpcServer.layerHttp({ group, path, protocol })` — convenience

One-call HTTP+server setup. Picks `layerProtocolHttp` or `layerProtocolWebsocket` for you (default `'websocket'`):

```ts
const ServerLayer = RpcServer.layerHttp({
	group: UsersGroup,
	path: '/api/rpc',
	protocol: 'http', // or 'websocket' (default)
	disableFatalDefects: true,
	concurrency: 'unbounded'
}).pipe(
	Layer.provide(UsersLive),
	Layer.provide(RpcSerialization.layerNdjson),
	Layer.provide(HttpRouter.layer)
);
```

### `RpcServer.toHttpEffect(group, options?)` and `toHttpEffectWebsocket`

For when you want to mount the RPC handler as a single `HttpServerResponse` Effect on a router you control (Hono adapter, custom routes, etc.) rather than registering a route on `HttpRouter`. Returns `Effect<Effect<HttpServerResponse, never, Scope | HttpServerRequest>, ...>`:

```ts
const HttpAppLayer = Layer.scoped(
	'/api/rpc',
	RpcServer.toHttpEffect(UsersGroup).pipe(
		Effect.provide(UsersLive),
		Effect.provide(RpcSerialization.layerNdjson)
	)
);
```

### Protocol layers (server side)

Pick one and `Layer.provide` it to `RpcServer.layer`/`layerHttp`:

| Layer | Requires | Notes |
|---|---|---|
| `RpcServer.layerProtocolHttp({ path })` | `RpcSerialization`, `HttpRouter` | request/response, **no streaming acks** (`supportsAck: false`), no transferables, no span propagation |
| `RpcServer.layerProtocolWebsocket({ path })` | `RpcSerialization`, `HttpRouter` | full duplex, supports acks, supports span propagation |
| `RpcServer.layerProtocolSocketServer` | `RpcSerialization`, `SocketServer` | raw TCP socket server |
| `RpcServer.layerProtocolStdio` | `RpcSerialization`, `Stdio` | process stdin/stdout — for CLI subprocess RPC |
| `RpcServer.layerProtocolWorkerRunner` | `WorkerRunner.WorkerRunnerPlatform` | run inside a web/node worker; supports `RpcWorker.InitialMessage` |

Each layer also has a `make*` Effect counterpart (`makeProtocolHttp`, `makeProtocolWebsocket`, etc.) when you need to compose it inline. There are also `makeProtocolWithHttpEffect` / `makeProtocolWithHttpEffectWebsocket` for "give me both the protocol and the http handler Effect" use cases.

### `RpcServer.Protocol` service

The `Protocol` service exposes runtime capabilities tests and middleware can inspect:

```ts
const { supportsAck, supportsTransferables, supportsSpanPropagation, clientIds, initialMessage } =
	yield* RpcServer.Protocol;
```

E2E tests use this to skip backpressure assertions on transports that don't support acks.

## RPC clients

`RpcClient.make(group, options?)` returns an Effect producing a typed client object. Default error channel is `RpcClientError`.

```ts
const client = yield* RpcClient.make(UsersGroup, {
	spanPrefix: 'UsersClient',
	disableTracing: false,
	flatten: false,
	generateRequestId: undefined,
	spanAttributes: { service: 'users' }
}).pipe(
	Effect.provide(RpcClient.layerProtocolHttp({ url: '/api/rpc' })),
	Effect.provide(RpcSerialization.layerNdjson),
	Effect.provide(FetchHttpClient.layer)
);

const user = yield* client.GetUser({ id: 'u1' });
```

You will almost always wrap this in a `Context.Service` so consumers get the client by name instead of plumbing the Effect:

```ts
class UsersClient extends Context.Service<
	UsersClient,
	RpcClient.RpcClient<RpcGroup.Rpcs<typeof UsersGroup>, RpcClientError>
>()('UsersClient') {
	static readonly layer = Layer.effect(UsersClient)(
		RpcClient.make(UsersGroup)
	).pipe(Layer.provide(AuthClient));
}
```

### Per-call options

Each generated method is `(payload, options?) => Effect | Stream`. The option shape differs by stream-vs-non-stream:

```ts
// Non-stream rpc
client.GetUser({ id: 'u1' }, {
	headers?: Headers.Input,    // per-call headers
	context?: Context<never>,   // per-call context (rare)
	discard?: true              // returns Effect<void, never, R>; no response decoding
});

// Stream rpc
client.Subscribe({ topic: 't' }, {
	headers?: Headers.Input,
	context?: Context<never>,
	asQueue?: true,             // returns Effect<Queue.Dequeue<A, E | Cause.Done>>
	streamBufferSize?: 16       // default 16
});
```

`discard: true` removes the error channel — the request is sent and acknowledged; the result and any failure are discarded. Use for fire-and-forget commands (especially against persistent entities).

`asQueue: true` is useful when you need finer control than a `Stream` gives you — e.g., you want to take only one chunk, then drop it. The end-of-stream signal is `Cause.Done` in the queue's error channel.

### Headers

For one-off headers, use the per-call `headers` option. For region-scoped headers, use `RpcClient.withHeaders` (which updates the `RpcClient.CurrentHeaders` Reference):

```ts
import { RpcClient } from 'effect/unstable/rpc';

yield* program.pipe(
	RpcClient.withHeaders({ authorization: `Bearer ${token}`, userid: '123' })
);
```

`RpcClient.CurrentHeaders` is a `Context.Reference<Headers.Headers>` you can also set directly with `Effect.updateService`. Headers from `withHeaders` and the per-call option are merged; per-call wins on conflict.

### `flatten: true` mode

When set, the client becomes a single function `(tag, payload, options?)` instead of a property-per-tag object. `AtomRpc` uses this internally; you'll want it when proxying generically:

```ts
const client =
	yield*
	RpcClient.make(UsersGroup, { flatten: true });
const user = yield* client('GetUser', { id: 'u1' });
```

### Client error channel

Every method has the error channel:

```
Rpc.Error<R>                    // your declared rpc error
| MiddlewareError                  // any middleware errors
| MiddlewareClientError            // any client-side middleware errors
| RpcClientError                   // transport-level
```

`RpcClientError` is a tagged union itself:

```ts
class RpcClientError extends Schema.ErrorClass(...)({
	_tag: 'RpcClientError',
	reason: Schema.Union([
		WorkerErrorReason,
		SocketErrorReason,
		HttpClientErrorSchema,
		RpcClientDefect
	])
})
```

Pattern-match on `error.reason._tag` to handle transport faults (network down, malformed response, worker crash). The `RpcClientDefect` case wraps non-error throws and protocol bugs.

### Client protocol layers

| Layer | Requires | Notes |
|---|---|---|
| `RpcClient.layerProtocolHttp({ url, transformClient? })` | `RpcSerialization`, `HttpClient` | request/response. `transformClient` lets you rewrite the underlying `HttpClient` (e.g., add auth headers, prepend URL paths) |
| `RpcClient.layerProtocolSocket({ retryTransientErrors? })` | `RpcSerialization`, `Socket.Socket` | full duplex. Auto-pings every 5s; reconnects on transient socket errors |
| `RpcClient.layerProtocolWorker(options)` | `Worker.WorkerPlatform`, `Worker.Spawner` | pool of worker-backed clients. Options: either `{ size, concurrency?, targetUtilization? }` or `{ minSize, maxSize, timeToLive, concurrency?, targetUtilization? }` |

For each there's a corresponding `make*` Effect (`makeProtocolHttp`, `makeProtocolSocket`, `makeProtocolWorker`) when you need finer control over context.

### `RpcClient.ConnectionHooks`

A `Context.Service` you can provide to get `onConnect` / `onDisconnect` callbacks for socket and worker transports. Use it to (re-)hydrate auth state on reconnect:

```ts
const ConnectionHooksLayer = Layer.succeed(RpcClient.ConnectionHooks, {
	onConnect: refreshAuthToken,
	onDisconnect: Effect.logWarning('rpc disconnected')
});
```

### `RpcSchema.ClientAbort`

When a client interrupts a streaming subscription, the server-side handler's `onInterrupt` finalizer sees a `Cause` carrying the `ClientAbort` annotation. Use it to distinguish client cancel from server shutdown:

```ts
import { RpcSchema } from 'effect/unstable/rpc';
import { Cause, Context } from 'effect';

const subscribeHandler = stream.pipe(
	Effect.onInterrupt((cause) => {
		const isClientAbort = Context.has(cause, RpcSchema.ClientAbort);
		return Effect.logInfo('subscribe ended', { isClientAbort });
	})
);
```

## Middleware

`RpcMiddleware.Service<Self, Config>()(name, options)` defines a middleware service. The config positionally encodes what the middleware *provides*, *requires*, and what *client-only* error type it can throw. The options carry the wire-error schema and the `requiredForClient` enforcement flag.

```ts
import { RpcMiddleware } from 'effect/unstable/rpc';
import { Context, Schema } from 'effect';

class CurrentUser extends Context.Service<CurrentUser, User>()('CurrentUser') {}

class Unauthorized extends Schema.ErrorClass<Unauthorized>('Unauthorized')({
	_tag: Schema.tag('Unauthorized')
}) {}

class AuthMiddleware extends RpcMiddleware.Service<AuthMiddleware, {
	provides: CurrentUser; // injected into the wrapped handler
	requires: never; // services this middleware needs from outer context
	clientError: never; // errors only the client side can produce
}>()('AuthMiddleware', {
	error: Unauthorized, // wire-form error this middleware can produce
	requiredForClient: true // clients must supply layerClient or fail to compile
}) {}
```

The full config bag is `{ requires?, provides?, clientError? }` — all optional, all default `never`.

`requiredForClient: true` is what makes auth client-side enforcement a *compile-time* error rather than a runtime surprise: clients must `Layer.provide(RpcMiddleware.layerClient(AuthMiddleware, ...))` or `RpcClient.make` won't compile.

### Server-side middleware implementation

Implement the middleware as a Layer producing the service. The function receives `(effect, options)`:

```ts
import { Layer } from 'effect';

const AuthLive = Layer.succeed(AuthMiddleware)(
	AuthMiddleware.of((effect, { client, requestId, rpc, payload, headers }) =>
		Effect.flatMap(verifyToken(headers.authorization), (user) =>
			Effect.provideService(effect, CurrentUser, user)
		)
	)
);
```

Options shape: `{ client: ServerClient, requestId, rpc, payload, headers }`. The middleware can:

- Provide services to the inner effect (matching the `provides` config)
- Fail with the wire-error schema (`Unauthorized` here)
- Annotate `client` via `client.annotate(...)` so subsequent middlewares see the per-connection state
- Read `headers` directly (they're already parsed)

Middleware can chain `requires` and `provides` — `DbMiddleware extends RpcMiddleware.Service<…, { provides: DbConnection, requires: CurrentUser }>` will compile only when paired with an `AuthMiddleware` upstream that provides `CurrentUser`.

### Client-side middleware (`layerClient`)

For middleware that needs to *also* run client-side (most commonly: attach an auth header), provide a `layerClient`:

```ts
import { Headers } from 'effect/unstable/http';

export const AuthClient = RpcMiddleware.layerClient(
	AuthMiddleware,
	({ rpc, request, next }) =>
		next({
			...request,
			headers: Headers.set(request.headers, 'authorization', `Bearer ${currentToken}`)
		})
);
```

Important details:

- `request.headers` is `Headers.Headers` (already parsed). Use the helpers from `effect/unstable/http/Headers` (`Headers.set`, `Headers.merge`, `Headers.fromInput`).
- You **must** call `next(request)` (with the modified or original request) — the middleware's job is to wrap the send, not replace it.
- The Layer signature is `Layer<ForClient<AuthMiddleware>>` — it's a distinct service from the server-side middleware, and providing both is the norm for client packages.

## Serialization

The choice of serialization is load-bearing because of *framing*. Some transports (raw HTTP request/response) deliver one logical message at a time; others (sockets, ndjson over HTTP streams) deliver an unbounded stream of bytes that must be split into messages.

| Layer | Content-Type | Framed? | Use for | Notes |
|---|---|---|---|---|
| `RpcSerialization.layerJson` | `application/json` | no | `layerProtocolHttp` | Default JSON over request/response |
| `RpcSerialization.layerNdjson` | `application/ndjson` | yes (newline) | `layerProtocolWebsocket`, sockets, http+stream | Newline-delimited JSON; required for streaming |
| `RpcSerialization.layerJsonRpc()` | `application/json` (configurable) | no | JSON-RPC 2.0 interop | Maps `_tag` to `method`; preserves batched arrays |
| `RpcSerialization.layerNdJsonRpc()` | `application/json-rpc` (configurable) | yes (newline) | JSON-RPC 2.0 over sockets | |
| `RpcSerialization.layerMsgPack` | `application/msgpack` | yes (msgpack frames) | binary transports | Smallest wire size; native binary; uses `useRecords: true` |

`RpcSerialization.makeMsgPack(options?)` lets you customize msgpackr (`useRecords`, `useFloat32`, etc.).

Picking the wrong one is a real bug:

- `layerJson` over a websocket → no framing → the first chunk past the first message is misinterpreted
- `layerMsgPack` against a JSON-only HTTP client → garbled responses
- `layerNdjson` against `layerProtocolHttp` → works, but framing is wasted; clients have to wait for the response to end

## Testing — `RpcTest.makeClient`

In-process server+client wired together, no network. The simplest possible RPC test:

```ts
import { Effect, Layer } from 'effect';
import { RpcTest } from 'effect/unstable/rpc';
import { it } from '@effect/vitest';

const TestClient = Layer.effect(UsersClient)(
	RpcTest.makeClient(UsersGroup)
).pipe(Layer.provide([UsersLive, AuthLive, AuthClient]));

it.effect('GetUser', () =>
	Effect.gen(function*() {
		const client = yield* UsersClient;
		const user = yield* client.GetUser({ id: 'u1' });
		expect(user.id).toBe('u1');
	}).pipe(Effect.provide(TestClient)));
```

`makeClient` accepts `{ flatten?: boolean }` mirroring `RpcClient.make`. Required context is `Scope | Rpc.ToHandler<Rpcs> | Rpc.Middleware<Rpcs> | Rpc.MiddlewareClient<Rpcs>` — i.e. handler layers **and** any client-side middleware layers. Forgetting the latter is a common type error.

## Worker transports & `RpcWorker.InitialMessage`

For worker-backed clients, you can pass typed initial config at spawn time without a separate rpc round-trip:

```ts
// On the worker (server side):
import { RpcWorker } from 'effect/unstable/rpc';

class WorkerConfig extends Schema.Class<WorkerConfig>('WorkerConfig')({
	apiUrl: Schema.String,
	tenantId: Schema.String
}) {}

// Inside the worker, before serving:
const config = yield* RpcWorker.initialMessage(WorkerConfig);

// On the client (parent side):
const InitialMessageLayer = RpcWorker.layerInitialMessage(
	WorkerConfig,
	Effect.succeed(new WorkerConfig({ apiUrl: '/api', tenantId: 't1' }))
);

const ClientLayer = UsersClient.layer.pipe(
	Layer.provide(RpcClient.layerProtocolWorker({ size: 4 })),
	Layer.provide(InitialMessageLayer)
);
```

---

# Cluster

Cluster turns rpcs into **addressable, distributed actors** (`Entity`). Messages are routed to whichever runner currently owns the entity's shard, optionally persisted to durable storage, and replayed on restart.

## Entity

```ts
import { Schema } from 'effect';
import { ClusterSchema, Entity } from 'effect/unstable/cluster';
import { Rpc } from 'effect/unstable/rpc';

export class Increment extends Rpc.make('Increment', {
	payload: { amount: Schema.Number },
	success: Schema.Number,
	primaryKey: ({ amount }) => `inc-${amount}` // for dedup across retries
}) {}

export const GetCount = Rpc.make('GetCount', { success: Schema.Number });

export const Counter = Entity.make('Counter', [Increment, GetCount])
	.annotateRpcs(ClusterSchema.Persisted, true); // persist all messages
```

Two constructors:

- **`Entity.make(type, [rpcs])`** — variadic-array form
- **`Entity.fromRpcGroup(type, rpcGroup)`** — when the protocol already exists as an `RpcGroup` (e.g., shared with a non-clustered RPC server)

### Entity handler signature is **different from RpcGroup**

Entity handlers receive a single `envelope: Envelope.Request<R>`:

```ts
type EntityHandler<R extends Rpc.Any> = (
	envelope: {
		readonly _tag: 'Request';
		readonly requestId: Snowflake;
		readonly address: EntityAddress; // { entityType, entityId, shardId }
		readonly tag: Rpc.Tag<R>;
		readonly payload: Rpc.Payload<R>;
		readonly headers: Headers;
		readonly traceId?: string;
		readonly spanId?: string;
		readonly sampled?: boolean;
		// for stream rpcs:
		readonly lastSentChunk: Option<Reply.Chunk<R>>;
		readonly lastSentChunkValue: Option<SuccessChunk<R>>;
		readonly nextSequence: number;
	}
) => Effect | Stream;
```

You destructure `{ payload }` (and sometimes `{ payload, address }`) inside the handler. The full envelope is also useful for streaming rpcs that need to resume after a reconnect — `lastSentChunkValue` and `nextSequence` let you replay from the right offset.

```ts
export const CounterLive = Counter.toLayer(
	Effect.gen(function*() {
		const count = yield* Ref.make(0);

		return Counter.of({
			Increment: (envelope) =>
				Ref.updateAndGet(count, (n) => n + envelope.payload.amount),

			GetCount: () => Ref.get(count).pipe(Rpc.fork) // concurrent reads
		});
	}),
	{
		maxIdleTime: Duration.minutes(5),
		concurrency: 1, // sequential by default
		mailboxCapacity: 1000,
		disableFatalDefects: false,
		defectRetryPolicy: Schedule.exponential('200 millis'),
		spanAttributes: { entity: 'Counter' }
	}
);
```

`toLayer` options:

- **`maxIdleTime`** — passivation timeout. After this idle time the entity is stopped and recreated on the next message.
- **`concurrency`** (default `1`) — handlers run sequentially per entity. Set `'unbounded'` for concurrent handlers, or use `Rpc.fork(...)` per-handler.
- **`mailboxCapacity`** (default from `ShardingConfig.entityMailboxCapacity`, usually 4096) — backpressure threshold; sends fail with `MailboxFull` past this point.
- **`disableFatalDefects`** — by default a defect inside an entity handler crashes the entity (then retries per `defectRetryPolicy`); with `true`, defects are reported back to the sender as a normal `Cause.Die`.
- **`defectRetryPolicy`** — `Schedule` for restarting after a fatal defect.
- **`spanAttributes`** — added to every per-rpc span.

### Cluster-only services in handlers

Entity handlers can pull two services from context:

```ts
import { Entity } from 'effect/unstable/cluster';

Counter.toLayer(Effect.gen(function*() {
	return Counter.of({
		Increment: Effect.fnUntraced(function*(envelope) {
			const address = yield* Entity.CurrentAddress;
			// EntityAddress: { entityType, entityId: string, shardId: ShardId }
			const runner = yield* Entity.CurrentRunnerAddress;
			// RunnerAddress: { host: string, port: number }

			yield* Effect.logInfo('handling on runner', {
				entityId: address.entityId,
				runner: `${runner.host}:${runner.port}`
			});
			// ...
		})
	});
}));
```

Use `Entity.CurrentAddress` instead of threading the entity id through the payload.

### `Entity.keepAlive(boolean)`

Pin or release the entity's idle timeout from inside a handler. Call `keepAlive(true)` to extend the lifetime while a long async job runs; `keepAlive(false)` to allow normal passivation:

```ts
const RunLongJob = Effect.fn('Counter.runLongJob')(function*() {
	yield* Entity.keepAlive(true);
	yield* longRunningJob;
	yield* Entity.keepAlive(false);
});
```

### Queue-based handlers — `entity.toLayerQueue`

When you want full control over message ordering, batching, or backpressure, use `toLayerQueue`. The handler is `(queue, replier) => Effect<never, never, R>` — a long-running effect that consumes the queue and replies via the `Replier`:

```ts
import { Effect, Queue, Stream } from 'effect';

const StreamingCounter = Counter.toLayerQueue(
	Effect.gen(function*() {
		let count = 0;
		return (queue, replier) =>
			Effect.gen(function*() {
				while (true) {
					const request = yield* Queue.take(queue);
					if (request.tag === 'Increment') {
						count += request.payload.amount;
						yield* replier.succeed(request, count);
					} else if (request.tag === 'GetCount') {
						yield* replier.succeed(request, count);
					}
				}
			});
	}),
	{ maxIdleTime: Duration.minutes(5) }
);
```

The `Replier` API:

```ts
interface Replier<R extends Rpc.Any> {
	succeed: (request, value) => Effect<void>;
	// for stream rpcs, value can be a Stream or a Queue.Dequeue
	fail: (request, error) => Effect<void>;
	failCause: (request, cause) => Effect<void>;
	complete: (request, exit: Exit<value, error>) => Effect<void>;
}
```

For a stream rpc with `toLayerQueue`, you can reply with either a `Stream` or a `Queue.Dequeue` and the runtime adapts:

```ts
StreamEntity.toLayerQueue((mailbox, replier) =>
	Effect.gen(function*() {
		while (true) {
			const req = yield* Queue.take(mailbox);
			yield* replier.succeed(req, Stream.make(1, 2, 3));
		}
	}));
```

`toLayerQueue` always sets `concurrency: 'unbounded'` internally (you handle ordering yourself).

### Cluster annotations (`ClusterSchema`)

These are `Context.Reference` annotations you attach via `Rpc.annotate`, `RpcGroup.annotateRpcs`, or `Entity.annotate`/`annotateRpcs`. Defaults in parens.

| Annotation | Default | Effect |
|---|---|---|
| `Persisted` | `false` | Persist messages to `MessageStorage` for durable delivery and replay |
| `WithTransaction` | `false` | Wrap the handler in a storage transaction so SQL queries inside the handler commit atomically with the message ack |
| `Uninterruptible` | `false` | Three values: `true` (both sides), `'client'` (client won't send `Interrupt`), `'server'` (handler runs `Effect.uninterruptible`). Predicates: `isUninterruptibleForServer`, `isUninterruptibleForClient` |
| `ShardGroup` | `() => 'default'` | `(entityId) => string` — control which shard group an entity goes to |
| `ClientTracingEnabled` | `true` | Disable per-rpc client spans (e.g., for noisy cron jobs) |
| `Dynamic` | `identity` | `(annotations, request) => annotations` — compute annotations per-request, e.g., turn on `WithTransaction` only for write methods |

```ts
// Mark an entire entity as persisted with custom shard grouping
const Counter = Entity.make('Counter', [Increment, GetCount])
	.annotateRpcs(ClusterSchema.Persisted, true)
	.annotate(ClusterSchema.ShardGroup, (entityId) => `tenant-${entityId.split(':')[0]}`);

// Per-rpc dynamic transaction wrapping
const WithTx = Rpc.make('WithTx', {
	payload: { id: Schema.Number },
	success: Schema.Boolean
}).annotate(
	ClusterSchema.Dynamic,
	Context.add(Context.empty(), ClusterSchema.WithTransaction, true)
);
```

### Entity client — `entity.client`

Returns an Effect producing a `(entityId) => RpcClient.From<...>` factory. The factory builds a typed client targeting one specific entity instance:

```ts
const useCounter = Effect.gen(function*() {
	const clientFor = yield* Counter.client;
	const counter = clientFor('counter-tenant1-abc');

	const after = yield* counter.Increment({ amount: 1 });
	const now = yield* counter.GetCount();
});
```

Required context: `Sharding`. The client's error channel is augmented with cluster-specific errors:

```
Rpc.Error<R> | MailboxFull | AlreadyProcessingMessage | PersistenceError
```

Use `discard: true` for fire-and-forget commands (skip the reply round-trip):

```ts
yield* counter.Increment({ amount: 1 }, { discard: true });
```

### `Entity.makeTestClient(entity, layer)`

In-process entity testing without a real cluster. Returns `(entityId) => Effect<RpcClient<...>>`:

```ts
import { Effect } from 'effect';
import { Entity, ShardingConfig } from 'effect/unstable/cluster';
import { it } from '@effect/vitest';

const TestShardingConfig = ShardingConfig.layer({
	shardsPerGroup: 300,
	entityMailboxCapacity: 10
});

it.effect('Counter increments', () =>
	Effect.gen(function*() {
		const makeClient = yield* Entity.makeTestClient(Counter, CounterLive);
		const client = yield* makeClient('test-1');
		const result = yield* client.Increment({ amount: 5 });
		expect(result).toBe(5);
	}).pipe(Effect.provide(TestShardingConfig)));
```

Required context: `Scope | ShardingConfig | Rpc.MiddlewareClient<Rpcs> | (handler context)`. **You must provide `ShardingConfig`** — `TestRunner.layer` provides one automatically, but `makeTestClient` does not.

## Singletons (`Singleton.make`)

A `Singleton` is an effect that runs *exactly once across the cluster*. The shard manager elects a single runner to host it; if that runner dies, another one takes over. Distinct from `ClusterCron` — the latter is built on top of singletons + entities.

```ts
import { Singleton } from 'effect/unstable/cluster';

const LeaderElection = Singleton.make(
	'leader-elector',
	Effect.gen(function*() {
		yield* Effect.logInfo('elected leader');
		yield* Effect.never; // hold the position
	}),
	{ shardGroup: 'leader-pool' } // optional
);

const AppLayer = Layer.mergeAll(LeaderElection, /* ... */);
```

Use cases: leader election, single-writer queues, pub/sub fan-out coordinators, scheduled rebalancing.

## Cron jobs (`ClusterCron.make`)

Cluster-singleton cron executions. The cron schedule is durable: missed runs (within `skipIfOlderThan`) are caught up; future runs are scheduled ahead.

```ts
import { Cron, Effect } from 'effect';
import { ClusterCron } from 'effect/unstable/cluster';

const DailyReport = ClusterCron.make({
	name: 'DailyReport',
	cron: Cron.parse('0 8 * * *').pipe(Effect.runSync), // 08:00 daily
	execute: generateAndSendReport,
	shardGroup: 'reports', // optional; defaults to 'default'
	skipIfOlderThan: '1 day', // skip stale executions; default 1 day
	calculateNextRunFromPrevious: false // default; next run computed from now
});
```

`ClusterCron.make` returns `Layer<never, never, Sharding | (R - Scope)>`. Internally it builds:

- An `Entity` named `ClusterCron/<name>` whose `run` rpc is `Persisted` + `Uninterruptible`
- A `Singleton` that schedules the next entity invocation

The schedule survives runner restarts because the next invocation is durably stored as an entity message with a `DeliverAt` annotation.

## Sharding service

Inside any entity handler (or any effect running in the cluster), you can pull `Sharding.Sharding` for cluster-aware operations:

```ts
import { Sharding } from 'effect/unstable/cluster';

const sharding = yield* Sharding.Sharding;

const id = yield* sharding.getSnowflake; // unique-per-runner monotonic ID
const isShutdown = yield* sharding.isShutdown; // graceful drain signal
const count = yield* sharding.activeEntityCount; // metric
yield* sharding.pollStorage; // force immediate storage poll
```

Use these for: graceful shutdown gates, generating non-colliding IDs across runners, observability metrics, and forcing a storage check after writing externally to the message store.

## Cluster runtime layers

Three levels of convenience.

### Level 1: testing — `TestRunner.layer`

```ts
import { TestRunner } from 'effect/unstable/cluster';

const TestLayer = Layer.mergeAll(CounterLive, OrderLive).pipe(
	Layer.provideMerge(TestRunner.layer)
);
```

In-memory `MessageStorage` (with an inspectable `MemoryDriver`), in-memory `RunnerStorage`, no-op `RunnerHealth`. Single process. Provides `ShardingConfig.layer()` automatically.

The `MemoryDriver` is observable in tests:

```ts
const driver = yield* MessageStorage.MemoryDriver;
expect(driver.requests.size).toBe(9);
expect(driver.journal[0].address.entityId).toBe('test-1');
```

### Level 2: single-node, sql-backed — `SingleRunner.layer`

```ts
import { SingleRunner } from 'effect/unstable/cluster';

const ClusterLayer = SingleRunner.layer({
	shardingConfig: { entityMaxIdleTime: '10 minutes' },
	runnerStorage: 'sql' // or 'memory'
}).pipe(Layer.provide(SqlClientLayer));
```

Ideal for: long-running Node/Bun processes that need durable workflows or persistent entities but don't need to scale across machines.

### Level 3: production multi-node — platform bundles

The Node and Bun platform packages ship opinionated all-in-one layers that wire transport + serialization + storage + health checks:

```ts
import { NodeClusterSocket } from '@effect/platform-node';

const ClusterLayer = NodeClusterSocket.layer({
	serialization: 'msgpack', // or 'ndjson'; default 'msgpack'
	clientOnly: false, // true → don't bind a server port
	storage: 'sql', // 'sql' | 'memory' | 'byo'; default 'sql'
	runnerHealth: 'ping', // 'ping' | 'k8s'; default 'ping'
	runnerHealthK8s: { namespace: 'default', labelSelector: 'app=runner' },
	shardingConfig: {
		runnerShardWeight: 2,
		shardsPerGroup: 300
	}
}).pipe(Layer.provide(SqlClientLayer));
```

Variants:

- **`NodeClusterSocket.layer`** — TCP socket transport
- **`NodeClusterHttp.layer({ transport: 'http' | 'websocket', ... })`** — HTTP or WebSocket transport (needs a port; behind ELB/ingress)
- **`BunClusterSocket.layer`** / **`BunClusterHttp.layer`** — Bun equivalents

`clientOnly: true` skips opening a server port. Use for browser/edge clients that send RPCs *into* the cluster but don't host entities themselves.

`storage: 'byo'` gives you `MessageStorage` and `RunnerStorage` as required services so you can plug your own implementations.

### Manual assembly (when you need to deviate)

When the bundles aren't quite right, assemble from the primitives:

| Layer | Purpose |
|---|---|
| `MessageStorage.layerNoop` | discard messages; for `clientOnly` setups that don't need replay |
| `MessageStorage.layerMemory` | in-process, with `MemoryDriver` |
| `SqlMessageStorage.layer` / `layerWith({ prefix? })` | production durable storage |
| `RunnerStorage.layerMemory` | in-process |
| `SqlRunnerStorage.layer` / `layerWith({ prefix? })` | production |
| `RunnerHealth.layerNoop` | testing |
| `RunnerHealth.layerPing` | runners ping each other via RPC |
| `RunnerHealth.layerK8s({ namespace?, labelSelector? })` | mark runners unhealthy via the k8s API |
| `Runners.layerRpc` | RPC-based runner-to-runner communication (default for socket/http bundles) |
| `Runners.layerNoop` | single-process; no inter-runner RPC |
| `HttpRunner.layerHttp` / `layerWebsocket` | HTTP-based runner transport with default `/` path |
| `HttpRunner.layerHttpClientOnly` / `layerWebsocketClientOnly` | client-only variants |
| `HttpRunner.layerHttpOptions({ path })` / `layerWebsocketOptions({ path })` | path-customized transport |
| `Sharding.layer` | the sharding service itself; requires the four storage/runner/health services |
| `ShardingConfig.layer(partial?)` | constant config |
| `ShardingConfig.layerFromEnv(partial?)` | reads `RUNNER_ADDRESS_HOST`, `RUNNER_ADDRESS_PORT`, etc. |

`ShardingConfig` defaults are sane:

- `shardsPerGroup: 300` — keep consistent across all runners
- `availableShardGroups: ['default']` — every shard group that exists across the whole cluster
- `assignedShardGroups: ['default']` — the subset of those groups this runner is allowed to own
- `entityMaxIdleTime: 1 minute`
- `entityMailboxCapacity: 4096`
- `entityTerminationTimeout: 15 seconds` — k8s-friendly
- `preemptiveShutdown: true` — drain on entity shutdown
- `runnerShardWeight: 1` — relative shard allocation

`availableShardGroups` is **cluster-wide** and must be identical on every runner that shares the same storage backend — shard and advisory-lock numbering is derived from it. `assignedShardGroups` is per-runner and is filtered against `availableShardGroups`, so a runner only ever owns groups that appear in *both*. If your code routes entities or workflows to a non-`default` `ClusterSchema.ShardGroup`, that group must be in `availableShardGroups` everywhere and in `assignedShardGroups` on the runners meant to host it:

```ts
import { ShardingConfig } from 'effect/unstable/cluster';

const Config = ShardingConfig.layer({
	availableShardGroups: ['default', 'workflow'], // cluster-wide; same on all runners
	assignedShardGroups: ['default', 'workflow'] // this runner may own both groups
});
```

Under `layerFromEnv` (which constant-cases env keys) these read from `AVAILABLE_SHARD_GROUPS` and `SHARD_GROUPS` — note the assigned-groups env key is `SHARD_GROUPS`, not `ASSIGNED_SHARD_GROUPS`.

`ShardingConfig.config` is the `Config<ShardingConfig['Service']>` you can compose with other configs in `layerFromEnv`.

## Bridges — exposing entities and workflows as RPC/HTTP

Both `Entity` and `Workflow` ship "proxy" helpers that auto-derive `RpcGroup`s and `HttpApiGroup`s from your domain definitions, plus matching server layers that fan messages back into the cluster. This is how you put a public API in front of cluster-only protocols without writing glue.

### `EntityProxy` — entity → RPC / HTTP

```ts
import { Entity, EntityProxy, EntityProxyServer } from 'effect/unstable/cluster';
import { RpcServer } from 'effect/unstable/rpc';
import { HttpApi, HttpApiBuilder } from 'effect/unstable/httpapi';

const Counter = Entity.make('Counter', [Increment, GetCount])
	.annotateRpcs(ClusterSchema.Persisted, true);

// --- Expose as RPC ---
class CounterRpcs extends EntityProxy.toRpcGroup(Counter) {}

// CounterRpcs has two rpcs per entity rpc:
//   "Counter.Increment"        → returns Number
//   "Counter.IncrementDiscard" → fire-and-forget (returns void, only cluster errors)

const RpcServerLayer = RpcServer.layer(CounterRpcs).pipe(
	Layer.provide(EntityProxyServer.layerRpcHandlers(Counter))
);

// --- Expose as HTTP ---
class Api extends HttpApi.make('api')
	.add(EntityProxy.toHttpApiGroup('counter', Counter).prefix('/counter'))
{}

// Generates: POST /counter/increment/:entityId, POST /counter/increment/:entityId/discard, etc.

const ApiLayer = HttpApiBuilder.layer(Api).pipe(
	Layer.provide(EntityProxyServer.layerHttpApi(Api, 'counter', Counter))
);
```

The generated **RPC** payload wraps the original payload as `{ entityId: string, payload: <original payload> }`. The generated **HTTP** endpoints are shaped differently: `entityId` is a route param (`POST /counter/increment/:entityId`) read server-side via `params.entityId`, and the request **body** is the original payload directly — there is no `{ entityId, payload }` wrapper over HTTP. Either way, errors include the original error type plus `MailboxFull | AlreadyProcessingMessage | PersistenceError`.

### `WorkflowProxy` — workflow → RPC / HTTP

```ts
import { Workflow, WorkflowProxy, WorkflowProxyServer } from 'effect/unstable/workflow';
import { RpcServer } from 'effect/unstable/rpc';

const myWorkflows = [EmailWorkflow, OrderWorkflow] as const;

// RPC: generates 3 rpcs per workflow: <Name>, <Name>Discard, <Name>Resume
class WorkflowRpcs extends WorkflowProxy.toRpcGroup(myWorkflows) {}

const ServerLayer = RpcServer.layer(WorkflowRpcs).pipe(
	Layer.provide(WorkflowProxyServer.layerRpcHandlers(myWorkflows))
);

// HTTP: generates 3 endpoints per workflow under e.g. /emailworkflow, /emailworkflow/discard, /emailworkflow/resume
class Api extends HttpApi.make('api')
	.add(WorkflowProxy.toHttpApiGroup('workflows', myWorkflows))
{}
```

To namespace the generated rpcs, pass `prefix` as the **second** argument: `WorkflowProxy.toRpcGroup(myWorkflows, { prefix: 'wf.' })`. The server handlers must use the same prefix: `WorkflowProxyServer.layerRpcHandlers(myWorkflows, { prefix: 'wf.' })`.

These proxies are how you give a frontend or an external system a typed RPC/HTTP surface that drives durable workflows, without leaking workflow-engine internals.

## Cluster + workflow integration — `ClusterWorkflowEngine`

The in-memory `WorkflowEngine.layerMemory` is for testing only. For production, use `ClusterWorkflowEngine.layer`, which wires the workflow engine into the cluster's `Sharding` + `MessageStorage`:

```ts
import { ClusterWorkflowEngine } from 'effect/unstable/cluster';
import { Workflow } from 'effect/unstable/workflow';

const WorkflowsLayer = Layer.mergeAll(
	EmailWorkflowLayer,
	OrderWorkflowLayer
).pipe(Layer.provideMerge(ClusterWorkflowEngine.layer));

// then provide ClusterLayer (NodeClusterSocket.layer / SingleRunner.layer / etc.)
```

### Workflow shard-group routing

A workflow can be annotated with `ClusterSchema.ShardGroup`, exactly like an entity:

```ts
import { ClusterSchema } from 'effect/unstable/cluster';

const OrderWorkflow = Workflow.make({ /* ... */ })
	.annotate(ClusterSchema.ShardGroup, () => 'workflow');
```

`ClusterWorkflowEngine` reads that annotation when computing the workflow entity's address, so the workflow's entity messages, durable clock wake-ups, and registered durable-deferred completions all route through the owning workflow's shard group. Any non-`default` group must appear in `ShardingConfig.availableShardGroups` cluster-wide and in `assignedShardGroups` on the runners meant to host it (e.g. `['default', 'workflow']`), or those messages have nowhere to land.

See the `effect-workflow` skill for the full `Workflow` / `Activity` / `DurableClock` / `DurableDeferred` / `DurableQueue` API surface.

## Reactive frontend — `AtomRpc`

`AtomRpc.Service()(...)` produces an Atom-aware RPC client with `query` (cached, reactive) and `mutation` (invalidating) helpers, designed for React + Atom apps. See the `effect-atom-rpc` skill for the full surface; brief teaser:

```ts
import { AtomRpc } from 'effect/unstable/reactivity';

class UsersClient extends AtomRpc.Service<UsersClient>()('UsersClient', {
	group: UsersGroup,
	protocol: RpcClient.layerProtocolHttp({ url: '/api/rpc' }).pipe(
		Layer.provide(RpcSerialization.layerJson),
		Layer.provide(FetchHttpClient.layer)
	)
}) {}

// In a component:
const userResult = useAtomValue(
	UsersClient.query('GetUser', { id: 'u1' }, {
		timeToLive: '30 seconds',
		serializationKey: 'user-u1', // for SSR hydration
		reactivityKeys: ['users', 'user-u1']
	})
);

const incrementUser = useAtomSet(UsersClient.mutation('IncrementUser'));
incrementUser({ payload: { id: 'u1' }, reactivityKeys: ['users'] });
```

## Complete End-to-End Example

A small users service with auth middleware, websocket transport, and a test client:

```ts
// --- definitions/users.ts (shared between server and client) ---
import { Context, Schema } from 'effect';
import { Rpc, RpcGroup, RpcMiddleware } from 'effect/unstable/rpc';

export class User extends Schema.Class<User>('User')({
	id: Schema.String,
	name: Schema.String
}) {}

export class UserNotFound extends Schema.ErrorClass<UserNotFound>('UserNotFound')({
	_tag: Schema.tag('UserNotFound'),
	id: Schema.String
}) {}

export class Unauthorized extends Schema.ErrorClass<Unauthorized>('Unauthorized')({
	_tag: Schema.tag('Unauthorized')
}) {}

export class CurrentUser extends Context.Service<CurrentUser, User>()('CurrentUser') {}

export class AuthMiddleware extends RpcMiddleware.Service<AuthMiddleware, {
	provides: CurrentUser;
}>()('AuthMiddleware', {
	error: Unauthorized,
	requiredForClient: true
}) {}

export class GetUser extends Rpc.make('GetUser', {
	payload: { id: Schema.String },
	success: User,
	error: UserNotFound
}) {}

export class StreamUsers extends Rpc.make('StreamUsers', {
	payload: { since: Schema.DateTimeUtc },
	success: User,
	stream: true
}) {}

export const UsersGroup = RpcGroup.make(GetUser, StreamUsers).middleware(AuthMiddleware);
```

```ts
// --- server/handlers.ts ---
import { Effect, Layer, Stream } from 'effect';
import { Headers } from 'effect/unstable/http';
import { Rpc, RpcMiddleware } from 'effect/unstable/rpc';
import { CurrentUser, UnauthorizedError, UsersGroup, User, UserNotFound } from '../definitions/users.ts';

export const UsersHandlersLive = UsersGroup.toLayer(
	Effect.gen(function*() {
		const db = yield* Database;
		return UsersGroup.of({
			GetUser: (payload) =>
				db.findUser(payload.id).pipe(
					Effect.mapError(() => new UserNotFound({ id: payload.id }))
				),
			StreamUsers: (payload) =>
				db.streamUsersSince(payload.since).pipe(Stream.map((row) => new User(row)))
		});
	})
);

export const AuthLive = Layer.succeed(AuthMiddleware)(
	AuthMiddleware.of((effect, { headers }) => {
		const token = headers.authorization;
		if (!token) return Effect.fail(new Unauthorized());
		return verifyToken(token).pipe(
			Effect.flatMap((user) => Effect.provideService(effect, CurrentUser, user))
		);
	})
);
```

```ts
// --- server/main.ts ---
import { Layer } from 'effect';
import { NodeHttpServer, NodeRuntime } from '@effect/platform-node';
import { HttpRouter } from 'effect/unstable/http';
import { RpcSerialization, RpcServer } from 'effect/unstable/rpc';
import { createServer } from 'node:http';

const ServerLayer = RpcServer.layerHttp({
	group: UsersGroup,
	path: '/api/rpc',
	protocol: 'websocket',
	disableFatalDefects: true
}).pipe(
	Layer.provide([UsersHandlersLive, AuthLive]),
	Layer.provide(RpcSerialization.layerNdjson)
);

const HttpLayer = HttpRouter.serve(ServerLayer).pipe(
	Layer.provide(NodeHttpServer.layer(createServer, { port: 3000 }))
);

Layer.launch(HttpLayer).pipe(NodeRuntime.runMain);
```

```ts
// --- client/users-client.ts ---
import { Context, Effect, Layer } from 'effect';
import { FetchHttpClient } from 'effect/unstable/http';
import { RpcClient, RpcMiddleware, RpcSerialization } from 'effect/unstable/rpc';
import { RpcClientError } from 'effect/unstable/rpc/RpcClientError';

const AuthClient = RpcMiddleware.layerClient(AuthMiddleware, ({ next, request }) =>
	next({
		...request,
		headers: Headers.set(request.headers, 'authorization', `Bearer ${getToken()}`)
	}));

export class UsersClient extends Context.Service<
	UsersClient,
	RpcClient.RpcClient<RpcGroup.Rpcs<typeof UsersGroup>, RpcClientError>
>()('UsersClient') {
	static readonly layer = Layer.effect(UsersClient)(
		RpcClient.make(UsersGroup)
	).pipe(
		Layer.provide(AuthClient),
		Layer.provide(RpcClient.layerProtocolSocket()),
		Layer.provide(NodeSocket.layerWebSocket('ws://localhost:3000/api/rpc')),
		Layer.provide(RpcSerialization.layerNdjson)
	);

	static readonly layerTest = Layer.effect(UsersClient)(
		RpcTest.makeClient(UsersGroup)
	).pipe(Layer.provide([UsersHandlersLive, AuthLive, AuthClient]));
}

// Usage:
const program = Effect.gen(function*() {
	const client = yield* UsersClient;
	const user = yield* client.GetUser({ id: 'u1' });
	yield* Effect.logInfo('got', user);
});

const usersByName = Effect.gen(function*() {
	const client = yield* UsersClient;
	return yield* client
		.StreamUsers({ since: yesterday })
		.pipe(Stream.runCollect);
}).pipe(
	RpcClient.withHeaders({ 'x-tenant': 't1' })
);
```

## Anti-patterns

1. **Confusing `RpcGroup` and `Entity` handler signatures.** Group: `(payload, options)`. Entity: `(envelope)`. The compiler will catch most cases but not all (the second arg is optional in groups).
2. **Using `clientId: number` in handler types.** It's `client: Rpc.ServerClient` (which exposes `client.id` and a mutable `annotations` context).
3. **Treating `Rpc.fork` and `Rpc.uninterruptible` like options.** They are wrappers — apply with `.pipe(Rpc.fork)` on the handler's return value.
4. **Forgetting `primaryKey` on entity rpcs that need dedup.** Without it, retried sends are *not* deduplicated; this is critical for clustered handlers that should be idempotent.
5. **Using `JSON.parse`/`JSON.stringify` on rpc payloads.** Schemas already round-trip; if you need a JSON string boundary, use `Schema.fromJsonString(...)`.
6. **Picking `layerJson` for a streaming or socket transport.** No framing → message corruption. Use `layerNdjson` or `layerMsgPack`.
7. **Forgetting `Layer.provide(AuthClient)` on a `requiredForClient: true` middleware.** Compile error, but a confusing one if you don't know to look.
8. **Using `WorkflowEngine.layerMemory` in production.** It is testing-only; use `ClusterWorkflowEngine.layer` plus a real cluster bundle.
9. **Forgetting `ShardingConfig` when using `Entity.makeTestClient`.** `TestRunner.layer` provides one; `makeTestClient` does not.
10. **Treating entity ids as application ids.** They're routing keys. Use composite ids when you need tenancy/multi-org isolation: `entityId = '${tenantId}:${userId}'` and a custom `ShardGroup` annotation that derives the group from the prefix.
11. **Mounting an HTTP API directly on top of an `Entity` instead of using `EntityProxy`.** Reinvents the proxy/discard/error mapping the proxy gives you for free.
12. **Reading `Date.now()` inside an entity or workflow handler.** Use `Clock` (and inside workflows, `DateTime.now` works because the engine wraps activities). For durable timers, use `DurableClock.sleep`.
13. **`yield* fiber` / `yield* deferred` / `yield* ref`.** Removed in v4. Use `Fiber.join`, `Deferred.await`, `Ref.get` explicitly.

## Rules

- Define rpcs in shared modules so server, client, entity, proxy, and AtomRpc all consume the same definitions.
- Pick `class extends Rpc.make(...)` for nominal types you import widely; pick `const` for ad-hoc ones.
- Use `Schema.Class` for non-trivial payloads/successes/errors; let `Rpc.make` build a struct only for tiny inline payloads.
- Use `Schema.TaggedErrorClass` (or `Schema.ErrorClass` with a `Schema.tag` field) for every rpc/middleware error.
- Set `defect: Schema.Defect({ includeStack: true })` on rpcs whose defects you want to debug across the wire.
- Set `primaryKey` on every rpc that gets persisted or retried; cluster will dedupe based on it.
- Annotate persistent entities with `ClusterSchema.Persisted` (via `entity.annotateRpcs`).
- Use `Rpc.fork` for read-only handlers that should run concurrently; otherwise let the per-entity `concurrency: 1` default protect state.
- Use `Entity.CurrentAddress` instead of threading `entityId` through payloads.
- Use `Entity.keepAlive(true)` to pin entities while they own long-running async work.
- Use `EntityProxy.toRpcGroup` / `toHttpApiGroup` and `WorkflowProxy.toRpcGroup` / `toHttpApiGroup` to expose cluster protocols externally — never hand-roll the dispatch.
- Use `RpcTest.makeClient` for handler tests and `Entity.makeTestClient` for entity tests; reach for `TestRunner.layer` for full-cluster integration tests.
- For production cluster, use `NodeClusterSocket.layer` / `NodeClusterHttp.layer` (or the Bun equivalents) unless you specifically need to assemble layers manually.
- Match transport ↔ serialization: HTTP → `layerJson`; sockets/websocket/streaming → `layerNdjson` or `layerMsgPack`.
- Pattern-match on `client.GetUser(...).pipe(Effect.catchTag('UserNotFound', ...), Effect.catchFilter(...))` for typed recovery; reserve broad `Effect.catchAll` for the runtime boundary.
