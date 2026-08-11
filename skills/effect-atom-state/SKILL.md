---
name: effect-atom-state
description: Implement reactive state management with Effect Atom for React applications
---

# Effect Atom State Management

Effect Atom is a reactive state management library for Effect that seamlessly integrates with React.

## Effect Source Reference

The Effect v4 source is available at `~/.cache/effect-v4/`.
Browse and read files there directly to look up APIs, types, and implementations.

Reference this for:

- Atom reactivity: `packages/effect/src/unstable/reactivity/`
- AsyncResult source: `packages/effect/src/unstable/reactivity/AsyncResult.ts`
- Effect source: `packages/effect/src/`

## Core Concepts

### Atoms as References

Atoms work **by reference** - they are stable containers for reactive state:

```typescript
import * as Atom from 'effect/unstable/reactivity/Atom';

// Atoms are created once and referenced throughout the app
export const counterAtom = Atom.make(0);

// Multiple components can reference the same atom
// All update when the atom value changes
```

### Automatic Cleanup

Atoms automatically reset when no subscribers remain (unless marked with `keepAlive`):

```typescript
// Resets when last subscriber unmounts
export const temporaryState = Atom.make(initialValue);

// Persists across component lifecycles
export const persistentState = Atom.make(initialValue).pipe(Atom.keepAlive);
```

### Lazy Evaluation

Atom values are computed on-demand when subscribers access them.

## Pattern: Basic Atoms

```typescript
import * as Atom from 'effect/unstable/reactivity/Atom';

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

## Pattern: Atom Family (Dynamic Atoms)

Use `Atom.family` for stable references to dynamically created atoms:

```typescript
// Create atoms per entity ID
export const userAtoms = Atom.family((userId: string) =>
	Atom.make<User | null>(null).pipe(Atom.keepAlive)
);

// Usage - always returns the same atom for a given ID
const userAtom = userAtoms(userId);
```

## Pattern: Atom.fn for Async Actions

Use `Atom.fn` with `Effect.fnUntraced` for async operations:

- Reading gives `AsyncResult<Success, Error>` with automatic `.waiting` flag
- Triggering via `useAtomSet` runs the effect

```typescript
import * as Atom from "effect/unstable/reactivity/Atom"
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
import * as AsyncResult from 'effect/unstable/reactivity/AsyncResult';

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
		Stream.scan([], (acc, n) => [...acc, n].slice(-10))
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
import * as Atom from 'effect/unstable/reactivity/Atom';
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
5. **Automatic Cleanup**: Atoms reset when unused (unless `keepAlive`)
6. **Derive, Don't Coordinate**: Use computed atoms to derive state
7. **Result Types**: Handle errors explicitly with AsyncResult.match
8. **Services in Runtime**: Wrap layers once, use in multiple atoms
9. **Immutable Updates**: Always create new values, never mutate
10. **Scoped Effects**: Leverage finalizers for resource cleanup

## Common Patterns

### Loading States

Use `Atom.fn` with `Effect.fnUntraced` which automatically provides `AsyncResult` with `.waiting` flag:

```typescript
import * as Atom from "effect/unstable/reactivity/Atom"
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
	Effect.fnUntraced(function* (id: string, updates: Partial<Item>) {
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
// Subscribers notified once, not three times
```

Outside Effect/Atom contexts, use an `AtomRegistry` (`registry.set(...)`) inside the batch. Inside an atom or write context, use that context (`ctx.set(...)`) in the same pattern. `Atom.batch` only batches notifications; it does not introduce a free `set` function.

Use when multiple atoms must update atomically to avoid intermediate renders.

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
