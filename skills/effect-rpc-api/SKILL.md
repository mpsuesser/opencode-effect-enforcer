---
name: effect-rpc-api
description: Define type-safe RPC contracts with effect/unstable/rpc — Rpc.make payload/success/error/defect schemas, RpcSchema.Stream streaming responses, RpcGroup composition (add/merge/omit/prefix/annotate), and RpcMiddleware.Service definitions shared by client and server. Use when declaring or evolving RPC procedures, building a shared contract package, adding streaming endpoints, or defining auth/observability middleware types.
---

You are an Effect TypeScript expert specializing in defining shared RPC contracts with `Rpc`, `RpcGroup`, `RpcSchema`, and `RpcMiddleware` from `effect/unstable/rpc`.

This skill covers the **contract layer**: the definitions that client and server packages both import. Wiring handlers into a server is the `effect-rpc-server` skill; constructing clients and protocols is the `effect-rpc-client` skill; distributed entities are the `effect-rpc-cluster` skill.

## Effect Source Reference

The Effect v4 source is at `~/.cache/effect-v4/`. Read it directly when in doubt — these modules are under `unstable` and move between betas.

Key files:

- `packages/effect/src/unstable/rpc/Rpc.ts` — `Rpc.make`, `Rpc.custom`, per-rpc combinators, `exitSchema`, `Wrapper` (`fork`/`uninterruptible`/`wrap`), `ServerClient`, every type helper (`Payload`, `Success`, `Error`, `Exit`, `ToHandlerFn`, `ResultFrom`, ...)
- `packages/effect/src/unstable/rpc/RpcGroup.ts` — group construction and composition (`add`/`merge`/`omit`/`prefix`/`middleware`), group vs per-rpc annotations, handler-conversion surface (`toLayer`/`toHandlers`/`toLayerHandler`/`accessHandler`/`of`)
- `packages/effect/src/unstable/rpc/RpcSchema.ts` — the `Stream` schema marker, `isStreamSchema`, `ClientAbort` cause annotation
- `packages/effect/src/unstable/rpc/RpcMiddleware.ts` — `Service` constructor, `layerClient`, `ForClient`, `ApplyServices` and the middleware function shapes
- `packages/effect/src/unstable/rpc/RpcMessage.ts` — wire envelopes: `Request`, `Ack`, `Interrupt`, `Eof`, `Ping`, `ResponseChunk`, `ResponseExit`, `ExitEncoded`, `RequestId`
- `packages/effect/src/unstable/rpc/RpcClientError.ts` — the transport error type referenced when typing shared client aliases
- `packages/effect/src/unstable/rpc/index.ts` — public exports of the rpc namespace
- `packages/platform-node/test/fixtures/rpc-schemas.ts` — the best real-world contract fixture: rpcs, streaming, middleware, deferred responses
- `packages/effect/test/rpc/Rpc.test.ts` — `exitSchema`, custom defect schemas, `getStreamSchemas` semantics

## Core Model

An `Rpc` is a **value-level contract** for one procedure:

```ts
interface Rpc<
	Tag extends string,
	Payload extends Schema.Top = Schema.Void,
	Success extends Schema.Top = Schema.Void,
	Error extends Schema.Top = Schema.Never,
	Middleware extends RpcMiddleware.AnyService = never,
	Requires = never
> // _tag, payloadSchema, successSchema, errorSchema, defectSchema,
	// annotations: Context.Context<never>, middlewares: ReadonlySet<Middleware>
```

It records a tag, four schemas (payload, success, error, defect), a set of middleware service keys, and a `Context` of annotations. An `RpcGroup<R>` is an immutable `ReadonlyMap<tag, Rpc>` plus group-level annotations. Neither does any I/O — servers interpret them into handlers, clients into methods, entities into mailboxes. Define them once in a shared module and import them everywhere.

Both `Rpc` and `RpcGroup` declare `new (_: never): {}`, so both `const X = Rpc.make(...)` and `class X extends Rpc.make(...) {}` are valid (same for groups). All combinators return **new values** — these structures are immutable.

Imports used throughout (all from the `effect` package; there is no `@effect/rpc` in v4):

```ts
import { Context, Schema } from 'effect';
import { Rpc, RpcGroup, RpcMiddleware, RpcSchema } from 'effect/unstable/rpc';
```

Deep subpath imports also work (the package exports a `./*` wildcard), e.g. `import * as RpcSchema from 'effect/unstable/rpc/RpcSchema'` or `import { RpcClientError } from 'effect/unstable/rpc/RpcClientError'`.

---

## 1. Defining RPCs — `Rpc.make`

```ts
Rpc.make(tag, {
	payload?:    Schema.Top | Schema.Struct.Fields, // default Schema.Void
	success?:    Schema.Top,                        // default Schema.Void
	error?:      Schema.Top,                        // default Schema.Never
	defect?:     Rpc.DefectSchema,                  // default Schema.Defect()
	stream?:     boolean,                           // default false
	primaryKey?: (payload) => string                // only with struct-fields payload
});
```

Two declaration styles, both official:

```ts
import { Schema } from 'effect';
import { Rpc } from 'effect/unstable/rpc';

export class User extends Schema.Class<User>('User')({
	id: Schema.String,
	name: Schema.String
}) {}

export class UserNotFound extends Schema.TaggedErrorClass<UserNotFound>()('UserNotFound', {
	id: Schema.String
}) {}

// Style A — const value. Compact; good when listing many rpcs in one file.
export const Ping = Rpc.make('Ping', { success: Schema.String });

// Style B — class extends. Nominal identity; good for rpcs imported widely.
export class GetUser extends Rpc.make('GetUser', {
	payload: { id: Schema.String },
	success: User,
	error: UserNotFound
}) {}
```

With class style, the class itself is the rpc value (`RpcGroup.make(GetUser, ...)`) and `typeof GetUser` works with all `Rpc.*` type helpers.

### Payload: struct fields vs schema

```ts
// Inline fields — Rpc.make builds Schema.Struct({ ... }) for you
Rpc.make('CreateUser', {
	payload: { name: Schema.String, email: Schema.String },
	success: User
});

// Named schema — reuse a Schema.Class (or any Schema.Top)
class CreateUserInput extends Schema.Class<CreateUserInput>('CreateUserInput')({
	name: Schema.String,
	email: Schema.String
}) {}
Rpc.make('CreateUser', { payload: CreateUserInput, success: User });
```

With the default `Schema.Void` payload, the generated client method takes no payload argument (`client.Ping()`).

### `defect` — controlling defect serialization

Defects (`Effect.die`) cross the wire through `defectSchema`. The default `Schema.Defect()` round-trips defects as `unknown`, JSON-encoding `Error` values as `{ name, message, cause? }` and **stripping stack traces** for security. Options:

```ts
// Keep stack traces across the wire
Rpc.make('Risky', { defect: Schema.Defect({ includeStack: true }) });

// Also available: { excludeCause: true } to drop Error.cause
// Or any schema satisfying Rpc.DefectSchema (decodes/encodes with no services):
Rpc.make('RiskyRaw', { defect: Schema.Any });
```

Note `Schema.Defect()` normalizes: a non-`Error` object like `{ message: 'boom' }` decodes back as an `Error`; non-JSON values fall back to a formatted string.

### `primaryKey` — deterministic payload identity

`primaryKey` is only available when `payload` is given as **struct fields** (the option is typed `never` for schema payloads). It makes `Rpc.make` build a `Schema.Class` for the payload that implements `PrimaryKey.symbol`, giving each payload value a deterministic string identity. The cluster layer uses it to dedupe retried sends of persisted messages:

```ts
export const Charge = Rpc.make('Charge', {
	payload: { invoiceId: Schema.String, amountCents: Schema.Int },
	success: Schema.Boolean,
	primaryKey: ({ invoiceId }) => invoiceId
});
```

Clients still pass plain objects; the class is an implementation detail of the payload schema. See the `effect-rpc-cluster` skill for persistence semantics.

---

## 2. Streaming Contracts — `stream: true` and `RpcSchema.Stream`

`stream: true` changes how the `success` and `error` options are interpreted:

- `successSchema` becomes `RpcSchema.Stream(success, error)` — `success` is the **element** schema, `error` is the **stream error** schema
- `errorSchema` is set to `Schema.Never` (the declared `error` moved into the stream)

```ts
export class StreamUsers extends Rpc.make('StreamUsers', {
	payload: { since: Schema.DateTimeUtc },
	success: User, // element schema, not the Effect success
	error: UserNotFound, // stream error schema
	stream: true
}) {}
```

Consequences for both sides of the contract:

- the handler must return `Stream<User, UserNotFound, R>` — or `Effect<Queue.Dequeue<User, UserNotFound | Cause.Done>, ..., R>` to drive the queue itself
- the client sees `Stream<User, UserNotFound | RpcClientError>` (or a `Queue.Dequeue` with `{ asQueue: true }` — see the `effect-rpc-client` skill)
- the rpc's terminal `Exit` success is `void`; elements travel separately as `Chunk` messages

`RpcSchema.Stream` is itself a schema, so `Rpc.make('X', { success: RpcSchema.Stream(User, UserNotFound) })` is equivalent — `stream: true` is just the ergonomic spelling. Introspect with:

```ts
RpcSchema.isStreamSchema(StreamUsers.successSchema); // true
// streamSchema.success / streamSchema.error hold the element/error schemas
```

### `RpcSchema.ClientAbort`

`ClientAbort` is a `Cause` annotation marking interrupts that originated from a client abort: when a client interrupts a call, the server interrupts the handler fiber with it attached to the `Interrupt` reason. Servers distinguish client cancellation from shutdown by checking for `RpcSchema.ClientAbort.key` on `Interrupt` reasons — the handler-side detection snippet lives in the `effect-rpc-server` skill.

---

## 3. Per-RPC Combinators

Every `Rpc` is `Pipeable` and exposes instance methods, each returning a new rpc:

```ts
Rpc.make('GetUser', { payload: { id: Schema.String }, success: User })
	.setSuccess(Schema.Option(User)) // swap success schema
	.setError(UserNotFound) // swap error schema
	.setPayload({ id: Schema.String, tenant: Schema.String }) // fields or Schema.Top
	.middleware(AuthMiddleware) // attach a middleware service key
	.prefix('users.') // tag becomes 'users.GetUser'
	.annotate(SomeKey, value) // add one annotation
	.annotateMerge(someContext); // merge a Context.Context<I>
```

Notes:

- `prefix` changes `_tag`, which is the **wire identity** of the procedure (and the key handlers are registered under). Prefix at definition time, before anything depends on the tag.
- `annotate`/`annotateMerge` attach metadata read by servers, clusters, and proxies (e.g. `ClusterSchema.Persisted`). Annotations are an open `Context`, so any `Context.Key` works — including your own.
- `middleware` accumulates into a `ReadonlySet`; attaching also threads the middleware's `provides`/`requires` through the rpc's `Requires` type parameter (section 6).

---

## 4. Composing Contracts — `RpcGroup`

`RpcGroup.make(...rpcs)` is variadic:

```ts
export const UsersGroup = RpcGroup.make(GetUser, CreateUser, StreamUsers);
```

The rpcs are reachable at `group.requests` (`ReadonlyMap<string, Rpc>`) — useful for contract introspection tests and codegen; `Rpc.isRpc(u)` guards individual values.

### Combinators

```ts
UsersGroup
	.add(DeleteUser, UpdateUser) // append rpcs (same-tag add replaces)
	.merge(OrdersGroup, PaymentsGroup) // union of groups
	.omit('DeleteUser', 'UpdateUser') // remove by tag (variadic)
	.prefix('v2.') // re-tag every rpc
	.middleware(AuthMiddleware); // attach to every rpc currently in the group
```

Sharp edges, verified in source:

- `merge` is **last-wins** on duplicate rpc tags *and* duplicate group-annotation keys. No error, silent override.
- `middleware` and the `annotateRpcs*` methods only affect rpcs **already in the group**. Rpcs added afterwards via `.add(...)` are not covered — re-apply, or attach on the rpc itself before adding.
- `omit` removes the rpc from the group but does not return it; keep the original rpc value if you need it elsewhere.

### Group-level vs per-rpc annotations

```ts
group.annotate(SomeKey, value); // on the group itself
group.annotateMerge(context); // merge Context into the group
group.annotateRpcs(SomeKey, value); // on every rpc currently in the group
group.annotateRpcsMerge(context); // merge Context into every rpc
```

`annotateRpcs*` does **not** override an annotation already set on an individual rpc — the implementation merges as `Context.merge(context, rpc.annotations)`, so the rpc's own value wins. Use this deliberately: set per-rpc exceptions first, then apply the group default.

### Handler-conversion surface (pointer)

`RpcGroup` also carries the methods that turn a contract into a server implementation — `toLayer(handlers | Effect<handlers>)`, `toLayerHandler(tag, handler)`, `toHandlers(handlers)`, `accessHandler(tag)`, and the identity type-checker `of(handlers)`. Their option signatures and wiring belong to the `effect-rpc-server` skill; what matters at the contract level is that the handler **shape** is fully derived from the rpc definitions (section 8), so a contract change is a compile error in every handler and client.

---

## 5. Errors, Defects, and the Exit Schema

An rpc's effective error union is **derived**, not declared in one place:

```
Rpc.Error<R> = declared error schema  |  every attached middleware's error schema
```

On top of that, clients add transport errors (`RpcClientError`) and any middleware `clientError` types — see the `effect-rpc-client` skill. Never re-declare a middleware's error in the rpc's `error` option; attaching the middleware adds it automatically.

Use schema error classes so errors are tagged, yieldable, and serializable:

```ts
export class RateLimited extends Schema.TaggedErrorClass<RateLimited>()('RateLimited', {
	retryAfterMillis: Schema.Number
}) {}

export class OrderError extends Schema.TaggedErrorClass<OrderError>()('OrderError', {
	reason: Schema.Literals(['empty-cart', 'payment-failed'])
}) {}

const PlaceOrder = Rpc.make('PlaceOrder', {
	payload: { cartId: Schema.String },
	success: Schema.String,
	error: Schema.Union([OrderError, RateLimited]) // unions take an array in v4
});
```

### `Rpc.exitSchema`

`Rpc.exitSchema(rpc)` builds the `Schema.Exit` that servers use to encode results and clients use to decode them:

- success side: the success schema — or `Schema.Void` for streaming rpcs
- failure side: `Schema.Union([...])` of the rpc error schema, the stream error schema (if streaming), and every middleware error schema
- defect side: the rpc's `defectSchema`

The result is cached per rpc value (WeakMap). Useful for serialization tests and generic envelope tooling:

```ts
import { Exit } from 'effect';

const schema = Rpc.exitSchema(PlaceOrder);
const encoded = Schema.encodeSync(schema)(Exit.fail(new RateLimited({ retryAfterMillis: 100 })));
const roundTripped = Schema.decodeSync(schema)(encoded);
```

---

## 6. Middleware Definition — `RpcMiddleware.Service`

A middleware is declared as a `Context.Service` class with two parameter slots:

```ts
import { Context, Schema } from 'effect';
import { RpcMiddleware } from 'effect/unstable/rpc';

export class CurrentUser extends Context.Service<CurrentUser, User>()('CurrentUser') {}

export class Unauthorized extends Schema.TaggedErrorClass<Unauthorized>()('Unauthorized', {}) {}

export class AuthMiddleware extends RpcMiddleware.Service<AuthMiddleware, {
	provides: CurrentUser; // services injected into wrapped handlers
	requires: never; // services this middleware needs from the outer context
	clientError: never; // error type only the client-side wrapper can produce
}>()('AuthMiddleware', {
	error: Unauthorized, // wire-error schema; default Schema.Never
	requiredForClient: true // default false
}) {}
```

Exact shape, verified in source:

- The **config type parameter** carries `{ requires?, provides?, clientError? }` — all optional, all defaulting to `never`. A bare `RpcMiddleware.Service<TimingMiddleware>()('TimingMiddleware')` is a pure observer.
- The **options object** has exactly two keys: `error` (a schema; becomes part of the rpc error union, section 5) and `requiredForClient` (boolean). There is no `optional`, `wrap`, `failure`, or `provides` option key — those were v3 spellings.
- The class statics expose `.error` and `.requiredForClient`, and the class itself is the `Context.Key` you attach with `rpc.middleware(AuthMiddleware)` / `group.middleware(AuthMiddleware)`.

### What attaching does to types

`rpc.middleware(M)` computes `Requires_new = Exclude<Requires_old, Provides<M>> | Requires<M>` (`RpcMiddleware.ApplyServices`). So:

- handlers for the rpc receive `Provides<M>` in their environment for free (`CurrentUser` above)
- a middleware whose `requires` names a service is satisfied by attaching a *provider middleware after it* — unfulfilled `requires` surface as extra requirements on the handlers layer
- `requiredForClient: true` adds `RpcMiddleware.ForClient<M>` to the client's required context, making a missing client implementation a **compile-time** error. Without it, clients silently skip middleware that has no client layer provided.

### The server-side function shape (for reference)

The service value is a function `(effect, options) => Effect` — options: `{ client, requestId, rpc, payload, headers }` (`rpc` is typed `Rpc.AnyWithProps`). It wraps handler execution: it cannot change the success value (opaque `SuccessValue`), but it can provide services, fail with the wire error, and observe the exit. Execution order: middlewares apply in attachment order with the **last attached outermost**, on both server and client. The `Layer` implementation (`Layer.succeed(AuthMiddleware)(AuthMiddleware.of(...))`) belongs to the `effect-rpc-server` skill.

### The client-side counterpart — `RpcMiddleware.layerClient`

Defined alongside the contract so client packages can provide it. The function receives `{ rpc, request, next }` and **must** call `next` (with the original or a modified request):

```ts
import { Headers } from 'effect/unstable/http';

export const AuthClient = RpcMiddleware.layerClient(AuthMiddleware, ({ next, request }) =>
	next({
		...request,
		headers: Headers.set(request.headers, 'authorization', `Bearer ${getToken()}`)
	})
);
// Layer<RpcMiddleware.ForClient<AuthMiddleware>>
```

`layerClient` also accepts an `Effect` that builds the function (for middleware needing services); the layer's environment is captured and merged into every invocation. Failures here surface as the middleware's `error` type or the `clientError` type from the config.

---

## 7. Custom Constructors — `Rpc.custom`

`Rpc.custom` builds an `Rpc.make`-alike that transforms every rpc's success/error schemas — encode a convention once (paginated lists, response envelopes) instead of repeating it per rpc:

```ts
import { Schema } from 'effect';
import { Rpc } from 'effect/unstable/rpc';

// Type-level definition: how success/error transform
export interface RpcWithPagination extends Rpc.Custom {
	readonly out: Rpc.Custom.Out<Paginated<this['success']>, this['error']>;
}

export interface Paginated<S extends Schema.Top> extends
	Schema.Struct<{
		readonly offset: Schema.Number;
		readonly total: Schema.Number;
		readonly results: Schema.$Array<S>;
	}>
{}

// Value-level implementation: receives { success, error, defect }, returns the transformed set
export const makePaginated = Rpc.custom<RpcWithPagination>((schemas) => ({
	...schemas,
	success: Schema.Struct({
		offset: Schema.Number,
		total: Schema.Number,
		results: Schema.Array(schemas.success)
	})
}));

// Used exactly like Rpc.make — payload, stream, primaryKey all still work
export const ListUsers = makePaginated('listUsers', { success: User });
// success type: { offset: number, total: number, results: readonly User[] }
```

The transformation applies to `success`/`error`/`defect` only; `payload`, `stream`, and `primaryKey` pass through unchanged. With `stream: true`, the transformed success becomes the stream **element** schema.

---

## 8. The Handler Contract and Wrappers

The contract fully determines the handler signature (`Rpc.ToHandlerFn`):

```ts
(
	payload: Rpc.Payload<R>,
	options: {
		readonly client: Rpc.ServerClient; // client.id: number; client.annotate(key, value)
		readonly requestId: RequestId;
		readonly headers: Headers;
		readonly rpc: R;
	}
) => Rpc.WrapperOr<Rpc.ResultFrom<R, Services>>
```

`Rpc.ResultFrom` — what a handler may return:

- **non-stream rpc**: `Effect<Success | Deferred<Success, Error>, Error, R>`. Succeeding with a `Deferred` defers the terminal exit until the deferred completes — invisible on the wire, useful when the result arrives from another fiber/webhook later.
- **stream rpc**: `Stream<Element, StreamError, R>` or `Effect<Queue.Dequeue<Element, StreamError | Cause.Done>, ..., R>` (end-of-stream is `Cause.Done` in the queue's error channel).

`Scope` is always available to handlers (the server scopes each request), and services in any attached middleware's `provides` are excluded from the handler's requirements.

### Wrappers — `Rpc.fork`, `Rpc.uninterruptible`, `Rpc.wrap`

Execution-mode hints are **wrappers around the handler's return value**, not `Rpc.make` options:

```ts
GetCount: () => Ref.get(count).pipe(Rpc.fork); // bypass server concurrency limit
Charge: (payload) => chargeOnce(payload).pipe(Rpc.uninterruptible); // must complete
Both: (payload) => work(payload).pipe(Rpc.wrap({ fork: true, uninterruptible: true }));
```

`wrap` on an already-wrapped value inherits unspecified options from the existing wrapper. Introspection helpers: `Rpc.isWrapper(u)`, `Rpc.unwrap(value)`, `Rpc.wrapMap(value, f)` (maps the inner value, preserving options).

---

## 9. Wire-Format Awareness — `RpcMessage`

You rarely touch `RpcMessage` directly, but the envelope explains several contract-level facts:

| Direction | Decoded messages | Purpose |
|---|---|---|
| client → server | `Request`, `Ack`, `Interrupt`, `Eof` (+ encoded-only `Ping`) | call, stream backpressure ack, cancellation, end-of-input, keepalive |
| server → client | `ResponseChunk`, `ResponseExit`, `ResponseDefect`, `ClientEnd` (+ encoded-only `Pong`, `ClientProtocolError`) | stream elements, terminal exit, connection-level defect, lifecycle |

Key facts:

- A `RequestEncoded` carries `{ _tag: 'Request', id: string, tag: string, payload: unknown, headers: Array<[string, string]>, traceId?, spanId?, sampled? }`. The rpc's `_tag` **is the wire identity** — renaming or re-prefixing an rpc is a breaking protocol change for deployed clients.
- `RequestId` is a branded `bigint`; construct with `RequestId(1n)` or `RequestId('1')` (from `effect/unstable/rpc/RpcMessage`). You need it when invoking handlers manually in tests via `accessHandler`.
- Terminal results travel as `ExitEncoded` — `Success` with a value, or `Failure` with a cause array of `Fail` (your error union, encoded), `Die` (via `defectSchema`), and `Interrupt` entries. This is exactly what `Rpc.exitSchema` encodes/decodes.
- Stream elements travel as batched `Chunk` messages, acknowledged by `Ack` on ack-capable protocols (sockets, workers); the HTTP protocol declares `supportsAck: false`. Incremental delivery requires a serialization with framing (e.g. ndjson) — with non-framed json over HTTP the chunks are buffered and returned in one final batch (see serialization notes in the `effect-rpc-cluster` skill).

---

## 10. Type Helpers for Shared Contract Packages

`Rpc.*` type extractors (all take the rpc type, e.g. `typeof GetUser`):

```ts
Rpc.Tag<R>; // 'GetUser'
Rpc.Payload<R>; // decoded payload type
Rpc.PayloadConstructor<R>; // input accepted by payload construction
Rpc.Success<R>; // decoded success (Stream<...> for streaming rpcs)
Rpc.SuccessEncoded<R>; // encoded success
Rpc.SuccessChunk<R>; // stream element type (never for non-stream)
Rpc.Error<R>; // declared error | middleware errors (decoded)
Rpc.Exit<R>; // Exit<SuccessExit, ErrorExit> — stream rpcs have void success
Rpc.Middleware<R>; // middleware service identifiers
Rpc.MiddlewareClient<R>; // ForClient<...> for requiredForClient middleware
Rpc.Services<R>; // schema en/decoding services (both sides)
Rpc.ServicesClient<R>; // client-side schema services
Rpc.ServicesServer<R>; // server-side schema services
Rpc.ExtractTag<R, 'GetUser'>; // select one rpc from a union
Rpc.ToHandler<R>; // the Handler service type servers require
```

For generic utilities, constrain on `Rpc.Any` (tag + annotations only) or `Rpc.AnyWithProps` (all schemas/middleware visible — the type of `options.rpc` in middleware); groups use `RpcGroup.Any`. Niche helpers (`SuccessSchema`/`ErrorSchema`, `SuccessExit`/`ErrorExit`, `IsStream`, `Prefixed`, `AddError`, `AddMiddleware`, `ExtractProvides`/`ExtractRequires`/`ExcludeProvides`) also live in `Rpc.ts` — read the source when writing generic tooling.

`RpcGroup.*` helpers:

```ts
RpcGroup.Rpcs<typeof UsersGroup>; // union of the group's rpc definitions
RpcGroup.HandlersFrom<R>; // { [tag]: handler fn } object type
RpcGroup.HandlerFrom<R, Tag>; // one handler fn type
```

The canonical use — typing a client service in the shared package without constructing anything:

```ts
import type { RpcClient } from 'effect/unstable/rpc';
import type { RpcClientError } from 'effect/unstable/rpc/RpcClientError';

export type UsersClient = RpcClient.RpcClient<
	RpcGroup.Rpcs<typeof UsersGroup>,
	RpcClientError
>;
```

---

## Key Patterns

### A complete shared contract module

Everything client and server need, with zero runtime wiring:

```ts
// contracts/users.ts — imported by both server and client packages
import { Context, Schema } from 'effect';
import { Rpc, RpcGroup, RpcMiddleware } from 'effect/unstable/rpc';

// --- domain schemas ---
export class User extends Schema.Class<User>('User')({
	id: Schema.String,
	name: Schema.String,
	createdAt: Schema.DateTimeUtc
}) {}

// --- errors ---
export class UserNotFound extends Schema.TaggedErrorClass<UserNotFound>()('UserNotFound', {
	id: Schema.String
}) {}

export class Unauthorized extends Schema.TaggedErrorClass<Unauthorized>()('Unauthorized', {}) {}

// --- middleware contract ---
export class CurrentUser extends Context.Service<CurrentUser, User>()('CurrentUser') {}

export class AuthMiddleware extends RpcMiddleware.Service<AuthMiddleware, {
	provides: CurrentUser;
}>()('AuthMiddleware', {
	error: Unauthorized,
	requiredForClient: true
}) {}

// --- procedures ---
export class GetUser extends Rpc.make('GetUser', {
	payload: { id: Schema.String },
	success: User,
	error: UserNotFound
}) {}

export class CreateUser extends Rpc.make('CreateUser', {
	payload: { name: Schema.String },
	success: User,
	primaryKey: ({ name }) => name // idempotent under cluster persistence
}) {}

export class WatchUsers extends Rpc.make('WatchUsers', {
	payload: { since: Schema.DateTimeUtc },
	success: User, // stream element
	error: UserNotFound, // stream error
	stream: true
}) {}

// Public group: everything requires auth
export const UsersGroup = RpcGroup.make(GetUser, CreateUser, WatchUsers)
	.middleware(AuthMiddleware);
```

The server package implements `UsersGroup.toLayer(...)` and a `Layer.succeed(AuthMiddleware)(...)` (see `effect-rpc-server`); the client package builds `RpcClient.make(UsersGroup)` plus `RpcMiddleware.layerClient(AuthMiddleware, ...)` (see `effect-rpc-client`).

### Versioning and namespacing with `prefix` + `merge`

```ts
const V1 = RpcGroup.make(GetUser, CreateUser).prefix('v1.');
const V2 = RpcGroup.make(GetUserV2, CreateUser, WatchUsers).prefix('v2.');

// One group served at one endpoint; tags are 'v1.GetUser', 'v2.GetUser', ...
export const ApiGroup = V1.merge(V2);
```

Handler objects key by the **prefixed** tag (quoted keys: `'v1.GetUser': (payload) => ...`). Remember `merge` is last-wins on tag collisions — prefix before merging to make collisions impossible.

### Trimming a group for a restricted surface

```ts
// Internal group has admin procedures; public surface omits them
export const AdminGroup = RpcGroup.make(GetUser, CreateUser, DeleteUser, PurgeAll);
export const PublicGroup = AdminGroup.omit('DeleteUser', 'PurgeAll').middleware(AuthMiddleware);
```

### Marking a group for the cluster

Contracts double as entity protocols — annotate, then hand to `Entity.fromRpcGroup`:

```ts
import { ClusterSchema } from 'effect/unstable/cluster';

export const DurableUsers = UsersGroup.annotateRpcs(ClusterSchema.Persisted, true);
// Entity.fromRpcGroup('Users', DurableUsers) — see the effect-rpc-cluster skill
```

### Exit-schema round-trip test for a contract

```ts
import { assert, it } from '@effect/vitest';
import { Exit, Schema } from 'effect';
import { Rpc } from 'effect/unstable/rpc';

it('GetUser exits round-trip', () => {
	const schema = Rpc.exitSchema(GetUser);
	const exit = Exit.fail(new UserNotFound({ id: 'u1' }));
	const decoded = Schema.decodeSync(schema)(Schema.encodeSync(schema)(exit));
	assert(Exit.isFailure(decoded));
});
```

## Common Mistakes

1. **Importing from `@effect/rpc`.** The package does not exist in v4 — everything is `effect/unstable/rpc` (deep subpaths like `effect/unstable/rpc/RpcMessage` also work).
2. **Reaching for `Rpc.fromTaggedRequest` / `Schema.TaggedRequest`.** Neither exists in v4. The tag is `Rpc.make`'s first argument; the payload schema carries no `_tag` field — the wire envelope transports the tag separately.
3. **Expecting `error` to stay the Effect error with `stream: true`.** It becomes the *stream* error schema and the rpc's `errorSchema` is set to `Schema.Never`. Likewise `success` becomes the *element* schema.
4. **Passing `primaryKey` with a schema payload.** It is typed `never` unless `payload` is inline struct fields — wrap the fields inline or drop `primaryKey`.
5. **Using v3 middleware option keys.** `RpcMiddleware.Service` options are exactly `{ error?, requiredForClient? }`; `provides`/`requires`/`clientError` go in the second *type parameter*, and `optional`/`wrap`/`failure` do not exist (v4 middleware always wraps).
6. **Re-declaring a middleware's error in the rpc's `error` option.** Attaching the middleware already unions its `error` schema into `Rpc.Error` and `exitSchema` — declaring it twice bloats the wire union.
7. **Assuming `group.middleware(...)` / `annotateRpcs(...)` cover later additions.** They snapshot the rpcs currently in the group; rpcs added afterwards via `.add(...)` are unaffected.
8. **Expecting `annotateRpcs` to override per-rpc annotations.** Per-rpc values win (`Context.merge(context, rpc.annotations)`); the group call only fills in missing keys.
9. **Relying on `merge` to detect tag collisions.** It is silent last-wins for both rpc tags and group annotation keys — `prefix` before merging.
10. **Treating `Rpc.fork`/`Rpc.uninterruptible` as `Rpc.make` options.** They are wrappers applied to a handler's *return value*: `effect.pipe(Rpc.fork)`.
11. **Mutating in place.** `annotate`, `prefix`, `middleware`, `setSuccess`, etc. all return new `Rpc`/`RpcGroup` values; discarding the return value is a no-op.
12. **Renaming or re-prefixing rpcs after deployment.** `_tag` is the wire identity; old clients will send tags the server no longer knows. Treat tag changes like breaking schema changes.
13. **Passing a union to `Schema.Union` variadically.** v4 takes an array: `Schema.Union([OrderError, RateLimited])`, not `Schema.Union(OrderError, RateLimited)`.
14. **Declaring errors as plain `Schema.Struct`s.** Use `Schema.TaggedErrorClass` (or `Schema.ErrorClass` with a `Schema.tag` field) so errors are yieldable, `catchTag`-able, and carry a stable `_tag` on the wire.
15. **Expecting stack traces in remote defects.** The default `Schema.Defect()` strips stacks; opt in per rpc with `defect: Schema.Defect({ includeStack: true })`.
