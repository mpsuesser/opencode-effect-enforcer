---
name: effect-fiber
description: Fork, supervise, and interrupt Effect fibers with Effect.forkChild/forkScoped/forkIn/forkDetach, Fiber join/await/interrupt, uninterruptible regions, and the FiberHandle/FiberMap/FiberSet supervision collections. Use when running background work, cancelling or restarting tasks, implementing latest-wins or keyed workers, bridging Effect into callback APIs, or debugging interruption and fiber lifetime issues.
---

You are an Effect TypeScript expert specializing in fiber lifecycle, interruption, and supervision with `Fiber`, `FiberHandle`, `FiberMap`, and `FiberSet`.

## Effect Source Reference

The Effect v4 source is available at `~/.cache/effect-v4/`.
Browse and read files there directly to look up APIs, types, and implementations.

Reference this for:

- `Fiber` interface and await/join/interrupt operations (`packages/effect/src/Fiber.ts`)
- Fork variants, interruption combinators, run\* APIs (`packages/effect/src/Effect.ts`)
- Single-slot supervision (`packages/effect/src/FiberHandle.ts`)
- Keyed fiber collections (`packages/effect/src/FiberMap.ts`)
- Grow-only fiber collections (`packages/effect/src/FiberSet.ts`)
- Runtime internals — `FiberImpl`, fork/interrupt mechanics (`packages/effect/src/internal/effect.ts`)
- v3 → v4 fork renames (`migration/forking.md`), keep-alive changes (`migration/fiber-keep-alive.md` — partially stale, see section 9)
- Real usage and edge cases (`packages/effect/test/FiberHandle.test.ts`, `FiberMap.test.ts`, `FiberSet.test.ts`)

## Core Model

A `Fiber<A, E = never>` is a handle to a lightweight, cooperatively scheduled execution of an `Effect` that may still be running or may have completed. It is the unit of concurrency in Effect. A fiber's outcome is an `Exit<A, E>` — success with `A`, or failure with a `Cause<E>` that can contain typed errors, defects, and interruptions.

```ts
import {
	Cause,
	Deferred,
	Effect,
	Exit,
	Fiber,
	FiberHandle,
	FiberMap,
	FiberSet,
	Schedule,
	Scope,
	Semaphore
} from 'effect';
```

Key facts to internalize:

- **Structured concurrency.** A fiber forked with `Effect.forkChild` is attached to its parent: when the parent fiber completes (success, failure, or interruption), all still-running children are interrupted before the parent's exit settles. `forkScoped`/`forkIn` tie the fiber's lifetime to a `Scope` instead; `forkDetach` produces a global fiber with no automatic lifetime.
- **Interruption is cooperative.** It is observed at effect boundaries; uninterruptible regions and finalizers run to completion first. Interrupting is itself an effect that waits for the target to fully settle.
- **Fiber ids are plain `number`s** in v4 (there is no composite `FiberId` type). Interruptors are recorded in the `Cause` as a `ReadonlySet<number>`.
- **`Exit` is an `Effect`.** You can `yield*` an `Exit` directly to propagate its result into the current fiber.
- Useful synchronous members on the fiber object: `fiber.id`, `fiber.pollUnsafe(): Exit<A, E> | undefined`, `fiber.addObserver(cb): () => void` (returns an unsubscribe function), `fiber.interruptUnsafe(fiberId?)`.

High-level concurrency combinators (`Effect.all`, `Effect.forEach`, `Effect.race*`) are covered by the effect-parallelization skill — prefer those when you just need concurrent results; reach for explicit fibers when you need lifecycle control.

---

## 1. Forking Fibers

The v3 names are gone: `Effect.fork` → `Effect.forkChild`, `Effect.forkDaemon` → `Effect.forkDetach` (`Effect.forkAll` and `Effect.forkWithErrorHandler` were removed). Four variants exist in v4, differing only in lifetime:

| Variant                        | Interrupted when…                            | Requirements    |
| ------------------------------ | -------------------------------------------- | --------------- |
| `Effect.forkChild`             | the parent fiber completes                   | `R`             |
| `Effect.forkScoped`            | the current `Scope` closes                   | `R \| Scope`    |
| `Effect.forkIn(effect, scope)` | the supplied `Scope` closes                  | `R`             |
| `Effect.forkDetach`            | never automatically (explicit interrupt only)| `R`             |

All four return `Effect<Fiber<A, E>, never, R>` — forking never fails — and all accept the same options object:

```ts
{
	readonly startImmediately?: boolean | undefined;
	readonly uninterruptible?: boolean | 'inherit' | undefined;
}
```

- `startImmediately: true` evaluates the fiber synchronously up to its first suspension. The default is a deferred start: the fiber is scheduled and begins on the next scheduler tick, after the parent yields.
- `uninterruptible: true` starts the fiber uninterruptible; `'inherit'` copies the parent's current interruptibility; default is interruptible.

```ts
const task = Effect.gen(function* () {
	yield* Effect.sleep('2 seconds');
	return 'result';
});

const program = Effect.gen(function* () {
	// data-first and data-last forms both work
	const fiber1 = yield* Effect.forkChild(task);
	const fiber2 = yield* task.pipe(Effect.forkChild);
	const fiber3 = yield* Effect.forkChild(task, { startImmediately: true });
	const fiber4 = yield* task.pipe(Effect.forkChild({ startImmediately: true }));

	const result = yield* Fiber.join(fiber1);
	return result;
});
```

Forking into a scope:

```ts
const scopedFork = Effect.scoped(
	Effect.gen(function* () {
		// tied to the enclosing scope
		const fiber = yield* Effect.forkScoped(task);

		// or fork into an explicit scope you manage
		const scope = yield* Effect.scope;
		const fiber2 = yield* Effect.forkIn(task, scope);

		yield* Effect.sleep('1 second');
		// both fibers are interrupted when the scope closes
	})
);
```

Detached fibers survive the parent — pair them with explicit interruption or `Fiber.runIn`:

```ts
const daemon = Effect.gen(function* () {
	const fiber = yield* Effect.forkDetach(pollForever);
	// attach a manually managed fiber to a scope after the fact:
	// the scope's close interrupts it (does not wait for it before registering)
	const scope = yield* Effect.scope;
	Fiber.runIn(fiber, scope);
});
```

### Lazy start gotcha

Because forked fibers start on the next tick by default, side effects have not happened immediately after the fork:

```ts
const program = Effect.gen(function* () {
	let started = false;
	const fiber = yield* Effect.forkChild(Effect.sync(() => (started = true)));
	// started === false here!
	yield* Effect.yieldNow; // let scheduled fibers run
	// started === true
});
```

Use `{ startImmediately: true }` when registration must happen before the parent proceeds (e.g. installing an `Effect.onInterrupt` handler or subscribing to a queue).

---

## 2. Joining, Awaiting, and Reading Exits

```ts
const program = Effect.gen(function* () {
	const fiber = yield* Effect.forkChild(compute);

	// join: flatten the fiber's result into the current fiber.
	// Failure (or interruption) of the fiber fails the current effect.
	const value = yield* Fiber.join(fiber);

	// await: NEVER fails — always succeeds with the Exit for inspection.
	const exit = yield* Fiber.await(fiber);

	if (Exit.isSuccess(exit)) {
		console.log(exit.value);
	} else if (Cause.hasInterrupts(exit.cause)) {
		// exit is already narrowed to Failure here, so .cause is accessible
		console.log('interrupted by', Cause.interruptors(exit.cause));
	} else {
		console.log('failed:', Cause.squash(exit.cause));
	}
});
```

Many fibers at once:

```ts
// every outcome as data, ordered like the input
const exits = yield* Fiber.awaitAll([fiberA, fiberB]);
// Array<Exit<A, E>>

// all success values; fails fast with the first failed fiber's Cause.
// NOTE: does NOT interrupt the remaining fibers — do that yourself.
const values = yield* Fiber.joinAll([fiberA, fiberB]);
```

Working with `Exit` values:

```ts
const summary = Exit.match(exit, {
	onSuccess: (value) => `ok: ${value}`,
	onFailure: (cause) => `failed: ${Cause.squash(cause)}`
});

Exit.getSuccess(exit); // Option<A>
Exit.getCause(exit); // Option<Cause<E>>
Exit.hasFails(exit); // has typed errors
Exit.hasDies(exit); // has defects
Exit.hasInterrupts(exit); // has interruptions
Cause.hasInterruptsOnly(cause); // ONLY interruptions (clean cancellation)
// the Exit.has* checks are TYPE GUARDS narrowing to Failure<A, E>; in an
// else-if chain test the cause instead (Cause.hasFails/hasDies/hasInterrupts
// return plain booleans) or the final else narrows `exit` to never

// Exit is itself an Effect: yielding it propagates success/failure
const value = yield* exit;
```

To capture the exit of an inline effect (no fiber needed) use `Effect.exit(effect)`, which returns `Effect<Exit<A, E>, never, R>`.

Synchronous inspection (outside or inside effects):

```ts
const exit = fiber.pollUnsafe(); // Exit<A, E> | undefined — undefined while running
const cancel = fiber.addObserver((exit) => console.log('done', exit));
cancel(); // unsubscribe
```

There is no `Fiber.poll` effect in v4 — `pollUnsafe` and `addObserver` are the low-level hooks. In tests, `fiber.pollUnsafe()` combined with `TestClock` from `effect/testing` is the standard way to assert "still running" vs "completed" (see the effect-concurrency-testing skill for the full idiom; effect-testing covers TestClock setup).

---

## 3. Interruption

```ts
// interrupt one fiber and WAIT for it to fully settle
// (finalizers + uninterruptible regions run to completion first)
yield* Fiber.interrupt(fiber); // Effect<void>

// interrupt many, wait for all of them to settle
yield* Fiber.interruptAll([fiber1, fiber2]);

// record a specific fiber id as the interruptor (diagnostics/tracing)
yield* Fiber.interruptAs(fiber, controllerFiber.id);
yield* Fiber.interruptAllAs([fiber1, fiber2], controllerFiber.id);

// interrupt the CURRENT fiber
yield* Effect.interrupt; // Effect<never>
```

Notes:

- `Fiber.interrupt` uses the current fiber's id as the interruptor. The id set ends up in the `Cause` and is what `Effect.onInterrupt` finalizers and `Cause.interruptors` see.
- Fire-and-forget cancellation from synchronous code: `fiber.interruptUnsafe()` — sends the signal without waiting.
- Self-interruption via `Effect.interrupt` produces an exit where `Cause.hasInterruptsOnly` is `true`; platform `runMain` runners map that to exit code 130 rather than an error.
- A constructed interrupted exit is available as `Exit.interrupt(fiberId?)`.

Current-fiber accessors:

```ts
const self = yield* Effect.fiber; // Effect<Fiber<unknown, unknown>>
const id = yield* Effect.fiberId; // Effect<number>
const eff = Effect.withFiber((fiber) => Effect.succeed(fiber.id)); // low-level constructor
const maybe = Fiber.getCurrent(); // sync: Fiber | undefined (undefined outside a fiber)
```

---

## 4. Uninterruptible Regions and Cleanup

```ts
Effect.uninterruptible(critical); // cannot be interrupted inside
Effect.interruptible(effect); // re-enable inside an uninterruptible region
```

Interruption inside an uninterruptible region is **deferred, not dropped**: the pending interruption fires the moment the region ends. The canonical acquire/use/release shape protects acquisition and cleanup while keeping the work cancellable:

```ts
const withConnection = Effect.uninterruptibleMask((restore) =>
	Effect.gen(function* () {
		const conn = yield* acquireConnection; // protected
		return yield* restore(useConnection(conn)).pipe(
			// cleanup runs on success, failure, AND interruption
			Effect.onExit(() => closeConnection(conn))
		);
	})
);
```

`Effect.interruptibleMask((restore) => ...)` is the inverse: the body is interruptible and `restore` re-applies the outer interruptibility.

Interruption-specific and general finalizers:

```ts
// runs ONLY when the effect is interrupted; receives interruptor fiber ids
const guarded = Effect.onInterrupt(longRunning, (interruptors) =>
	Effect.log(`interrupted by: ${[...interruptors].join(', ')}`)
);

// always runs (success / failure / interruption); finalizer cannot fail
const cleaned = Effect.ensuring(task, Effect.log('cleanup'));

// runs with the Exit — inspect how the effect ended
const observed = Effect.onExit(task, (exit) =>
	Effect.log(Exit.isSuccess(exit) ? 'ok' : 'failed/interrupted')
);

// runs only on failure, with the Cause
const onFail = Effect.onError(task, (cause) => Effect.log(Cause.squash(cause)));
```

Bridging interruption to `AbortSignal`-aware APIs:

```ts
const download = Effect.scoped(
	Effect.gen(function* () {
		// fresh AbortController per acquisition; aborted when the scope closes
		const signal = yield* Effect.abortSignal; // Effect<AbortSignal, never, Scope>
		// pass `signal` to fetch(), child processes, etc.
	})
);
```

---

## 5. Structured Concurrency Lifetimes

The most important v4 behavior: **when a fiber finishes its work, any children forked with `forkChild` that are still running are interrupted** before the parent's exit is reported. This makes fire-and-forget with `forkChild` a bug:

```ts
// WRONG — the child is interrupted as soon as the parent returns,
// likely before it even starts (lazy start!)
const wrong = Effect.gen(function* () {
	yield* Effect.forkChild(sendAuditLog(event));
	return 'done';
});
```

Correct options, by intent:

```ts
// 1. The work belongs to a longer-lived scope (service, request, app)
const scoped = Effect.gen(function* () {
	yield* Effect.forkScoped(sendAuditLog(event));
	return 'done';
}); // requires Scope — provided by Effect.scoped / a Layer scope

// 2. The parent should wait for children forked during the effect
const awaited = Effect.awaitAllChildren(
	Effect.gen(function* () {
		yield* Effect.forkChild(sendAuditLog(event));
		return 'done';
	})
); // completes only after the audit-log child completes

// 3. Truly detached background work (you own its shutdown)
const detached = Effect.gen(function* () {
	const fiber = yield* Effect.forkDetach(sendAuditLog(event));
	return 'done';
});
```

Whichever lifetime you pick, **a forked fiber's failure is observed by nobody unless you arrange it**: `join`/`await` the fiber, supervise it via `FiberHandle`/`FiberMap`/`FiberSet` `join`, or attach `Effect.catchCause`/`Effect.onError` plus logging inside the forked effect. v4 removed `Effect.forkWithErrorHandler`, and the runtime does not log unhandled fiber failures.

`Effect.awaitAllChildren` only waits for children forked while the wrapped effect runs — children that existed beforehand are not awaited.

`forkIn`/`forkScoped` register an interruption finalizer on the scope and remove it when the fiber completes on its own. Forking into an already-closed scope interrupts the new fiber immediately. The same applies to `Fiber.runIn(fiber, scope)`, which only registers the finalizer — it does not wait for the fiber.

Scope mechanics themselves — `Effect.scoped`, manual `Scope.make`/`close`, finalizer ordering — are covered by the effect-scope skill.

---

## 6. FiberHandle — Single-Slot Supervision

`FiberHandle<A, E>` manages **at most one fiber**. Running a new effect into it interrupts the previous fiber (latest wins); closing the owning scope interrupts the current fiber; completed fibers remove themselves.

```ts
const program = Effect.gen(function* () {
	// always pass type parameters — defaults are <unknown, unknown>
	const handle = yield* FiberHandle.make<string, MyError>();
	// Effect<FiberHandle<string, MyError>, never, Scope>

	// fork into the handle; interrupts whatever was there
	const fiber = yield* FiberHandle.run(handle, task);

	// keep the existing fiber; the NEW effect gets an already-interrupted fiber
	yield* FiberHandle.run(handle, otherTask, { onlyIfMissing: true });

	const current = FiberHandle.getUnsafe(handle); // Option<Fiber<string, MyError>>
	const current2 = yield* FiberHandle.get(handle); // Effect-wrapped version

	yield* FiberHandle.clear(handle); // interrupt current fiber, leave handle empty

	yield* FiberHandle.awaitEmpty(handle); // wait for the current fiber to complete
	yield* FiberHandle.join(handle); // see below
}).pipe(Effect.scoped);
```

`run` options: `{ onlyIfMissing?: boolean; propagateInterruption?: boolean }`. The type also accepts `startImmediately`, but it is a no-op — collection fibers are forked via `Effect.runForkWith` and always start synchronously (see "How collection fibers relate to the caller" in section 8).

### join vs awaitEmpty

- `FiberHandle.join(handle): Effect<void, E>` — fails with the **first managed-fiber failure**; succeeds (void) only when the handle's scope closes. It never resolves just because a fiber finished successfully. Use it as a supervision watchdog.
- `FiberHandle.awaitEmpty(handle): Effect<void, E>` — waits for the currently held fiber to complete.

### propagateInterruption

By default (`false`), interruption of a managed fiber — including by an external `Fiber.interrupt` — does **not** fail `join`. With `propagateInterruption: true`, external interruptions do fail `join`; interruptions performed internally by the collection itself (replacement, `clear`, scope close — recorded with internal fiber id `-1`) never do.

### Installing existing fibers

```ts
const fiber = Effect.runFork(task);
yield* FiberHandle.set(handle, fiber, { onlyIfMissing: true });
FiberHandle.setUnsafe(handle, fiber); // synchronous variant
```

### Runtime helpers — synchronous runners for callback code

`runtime` captures the current services and returns a **synchronous** function that forks effects into the handle:

```ts
const handle = yield* FiberHandle.make<void, never>();
const run = yield* FiberHandle.runtime(handle)<MyService>(); // note the curried <R>() call

// plain function — safe to call from event handlers
const fiber = run(taskNeedingMyService, { onlyIfMissing: false });

// Promise-returning runner for an existing handle (rejects with Cause.squash)
const runPromise = yield* FiberHandle.runtimePromise(handle)<MyService>();
```

Runner options: `{ signal?: AbortSignal; scheduler?: Scheduler; onlyIfMissing?: boolean; propagateInterruption?: boolean }`.

Shortcuts that create the handle and runner together (scoped):

```ts
const run = yield* FiberHandle.makeRuntime<never>(); // <R, E, A>
const runPromise = yield* FiberHandle.makeRuntimePromise(); // Promise-returning runner
const promise = runPromise(Effect.succeed('hello')); // rejects with Cause.squash on failure
```

### Closed-handle behavior

After the scope closes: `FiberHandle.run` **interrupts the calling fiber**; the captured `runtime`/`makeRuntime` runners instead return a shared, already-interrupted fiber. Fibers passed to `setUnsafe` on a closed handle are interrupted immediately.

---

## 7. FiberMap — Keyed Fibers

`FiberMap<K, A, E>` is a map of running fibers indexed by key. Running a new effect under an existing key interrupts the previous fiber for that key; entries remove themselves on completion; scope close interrupts everything.

```ts
const program = Effect.gen(function* () {
	const map = yield* FiberMap.make<string, void, JobError>();
	// Effect<FiberMap<string, void, JobError>, never, Scope>

	// fork under a key — replaces (interrupts) any previous "job-1" fiber
	const fiber = yield* FiberMap.run(map, 'job-1', runJob(1));

	// dedupe: keep the running fiber, new effect gets an interrupted fiber
	yield* FiberMap.run(map, 'job-1', runJob(1), { onlyIfMissing: true });

	yield* FiberMap.has(map, 'job-1'); // Effect<boolean> (hasUnsafe: sync)
	yield* FiberMap.get(map, 'job-1'); // Effect<Option<Fiber<void, JobError>>>
	yield* FiberMap.size(map); // Effect<number>

	yield* FiberMap.remove(map, 'job-1'); // interrupt + remove that key
	yield* FiberMap.clear(map); // interrupt every fiber

	// FiberMap is Iterable<[K, Fiber<A, E>]>
	for (const [key, fiber] of map) {
		console.log(key, fiber.id);
	}

	yield* FiberMap.awaitEmpty(map); // Effect<void, E> — wait until no fibers remain
	yield* FiberMap.join(map); // Effect<void, E> — fail on first fiber failure
}).pipe(Effect.scoped);
```

`run` options are the same as FiberHandle's: `{ onlyIfMissing?, propagateInterruption? }` (`startImmediately` is in the type but is a no-op here too). `set`/`setUnsafe` install existing fibers under a key with `{ onlyIfMissing?, propagateInterruption? }`.

Runtime helpers take the key as the first runner argument:

```ts
const run = yield* FiberMap.runtime(map)<MyService>();
run('job-2', taskNeedingMyService, { onlyIfMissing: true });
const runPromise = yield* FiberMap.runtimePromise(map)<MyService>(); // Promise runner, key-first

// or create map + runner at once (note generic order: <R, K>)
const run2 = yield* FiberMap.makeRuntime<never, string>();
const runPromise2 = yield* FiberMap.makeRuntimePromise<never, string>();
```

Closed-map behavior matches FiberHandle: `FiberMap.run` interrupts the caller; runtime runners return a pre-interrupted fiber.

---

## 8. FiberSet — Grow-Only Fiber Collections

`FiberSet<A, E>` tracks an unkeyed set of fibers. No replacement semantics — every `run`/`add` grows the set; completed fibers remove themselves; scope close interrupts all. Nothing limits admission: unbounded `run` calls on a production ingest path are a hazard — gate them with a `Semaphore` (see the bounded pattern under Key Patterns).

```ts
const program = Effect.gen(function* () {
	const set = yield* FiberSet.make<void, TaskError>();
	// Effect<FiberSet<void, TaskError>, never, Scope>

	const fiber = yield* FiberSet.run(set, handleRequest(req));
	yield* FiberSet.add(set, existingFiber); // track an already-forked fiber
	FiberSet.addUnsafe(set, anotherFiber); // synchronous variant

	yield* FiberSet.size(set); // Effect<number>
	yield* FiberSet.clear(set); // interrupt all members

	// FiberSet is Iterable<Fiber<A, E>>
	const exits = yield* Fiber.awaitAll(set);

	yield* FiberSet.awaitEmpty(set); // Effect<void> — graceful drain
	yield* FiberSet.join(set); // Effect<void, E> — fail on first fiber failure
}).pipe(Effect.scoped);
```

`run` options: `{ propagateInterruption? }` (no `onlyIfMissing` — there is no key; `startImmediately` is in the type but is a no-op). On a closed set, `FiberSet.run` returns an already-interrupted fiber (it does **not** interrupt the caller, unlike FiberHandle/FiberMap).

Runtime helpers mirror the others in shape, with one source quirk: the `FiberSet.runtime` runner's option type accepts `propagateInterruption` but never forwards it to the set (`addUnsafe` is called without options) — set it via `FiberSet.run`/`add` instead:

```ts
const run = yield* FiberSet.runtime(set)<MyService>();
run(taskNeedingMyService);
const runPromise = yield* FiberSet.runtimePromise(set)<MyService>(); // Promise runner for an existing set

const run2 = yield* FiberSet.makeRuntime(); // scoped set + runner
const runPromise2 = yield* FiberSet.makeRuntimePromise();
```

### How collection fibers relate to the caller

Fibers forked via `FiberHandle/FiberMap/FiberSet.run` (and the runtime runners) are created with `Effect.runForkWith(parent.context)` — they are **root fibers carrying the caller's services, not children of the calling fiber**. Consequences:

- They start executing **immediately and synchronously** up to their first suspension (no lazy start, unlike `Effect.forkChild`).
- The calling fiber's completion does not interrupt them — only key replacement, `remove`/`clear`, or the collection's scope close does.

---

## 9. Running Fibers at the Program Edge

`Effect.runFork` starts a root fiber synchronously (it evaluates until the first suspension before returning):

```ts
const fiber = Effect.runFork(program, {
	signal: abortController.signal, // interrupt the fiber when aborted
	scheduler: customScheduler, // optional Scheduler service
	uninterruptible: true, // start the fiber uninterruptible
	onFiberStart: (fiber) => console.log('started', fiber.id)
});

fiber.addObserver((exit) => console.log('done', exit));
Effect.runFork(Fiber.interrupt(fiber)); // interruption is itself an effect
```

All keys of `Effect.RunOptions` are optional: `{ signal?, scheduler?, uninterruptible?, onFiberStart? }`.

When the effect still needs services, pre-apply a `Context`:

```ts
const runWith = Effect.runForkWith(servicesContext); // <R> pre-applied
const fiber = runWith(effectNeedingServices, { signal });
```

This is exactly what the FiberHandle/Map/Set runtime helpers wrap for you — prefer those when the forked fibers need supervision.

### Keep-alive and runMain

In beta.80 there is **no per-fiber keep-alive in the core runtime** (it existed earlier in v4 but was removed — the `migration/fiber-keep-alive.md` doc predates the removal). A bare `Effect.runFork`/`Effect.runPromise` whose fiber is suspended on a pure Effect primitive (e.g. `Deferred.await`, `Effect.never`) does not by itself hold the Node.js process open.

`Runtime.makeRunMain`-based runners — `NodeRuntime.runMain` from `@effect/platform-node`, `BunRuntime.runMain`, etc. — install a long-interval timer that keeps the process alive until the main fiber completes, and additionally provide SIGINT/SIGTERM handling (interrupting the root fiber gracefully), exit-code mapping (interruption-only causes → 130), and error reporting. Always use `runMain` for long-lived program entry points:

```ts
import { NodeRuntime } from '@effect/platform-node';

NodeRuntime.runMain(program);
```

See the effect-managed-runtime skill for embedding Effect in existing applications.

---

## Key Patterns

### Latest-wins cancellation (FiberHandle + runtime)

Each new request interrupts the in-flight one — autocomplete, file watching, "restart preview on change":

```ts
const searchBox = Effect.gen(function* () {
	const handle = yield* FiberHandle.make<void, never>();
	const run = yield* FiberHandle.runtime(handle)<SearchApi>();

	input.addEventListener('input', () => {
		// synchronous call; interrupts the previous search automatically
		run(performSearch(input.value));
	});

	yield* Effect.never; // keep the scope open while the UI lives
}).pipe(Effect.scoped);
```

### Restart-on-crash worker with a supervision watchdog

`Effect.retry` restarts the worker with backoff; `FiberHandle.join` propagates a final, unrecovered failure to the supervisor:

```ts
const worker = consumeJobs.pipe(
	Effect.retry(Schedule.exponential('250 millis').pipe(Schedule.take(10)))
);

const supervisor = Effect.gen(function* () {
	const handle = yield* FiberHandle.make<never, JobError>();
	yield* FiberHandle.run(handle, worker);

	// blocks until the worker exhausts retries (fails) or the scope closes
	yield* FiberHandle.join(handle);
}).pipe(Effect.scoped);
```

### Keyed jobs with dedupe and per-key cancellation (FiberMap)

```ts
const downloads = Effect.gen(function* () {
	const map = yield* FiberMap.make<string, void, DownloadError>();

	const start = (url: string) =>
		// onlyIfMissing dedupes: a second start() for the same url is a no-op
		FiberMap.run(map, url, download(url), { onlyIfMissing: true });

	const cancel = (url: string) => FiberMap.remove(map, url);

	yield* start('https://example.com/a.bin');
	yield* start('https://example.com/a.bin'); // already running — skipped
	yield* cancel('https://example.com/a.bin');

	yield* FiberMap.awaitEmpty(map); // drain remaining downloads
}).pipe(Effect.scoped);
```

### Background task set with graceful drain (FiberSet)

```ts
const webhookProcessor = Effect.gen(function* () {
	const tasks = yield* FiberSet.make<void, WebhookError>();

	for (const event of events) {
		yield* FiberSet.run(tasks, handleWebhook(event));
	}

	// graceful shutdown: wait for in-flight tasks instead of interrupting them.
	// Drop this line to let the closing scope interrupt whatever is left.
	yield* FiberSet.awaitEmpty(tasks);
}).pipe(Effect.scoped);
```

To fail fast when any background task crashes, run the service's main loop against `FiberSet.join(tasks)` (it fails with the first non-interruption failure).

### Bounded background task set (FiberSet + Semaphore)

`FiberSet` never applies backpressure on its own. Bound admission by taking a semaphore permit before `run` and releasing it when the task fiber settles:

```ts
const boundedProcessor = Effect.gen(function* () {
	const tasks = yield* FiberSet.make<void, WebhookError>();
	const permits = yield* Semaphore.make(16); // at most 16 in flight

	for (const event of events) {
		yield* Semaphore.take(permits, 1); // waits while 16 tasks are in flight
		yield* FiberSet.run(
			tasks,
			handleWebhook(event).pipe(
				// runs on success, failure, AND interruption — permits never leak
				Effect.ensuring(Semaphore.release(permits, 1))
			)
		);
	}

	yield* FiberSet.awaitEmpty(tasks);
}).pipe(Effect.scoped);
```

See the effect-parallelization skill for `Semaphore` details (`withPermits`, `withPermitsIfAvailable`, `PartitionedSemaphore`).

### Bridging callback APIs into supervised fibers

```ts
const socketHandler = Effect.gen(function* () {
	const set = yield* FiberSet.make<void, never>();
	const run = yield* FiberSet.runtime(set)<MessageStore>();

	socket.on('message', (data) => {
		// every message handled on a tracked fiber;
		// all in-flight handlers are interrupted when the scope closes
		run(storeMessage(data));
	});

	yield* Effect.never;
}).pipe(Effect.scoped);
```

### Protected handoff between fibers (Deferred + interruption-safe cleanup)

```ts
const handoff = Effect.gen(function* () {
	const deferred = yield* Deferred.make<Result, WorkerError>();

	const producer = yield* Effect.forkScoped(
		produceResult.pipe(
			Effect.onExit((exit) => Deferred.done(deferred, exit)),
			Effect.onInterrupt(() => Effect.log('producer cancelled'))
		)
	);

	// consumer waits without caring which fiber produces
	return yield* Deferred.await(deferred);
});
```

---

## Common Mistakes

1. **`Effect.fork` / `Effect.forkDaemon` don't exist in v4** — they are `Effect.forkChild` and `Effect.forkDetach`. `Effect.forkAll` and `Effect.forkWithErrorHandler` were removed entirely.
2. **Fire-and-forget with `forkChild` silently dies** — children are interrupted when the parent fiber completes. Use `forkScoped`/`forkIn` for scope-tied work, `forkDetach` for detached work, or `Effect.awaitAllChildren` to wait.
3. **Asserting right after a fork** — forked fibers start on the next scheduler tick by default. `yield* Effect.yieldNow` first, or fork with `{ startImmediately: true }`.
4. **Expecting `Fiber.await` to fail** — it always succeeds with an `Exit`. Use `Fiber.join` to propagate the fiber's failure; use `Fiber.await` to inspect.
5. **Looking for `Fiber.poll`** — there is no effectful poll in v4. Use the synchronous `fiber.pollUnsafe()` (`Exit | undefined`) or `fiber.addObserver`.
6. **Assuming `Fiber.joinAll` cancels the rest on failure** — it fails fast but leaves the other fibers running. Follow up with `Fiber.interruptAll` if they should stop.
7. **Treating `Fiber.interrupt` as instant** — it waits for the target to fully settle, including finalizers and uninterruptible regions. For a non-blocking signal use `fiber.interruptUnsafe()`.
8. **Using `join` to wait for completion on FiberHandle/FiberMap/FiberSet** — `join` only resolves on a fiber failure or when the scope closes; successful fibers just leave the collection. Use `awaitEmpty` to wait for work to finish.
9. **Expecting external interruption to fail `join`** — by default it doesn't. Pass `{ propagateInterruption: true }` to `run`/`set`/`add`; the collection's own internal interruptions (replacement, `clear`, scope close) never fail `join` either way.
10. **Expecting `onlyIfMissing: true` to error when occupied** — it succeeds, returning a shared already-interrupted fiber while keeping the existing one. Check `Exit.hasInterrupts(yield* Fiber.await(fiber))` to detect the rejected start.
11. **Calling `run` on a closed collection** — `FiberHandle.run`/`FiberMap.run` interrupt the *calling* fiber; `FiberSet.run` and all `runtime()` runners return a pre-interrupted fiber instead. Neither throws.
12. **Assuming collection fibers are children of the caller** — they are root fibers created via `Effect.runForkWith` with the caller's context: they start immediately and survive the calling fiber; only the collection (scope close, replacement, remove/clear) interrupts them.
13. **Relying on `Effect.runFork`/`runPromise` to keep Node alive** — beta.80 removed the core fiber keep-alive; a fiber suspended on `Deferred.await`/`Effect.never` won't hold the process open. Use `NodeRuntime.runMain` (built on `Runtime.makeRunMain`).
14. **Letting interruption leak through acquire/release** — wrap the whole sequence in `Effect.uninterruptibleMask` and `restore` only the use phase; pending interruption is delivered as soon as the region ends, so cleanup still runs exactly once.
15. **Leaving collection type parameters off** — `FiberHandle.make()` defaults to `<unknown, unknown>`, making `join` surface `unknown` errors. Always pass them: `FiberHandle.make<A, E>()`, `FiberMap.make<K, A, E>()`, `FiberSet.make<A, E>()`.
16. **Using v3 `FiberId` types** — v4 fiber ids are plain `number`s; `Cause.interruptors(cause)` and `Effect.onInterrupt` finalizers give you `ReadonlySet<number>`.
17. **Assuming someone logs a background fiber's failure** — the v4 runtime has no unhandled-fiber-failure reporting and `Effect.forkWithErrorHandler` is gone. Unobserved failures vanish: `join`/`await` the fiber, watch the collection with `FiberHandle/FiberMap/FiberSet.join`, or build `Effect.catchCause`/`Effect.onError` + logging into the forked effect.
