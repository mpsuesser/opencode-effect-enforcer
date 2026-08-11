---
name: effect-scope
description: Manage resource lifecycles with Effect Scope — Effect.acquireRelease/addFinalizer/scoped/scopedWith, onExit/ensuring finalizers, manual Scope.make/close/fork, ScopedRef, and scope ownership in Layers and fibers. Use when acquiring anything that needs guaranteed cleanup (file handles, connections, event listeners, temp files), when Scope appears in an effect's R, or when resources leak or are released too early.
---

You are an Effect TypeScript expert specializing in resource lifecycle management with `Scope`, finalizers, and scoped effects.

## Effect Source Reference

The Effect v4 source is at `~/.cache/effect-v4/`. Read it directly when in doubt — v4 differs substantially from v3 and from most training data.

Key files:

- `packages/effect/src/Scope.ts` — `Scope`/`Closeable` interfaces, state model, `make`, `fork`, `close`, `provide`, `use`, `addFinalizer(Exit)`
- `packages/effect/src/Effect.ts` — `acquireRelease`, `acquireDisposable`, `acquireUseRelease`, `addFinalizer`, `scoped`, `scopedWith`, `scope`, the `onExit`/`ensuring`/`onError`/`onInterrupt` family, `forkScoped`/`forkIn` (grep; the file is huge)
- `packages/effect/src/internal/effect.ts` — runtime semantics: finalizer ordering, close behavior, `scoped` implementation (search for `scopeClose`, `scopeCloseFinalizers`)
- `packages/effect/src/ScopedRef.ts` — resource-backed mutable reference with release-on-replace
- `packages/effect/src/Layer.ts` — how layers fork and refcount scopes (`fromBuild`, `memoMapBuild`)
- `packages/effect/test/Scope.test.ts` + `test/ScopedRef.test.ts` — edge-case semantics
- `ai-docs/src/01_effect/04_resources/` — runnable lessons: `acquireRelease` inside a Layer, background tasks via `Layer.effectDiscard` + `forkScoped`, `LayerMap`
- `migration/scope.md` + `migration/v3-to-v4.md` — v3 → v4 renames (`Scope.extend` → `Scope.provide`, `Layer.scoped` → `Layer.effect`)

## Core Model

A `Scope` is a lifetime boundary. Acquiring a resource registers a cleanup effect (a *finalizer*) on the scope; closing the scope runs all registered finalizers with the `Exit` value that ended the work. `Scope` appears in an effect's requirements `R` like any other service:

```ts
// Acquiring puts Scope into R…
const acquireRelease: <A, E, R, R2>(
	acquire: Effect.Effect<A, E, R>,
	release: (a: A, exit: Exit.Exit<unknown, unknown>) => Effect.Effect<unknown, never, R2>,
	options?: { readonly interruptible?: boolean }
) => Effect.Effect<A, E, R | R2 | Scope.Scope>;

// …and eliminating Scope decides the resource's lifetime
const scoped: <A, E, R>(
	self: Effect.Effect<A, E, R>
) => Effect.Effect<A, E, Exclude<R, Scope.Scope>>;
```

`Scope.Scope` in `R` reads as: "this effect registers cleanup on whoever provides the scope." The provider decides how long the resource lives. The three providers, from most to least common:

1. **`Effect.scoped(effect)`** — lifetime is exactly this effect. A fresh scope opens before it runs and closes (running finalizers) when it exits, whether by success, failure, or interruption.
2. **`Layer.effect(Tag, effect)`** — lifetime is the layer. Finalizers run when the layer's scope closes, normally at application or `ManagedRuntime` shutdown. In v4 `Layer.effect` *is* the scoped constructor; `Layer.scoped` no longer exists.
3. **`Scope.provide(effect, scope)` / `Scope.use(effect, scope)`** — lifetime is caller-managed. `provide` injects a scope without closing it; `use` injects a `Closeable` and closes it when the effect exits.

`Scope` must be fully eliminated before the run boundary: `Effect.runPromise`/`runFork` require `Effect<A, E, never>`.

The `Scope` object itself:

```ts
interface Scope {
	readonly strategy: 'sequential' | 'parallel';
	state: State.Open | State.Closed | State.Empty;
}
interface Closeable extends Scope {} // can be passed to Scope.close
```

`Scope.Scope` is also the `Context` tag for the current scope, so `yield* Scope.Scope` and `yield* Effect.scope` both return it.

Imports used throughout this skill:

```ts
import { Effect, Exit, Layer, Scope, ScopedRef } from 'effect';
```

---

## 1. Acquiring Resources

### Effect.acquireRelease

The workhorse. Acquire a value; the release finalizer is registered on the current scope and is guaranteed to run when that scope closes. The finalizer receives the `Exit` the scope was closed with.

```ts
interface Conn {
	readonly query: (sql: string) => Effect.Effect<string>;
	readonly close: () => void;
}

declare const connect: Effect.Effect<Conn, ConnError>;

const connection = Effect.acquireRelease(
	connect,
	(conn, exit) =>
		Effect.sync(() => {
			console.log(Exit.isSuccess(exit) ? 'clean close' : 'close after failure');
			conn.close();
		})
);
// Effect<Conn, ConnError, Scope.Scope>

const program = Effect.scoped(
	Effect.gen(function* () {
		const conn = yield* connection;
		return yield* conn.query('SELECT 1');
	})
);
// Effect<string, ConnError> — Scope eliminated, conn closed on exit
```

Semantics to rely on:

- **Acquisition is uninterruptible by default.** Pass `{ interruptible: true }` as the third argument to allow the acquire effect to be interrupted (there is no separate `acquireReleaseInterruptible` in v4).
- **`release` cannot fail at the type level** — its error channel is `never`. Catch and convert errors inside the release effect.
- **The release's services (`R2`) are captured from the context at acquisition time**, so release can use services even though the scope may close in a different context.
- If acquisition fails, no finalizer is registered.

### Effect.acquireDisposable (v4-only)

For resources implementing the JS disposal protocols (`Symbol.dispose` / `Symbol.asyncDispose`) — no explicit release function needed:

```ts
import sqlite from 'node:sqlite';

const db = Effect.acquireDisposable(
	Effect.sync(() => new sqlite.DatabaseSync(':memory:'))
);
// Effect<DatabaseSync, never, Scope.Scope> — disposed when the scope closes
```

### Effect.acquireUseRelease

Bracketing without `Scope`: acquire, use, release in one effect. Use when the resource's lifetime is exactly one callback and you don't want `Scope` in `R` at all.

```ts
const result = Effect.acquireUseRelease(
	connect, // acquire (uninterruptible)
	(conn) => conn.query('SELECT * FROM users'), // use (interruptible)
	(conn, exit) => Effect.sync(() => conn.close()) // release (uninterruptible)
);
// Effect<string, ConnError> — no Scope requirement; a fallible release would add its error here (E3 in the signature)
```

- `release` receives the `Exit` of the **use** step (`Exit<A, E2>`), not of the whole program.
- Unlike `acquireRelease`, the release here *can* fail (`E3`), and a release failure fails the whole effect even when `use` succeeded. Catch inside release if that is not desired.
- Release runs as soon as `use` finishes — choose `acquireRelease` + `Scope` when the resource must outlive a single callback.

---

## 2. Finalizers

### Effect.addFinalizer — register cleanup on the current scope

When there is no acquired value, just cleanup to schedule. The callback receives the `Exit` used to close the scope:

```ts
const program = Effect.scoped(
	Effect.gen(function* () {
		yield* Effect.addFinalizer((exit) =>
			Effect.log(Exit.isSuccess(exit) ? 'completed' : 'failed or interrupted')
		);
		yield* Effect.log('working...');
	})
);
```

- Requires `Scope.Scope` in `R`; finalizer error channel is `never`.
- **The finalizer's services are captured at registration time** from the surrounding context.
- Registering on an already-closed scope runs the finalizer **immediately** with the stored exit (it is not silently dropped).

### onExit / ensuring / onError / onInterrupt — attach cleanup to one effect

These do **not** use `Scope`; they guard a single effect and run as soon as it settles:

```ts
// Run on every completion, observing the Exit
task.pipe(Effect.onExit((exit) => Effect.log(`done: ${exit._tag}`)));

// Run on every completion, ignoring the Exit (ensuring = onExit that ignores its input)
task.pipe(Effect.ensuring(Effect.log('always runs')));

// Run only on failure, observing the Cause
task.pipe(Effect.onError((cause) => Effect.log('failed')));

// Run only on interruption; receives the set of interrupting fiber ids
task.pipe(Effect.onInterrupt((interruptors) => Effect.log('interrupted')));
```

Selective variants: `Effect.onExitIf(self, predicate, f)`, `Effect.onExitFilter(self, filter, f)`, `Effect.onErrorIf(self, predicate, f)`, `Effect.onErrorFilter(self, filter, f)` (predicate/filter argument comes before the finalizer; all are dual).

Semantics:

- Finalizers attached with `onExit`/`ensuring` run in an **uninterruptible region** (unless you reach for the low-level `Effect.onExitPrimitive(self, f, interruptible)`, which also allows returning `undefined` to skip finalization).
- If the finalizer itself fails (`onExit`'s `f` may have an error channel `XE`), that failure replaces the original result. `Effect.ensuring`'s public signature forbids finalizer failure (`Effect<X, never, R1>`).
- These only fire if the effect **starts** executing.

Choosing between them:

| Need | Use |
|---|---|
| Cleanup tied to a resource value | `Effect.acquireRelease` |
| Cleanup tied to the surrounding scope's lifetime | `Effect.addFinalizer` |
| Cleanup tied to one effect's completion | `Effect.ensuring` / `Effect.onExit` |
| Bracket acquire/use/release with no `Scope` in `R` | `Effect.acquireUseRelease` |

---

## 3. Eliminating Scope

### Effect.scoped

Creates a fresh scope, runs the effect with it, closes the scope with the effect's `Exit`:

```ts
const safe = Effect.scoped(
	Effect.gen(function* () {
		const conn = yield* connection; // Effect<..., Scope.Scope>
		return yield* conn.query('SELECT 1');
	})
);
// Scope removed from R; finalizers run when the gen block exits
```

Implementation detail that matters: `Effect.scoped` adds the fresh scope to the fiber's context, **shadowing any outer scope** for everything inside — `Effect.scope`, `acquireRelease`, and `addFinalizer` inside the block all see the inner scope. The close runs in the effect's finalization (uninterruptible) region.

Place `Effect.scoped` as close to the use site as correctness allows: everything inside it holds the resource open.

### Effect.scopedWith

Like `scoped`, but hands you the scope explicitly instead of putting it in context. Useful when you want to register finalizers on the managed scope manually, or pass it to scope-accepting APIs without affecting the ambient `Scope` service:

```ts
const program = Effect.scopedWith((scope) =>
	Effect.gen(function* () {
		yield* Scope.addFinalizer(scope, Effect.log('closing'));
		yield* doWork;
	})
);
// Effect<A, E, R> — note: does NOT remove Scope from R, the scope is only the callback argument
```

### Scope.provide and Scope.use

When the caller owns a scope:

```ts
const manual = Effect.gen(function* () {
	const scope = yield* Scope.make(); // Effect<Scope.Closeable>

	// provide: inject the scope, do NOT close it — caller closes later
	const conn = yield* connection.pipe(Scope.provide(scope));
	// ... use conn across multiple steps/effects ...
	yield* Scope.close(scope, Exit.void);
});

// use: inject a Closeable AND close it when the effect exits (with the same Exit).
// Create the scope per execution — a scope baked into a shared const is closed
// after the first run, and a closed scope releases acquisitions immediately (mistake #8).
const once = Effect.suspend(() =>
	connection.pipe(
		Effect.flatMap((conn) => conn.query('SELECT 1')),
		Scope.use(Scope.makeUnsafe())
	)
);
```

Both are dual (data-first and data-last). `Scope.provide` was called `Scope.extend` in v3.

### Effect.scope

`Effect.scope: Effect<Scope, never, Scope>` returns the current scope from the context — it is exactly the `Scope.Scope` service access. Use it to capture an outer scope before entering a narrower one (see section 5).

---

## 4. Manual Scopes: make, close, finalizer ordering

```ts
const lifecycle = Effect.gen(function* () {
	const scope = yield* Scope.make(); // default strategy 'sequential'

	yield* Scope.addFinalizer(scope, Effect.log('cleanup 1'));
	yield* Scope.addFinalizer(scope, Effect.log('cleanup 2'));
	yield* Scope.addFinalizerExit(scope, (exit) =>
		Effect.log(`cleanup 3, closed with ${exit._tag}`)
	);

	yield* Scope.close(scope, Exit.void);
	// Output: cleanup 3, cleanup 2, cleanup 1  (reverse registration order)
});
```

Constructors and operations (all verified against `Scope.ts`):

| API | Signature | Notes |
|---|---|---|
| `Scope.make` | `(strategy?: 'sequential' \| 'parallel') => Effect<Closeable>` | default `'sequential'` |
| `Scope.makeUnsafe` | `(strategy?) => Closeable` | synchronous |
| `Scope.addFinalizer` | `(scope, finalizer: Effect<unknown>) => Effect<void>` | exit-blind |
| `Scope.addFinalizerExit` | `(scope, (exit) => Effect<unknown>) => Effect<void>` | exit-aware |
| `Scope.close` | `(scope, exit: Exit<A, E>) => Effect<void>` | idempotent |
| `Scope.closeUnsafe` | `(scope, exit) => Effect<void> \| undefined` | low-level; **you must run the returned effect** or finalizers are skipped |
| `Scope.fork` | `(scope, strategy?) => Effect<Closeable>` | child scope, see section 5 |
| `Scope.forkUnsafe` | `(scope, strategy?) => Closeable` | synchronous |
| `Scope.provide` / `Scope.use` | dual | see section 3 |

Close semantics (from `internal/effect.ts` `scopeCloseFinalizers`):

- Finalizers run in **reverse registration order** (LIFO).
- `'sequential'` (default): one at a time, each awaited. `'parallel'`: all started concurrently, then awaited together.
- **Every finalizer always runs** — a failing finalizer does not prevent the others. All failures are collected and combined into a single `Cause`; `Scope.close` then fails with that combined cause.
- Closing an already-closed scope is a no-op.
- The scope transitions to `Closed` *before* finalizers run, so finalizers registered from inside finalizers execute immediately.
- You can inspect `scope.state._tag` (`'Empty' | 'Open' | 'Closed'`) and `scope.strategy` directly.

Manual scopes are warranted when a resource's lifetime does not align with any effect's lexical extent — for example a connection cached between requests, a resource handed off to another fiber, or interop with non-Effect lifecycle callbacks (`Scope.makeUnsafe` + `Scope.closeUnsafe` from a `dispose()` method).

---

## 5. Extending and Splitting Lifetimes

### Acquire into an outer scope

Inside `Effect.scoped`, the ambient scope is the inner one. To make a resource outlive the block, capture the outer scope first and `Scope.provide` it:

```ts
const program = Effect.gen(function* () {
	const outer = yield* Effect.scope; // capture before entering the inner scope

	yield* Effect.scoped(
		Effect.gen(function* () {
			const shortLived = yield* connection; // closed when this block exits
			const longLived = yield* connection.pipe(Scope.provide(outer)); // survives the block
			// ...
		})
	);
});
```

### Child scopes with Scope.fork

`Scope.fork(parent)` creates a `Closeable` child registered with the parent:

- Closing the **parent** closes the child with the same `Exit`.
- Closing the **child** first detaches it from the parent (the parent no longer tracks it).
- Forking from an **already-closed** parent returns an already-closed child — finalizers added to it run immediately.

This is the splitting primitive: hand part of a lifetime to other code while keeping an upper bound.

```ts
// Hand a resource's lifetime to a background fiber, bounded by the parent scope
const handOff = Effect.gen(function* () {
	const parent = yield* Effect.scope;
	const child = yield* Scope.fork(parent);
	const resource = yield* connection.pipe(Scope.provide(child));
	yield* processInBackground(resource).pipe(
		Effect.onExit((exit) => Scope.close(child, exit)),
		Effect.forkIn(child)
	);
	// Worker finishes first: onExit closes `child`, releasing the resource.
	// Parent closes first: it closes `child`, releasing the resource AND
	// interrupting the worker — forkIn ties the fiber to the child scope.
	// (forkDetach would NOT be interrupted; it would keep running against
	// a released resource.)
});
```

Per-item scopes inside a long-running loop — do not let per-job resources pile up on the daemon's scope:

```ts
const worker = Effect.gen(function* () {
	while (true) {
		const job = yield* nextJob;
		// fresh lifetime per job; finalizers run when handleJob exits
		yield* Effect.scoped(handleJob(job));
	}
});
```

Layers use a similar mechanism internally: each layer builds inside its own scope whose closure is tied to its consumers' scopes via a refcounted finalizer (see section 6).

---

## 6. Layers Own Scopes

`Layer.effect` builds the service inside the **layer's scope**: any `acquireRelease`/`addFinalizer` performed during construction is released when the layer is torn down (app shutdown, `ManagedRuntime.disposeEffect`, test end). The `Scope` requirement is eliminated by the constructor itself:

```ts
import { Context } from 'effect';

class Db extends Context.Service<Db, {
	readonly query: (sql: string) => Effect.Effect<string>;
}>()('app/Db') {
	static readonly layer = Layer.effect(
		Db,
		Effect.gen(function* () {
			const conn = yield* Effect.acquireRelease(
				connect,
				(conn) => Effect.sync(() => conn.close())
			);
			return Db.of({ query: (sql) => conn.query(sql) });
		})
	);
	// Layer<Db, ConnError> — Scope consumed by the layer
}
```

Key facts (verified in `Layer.ts`):

- **v3 `Layer.scoped` and `Layer.scopedDiscard` are gone.** `Layer.effect` / `Layer.effectDiscard` already do `Exclude<R, Scope.Scope>` — there is nothing extra to call.
- `Layer.effect` is callable both ways: `Layer.effect(Tag, effect)` or curried `Layer.effect(Tag)(effect)`.
- `Layer.effectDiscard(effect)` runs construction side effects in the layer scope, providing no service — the canonical home for background tasks (see section 7).
- **Memoized layers refcount their scope.** Each layer builds once per `MemoMap` in its own scope; every consumer's scope registers a finalizer that decrements an observer count, and the layer's finalizers run only when the **last** consumer's scope closes. In v4 the `MemoMap` is shared across `Effect.provide` calls.
- `Layer.build(layer)` returns `Effect<Context<ROut>, E, RIn | Scope.Scope>` — the resources bind to the ambient scope. `Layer.buildWithScope(layer, scope)` uses an explicit one. `Layer.launch(layer)` builds the layer and sleeps forever inside `Effect.scoped` — for apps that *are* a layer.

Layer composition, `Layer.fresh`, and `provide` semantics are covered by the `effect-layer-design` skill; `ManagedRuntime` scope handling by the `effect-managed-runtime` skill.

---

## 7. Fibers and Scopes

Fibers can be bound to a scope: the fiber is interrupted when the scope closes. Two operators (details and supervision strategy live in the `effect-fiber` skill):

```ts
// Fork tied to the current scope (adds Scope to R)
const daemon = Effect.scoped(
	Effect.gen(function* () {
		const fiber = yield* heartbeat.pipe(Effect.forkScoped);
		// or start immediately rather than deferred:
		yield* heartbeat.pipe(Effect.forkScoped({ startImmediately: true }));
		yield* mainWork;
	}) // heartbeat interrupted when the scope closes
);

// Fork into an explicit scope
const inScope = Effect.gen(function* () {
	const scope = yield* Scope.make();
	const fiber = yield* Effect.forkIn(task, scope, { startImmediately: true });
	// ...
	yield* Scope.close(scope, Exit.void); // interrupts the fiber
});
```

Options for all fork variants: `{ startImmediately?: boolean, uninterruptible?: boolean | 'inherit' }`. Remember the v4 renames: `Effect.fork` → `Effect.forkChild`, `Effect.forkDaemon` → `Effect.forkDetach`.

The standard background-task-in-a-layer pattern combines both worlds — the layer scope bounds the fiber:

```ts
const Heartbeat = Layer.effectDiscard(
	Effect.gen(function* () {
		yield* Effect.gen(function* () {
			while (true) {
				yield* Effect.sleep('5 seconds');
				yield* Effect.logInfo('heartbeat');
			}
		}).pipe(
			Effect.onInterrupt(() => Effect.logInfo('heartbeat stopped: layer closed')),
			Effect.forkScoped
		);
	})
);
```

`FiberSet`/`FiberMap`/`FiberHandle` constructors also require `Scope.Scope` and interrupt their fibers on close — see the `effect-fiber` skill.

---

## 8. ScopedRef — a resource-backed mutable reference

`ScopedRef<A>` holds a current value together with the scope that owns it. Replacing the value acquires the replacement in a fresh scope and **releases the previous value's resources**. Ideal for rotating connections, refreshed clients, reloaded credentials.

```ts
// Initial value WITHOUT resources: make takes a THUNK (LazyArg), not a value
const ref = yield* ScopedRef.make(() => initialClient);
// Effect<ScopedRef<Client>, never, Scope.Scope>

// Initial value WITH resources: fromAcquire tracks acquisition in the ref's scope
const ref2 = yield* ScopedRef.fromAcquire(
	Effect.acquireRelease(connect, (conn) => Effect.sync(() => conn.close()))
);
// Effect<ScopedRef<Conn>, ConnError, Scope.Scope>

// Read
const conn = yield* ScopedRef.get(ref2); // Effect<Conn>
const now = ScopedRef.getUnsafe(ref2); // synchronous

// Replace: releases the old value's scope, acquires the new value
yield* ScopedRef.set(
	ref2,
	Effect.acquireRelease(connect, (conn) => Effect.sync(() => conn.close()))
);
// Effect<void, ConnError> — the acquire's Scope requirement is absorbed by the ref
```

Semantics (verified in `ScopedRef.ts` and its tests):

- Constructing requires `Scope.Scope`: when the *outer* scope closes, the currently-held value's scope is closed too.
- `set` is **synchronized** (internal semaphore — one replacement at a time) and **uninterruptible**.
- `set` closes the **old scope first**, then acquires. If acquisition fails, the new scope is closed with the failure, the error propagates, and the ref still holds the old — now already-released — value. Treat a failed `set` as "ref is stale; retry or tear down."
- `ScopedRef.set` is dual: `ref.pipe(ScopedRef.set(acquire))` also works.

For keyed collections of scoped resources, see `LayerMap` (`ai-docs/src/01_effect/04_resources/30_layer-map.ts`); for capacity-managed pools, see `Pool` (`packages/effect/src/Pool.ts` — `Pool.make` returns a scoped pool whose `Pool.get(pool)` is itself scoped per item). `ScopedCache` is covered by the `effect-cache` skill.

---

## 9. Scope-Aware Utilities

Small APIs that bind other lifetimes to the current scope:

```ts
// AbortSignal aborted when the scope closes — for fetch()-style cancellation
const signal = yield* Effect.abortSignal; // Effect<AbortSignal, never, Scope.Scope>

// Tracing span ended when the scope closes
const span = yield* Effect.makeSpanScoped('operation'); // Effect<Span, never, Scope.Scope>
yield* task.pipe(Effect.withSpanScoped('task')); // wraps, span ends at scope close

// Log annotations that last until the scope closes, then restore
yield* Effect.annotateLogsScoped({ requestId: 'req-123' });
```

Other modules lean on `Scope` the same way — recognize the signature `Effect<X, E, R | Scope>` as "lifetime managed by your scope":

- `FileSystem.open`, `makeTempDirectoryScoped`, `makeTempFileScoped` (see the `effect-filesystem` skill)
- `Stream.scoped` and `Stream.callback` resource handling (see the `effect-stream` skill)
- HTTP request and connection scopes (see the `effect-http-server` and `effect-http-client` skills)

In tests, `it.effect` from `@effect/vitest` wraps every test body in `Effect.scoped`, so `acquireRelease`/`addFinalizer` fixtures clean up per test with no extra wiring.

---

## Key Patterns

### File handle, bounded lifetime

```ts
import { Effect, FileSystem } from 'effect';
import { NodeFileSystem } from '@effect/platform-node';

const writeLog = (line: string) =>
	Effect.scoped(
		Effect.gen(function* () {
			const fs = yield* FileSystem.FileSystem;
			const file = yield* fs.open('/var/log/app.log', { flag: 'a' }); // Effect<File, PlatformError, Scope>
			yield* file.writeAll(new TextEncoder().encode(line + '\n'));
		})
	).pipe(Effect.provide(NodeFileSystem.layer));
// file closed on success, failure, or interruption
```

### Service layer owning ordered resources

Multiple acquisitions in one layer constructor release in LIFO order at layer teardown — dependents detach before what they depend on (the single-resource version is in section 6; layer architecture in the `effect-layer-design` skill):

```ts
import { Context, Effect, Layer } from 'effect';

interface PgPool {
	readonly query: (sql: string) => Effect.Effect<string>;
	readonly end: () => Promise<void>;
	readonly on: (event: 'error', cb: (err: unknown) => void) => void;
	readonly off: (event: 'error', cb: (err: unknown) => void) => void;
}
declare const createPool: Effect.Effect<PgPool, ConnError>;

class Pg extends Context.Service<Pg, {
	readonly query: (sql: string) => Effect.Effect<string>;
}>()('app/Pg') {
	static readonly layer = Layer.effect(
		Pg,
		Effect.gen(function* () {
			const pool = yield* Effect.acquireRelease(
				createPool,
				(pool) => Effect.promise(() => pool.end())
			);
			const onError = (err: unknown) => console.error('pg pool error', err);
			yield* Effect.acquireRelease(
				Effect.sync(() => pool.on('error', onError)),
				() => Effect.sync(() => pool.off('error', onError))
			);
			return Pg.of({ query: (sql) => pool.query(sql) });
		})
	);
}
// Layer teardown (LIFO): listener detached first, THEN pool.end() —
// nothing ever touches the pool after it has been destroyed.
```

### Event-listener registration

Pair register/unregister with `acquireRelease`; the listener lives as long as the scope:

```ts
const onResize = (handler: () => void) =>
	Effect.acquireRelease(
		Effect.sync(() => window.addEventListener('resize', handler)),
		() => Effect.sync(() => window.removeEventListener('resize', handler))
	);

// As a stream of events, use Stream.callback + acquireRelease inside
// (full treatment in the effect-stream skill)
```

### Test fixture with automatic teardown

```ts
import { Effect } from 'effect';
import { expect, it } from '@effect/vitest';

const testDb = Effect.acquireRelease(
	openTestDatabase, // create temp schema, seed data
	(db, exit) => db.drop // always dropped, even on assertion failure
);

it.effect('queries seeded data', () =>
	Effect.gen(function* () {
		const db = yield* testDb; // it.effect provides a per-test scope
		const rows = yield* db.query('SELECT count(*) FROM users');
		expect(rows).toBe(3);
	}));
```

### Rotating credentials with ScopedRef

```ts
const makeClient = (token: string) =>
	Effect.acquireRelease(
		Effect.sync(() => createClient(token)),
		(client) => Effect.sync(() => client.destroy())
	);

const program = Effect.scoped(
	Effect.gen(function* () {
		const token = yield* fetchToken;
		const clientRef = yield* ScopedRef.fromAcquire(makeClient(token));

		// refresh loop: each set destroys the previous client
		yield* Effect.gen(function* () {
			while (true) {
				yield* Effect.sleep('55 minutes');
				const fresh = yield* fetchToken;
				yield* ScopedRef.set(clientRef, makeClient(fresh));
			}
		}).pipe(Effect.forkScoped);

		yield* serveRequests(clientRef); // readers: ScopedRef.get(clientRef)
	})
);
```

### Caller-managed scope for non-Effect lifecycles

```ts
// Interop: an OO container with start/stop hooks owning Effect resources
class Plugin {
	private readonly scope = Scope.makeUnsafe();

	start() {
		return Effect.runPromise(
			startResources.pipe(Scope.provide(this.scope)) // register, don't close
		);
	}

	stop() {
		return Effect.runPromise(Scope.close(this.scope, Exit.void));
	}
}
```

---

## Common Mistakes

1. **`Scope.extend` does not exist in v4** — it was renamed `Scope.provide`. Same behavior (inject without closing), dual API: `Scope.provide(effect, scope)` or `effect.pipe(Scope.provide(scope))`.
2. **`Layer.scoped` / `Layer.scopedDiscard` do not exist in v4** — `Layer.effect` / `Layer.effectDiscard` already eliminate `Scope` from the construction effect. Writing `Layer.scoped(Tag, ...)` is a v3 habit that no longer compiles.
3. **Forgetting `Effect.scoped` and "fixing" the leftover `Scope` in `R` at the app root.** It compiles once some outer scope exists, but every resource then lives until *that* scope closes — a leak in long-running apps. Eliminate `Scope` at the narrowest correct boundary.
4. **Expecting `Effect.scoped` to accept a scope argument.** It always creates a fresh scope. To supply your own, use `Scope.use` (closes it) or `Scope.provide` (doesn't).
5. **Assuming `Scope.provide` closes the scope.** It only injects. Without a later `Scope.close`, finalizers never run. `Scope.use` is the inject-and-close variant.
6. **Looking for `Effect.acquireReleaseInterruptible`** — gone. Acquisition is uninterruptible by default; opt out with `Effect.acquireRelease(acquire, release, { interruptible: true })`.
7. **`ScopedRef.make` takes a thunk**: `ScopedRef.make(() => 0)`, not `ScopedRef.make(0)`. And use `fromAcquire` when the initial value acquires resources — `make` does not track acquisition.
8. **Assuming finalizers added to a closed scope are ignored.** `Scope.addFinalizer*` (and `Effect.addFinalizer` via it) runs the finalizer immediately with the scope's stored exit. The same applies to `Scope.fork` on a closed parent: the child is born closed.
9. **Relying on registration-order cleanup.** Finalizers run in *reverse* registration order (LIFO), sequentially by default. Parallel finalization is opt-in per scope: `Scope.make('parallel')` — there is no v3-style `Effect.parallelFinalizers` combinator in v4.
10. **Assuming one failing finalizer aborts the rest.** All finalizers run on close; their failures are combined into a single `Cause` that `Scope.close` fails with.
11. **Using `acquireUseRelease` and swallowing release errors unknowingly — or the opposite.** Its release *can* fail and a release failure fails the whole effect even after a successful `use`. Conversely `acquireRelease`'s release is typed `never` — convert errors inside it.
12. **Acquiring per-request resources in a `Layer.effect` constructor.** Layer finalizers run when the layer scope closes (shutdown), not per call. Acquire per-request resources inside the request handler under `Effect.scoped`, or fork a child scope per item (section 5).
13. **v3 fork names**: `Effect.fork` → `Effect.forkChild`, `Effect.forkDaemon` → `Effect.forkDetach`. `forkScoped`/`forkIn` keep their names and now accept `{ startImmediately?, uninterruptible? }`.
14. **Calling `Scope.closeUnsafe` and dropping the result.** It returns `Effect | undefined`; ignoring the returned effect skips every finalizer. Use `Scope.close` unless you are writing low-level machinery.
15. **Expecting interruption to skip cleanup.** Finalizers receive `Exit.failCause` with an interrupt cause and still run (uninterruptibly). Use exit-aware finalizers (`addFinalizer`, `acquireRelease`'s `(a, exit) =>`) to branch on success/failure/interrupt — don't split cleanup across `onError` + success paths.
16. **Splitting acquire and `Effect.addFinalizer` into separate yields.** Interruption between the two steps leaks the resource. `acquireRelease` wraps acquisition and finalizer registration in a single `uninterruptibleMask` precisely to close this window — use it whenever cleanup is tied to an acquired value.
