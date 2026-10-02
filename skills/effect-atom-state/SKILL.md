---
name: effect-atom-state
description: Implement reactive state management with Effect Atom for React applications
---

# Effect Atom State Management

Effect Atom is a reactive state management library for Effect that seamlessly integrates with React.

`@effect/atom-react@4.0.0` requires React `>=19.0.0 <20.0.0`.
Keep the adapter at the same version as `effect`; core atoms live in `effect/reactivity`, and
React bindings live in `@effect/atom-react` (`packages/atom/react` upstream).
Core reactivity APIs carry `@stability unstable` and may break in minor releases.

## Effect Source Reference

The Effect v4 source is available at `~/.local/share/opencode/repos/github.com/Effect-TS/effect@main/`.
Inspect `git show effect@4.0.0:<path>` there for this baseline; main may be ahead.

Reference this for:

- Atom reactivity: `packages/effect/src/reactivity/`
- AsyncResult source: `packages/effect/src/reactivity/AsyncResult.ts`
- Effect source: `packages/effect/src/`

## Core Concepts

### Atoms as References

`Reactivity.Reactivity` is the branded service interface. Custom implementations
include its exported `[TypeId]: TypeId`; prefer the supplied constructor/layer.
Registry dehydration skips unencodable values while preserving other atoms.
`Atom.withFallback` forwards writes to the primary atom. Keep encoding contracts
explicit for state that must survive SSR dehydration.

Atoms work **by reference** - they are stable containers for reactive state:

```typescript
import * as Atom from 'effect/reactivity/Atom';

// Atoms are created once and referenced throughout the app
export const counterAtom = Atom.make(0);

// Multiple components can reference the same atom
// All update when the atom value changes
```

### Automatic Cleanup

Registry nodes become eligible for disposal when unused by subscribers and
dependent atoms. Disposal follows the atom's idle TTL or registry default; it is
not necessarily synchronous with the last React unmount. `keepAlive` retains the
node until its registry is reset/disposed:

```typescript
// Disposed after becoming unused, according to the registry's idle policy
export const temporaryState = Atom.make(initialValue);

// Persists across component lifecycles
export const persistentState = Atom.make(initialValue).pipe(Atom.keepAlive);
```

### Lazy Evaluation

Atom values are computed on-demand when subscribers access them.

Tracked dependencies remain retained while a node is stale and are reconciled
on its next build. Register cleanup with `get.addFinalizer` or scoped effects so
superseded builds release resources. Observed failed builds can recover when a
dependency changes; avoid manual reset workarounds for stale-node propagation.

## Pattern: Basic Atoms

```typescript
import * as Atom from 'effect/reactivity/Atom';

// Simple atom
export const count = Atom.make(0);

// Atom with object state
export interface CartState {
	readonly items: ReadonlyArray<Item>;
	readonly total: number;
}

export const cart = Atom.make<CartState>({
	items: [],
	total: 0
});
```

## Pattern: Derived Atoms

Use `Atom.map` or computed atoms with the `get` parameter:

```typescript
// Derived via map
export const itemCount = Atom.map(cart, (c) => c.items.length);
export const isEmpty = Atom.map(cart, (c) => c.items.length === 0);

// Computed atom accessing other atoms
export const cartSummary = Atom.make((get) => {
	const cartData = get(cart);
	const count = get(itemCount);

	return {
		itemCount: count,
		total: cartData.total,
		isEmpty: count === 0
	};
});
```

### Custom Equality

Use `Atom.withEquality` when recomputation produces referentially new values that should not notify subscribers when they are semantically unchanged. The default comparison is `Object.is`.

```typescript
interface Point {
	readonly x: number;
	readonly y: number;
}

export const point = Atom.make<Point>({ x: 0, y: 0 }).pipe(
	Atom.withEquality((current, next) =>
		current.x === next.x && current.y === next.y
	)
);
```

Equality changes notification behavior, not computation or mutation. Keep the comparator pure, fast, and consistent; use schema-derived equivalence for schema-modeled domain values.

## Pattern: Atom Family (Dynamic Atoms)

Use `Atom.family` for stable references to dynamically created atoms:

```typescript
// Create atoms per entity ID
export const userAtoms = Atom.family((userId: string) =>
	Atom.make<User | null>(null).pipe(Atom.keepAlive)
);

// Reuses the cached live atom for a given ID
const userAtom = userAtoms(userId);
```

Family caches use weak references where supported. Identity is reused while the
cached atom is live; it is not a permanent store of every key ever requested.
An old atom's finalizer does not evict a newer cached atom for the same key.

## Pattern: Atom.fn for Async Actions

Use `Atom.fn` with `Effect.fnUntraced` for async operations:

- Reading gives `AsyncResult<Success, Error>` with automatic `.waiting` flag
- Triggering via `useAtomSet` runs the effect
- The callback takes one application argument plus an `Atom.FnContext`; bundle
  multiple inputs into an object. The second argument is not another payload.
- By default a new write replaces the current run. Use `{ concurrent: true }`
  deliberately for overlapping Effect executions. Synchronous successes and
  failures are retained in concurrent mode; it still exposes one `AsyncResult`,
  not a per-invocation result log.

```typescript
import * as Atom from "effect/reactivity/Atom"
import { useAtomValue, useAtomSet } from "@effect/atom-react"
import { Effect, Exit } from "effect"

// Atom.fn with Effect.fnUntraced for generator syntax
const logAtom = Atom.fn(
  Effect.fnUntraced(function* (arg: number) {
    yield* Effect.log("got arg", arg)
  })
)

function LogComponent() {
  // useAtomSet returns a trigger function
  const logNumber = useAtomSet(logAtom)
  return <button onClick={() => logNumber(42)}>Log 42</button>
}
```

**With services using Atom.runtime:**

```typescript
class Users extends Context.Service<Users>()("app/Users", {
  make: Effect.gen(function* () {
    const create = (name: string) => Effect.succeed({ id: 1, name })
    return { create } as const
  }),
}) {}

const runtimeAtom = Atom.runtime(Users.layer)

// runtimeAtom.fn provides service access
const createUserAtom = runtimeAtom.fn(
  Effect.fnUntraced(function* (name: string) {
    const users = yield* Users
    return yield* users.create(name)
  })
)

function CreateUserComponent() {
  // mode: "promiseExit" for async handlers with Exit result
  const createUser = useAtomSet(createUserAtom, { mode: "promiseExit" })
  return (
    <button onClick={async () => {
      const exit = await createUser("John")
      if (Exit.isSuccess(exit)) {
        console.log(exit.value)
      }
    }}>
      Create user
    </button>
  )
}
```

**Reading result state:**

```typescript
function UserList() {
  const [result, createUser] = useAtom(createUserAtom)  // AsyncResult<User, Error>

  // Use matchWithWaiting for proper waiting state handling
  return AsyncResult.matchWithWaiting(result, {
    onWaiting: () => <Spinner />,
    onSuccess: ({ value }) => <UserCard user={value} />,
    onError: (error) => <Error message={String(error)} />,
    onDefect: (defect) => <Error message={String(defect)} />
  })
}
```

**Anti-pattern: Manual void wrappers**

```typescript
// ❌ DON'T - manual state management loses waiting control
const loading$ = Atom.make(false);
const user$ = Atom.make<User | null>(null);

const fetchUser = (id: string): void => {
	registry.set(loading$, true);
	Effect.runPromise(userService.getById(id)).then((user) => {
		registry.set(user$, user);
		registry.set(loading$, false);
	});
};

// ✅ DO - Atom.fn handles loading/success/failure automatically
const fetchUserAtom = Atom.fn(
	Effect.fnUntraced(function* (id: string) {
		return yield* userService.getById(id);
	})
);
// result.waiting, AsyncResult.match - all built-in
```

## Pattern: Runtime with Services

Wrap Effect layers/services for use in atoms:

```typescript
import { Layer } from 'effect';

// Create runtime with services
export const runtime = Atom.runtime(
	Layer.mergeAll(DatabaseService.Live, LoggerService.Live, ApiClient.Live)
);

// Use services in function atoms
export const fetchUserData = runtime.fn(
	Effect.fnUntraced(function* (userId: string) {
		const db = yield* DatabaseService;
		const user = yield* db.getUser(userId);

		yield* Atom.set(userAtoms(userId), user);
		return user;
	})
);
```

### Global Layers

Configure global layers once at app initialization:

```typescript
// App setup
Atom.runtime.addGlobalLayer(
	Layer.mergeAll(Logger.Live, Tracer.Live, Config.Live)
);
```

## Pattern: AsyncResult Types (Error Handling)

Atoms can return `AsyncResult` types for explicit error handling:

```tsx
import * as AsyncResult from 'effect/reactivity/AsyncResult';

export const userData = Atom.make<AsyncResult.AsyncResult<User, Error>>(
	AsyncResult.initial()
);

// In component - use matchWithWaiting for proper waiting state
const result = useAtomValue(userData);

AsyncResult.matchWithWaiting(result, {
	onWaiting: () => <Loading />,
	onSuccess: ({ value }) => <UserProfile user={value} />,
	onError: (error) => <Error message={String(error)} />,
	onDefect: (defect) => <Error message={String(defect)} />
});
```

## Pattern: Stream Integration

Convert streams into atoms that capture the latest value:

```typescript
import { Stream } from 'effect';

// Infinite stream becomes reactive atom
export const notifications = Atom.make(
	Stream.fromEventListener(window, 'notification').pipe(
		Stream.map(parseNotification),
		Stream.filter(isValid),
		Stream.scan(() => [], (acc, n) => [...acc, n].slice(-10))
	)
);
```

## Pattern: Pull Atoms (Pagination)

Use `Atom.pull` for stream-based pagination:

```tsx
export const pagedItems = Atom.pull(
	Stream.fromIterable(itemsSource).pipe(
		Stream.grouped(10) // Pages of 10 items
	)
);

function PagedList() {
	const result = useAtomValue(pagedItems);
	const pullNext = useAtomSet(pagedItems);

	return AsyncResult.matchWithWaiting(result, {
		onWaiting: () => <Loading />,
		onError: (error) => <Error message={String(error)} />,
		onDefect: (defect) => <Error message={String(defect)} />,
		onSuccess: (success) => (
			<>
				<ItemList items={success.value.items} />
				<button
					disabled={success.value.done}
					onClick={() => pullNext()}
				>
					Load more
				</button>
			</>
		)
	});
}
```

`Atom.pull` returns a writable `PullResult`, which is an `AsyncResult` whose success value is `{ done, items }`. The `waiting` flag stays on the top-level result; read pages from `success.value.items` and call `useAtomSet(pagedItems)()` to pull the next chunk.

## Pattern: Persistence

Use `Atom.kvs` for persisted state:

```typescript
import { BrowserKeyValueStore as BrowserKvs } from '@effect/platform-browser';
import * as Atom from 'effect/reactivity/Atom';
import * as Schema from 'effect/Schema';

export const userSettings = Atom.kvs({
	runtime: Atom.runtime(BrowserKvs.layerLocalStorage),
	key: 'user-settings',
	schema: Schema.Struct({
		theme: Schema.Literals(['light', 'dark']),
		notifications: Schema.Boolean,
		language: Schema.String
	}),
	defaultValue: () => ({
		theme: 'light',
		notifications: true,
		language: 'en'
	})
});
```

If you want to use the core Web Storage layer directly, import the module namespace and pass `Atom.runtime(KeyValueStore.layerStorage(() => globalThis.localStorage))`.

## React Integration

### Hooks

```tsx
import { useAtomValue, useAtomSet, useAtom } from '@effect/atom-react';

export function CartView() {
	// Read only
	const cartData = useAtomValue(cart);
	const isEmpty = useAtomValue(isEmpty);

	// Write only
	const addItem = useAtomSet(addItem);
	const clearCart = useAtomSet(clearCart);

	// Both read and write
	const [count, setCount] = useAtom(counterAtom);

	// For async function atoms (use mode option on useAtomSet)
	const fetchData = useAtomSet(fetchUserData, { mode: 'promiseExit' });

	return (
		<div>
			<div>Items: {cartData.items.length}</div>
			<button onClick={() => addItem(newItem)}>Add</button>
			<button onClick={() => clearCart()}>Clear</button>
		</div>
	);
}
```

### Separation of Concerns

Different components can read/write the same atom reactively:

```tsx
// Component A - reads state
function CartDisplay() {
	const cart = useAtomValue(cart);
	return <div>Items: {cart.items.length}</div>;
}

// Component B - modifies state
function CartActions() {
	const addItem = useAtomSet(addItem);
	return <button onClick={() => addItem(item)}>Add</button>;
}

// Both update reactively when atom changes
```

## Scoped Resources & Finalizers

Atoms support scoped effects with automatic cleanup:

```typescript
export const wsConnection = Atom.make(
	Effect.gen(function* () {
		// Acquire resource
		const ws = yield* Effect.acquireRelease(connectWebSocket(), (ws) =>
			Effect.sync(() => ws.close())
		);

		return ws;
	})
);

// Finalizer runs when atom rebuilds or becomes unused
```

## Key Principles

1. **Atom.fn for Async**: Use `Atom.fn()` for effects—gives automatic `waiting` flag and `AsyncResult` type
2. **Never Manual Void Wrappers**: Don't wrap Effects in void functions—you lose `waiting` control
3. **Reference Stability**: Use `Atom.family` for dynamically generated atom sets
4. **Lazy Evaluation**: Values computed on-demand when accessed
5. **Automatic Cleanup**: Unused atoms follow idle retention; `keepAlive` lasts until registry reset/disposal
6. **Derive, Don't Coordinate**: Use computed atoms to derive state
7. **Result Types**: Handle errors explicitly with AsyncResult.match
8. **Services in Runtime**: Wrap layers once, use in multiple atoms
9. **Immutable Updates**: Always create new values, never mutate
10. **Scoped Effects**: Leverage finalizers for resource cleanup
11. **Intentional Equality**: Use `Atom.withEquality` to suppress semantically redundant notifications

## Common Patterns

### Loading States

Use `Atom.fn` with `Effect.fnUntraced` which automatically provides `AsyncResult` with `.waiting` flag:

```typescript
import * as Atom from "effect/reactivity/Atom"
import { useAtomValue, useAtomSet } from "@effect/atom-react"
import { Effect } from "effect"

// Atom.fn handles loading/success/failure automatically
const loadUserAtom = Atom.fn(
  Effect.fnUntraced(function* (id: string) {
    return yield* userService.fetchUser(id)
  })
)

// In component
function UserProfile() {
  const [result, loadUser] = useAtom(loadUserAtom)

  // Use matchWithWaiting for proper waiting state handling
  return AsyncResult.matchWithWaiting(result, {
    onWaiting: () => <Loading />,
    onSuccess: ({ value }) => <UserCard user={value} />,
    onError: (error) => <Error message={String(error)} />,
    onDefect: (defect) => <Error message={String(defect)} />
  })
}
```

### Optimistic Updates

```typescript
export const updateItem = runtime.fn(
	Effect.fnUntraced(function* ({ id, updates }: { id: string; updates: Partial<Item> }) {
		const current = yield* Atom.get(itemsAtom);

		// Optimistic update
		yield* Atom.set(
			itemsAtom,
			current.map((item) =>
				item.id === id ? { ...item, ...updates } : item
			)
		);

		// Persist to server
		const result = yield* Effect.result(api.updateItem(id, updates));

		// Revert on failure
		if (result._tag === 'Failure') {
			yield* Atom.set(itemsAtom, current);
		}
	})
);
```

### Computed Queries

```typescript
// Filter atom accessing other atoms
export const filteredItems = Atom.make((get) => {
	const items = get(itemsAtom);
	const searchTerm = get(searchAtom);
	const activeFilters = get(filtersAtom);

	return items.filter(
		(item) =>
			item.name.includes(searchTerm) &&
			activeFilters.every((f) => f.predicate(item))
	);
});
```

## External push sources

For browser APIs or other external sources that push updates, create an atom with `Atom.make((get) => ...)` and use `get.setSelf` plus `get.addFinalizer`:

```typescript
// System theme detection — updates reactively via matchMedia listener
export const systemThemeAtom = Atom.make((get) => {
	const mql = window.matchMedia('(prefers-color-scheme: dark)');
	const readTheme = (): 'light' | 'dark' =>
		mql.matches ? 'dark' : 'light';

	const handler = (event: MediaQueryListEvent) => {
		get.setSelf(event.matches ? 'dark' : 'light');
	};

	mql.addEventListener('change', handler);
	get.addFinalizer(() => mql.removeEventListener('change', handler));

	return readTheme();
});
```

Use `Atom.transform` only to transform an existing source atom; it is not a standalone constructor that accepts an initial value and subscription effect.

## Atom.batch

Batch multiple atom updates into a single notification cycle:

```typescript
Atom.batch(() => {
	registry.set(nameAtom, 'Alice');
	registry.set(ageAtom, 30);
	registry.set(statusAtom, 'active');
});
// Dependents observe the final batched state
```

Outside Effect/Atom contexts, use an `AtomRegistry` (`registry.set(...)`) inside the batch. Inside an atom or write context, use that context (`ctx.set(...)`) in the same pattern. `Atom.batch` only batches notifications; it does not introduce a free `set` function.

Batch synchronous writes to avoid intermediate notifications. Writes made by
commit listeners are processed in subsequent commit work rather than dropped,
so do not promise exactly one callback when listeners themselves write.
Batching is not rollback: writes made before a thrown exception are still
committed and notified, then the first failure is rethrown. Async work after an
`await` is outside the batch.

## Stale-while-revalidate reads

Wrap an `AsyncResult` query atom with `Atom.swr({ staleTime: '30 seconds' })`.
Reads return the current result and defer stale-source refresh until after the
read. The scheduled refresh is skipped if the source becomes fresh or the
wrapper is disposed; a one-shot unmounted read does not keep background work
alive. Mount/subscribe for a continuing query lifetime.

`revalidateOnMount` controls initial stale refreshes. `revalidateOnFocus: true`
respects `staleTime`, while `'always'` forces a refresh. Manual refresh always
forwards to the source. `staleTime` is a freshness window, distinct from idle TTL.
Create the wrapper once (module scope, `Atom.family`, or `useMemo`) rather than
on every render. `swr` returns `WithoutSerializable<R>`; retain the serializable
source atom for hydration or explicitly serialize the wrapper under its own key.

## AsyncResult.builder

Chainable API for handling `AsyncResult` types — replaces verbose `AsyncResult.match`/`AsyncResult.matchWithWaiting`:

```typescript
const UserProfile = ({ userId }: { userId: string }) => {
  const user = useAtomValue(userAtom(userId))

  return AsyncResult.builder(user)
    .onInitial(() => <LoadingSkeleton />)
    .onErrorTag('UserNotFound', (err) => <NotFound id={err.userId} />)
    .onErrorIf(
      (err): err is NetworkError => err instanceof NetworkError,
      () => <RetryPrompt />
    )
    .onError((err) => <Error message={String(err)} />)
    .onSuccess((user) => <ProfileCard user={user} />)
    .render()
}
```

- `onInitial` — initial/pending state
- `onError` — handle any typed error value
- `onErrorIf` — handle typed errors with a predicate or refinement
- `onErrorTag` — handle tagged errors by `_tag`
- `onFailure` — receives the whole `Cause.Cause<E>`; reserve it for cause-level fallback handling
- `onSuccess` — render the success value
- `render()` — finalize and return JSX; it throws unhandled failures, so handle every expected error/defect or use `orElse` / `orNull`

## useAtomMount

Activate a side-effect atom without reading its value:

```typescript
// Start a WebSocket connection when component mounts, clean up on unmount
useAtomMount(websocketAtom);

// Start polling without consuming the value
useAtomMount(pollingAtom);
```

Use when an atom's side effects matter but its value doesn't need to be rendered.

## Performance

### Selective Re-rendering

Derive focused atoms to avoid unnecessary re-renders:

```typescript
// Bad: entire component re-renders when any user field changes
const user = useAtomValue(userAtom)
return <span>{user.name}</span>

// Good: only re-renders when name changes
const userName = useMemo(() => Atom.map(userAtom, (u) => u.name), [])
const name = useAtomValue(userName)
return <span>{name}</span>
```

Use `Atom.map` to create narrow slices of state that minimize re-render surface.

## Anti-Patterns

```
atoms inside components       → creates new atom every render; define outside or useMemo
missing finalizers             → memory/subscription leaks; always clean up in transform/fn
missing keepAlive              → global state garbage collected; use Atom.keepAlive
ignoring AsyncResult types     → crashes on error states; always handle all AsyncResult variants
updating state during render   → infinite loops; use effects or event handlers
```

Effect Atom bridges Effect's powerful type system with React's rendering model, providing type-safe reactive state management with automatic cleanup and seamless Effect integration.
