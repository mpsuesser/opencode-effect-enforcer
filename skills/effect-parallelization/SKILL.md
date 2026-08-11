---
name: effect-parallelization
description: Run Effect computations concurrently with Effect.all/forEach concurrency options, racing combinators (race, raceAll, raceFirst), and coordination primitives (Semaphore, PartitionedSemaphore, Latch). Use when fanning out work over a collection, limiting parallelism, racing alternatives for first-success, enforcing per-key or global rate limits, or gating fibers on a startup signal.
---

You are an Effect TypeScript expert specializing in declarative concurrency — `Effect.all`, `Effect.forEach`, racing, and the coordination primitives `Semaphore`, `PartitionedSemaphore`, and `Latch`.

## Effect Source Reference

The Effect v4 source is at `~/.cache/effect-v4/`. Read it directly when in doubt — Effect v4 differs substantially from v3 and from most training data.

Key files:

- `packages/effect/src/Effect.ts` — `all`, `forEach`, `race`/`raceAll`/`raceFirst`/`raceAllFirst`, `firstSuccessOf`, `timeout`/`timeoutOption`/`timeoutOrElse`, `zip`/`zipWith`, `filter`/`filterMap`/`filterMapEffect`, `partition`, `validate`, `findFirst`, `replicate`/`replicateEffect`, `withConcurrency` (very large file — grep for the export, then read its JSDoc)
- `packages/effect/src/Types.ts` — the `Concurrency` type (`number | "unbounded" | "inherit"`)
- `packages/effect/src/References.ts` — `CurrentConcurrency` reference read by `"inherit"`
- `packages/effect/src/Semaphore.ts` — counting semaphore: `make`, `withPermit(s)`, `withPermitsIfAvailable`, `take`/`release`/`releaseAll`, `resize`
- `packages/effect/src/PartitionedSemaphore.ts` — keyed permit pool with round-robin fairness across partitions
- `packages/effect/src/Latch.ts` — open/closed gate: `make`, `open`, `close`, `release`, `await`, `whenOpen`
- `packages/effect/src/internal/effect.ts` — the actual implementations (`forEachConcurrent`, `raceAll`, ...) when you need exact semantics
- `packages/effect/test/Effect.test.ts` — `forEach`/`all`/`partition`/`validate`/`raceAll` describe blocks with interruption edge cases
- `packages/effect/test/Semaphore.test.ts`, `test/PartitionedSemaphore.test.ts`, `test/Latch.test.ts` — real usage with `TestClock`
- `migration/v3-to-v4.md` — rename map (e.g. `Effect.makeSemaphore` → `Semaphore.make`)

## Core Model

Concurrency in Effect is declarative: combinators that operate on many effects take a `concurrency` option, fork child fibers internally, and uphold structured concurrency — when the combined effect finishes, fails, or is interrupted, every in-flight child fiber is interrupted before the result is produced.

```ts
// Types.Concurrency
type Concurrency = number | 'unbounded' | 'inherit';
```

| Value | Meaning |
| --- | --- |
| omitted | Sequential (concurrency 1). **This is the default.** |
| `n: number` | At most `n` effects run at once (values < 1 are clamped to 1) |
| `'unbounded'` | All effects start at once |
| `'inherit'` | Read `References.CurrentConcurrency` from context — **defaults to `'unbounded'`** unless overridden via `Effect.withConcurrency` |

The two central signatures:

```ts
// Combine a fixed structure of effects (tuple, array, iterable, or record)
Effect.all(arg, options?: {
	concurrency?: Concurrency;
	discard?: boolean;          // true => Effect<void>
	mode?: 'default' | 'result'; // 'result' => never fails, each slot is a Result<A, E>
});

// Apply an effectful function over an Iterable
Effect.forEach(elements, (a, index) => Effect<B, E, R>, options?: {
	concurrency?: Concurrency;
	discard?: boolean;
});
```

Imports used throughout this skill (all from the stable `effect` barrel):

```ts
import { Effect, Latch, PartitionedSemaphore, Result, Semaphore } from 'effect';
```

For manual fiber control (`Effect.forkChild`, `Fiber.join`, `FiberSet`, ...) see the `effect-fiber` skill. For pipelines over values produced over time, see the `effect-stream` skill.

---

## 1. The `concurrency` Option

Every collection combinator (`all`, `forEach`, `filter`, `partition`, `validate`, `replicateEffect`, `filterMapEffect`) accepts the same option. Without it, execution is **sequential**:

```ts
// Sequential — one at a time (the default!)
yield* Effect.forEach(ids, fetchUser);

// At most 8 in flight
yield* Effect.forEach(ids, fetchUser, { concurrency: 8 });

// All at once
yield* Effect.forEach(ids, fetchUser, { concurrency: 'unbounded' });
```

`'inherit'` defers the decision to the caller through the `CurrentConcurrency` context reference, which `Effect.withConcurrency` sets:

```ts
const job = Effect.forEach(ids, fetchUser, { concurrency: 'inherit' });

// Caller decides the limit
yield* job.pipe(Effect.withConcurrency(4));

// Without withConcurrency, CurrentConcurrency defaults to 'unbounded',
// so a bare `yield* job` runs everything at once.
```

`Effect.withConcurrency` accepts `number | 'unbounded'` and only affects combinators that opted into `'inherit'` — it does not cap operations that pass an explicit number or `'unbounded'`, and it does not parallelize operations that omitted the option.

### Failure semantics under concurrency

The default mode is fail-fast: on the first failure, in-flight siblings are interrupted, not-yet-started items are skipped, and the combined effect fails. If several concurrent effects fail before interruption lands, their failure reasons are merged into a single `Cause`. Results are always collected by input index, so success order matches input order regardless of completion order (exceptions: `filter` and `filterMapEffect`, see section 6).

---

## 2. `Effect.all` — Tuples, Arrays, Records, Iterables

The output shape follows the input shape, with types tracked precisely:

```ts
// Tuple — heterogeneous, result is a typed tuple
const [n, s] = yield* Effect.all([Effect.succeed(42), Effect.succeed('hi')]);
// [number, string]

// Record — results collected under the same keys
const page = yield* Effect.all(
	{
		user: fetchUser(id),
		posts: fetchPosts(id),
		ads: fetchAds()
	},
	{ concurrency: 'unbounded' }
);
// { user: User; posts: Post[]; ads: Ad[] }

// Any iterable (Array, Set, generator, ...) — result is an Array
const results = yield* Effect.all(new Set([eff1, eff2, eff3]));
```

### `discard: true` — run for effects only

```ts
yield* Effect.all([logA, logB, logC], { concurrency: 'unbounded', discard: true });
// Effect<void, E, R>
```

### `mode: 'result'` — run everything, never fail

Each slot becomes a `Result<A, E>` and the error channel becomes `never`. Every effect runs to completion (no fail-fast interruption):

```ts
const results = yield* Effect.all(
	[mightFail1, mightFail2, mightFail3],
	{ mode: 'result', concurrency: 'unbounded' }
);
// [Result<A1, E1>, Result<A2, E2>, Result<A3, E3>]

const successes = results.filter(Result.isSuccess).map((r) => r.success);
```

`mode: 'result'` works for records too — each value becomes a `Result`. The v3 modes `'either'` and `'validate'` no longer exist; `Result` replaced `Either` in v4, and validate-style accumulation lives in `Effect.validate` (section 6).

### Replication

```ts
// Array of n identical effects (not yet run) — feed to a combinator
const effects = Effect.replicate(pingServer, 5);
yield* Effect.all(effects, { concurrency: 'unbounded' });

// Run an effect n times with Effect.all semantics
const samples = yield* Effect.replicateEffect(measureLatency, 10, {
	concurrency: 'unbounded'
});
// Effect<Array<A>, E, R>; supports { discard: true } as well
```

---

## 3. `Effect.forEach` — Effectful Iteration

The workhorse for fan-out over a work list. The callback receives the element and its index:

```ts
const enriched = yield* Effect.forEach(
	orders,
	(order, index) => enrichOrder(order),
	{ concurrency: 8 }
);
// Array<EnrichedOrder> — in input order

// Side effects only
yield* Effect.forEach(events, publishEvent, {
	concurrency: 4,
	discard: true
});
```

Notes:

- Works on any `Iterable` — including strings (`Effect.forEach('abc', f)` iterates characters).
- Results are written by index: input order is preserved even with `concurrency: 'unbounded'`.
- Sequential mode (no option) stops at the first failure without starting later elements; concurrent mode interrupts in-flight siblings on failure.
- Interrupting the parent fiber interrupts all in-flight children; items beyond the concurrency window that were never forked simply never run.
- Concurrent `Effect.request` calls inside `forEach` trigger automatic batching — see the `effect-batching` skill.

For an unbounded or infinite source, do not collect into an array — use `Stream.fromIterable(...).pipe(Stream.mapEffect(f, { concurrency }))` instead (see the `effect-stream` skill).

---

## 4. Concurrent Zips

`Effect.zip` and `Effect.zipWith` combine exactly two effects. Their option key is `concurrent: boolean` — **not** `concurrency`:

```ts
// Sequential by default
const pair = yield* Effect.zip(task1, task2);
// [A, B]

// Run both at once
const pair2 = yield* Effect.zip(task1, task2, { concurrent: true });

const combined = yield* Effect.zipWith(
	fetchPrice,
	fetchQuantity,
	(price, qty) => price * qty,
	{ concurrent: true }
);
```

`{ concurrent: true }` is implemented as `Effect.all([self, that], { concurrency: 2 })`, so it inherits fail-fast semantics: if one side fails, the other is interrupted.

The v3 `Effect.zipRight`/`Effect.zipLeft` are renamed: use `Effect.andThen` / `Effect.tap`.

---

## 5. Racing

Four combinators, two axes: two effects vs. many, and first-*success* vs. first-*completion*:

| | First success wins | First completion wins (even failure) |
| --- | --- | --- |
| Two effects | `Effect.race(a, b)` | `Effect.raceFirst(a, b)` |
| Iterable | `Effect.raceAll(effects)` | `Effect.raceAllFirst(effects)` |

```ts
// First successful replica wins; losers are interrupted
const fastest = yield* Effect.raceAll(replicaUrls.map(queryReplica));

// First completion settles the race — a fast failure loses you the result
const settled = yield* Effect.raceFirst(primary, secondary);
```

Semantics (verified in `internal/effect.ts`):

- **Loser interruption is awaited**: when a winner settles, the remaining fibers are interrupted uninterruptibly and the race only resumes with the winning exit after those interruptions (including finalizers) complete.
- `race`/`raceAll`: early failures do not finish the race — the race keeps waiting until one effect succeeds or all have failed. If all fail, the failure reasons are collected into one combined `Cause`.
- `raceFirst`/`raceAllFirst`: the first fiber to settle (success *or* failure) decides the outcome.
- Effects are forked in iteration order; if an early effect completes synchronously, later effects may never start at all.
- All four accept an optional `onWinner` callback for observing the winning fiber:

```ts
Effect.raceAll(candidates, {
	onWinner: ({ fiber, index, parentFiber }) => {
		console.log(`candidate ${index} won`);
	}
});
```

### Sequential fallback: `firstSuccessOf`

`Effect.firstSuccessOf` is **not** a race — it tries effects one at a time, in order, returning the first success. Later effects never start if an earlier one succeeds. If all fail, it fails with the *last* error; an empty iterable is a defect.

```ts
const config = yield* Effect.firstSuccessOf([
	readFromEnv,
	readFromFile,
	Effect.succeed(defaultConfig)
]);
```

### Timeouts are races against the clock

`Effect.timeout(effect, '5 seconds')` (typed `Cause.TimeoutError` failure), `Effect.timeoutOption` (`Option.none` on timeout), and `Effect.timeoutOrElse` all interrupt the source effect when the timer wins — same structured guarantees as racing.

---

## 6. Concurrent Filtering, Partitioning, Validation

### `Effect.filter` — keep elements passing a predicate

Accepts a plain predicate/refinement, or an effectful predicate with a `concurrency` option:

```ts
// Sync predicate
const evens = yield* Effect.filter([1, 2, 3, 4], (n) => n % 2 === 0);

// Effectful predicate, concurrent
const reachable = yield* Effect.filter(
	hosts,
	(host) => pingHost(host),
	{ concurrency: 10 }
);
```

**Order caveat**: with `concurrency > 1`, `filter` and `filterMapEffect` collect kept values in *completion* order, not input order (they push on completion rather than writing by index).

### `Effect.filterMap` / `Effect.filterMapEffect` — filter + transform

These take a `Filter` (a function returning `Result.succeed(b)` to keep-and-transform or `Result.fail(x)` to skip). `filterMap` is synchronous; `filterMapEffect` is effectful with a `concurrency` option (note: its callback receives only the element, no index):

```ts
const strong = yield* Effect.filterMapEffect(
	candidates,
	(c) =>
		Effect.map(score(c), (s) =>
			s > 0.8 ? Result.succeed({ ...c, score: s }) : Result.fail(s)
		),
	{ concurrency: 4 }
);
// Array of kept, transformed values
```

### `Effect.partition` — split failures from successes, never fail

Runs every element (no short-circuit). Returns `[excluded, satisfying]` — failures first. Both arrays preserve input order:

```ts
const [failures, users] = yield* Effect.partition(
	userIds,
	(id) => fetchUser(id),
	{ concurrency: 8 }
);
// Effect<[excluded: Array<E>, satisfying: Array<User>], never, R>
```

### `Effect.validate` — accumulate all failures

Like `partition`, but fails with a `NonEmptyArray<E>` of every failure if at least one element failed; succeeds with all results otherwise. Supports `{ discard: true }`:

```ts
const validated = yield* Effect.validate(
	formFields,
	(field) => validateField(field),
	{ concurrency: 'unbounded' }
);
// Effect<Array<Valid>, NonEmptyArray<FieldError>, R>
```

### `Effect.findFirst` / `Effect.findFirstFilter` — sequential short-circuit search

```ts
const firstHealthy = yield* Effect.findFirst(servers, (s) => checkHealth(s));
// Effect<Option<Server>, E, R> — stops at the first match, always sequential
```

`findFirstFilter` is the transforming variant: the callback returns `Effect<Result<B, X>>` and the first `Result.succeed` short-circuits with `Option.some(b)`.

---

## 7. `Semaphore` — Bounded Access to Shared Resources

A counting semaphore from the `effect/Semaphore` module (exported from the `effect` barrel). Unlike a `concurrency` option — which bounds one call site — a semaphore bounds access *across* call sites and fibers.

```ts
const program = Effect.gen(function* () {
	const sem = yield* Semaphore.make(4); // 4 permits
	// or synchronously, outside Effect: Semaphore.makeUnsafe(4)

	yield* Effect.forEach(
		jobs,
		(job) => sem.withPermit(processJob(job)),
		{ concurrency: 'unbounded', discard: true }
	);
});
```

### Instance API

```ts
sem.withPermit(effect);            // acquire 1 permit, run, release on exit
sem.withPermits(2)(effect);        // weighted — note: curried!
sem.withPermitsIfAvailable(1)(effect); // Effect<Option<A>, E, R> — Option.none if permits unavailable, no waiting
sem.take(2);                       // Effect<number> — manual acquire (waits; see fairness note below); returns acquired count
sem.release(2);                    // Effect<number> — manual release; returns resulting free permits
sem.releaseAll;                    // Effect<number> — return every taken permit
sem.resize(8);                     // Effect<void> — change total permits in place
```

### Module-level duals

Every operation also exists as a module function, usable data-first or in pipes:

```ts
yield* Semaphore.withPermit(sem, criticalSection);
yield* Semaphore.withPermits(sem, 2, heavyTask);
yield* heavyTask.pipe(Semaphore.withPermits(sem, 2));
yield* Semaphore.withPermitsIfAvailable(sem, 1, optionalWork); // Option<A>
yield* Semaphore.resize(sem, 8);
```

Guarantees and gotchas (verified in source/tests):

- `withPermit*` releases permits on success, failure, *and* interruption — acquisition and release are wrapped in `uninterruptibleMask`.
- Pending `take`s are woken in arrival order, but a waiter requesting more permits than are currently free is skipped while later, smaller requests proceed — a `take(1)` can overtake a blocked `take(3)`. Strict FIFO holds only when all requests use the same permit count (e.g. `withPermit`).
- `take(n)`/`release(n)` are a low-level protocol: an unbalanced `release` inflates the permit count; an interrupted fiber between `take` and `release` leaks permits. Prefer `withPermits`.
- Requesting more permits than the total never completes (unless the semaphore is later `resize`d up).
- `resize` can shrink below the currently-taken count; existing holders keep their permits and new acquisitions wait until enough are released.
- `Semaphore.make(1)` is the idiomatic mutex for serializing access to mutable state.

---

## 8. `PartitionedSemaphore` — Keyed Fairness over a Shared Pool

A `PartitionedSemaphore<K>` shares one permit pool across many partition keys, but tracks waiters *per key* and distributes released permits across waiting partitions in **round-robin** order. Use it when independent groups (tenants, hosts, queues) compete for the same bounded resource and a busy group must not starve the others. A plain `Semaphore` serves its single arrival-order queue regardless of key; the partitioned variant interleaves: `p1, p2, p1, p2, ...`.

```ts
const program = Effect.gen(function* () {
	const sem = yield* PartitionedSemaphore.make<string>({ permits: 10 });

	const handle = (tenantId: string, req: Request) =>
		sem.withPermit(tenantId)(processRequest(req));

	// Weighted variant
	const handleBig = (tenantId: string, req: Request) =>
		sem.withPermits(tenantId, 3)(processBigRequest(req));
});
```

### API surface

```ts
PartitionedSemaphore.make<K>({ permits: number });   // Effect<PartitionedSemaphore<K>>
PartitionedSemaphore.makeUnsafe<K>({ permits });     // synchronous

sem.withPermit(key)(effect);          // 1 permit for this key
sem.withPermits(key, n)(effect);      // n permits — curried, like Semaphore
sem.withPermitsIfAvailable(n)(effect); // NOT keyed — Option<A>, no waiting
sem.take(key, n);                     // Effect<void> — manual, keyed
sem.release(n);                       // Effect<number> — manual, not keyed
sem.available;                        // Effect<number> — free permits (snapshot)
sem.capacity;                         // number — fixed total

// Module-level duals exist for all of the above:
yield* PartitionedSemaphore.withPermits(sem, 'tenant-a', 2, task);
yield* task.pipe(PartitionedSemaphore.withPermit(sem, 'tenant-a'));
```

Gotchas (verified in source/tests):

- **Requesting more permits than `capacity` never completes** — the take resolves to `Effect.never`, silently hanging the fiber.
- Zero or negative permit requests run the effect immediately without acquiring anything.
- Non-finite `permits` (e.g. `Infinity`) creates an unbounded semaphore where every operation is a no-op pass-through; negative capacities are clamped to 0.
- Interruption while waiting returns any partially-acquired permits to the pool — no leaks.
- `withPermitsIfAvailable` takes no key: it only checks the shared pool.

---

## 9. `Latch` — Gating Fibers on a Signal

A `Latch` is a reusable open/closed gate. Closed: `await` and `whenOpen` suspend. Open: they pass through immediately. Unlike `Deferred` (one-shot, carries a value — see the `effect-fiber` skill), a latch is value-less and can be closed and reopened any number of times.

```ts
const program = Effect.gen(function* () {
	const ready = yield* Latch.make(); // starts CLOSED; Latch.make(true) starts open
	// or synchronously: Latch.makeUnsafe(false)

	// Workers block until the latch opens
	const worker = (id: number) =>
		Effect.gen(function* () {
			yield* ready.await; // suspends while closed
			yield* Effect.log(`worker ${id} running`);
		});

	const fibers = yield* Effect.forEach([1, 2, 3], (id) =>
		Effect.forkChild(worker(id))
	);

	yield* loadConfiguration;
	yield* ready.open; // releases all current AND future waiters
});
```

### Operations

```ts
latch.await;            // Effect<void> — suspend until open (or released)
latch.open;             // Effect<boolean> — open; wake current + future waiters; true if state changed
latch.close;            // Effect<boolean> — future waiters suspend again; true if state changed
latch.release;          // Effect<boolean> — wake CURRENT waiters only; latch stays closed
latch.whenOpen(effect); // run effect once the latch allows passage
latch.openUnsafe();     // synchronous variants for non-Effect code
latch.closeUnsafe();

// Module-level equivalents
yield* Latch.open(latch);
yield* Latch.await(latch);
yield* Latch.whenOpen(latch, effect);
```

`open` vs `release`: `open` flips the state so all future `await`s pass immediately; `release` is a one-shot pulse — current waiters proceed, the latch remains closed, and the next waiter suspends again. Use close/open pairs to implement pause/resume:

```ts
const running = yield* Latch.make(true); // open = running

// In a polling loop:
const step = running.whenOpen(pollOnce);

// Elsewhere: pause and resume
yield* running.close;
yield* running.open;
```

---

## 10. Structured Concurrency Guarantees

All combinators in this skill uphold the same invariants:

1. **No leaked fibers**: children forked by `all`/`forEach`/`race*`/`zip { concurrent: true }` cannot outlive the combinator. Completion, failure, or interruption of the parent interrupts all in-flight children first.
2. **Fail-fast with cleanup**: in default mode, the first failure interrupts siblings; their finalizers (`Effect.ensuring`, `acquireRelease` releases) run before the combined effect settles.
3. **Interruption propagates**: interrupting the fiber running `Effect.forEach(..., { concurrency: 8 })` interrupts the 8 in-flight workers and skips the rest.
4. **Deterministic results**: `all`/`forEach`/`partition`/`validate` order results by input index regardless of completion order.

When you need to *escape* structure — background fibers, daemons, fiber handles — that is `Effect.forkChild` / `forkScoped` / `forkDetach` territory: see the `effect-fiber` skill. To test concurrent code deterministically with `TestClock`, see the `effect-concurrency-testing` skill.

---

## Key Patterns

### Bounded fan-out with error partitioning

Process a work list with a concurrency cap; collect failures without aborting the batch:

```ts
import { Effect } from 'effect';

const syncAllUsers = (userIds: ReadonlyArray<string>) =>
	Effect.gen(function* () {
		const [failures, synced] = yield* Effect.partition(
			userIds,
			(id) => syncUser(id),
			{ concurrency: 8 }
		);
		if (failures.length > 0) {
			yield* Effect.log(`${failures.length} of ${userIds.length} failed`);
		}
		return synced;
	});
```

### First-success-wins with sequential fallback

Race the fast replicas concurrently; only if all of them fail, try the expensive cold standby:

```ts
const fetchQuote = Effect.firstSuccessOf([
	Effect.raceAll(replicaUrls.map((url) => queryReplica(url))),
	queryColdStandby
]);
```

### Hedged requests

Start a backup request only if the primary has not answered within 200ms; whichever succeeds first wins and the loser is interrupted:

```ts
const hedged = Effect.race(
	queryPrimary,
	Effect.delay(queryBackup, '200 millis')
);
```

### Global rate limit shared across call sites

A `concurrency` option only bounds one combinator call. To bound a resource globally (DB pool, external API), put a semaphore in the service and wrap every operation:

```ts
import { Context, Effect, Layer, Semaphore } from 'effect';

class GeoApi extends Context.Service<
	GeoApi,
	{ geocode(address: string): Effect.Effect<Coords, GeoError> }
>()('app/GeoApi') {
	static readonly layer = Layer.effect(
		GeoApi,
		Effect.gen(function* () {
			const sem = yield* Semaphore.make(5); // provider allows 5 in-flight
			const geocode = (address: string) =>
				sem.withPermit(callProvider(address));
			return { geocode } as const;
		})
	);
}

// Callers can use any concurrency they like — at most 5 hit the provider
const geocodeMany = (addresses: ReadonlyArray<string>) =>
	Effect.gen(function* () {
		const { geocode } = yield* GeoApi;
		return yield* Effect.forEach(addresses, geocode, {
			concurrency: 'unbounded'
		});
	});
```

### Per-tenant concurrency with cross-tenant fairness

```ts
import { Effect, PartitionedSemaphore } from 'effect';

const makeIngestor = Effect.gen(function* () {
	// 16 workers total, shared by all tenants; released permits rotate
	// round-robin across tenants with queued work
	const sem = yield* PartitionedSemaphore.make<string>({ permits: 16 });

	const ingest = (tenantId: string, batch: ReadonlyArray<Event>) =>
		sem.withPermit(tenantId)(writeBatch(tenantId, batch));

	return { ingest } as const;
});
```

### Coordinated startup with a latch

Fork workers eagerly, but hold them at a gate until initialization completes:

```ts
import { Effect, Latch } from 'effect';

const main = Effect.gen(function* () {
	const ready = yield* Latch.make(); // closed

	yield* Effect.forEach(
		queueNames,
		(name) => Effect.forkChild(ready.whenOpen(consumeQueue(name))),
		{ discard: true }
	);

	yield* runMigrations;
	yield* warmCaches;
	yield* ready.open; // all consumers start together
});
```

### Throttled batch processing

Combine chunking with bounded concurrency — at most 4 batches in flight, each batch written atomically:

```ts
import { Array as Arr, Effect } from 'effect';

const writeAll = (rows: ReadonlyArray<Row>) =>
	Effect.forEach(
		Arr.chunksOf(rows, 100),
		(batch) => insertBatch(batch),
		{ concurrency: 4, discard: true }
	);
```

### Validate everything, report every error

```ts
const checkConfig = (entries: ReadonlyArray<Entry>) =>
	Effect.validate(entries, validateEntry, { concurrency: 'unbounded' }).pipe(
		Effect.mapError((errors) => new ConfigInvalid({ errors }))
	);
```

---

## Common Mistakes

1. **Assuming `Effect.all` / `Effect.forEach` are parallel by default** — they are sequential. Pass `{ concurrency: n | 'unbounded' }` explicitly; without it you also silently lose request batching (see effect-batching).
2. **Treating `'inherit'` as "same as omitted"** — `'inherit'` reads `CurrentConcurrency`, which defaults to `'unbounded'`. Omitted means 1. They are opposites unless `Effect.withConcurrency` is set.
3. **Wrong option key on zips** — `Effect.zip`/`zipWith` take `{ concurrent: true }` (boolean), not `{ concurrency: ... }`.
4. **v3 `mode: 'either'` / `mode: 'validate'` on `Effect.all`** — gone. v4 has `mode: 'result'` (slots become `Result<A, E>`); for accumulate-all-failures use `Effect.validate`, which fails with `NonEmptyArray<E>`.
5. **`Effect.makeSemaphore` / `Effect.makeLatch` no longer exist** — they moved to their own modules: `Semaphore.make(n)`, `Latch.make(open?)`, both importable from `'effect'`.
6. **Expecting `firstSuccessOf` to race** — it is strictly sequential (and fails with only the *last* error). For concurrent first-success with loser interruption, use `Effect.raceAll`.
7. **Confusing `race` with `raceFirst`** — `race`/`raceAll` ignore failures until something succeeds (or everything fails); `raceFirst`/`raceAllFirst` settle on the first completion, so a fast failure wins the race and fails the whole thing.
8. **Relying on output order from concurrent `Effect.filter`/`filterMapEffect`** — they collect in completion order. `forEach`, `all`, `partition`, and `validate` preserve input order; the filters do not.
9. **Calling `sem.withPermits(2, effect)` on the instance** — instance `withPermits(n)` is curried: `sem.withPermits(2)(effect)`. Only the module-level `Semaphore.withPermits(sem, 2, effect)` takes the effect as a third argument. Same for `PartitionedSemaphore`.
10. **Manual `take`/`release` instead of `withPermits`** — an interrupt between `take` and `release` leaks permits and an extra `release` inflates the pool. `withPermit(s)` is interruption-safe.
11. **Requesting more permits than capacity** — on `PartitionedSemaphore` this resolves to `Effect.never` (silent hang); on `Semaphore` it waits forever unless someone calls `resize`. Validate weights against capacity.
12. **Using `latch.release` to open a latch** — `release` only wakes the *current* waiters and leaves the latch closed; the next `await` suspends again. Use `latch.open` to let future waiters through.
13. **Hand-rolling `Promise.allSettled` semantics** — don't wrap exits manually; `Effect.all(..., { mode: 'result' })` or `Effect.partition` already run everything and surface per-item outcomes.
14. **Using v3 fork names (`Effect.fork`, `forkDaemon`)** — see the effect-fiber skill for the v4 equivalents.
15. **Fanning out an unbounded source through `forEach`** — `forEach` materializes the iterable into an array under concurrency. For large or infinite inputs use `Stream.mapEffect(f, { concurrency })` (effect-stream skill) to keep backpressure.
