---
name: effect-atom-rpc
description: Build reactive Atom-aware RPC clients for React/Atom UIs using AtomRpc. Provides cached query atoms, invalidating mutation atoms, SSR hydration, and reactivity-key invalidation on top of an RpcGroup.
---

You are an Effect TypeScript expert specializing in `effect/unstable/reactivity/AtomRpc` — the reactive RPC client for Atom-driven frontends.

## When to use this skill

`AtomRpc` sits on top of an `RpcGroup` and gives you:

- A `Service`-style RPC client whose dependencies are wired through an `AtomRuntime`
- `client.query(tag, payload, options?)` — a cached, reactive `Atom<AsyncResult<...>>`
- `client.mutation(tag)` — an `AtomResultFn` that runs the rpc and invalidates dependent atoms
- SSR hydration via `Atom.serializable` when you pass `serializationKey`
- Time-to-live caching, reactivity-key invalidation, and stream rpcs surfaced as `PullResult` atoms

Use this skill when building React (or Atom-based) frontends that consume an existing `RpcGroup`.

For the underlying RPC definitions, see the `effect-rpc-cluster` skill.
For Atom fundamentals (`Atom.make`, `family`, `keepAlive`, `AsyncResult`, hydration), see the `effect-atom-state` and `effect-react-vm` skills.

## Effect Source Reference

- `packages/effect/src/unstable/reactivity/AtomRpc.ts` — the whole API (~270 lines)
- `packages/effect/test/reactivity/AtomRpc.test.ts` — minimal usage + serialization test
- `packages/effect/src/unstable/reactivity/AtomHttpApi.ts` — the cousin pattern for `HttpApi` (same idea, same options)
- `packages/effect/src/unstable/reactivity/AsyncResult.ts` — the `AsyncResult` type returned by `query`
- `packages/effect/src/unstable/reactivity/Atom.ts` — `runtime`, `family`, `serializable`, `keepAlive`, `setIdleTTL`
- `packages/effect/src/unstable/reactivity/Hydration.ts` — SSR dehydrate/hydrate helpers
- `packages/effect/src/unstable/reactivity/Reactivity.ts` — the `Reactivity` service that powers reactivity keys

## Imports

```ts
import {
	AsyncResult,
	Atom,
	AtomRpc,
	Hydration,
	Reactivity
} from 'effect/unstable/reactivity';
import { RpcClient, RpcSerialization } from 'effect/unstable/rpc';
import { FetchHttpClient } from 'effect/unstable/http';
import { useAtomValue, useAtomSet } from '@effect/atom-react';
```

## Core idea

`AtomRpc.Service<Self>()(id, options)` produces a `Context.Service` subclass whose service value is an `RpcClient.RpcClient.Flat<Rpcs, RpcClientError>` (the `flatten: true` form of the RPC client — single function `(tag, payload, options?)`). It also attaches three things to the class itself:

```ts
class UsersClient extends AtomRpc.Service<UsersClient>()('UsersClient', { ... }) {
	// inherited from AtomRpc.Service:
	static readonly runtime: Atom.AtomRuntime<UsersClient>;
	static query: (tag, payload, options?) => Atom<AsyncResult<...>> | Atom.Writable<PullResult<...>, void>;
	static mutation: (tag) => Atom.AtomResultFn<{ payload, headers?, reactivityKeys? }, ..., ...>;
}
```

The `runtime` is what powers `query` and `mutation` — internally it builds a `Layer` that runs the RPC client effect and threads the protocol layer in. You don't usually touch `runtime` directly; React components use `query` / `mutation` via Atom hooks.

## Defining an AtomRpc client

```ts
import { Layer } from 'effect';
import { AtomRpc } from 'effect/unstable/reactivity';
import { FetchHttpClient } from 'effect/unstable/http';
import { RpcClient, RpcSerialization } from 'effect/unstable/rpc';
import { UsersGroup } from '../shared/users-rpc.ts';

export class UsersClient extends AtomRpc.Service<UsersClient>()('UsersClient', {
	group: UsersGroup,
	protocol: RpcClient.layerProtocolHttp({ url: '/api/rpc' }).pipe(
		Layer.provide(RpcSerialization.layerJson),
		Layer.provide(FetchHttpClient.layer)
	)
}) {}
```

Required: `group` and `protocol`.

`protocol` accepts either a `Layer` or a function `(get: AtomContext) => Layer`. The function form lets the protocol layer read other atoms — for example, take the current auth token from a `tokenAtom` and bake it into the HTTP client:

```ts
export class UsersClient extends AtomRpc.Service<UsersClient>()('UsersClient', {
	group: UsersGroup,
	protocol: (get) =>
		Layer.unwrap(
			Effect.gen(function*() {
				const token = get(tokenAtom);
				return RpcClient.layerProtocolHttp({
					url: '/api/rpc',
					transformClient: HttpClient.mapRequest(
						HttpClientRequest.setHeader('authorization', `Bearer ${token}`)
					)
				});
			})
		)
}) {}
```

Optional config:

```ts
AtomRpc.Service<UsersClient>()('UsersClient', {
	group: UsersGroup,
	protocol: ProtocolLayer,
	spanPrefix: 'UsersClient',
	spanAttributes: { app: 'admin-ui' },
	disableTracing: false,
	generateRequestId: customRequestIdFactory, // for deterministic IDs in tests
	makeEffect: undefined, // override the default RpcClient.make
	runtime: Atom.runtime // override the runtime factory (e.g., Atom.runtime.withReactivity)
});
```

`makeEffect` is mainly for testing — instead of building a real `RpcClient` from `protocol`, supply an Effect that returns the flat client directly. The test suite uses this to short-circuit network for unit tests:

```ts
makeEffect: Effect.succeed(
	((tag, payload) => {
		if (tag === 'GetUser') return Effect.succeed({ id: payload.id, name: `user-${payload.id}` });
		return Effect.die(`unexpected tag: ${tag}`);
	}) as any
);
```

## `query` — cached reactive reads

```ts
client.query(tag, payload, options?) =>
	non-stream → Atom<AsyncResult<Success, Error | RpcClientError | MiddlewareError>>
	stream     → Atom.Writable<PullResult<Success, Error | RpcClientError | ...>, void>
```

Query atoms are **cached by request key** — calling `query('GetUser', { id: '1' })` from many components returns the *same* atom, so the rpc fires once and shares the result.

```ts
import { useAtomValue } from '@effect/atom-react';

function UserProfile({ id }: { id: string }) {
	const result = useAtomValue(
		UsersClient.query('GetUser', { id }, {
			timeToLive: '30 seconds',
			serializationKey: `user-${id}`,
			reactivityKeys: ['users', `user-${id}`]
		})
	);

	return AsyncResult.builder(result)
		.onWaiting(() => <Spinner />)
		.onError((error) => <ErrorView error={error} />)
		.onSuccess((user) => <UserCard user={user} />)
		.render();
}
```

### Query options

```ts
client.query(tag, payload, {
	headers?: Headers.Input,                         // per-call headers
	reactivityKeys?: ReadonlyArray<unknown>          // invalidation keys
		| ReadonlyRecord<string, ReadonlyArray<unknown>>,
	timeToLive?: Duration.Input,                     // cache lifetime; idle eviction
	serializationKey?: string                        // makes the atom hydration-friendly
});
```

- **`reactivityKeys`** — keys this atom listens to. When a `mutation` (or any `Reactivity.invalidate`) fires with overlapping keys, this atom re-fetches.
- **`timeToLive`** — `Duration.Input | "infinity"`. With a finite duration, the atom is removed from the cache after that long without subscribers (`Atom.setIdleTTL`). With `Duration.infinity`, the atom is `Atom.keepAlive`'d (never evicted). Without `timeToLive`, the atom resets when the last subscriber unmounts.
- **`serializationKey`** — for non-stream queries, a stable key opts the atom into `Atom.serializable` keyed by `AtomRpc:${tag}:${serializationKey}`. Without a `serializationKey`, the query atom is cached for the current registry but is not serializable/hydratable, so SSR clients will fetch again. Stream rpcs cannot be serializable.

### Stream rpcs

When the rpc has `stream: true`, `query` returns an `Atom.Writable<PullResult<A, E>, void>` instead of `Atom<AsyncResult<A, E>>`:

```tsx
const messageAtom = ChatClient.query('Subscribe', { roomId: 'r1' });

function Messages() {
	const result = useAtomValue(messageAtom);
	const pullNext = useAtomSet(messageAtom);

	return AsyncResult.matchWithWaiting(result, {
		onWaiting: () => <Spinner />,
		onError: (error) => <ErrorView error={error} />,
		onDefect: (defect) => <ErrorView error={defect} />,
		onSuccess: (success) => (
			<MessageList
				items={success.value.items}
				done={success.value.done}
				onLoadMore={() => pullNext()}
			/>
		)
	});
}
```

`PullResult<A, E>` is an `AsyncResult<{ done: boolean; items: NonEmptyArray<A> }, E | NoSuchElementError>`. The `waiting` flag is top-level on the `AsyncResult`; `items` and `done` live under the success `value`. Use `Atom.runtime.pull` semantics — write `void` to request the next chunk.

## `mutation` — invalidating writes

```ts
client.mutation(tag) => Atom.AtomResultFn<
	{ payload, headers?, reactivityKeys? },
	Success,
	Error | RpcClientError | MiddlewareError
>;
```

```ts
import { useAtomSet } from '@effect/atom-react';

function CreateUserButton() {
	const createUser = useAtomSet(UsersClient.mutation('CreateUser'));

	return (
		<button
			onClick={() =>
				createUser({
					payload: { name: 'alice', email: 'alice@example.com' },
					reactivityKeys: ['users'] // invalidates every query atom keyed 'users'
				})}
		>
			Create
		</button>
	);
}
```

Calling the returned function:

- Runs the rpc with the given `payload` and optional `headers`
- After success, fires `Reactivity.invalidate(reactivityKeys)`, causing matching `query` atoms to re-fetch
- Returns nothing (the result is reflected via the mutation atom's own `AsyncResult` state)

The mutation atom itself is also `Atom.serializable` keyed `AtomRpc:mutation:${tag}` — useful when you want to inspect the most recent mutation result in the UI (loading state, last error).

### Mutation options

```ts
mutation({
	payload: Rpc.PayloadConstructor<Rpc>, // required; constructed via the rpc payload schema
	headers?: Headers.Input, // per-call headers
	reactivityKeys?: ReadonlyArray<unknown> // keys to invalidate after success
		| ReadonlyRecord<string, ReadonlyArray<unknown>>
});
```

Stream rpcs are **not** valid mutation targets. Use `query` for streams.

## Reactivity keys

Two equivalent ways to declare keys:

```ts
// Plain array → all keys map to the global namespace
reactivityKeys: ['users', 'user-1'];

// Record → keys are scoped to namespaces (useful for cross-cutting domains)
reactivityKeys: {
	users: ['user-1', 'user-2'],
	tenants: ['t1']
}
```

A `query` re-fires when *any* of its declared keys appears in an invalidation event. The matching is structural — if two atoms both list `'user-1'`, mutating with `reactivityKeys: ['user-1']` invalidates both.

For more advanced invalidation patterns (e.g., conditional invalidation, debounced invalidation), use `Reactivity.invalidate(keys)` and `Reactivity.mutation(effect, keys)` directly inside Atom-runtime effects.

## SSR hydration

Hydration uses `Atom.serializable` (which `query` opts into when you pass `serializationKey`):

```ts
// --- server: render then dehydrate ---
import { AtomRegistry, Hydration } from 'effect/unstable/reactivity';

const registry = AtomRegistry.make();
const userAtom = UsersClient.query('GetUser', { id: 'u1' }, {
	serializationKey: 'u1'
});

const unmount = registry.mount(userAtom);
yield* Effect.yieldNow;
yield* Effect.yieldNow;

const dehydrated = Hydration.toValues(Hydration.dehydrate(registry));
unmount();
// dehydrated is a JSON-safe array of { key, value } pairs to inline in the HTML
```

```tsx
// --- client: hydrate before rendering ---
import { AtomRegistry, Hydration } from 'effect/unstable/reactivity';
import { RegistryContext } from '@effect/atom-react';

const registry = AtomRegistry.make();
Hydration.hydrate(registry, dehydratedFromServer);

<RegistryContext.Provider value={registry}>
	<App />
</RegistryContext.Provider>;
```

Stream rpcs are not serializable — only non-stream `query` atoms with a stable `serializationKey` can be dehydrated and hydrated.

## Custom runtime

`AtomRpc.Service` accepts a `runtime` factory option. The default is `Atom.runtime`. Override it when you want all the atoms produced by this client to share a custom reactivity scope, registry, or annotation:

```ts
const myRuntime = Atom.runtime.withReactivity(['shared-namespace']);

export class UsersClient extends AtomRpc.Service<UsersClient>()('UsersClient', {
	group: UsersGroup,
	protocol: ProtocolLayer,
	runtime: myRuntime
}) {}
```

## End-to-end example

```ts
// --- shared/users-rpc.ts ---
import { Schema } from 'effect';
import { Rpc, RpcGroup } from 'effect/unstable/rpc';

export class User extends Schema.Class<User>('User')({
	id: Schema.String,
	name: Schema.String,
	email: Schema.String
}) {}

export class UserNotFound extends Schema.ErrorClass<UserNotFound>('UserNotFound')({
	_tag: Schema.tag('UserNotFound'),
	id: Schema.String
}) {}

export const GetUser = Rpc.make('GetUser', {
	payload: { id: Schema.String },
	success: User,
	error: UserNotFound
});

export const ListUsers = Rpc.make('ListUsers', {
	success: Schema.Array(User)
});

export const CreateUser = Rpc.make('CreateUser', {
	payload: { name: Schema.String, email: Schema.String },
	success: User
});

export const UsersGroup = RpcGroup.make(GetUser, ListUsers, CreateUser);
```

```ts
// --- frontend/clients/users-client.ts ---
import { Layer } from 'effect';
import { FetchHttpClient } from 'effect/unstable/http';
import { AtomRpc } from 'effect/unstable/reactivity';
import { RpcClient, RpcSerialization } from 'effect/unstable/rpc';
import { UsersGroup } from '../../shared/users-rpc.ts';

export class UsersClient extends AtomRpc.Service<UsersClient>()('UsersClient', {
	group: UsersGroup,
	protocol: RpcClient.layerProtocolHttp({ url: '/api/rpc' }).pipe(
		Layer.provide(RpcSerialization.layerJson),
		Layer.provide(FetchHttpClient.layer)
	),
	spanPrefix: 'UsersClient'
}) {}
```

```tsx
// --- frontend/components/UserList.tsx ---
import { useAtomValue, useAtomSet } from '@effect/atom-react';
import { AsyncResult } from 'effect/unstable/reactivity';
import { UsersClient } from '../clients/users-client';

export function UserList() {
	const users = useAtomValue(
		UsersClient.query('ListUsers', undefined, {
			timeToLive: '1 minute',
			reactivityKeys: ['users'],
			serializationKey: 'all'
		})
	);

	const createUser = useAtomSet(UsersClient.mutation('CreateUser'));

	const onAdd = () =>
		createUser({
			payload: { name: 'New user', email: 'new@example.com' },
			reactivityKeys: ['users']
		});

	return (
		<>
			<button onClick={onAdd}>Add user</button>
			{AsyncResult.builder(users)
				.onWaiting(() => <p>Loading…</p>)
				.onError((err) => <p>Error: {String(err)}</p>)
				.onSuccess((list) => (
					<ul>
						{list.map((u) => <li key={u.id}>{u.name}</li>)}
					</ul>
				))
				.render()}
		</>
	);
}
```

```tsx
// --- frontend/components/UserDetail.tsx ---
export function UserDetail({ id }: { id: string }) {
	const user = useAtomValue(
		UsersClient.query('GetUser', { id }, {
			timeToLive: '30 seconds',
			reactivityKeys: ['users', `user-${id}`],
			serializationKey: `user-${id}`
		})
	);

	return AsyncResult.builder(user)
		.onWaiting(() => <Spinner />)
		.onErrorTag('UserNotFound', (err) => <NotFound id={err.id} />)
		.onError((err) => <ErrorView error={err} />)
		.onSuccess((u) => <UserCard user={u} />)
		.render();
}
```

## Sibling: `AtomHttpApi`

If your backend exposes an `HttpApi` instead of an `RpcGroup`, `AtomHttpApi.Service<Self>()(id, options)` is the same idea applied to `HttpApiGroup`/`HttpApiEndpoint`:

```ts
import { AtomHttpApi } from 'effect/unstable/reactivity';

class ApiClient extends AtomHttpApi.Service<ApiClient>()('ApiClient', {
	api: MyHttpApi,
	httpClient: FetchHttpClient.layer,
	baseUrl: '/api'
}) {}

ApiClient.query('users', 'getById', {
	params: { id: 'u1' },
	timeToLive: '30 seconds',
	reactivityKeys: ['users', 'user-u1'],
	serializationKey: 'user-u1'
});

const updateUser = useAtomSet(ApiClient.mutation('users', 'update'));
```

The `query`/`mutation` arguments differ (you pass `groupName, endpointName, request` because HttpApi has groups). Non-stream `AtomHttpApi.query` atoms are serializable only in decoded-only mode **and** when you provide a stable `serializationKey`; query hydration keys use `AtomHttpApi:${group}:${endpoint}:${serializationKey}`. Decoded-only AtomHttpApi query/mutation serialization uses endpoint + endpoint-middleware wire error schemas; do not document client-only middleware errors as serialized failures.

`AtomHttpApi` error types follow the `HttpApiClient` endpoint shape: endpoint decoded errors, endpoint middleware errors, and client middleware errors. With `responseMode: 'response-only'`, endpoint decoded errors are excluded because the caller receives the raw response, but endpoint middleware and client middleware errors remain typed failures. Low-level `HttpClientError` and `SchemaError` are raised as defects by the AtomHttpApi runtime.

## Anti-patterns

1. **Re-creating the client on every render.** `AtomRpc.Service` produces a *singleton* class — define it once at module scope and import. Constructing it inside a component creates a new runtime per render.
2. **Forgetting `serializationKey` for hydration.** Without it, SSR-rendered atoms re-fetch on the client. Add `serializationKey` to every query you want to hydrate.
3. **Using `query` for an action.** Queries are cached and may run more than once due to subscription churn. Use `mutation` for any side-effectful or state-changing call.
4. **Forgetting `reactivityKeys` on mutations.** A mutation that doesn't list keys won't invalidate any queries — the UI will look stale until the user refreshes.
5. **Trying to make a stream rpc serializable.** Not supported — `serializationKey` is silently ignored on streams.
6. **Overlapping reactivity keys without intent.** A widely-used key like `['users']` invalidates *every* user query. Scope keys narrowly (`['user-${id}']`) when only one entry changes; use the broad key only when a list-level refresh is intended.
7. **Assuming every error has `_tag`.** The failure channel includes declared RPC errors, RPC middleware wire errors, and `RpcClientError` transport faults. When you model errors as tagged schemas, use `.onErrorTag(...)` or check `_tag`; otherwise handle by schema/predicate with `.onError(...)` / `.onErrorIf(...)`.
8. **Mixing `Atom.runtime` factories.** If you specify a custom `runtime` for `AtomRpc.Service`, use it consistently across related queries; mixing runtimes scopes reactivity differently and breaks invalidation.

## Rules

- Define the `RpcGroup` in a shared module; the same `UsersGroup` powers `RpcServer`, `RpcClient`, and `AtomRpc.Service`.
- One `AtomRpc.Service` class per logical client; module-singleton, never per-component.
- Always pass `reactivityKeys` to mutations so dependent queries refresh.
- Pass `serializationKey` to every query you want SSR-hydratable.
- Pick `timeToLive` deliberately: short (`'10 seconds'`) for hot data, long (`Duration.infinity`) for reference data, omit for "tear down on unmount".
- Use `AsyncResult.builder(...).onWaiting(...).onError(...).onSuccess(...)` (or `AsyncResult.matchWithWaiting`) to render — never check `.waiting` and `.error` ad-hoc. Reserve `.onFailure((cause) => ...)` for whole-`Cause` fallbacks after typed error branches.
- For protocol layers that depend on auth tokens or other reactive state, use the `(get) => Layer` form of `protocol` so the client rebuilds when those atoms change.
- For typed error recovery, handle declared RPC errors, RPC middleware wire errors, and `RpcClientError`; branch on `_tag` only when the relevant errors are tagged.
- Cross-link to `effect-atom-state` and `effect-react-vm` skills for atom-side patterns; this skill covers only the RPC bridge.
