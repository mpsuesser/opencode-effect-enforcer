---
name: effect-cache
description: Cache effectful lookups in memory with Cache and ScopedCache — capacity/LRU eviction, fixed or exit-aware TTL, deduplicated concurrent lookups, refresh/invalidation, and resource-owning entries with per-entry scopes. Use when memoizing effectful lookups by key, adding TTL caching to API or DB reads, deduplicating concurrent fetches of the same key, or caching values that own resources such as connections.
---

You are an Effect TypeScript expert specializing in in-memory caching with `Cache` and `ScopedCache`.

## Effect Source Reference

The Effect v4 source is available at `~/.cache/effect-v4/`.
Browse and read files there directly to look up APIs, types, and implementations.

Reference this for:

- `Cache` model, `make`/`makeWith`, and all combinators (`packages/effect/src/Cache.ts`)
- `ScopedCache` — the variant whose entries own a `Scope` (`packages/effect/src/ScopedCache.ts`)
- Precise behavioral semantics: LRU order, TTL, failure caching (`packages/effect/test/Cache.test.ts`)
- Finalizer timing on eviction/expiry/invalidation/close (`packages/effect/test/ScopedCache.test.ts`)
- Single-value memoization `Effect.cached*` (`packages/effect/src/Effect.ts`, category "caching")

## Core Model

A `Cache<Key, A, E, R>` is a mutable keyed store populated by an effectful `lookup` function. `Cache.get` returns the cached value on a hit and runs the lookup on a miss or expired entry. Both are exposed as **module functions** (`Cache.get(cache, key)`), not methods. Every function taking extra arguments is dual (`Cache.get(cache, key)` or `cache.pipe(Cache.get(key))`); the unary ones (`size`, `keys`, `values`, `entries`, `invalidateAll`) are piped bare: `cache.pipe(Cache.size)`.

```ts
import { Cache, Duration, Effect, Exit, Option, ScopedCache } from 'effect';
import { TestClock } from 'effect/testing';
```

```ts
interface Cache<Key, A, E = never, R = never> {
	readonly capacity: number;
	readonly lookup: (key: Key) => Effect.Effect<A, E, R>;
	readonly timeToLive: (exit: Exit.Exit<A, E>, key: Key) => Duration.Duration;
}
```

How to think about it:

- **Entries store the lookup `Exit`** — successes *and failures* are cached. A failed lookup keeps failing from cache until the entry expires, is invalidated, or is refreshed.
- **Concurrent `get`s of the same missing key share one lookup.** The first caller runs the lookup on its own fiber; the rest await the same `Deferred`.
- **Insertion-ordered map = LRU.** Reads move the entry to the back; when capacity is exceeded the oldest entries are evicted.
- **TTL is computed per entry** from the lookup `Exit` and the key, against the fiber's `Clock` — `TestClock` works. Expiry is lazy: entries are removed when next touched.
- **`ScopedCache`** is the same model where each entry additionally owns a `Scope`: resources acquired during the lookup live exactly as long as the entry is cached.

Choosing the right tool:

| Need | Use |
| --- | --- |
| Cache one value, no key | `Effect.cached` / `cachedWithTTL` / `cachedInvalidateWithTTL` (section 10) |
| Cache values by key | `Cache` |
| Cached value owns resources (connection, file handle, subprocess) | `ScopedCache` |
| Batch + deduplicate request-shaped fetches | see the effect-batching skill (`RequestResolver.withCache` / `asCache`) |
| Pool of N interchangeable resources checked out per use | `effect/Pool` (not keyed caching) |
| Scope/finalizer fundamentals | see the effect-scope skill |

---

## 1. Creating a Cache

### Cache.make — fixed TTL for every entry

```ts
const program = Effect.gen(function* () {
	const cache = yield* Cache.make({
		capacity: 500, // required; pass Infinity for unbounded
		lookup: (userId: number) => fetchUser(userId), // (key) => Effect<A, E, R>
		timeToLive: '15 minutes' // optional Duration.Input; default: never expires
	});

	const user = yield* Cache.get(cache, 42); // miss -> runs lookup, caches the Exit
	const again = yield* Cache.get(cache, 42); // hit -> no lookup
});
```

Options for `Cache.make`:

- `lookup: (key: Key) => Effect<A, E, R>` — required
- `capacity: number` — required; `Infinity` disables eviction
- `timeToLive?: Duration.Input` — a *value* (`'5 minutes'`, `Duration.minutes(5)`, millis number); default infinite
- `requireServicesAt?: 'lookup' | 'construction'` — where `R` is required (section 9)

`Cache.make` returns `Effect<Cache<Key, A, E>, never, R>` — by default the lookup's services are required (and captured) when the cache is constructed, and the cache itself has `R = never`.

Type parameters are `Cache<Key, A, E, R>` — value before error. Inference from `lookup` usually suffices; annotate explicitly as `Cache.make<string, number, string>({ ... })` when the error type needs pinning.

### Cache.makeWith — TTL computed from each lookup Exit and key

`Cache.makeWith` takes the **lookup as the first argument**, then options (no `lookup` key):

```ts
const cache = yield* Cache.makeWith(
	(key: string) => fetchConfig(key),
	{
		capacity: 100,
		timeToLive: (exit, key) => {
			if (Exit.isFailure(exit)) return '30 seconds'; // short negative caching
			return key.startsWith('static/') ? Duration.hours(12) : '5 minutes';
		}
	}
);
```

The `timeToLive` function runs once per lookup completion (and per `set`) and may return any `Duration.Input`. Return `Duration.infinity` for no expiry, `Duration.zero` to not cache that result.

### Key equality

Keys are compared with Effect's `Equal`/`Hash` traits (the backing store is a `MutableHashMap`). Primitives work as-is, and in v4 plain objects and arrays compare **structurally** — two separate `{ orgId: 'a', userId: 1 }` literals hit the same entry. The caveat: `Equal` caches comparison results per object pair and `Hash` caches per object, so a key object must not be mutated after first use. Prefer immutable `Data.Class` or `Schema.Class` instances for composite keys.

```ts
import { Data } from 'effect';

class UserKey extends Data.Class<{ orgId: string; userId: number }> {}

const cache = yield* Cache.make({
	capacity: 1000,
	lookup: (key: UserKey) => fetchOrgUser(key.orgId, key.userId)
});

yield* Cache.get(cache, new UserKey({ orgId: 'a', userId: 1 }));
yield* Cache.get(cache, new UserKey({ orgId: 'a', userId: 1 })); // hit — structural equality
```

---

## 2. Reading from a Cache

| Function | Returns | Runs lookup? | Pending entry? | Failed entry? | Touches LRU? |
| --- | --- | --- | --- | --- | --- |
| `Cache.get(cache, key)` | `Effect<A, E, R>` | on miss/expired | awaits it | fails with `E` | yes |
| `Cache.getOption(cache, key)` | `Effect<Option<A>, E>` | never | awaits it | fails with `E` | yes |
| `Cache.getSuccess(cache, key)` | `Effect<Option<A>>` | never | `Option.none()` | `Option.none()` | yes |
| `Cache.has(cache, key)` | `Effect<boolean>` | never | `true` | `true` | no |

```ts
const value = yield* Cache.get(cache, 'k'); // populate or hit
const opt = yield* Cache.getOption(cache, 'k'); // Option.some(v) | Option.none(); waits for in-flight lookups
const ok = yield* Cache.getSuccess(cache, 'k'); // only resolved successes; never fails
const exists = yield* Cache.has(cache, 'k'); // expired entries count as absent
```

Concurrent-lookup deduplication in action:

```ts
let lookups = 0;
const cache = yield* Cache.make({
	capacity: 10,
	lookup: (key: string) => Effect.sync(() => (lookups++, key.length))
});

const results = yield* Effect.all(
	[Cache.get(cache, 'hello'), Cache.get(cache, 'hello'), Cache.get(cache, 'hello')],
	{ concurrency: 'unbounded' }
);
// results: [5, 5, 5]; lookups === 1
```

---

## 3. Writing, Invalidating, Refreshing

### set — seed or overwrite without running the lookup

```ts
yield* Cache.set(cache, 'k', 42);
```

`set` stores a successful exit, applies the cache's TTL to it (`timeToLive(Exit.succeed(value), key)`), and enforces capacity. With a zero TTL the entry is removed rather than stored (`ScopedCache.set` instead stores an immediately-expired entry: the old entry's scope closes at once, but the dead entry counts toward `size` until next touched).

### invalidate / invalidateAll / invalidateWhen

```ts
yield* Cache.invalidate(cache, 'k'); // remove one key; no-op if absent
yield* Cache.invalidateAll(cache); // clear everything

// Conditional: removes only a *resolved successful* value matching the predicate.
// Returns false for missing, expired, failed, or non-matching entries.
const removed: boolean = yield* Cache.invalidateWhen(cache, 'k', (v) => v.stale);
```

### refresh — recompute now, serve stale meanwhile

```ts
const fresh = yield* Cache.refresh(cache, 'k');
```

- Always invokes the lookup, even for an unexpired entry, and resets the TTL from the new exit.
- For an **existing** key, the old entry keeps serving `get` callers until the new lookup completes — built-in stale-while-revalidate.
- For a **missing** key, a pending entry is inserted immediately; concurrent `get`s wait on it.
- Concurrent `refresh` calls are **not deduplicated** — each runs the lookup independently (only `get` dedups).

---

## 4. Capacity and LRU Eviction

- `capacity` is required. When an insert (miss in `get`, `set`, `refresh` of a new key) pushes the size above capacity, the **oldest** entries are removed until size equals capacity.
- "Oldest" is insertion/read order: `get`, `getOption`, and `getSuccess` move the entry to the back; `has` and `invalidateWhen` do not affect recency.
- The pending entry for an in-flight lookup is inserted *before* the lookup completes, so it counts toward capacity immediately.
- `capacity: Infinity` is supported and skips eviction entirely.

```ts
const cache = yield* Cache.make({ capacity: 3, lookup: (k: string) => Effect.succeed(k.length) });
yield* Cache.get(cache, 'a');
yield* Cache.get(cache, 'b');
yield* Cache.get(cache, 'c');
yield* Cache.get(cache, 'a'); // touch 'a' -> now 'b' is oldest
yield* Cache.get(cache, 'd'); // evicts 'b'
```

---

## 5. Time-to-Live Semantics

- The TTL function runs once when a lookup resolves (or on `set`), producing a per-entry absolute expiry timestamp from the fiber's `Clock`.
- Expiry is **lazy**: an expired entry stays in the map until some operation touches it (`get` re-runs the lookup; `has`/`getOption`/`keys`/`entries`/`values` treat-and-remove it as absent).
- `Duration.infinity` (the default) means no expiry. `Duration.zero` means the entry expires immediately — effectively "do not cache this result".
- `refresh` and re-`get`-after-expiry both restart the TTL clock; plain `get` hits do not extend it (no sliding expiration).

Per-key and per-result TTL via `makeWith`:

```ts
const cache = yield* Cache.makeWith(
	(key: string) => fetchPrice(key),
	{
		capacity: 1000,
		timeToLive: (exit, key) =>
			Exit.isSuccess(exit)
				? key.startsWith('crypto/') ? '5 seconds' : '1 minute'
				: Duration.zero // never cache failures
	}
);
```

TTL is fully `TestClock`-compatible:

```ts
yield* Cache.get(cache, 'k');
yield* TestClock.adjust('30 minutes');
// assert (yield* Cache.has(cache, 'k')) === true / false depending on TTL
```

---

## 6. Failed and Interrupted Lookups

**Failures are cached.** The stored `Exit` is replayed to every subsequent `get` without re-running the lookup, until the entry expires or is invalidated/refreshed. With the default infinite TTL, one transient error fails for that key forever:

```ts
// WRONG for fallible lookups: a single failure is cached indefinitely
const fragile = yield* Cache.make({ capacity: 100, lookup: fetchUser });

// CORRECT: bound failure lifetime (or use Duration.zero to not cache failures)
const robust = yield* Cache.makeWith(fetchUser, {
	capacity: 100,
	timeToLive: (exit) => (Exit.isSuccess(exit) ? '5 minutes' : '10 seconds')
});
```

**Interruption poisons entries the same way** (verified against beta.80): the lookup runs on the fiber of the caller that triggered the miss. If that fiber is interrupted mid-lookup, the entry's deferred completes with the interrupt exit — concurrent waiters fail with it, and with an infinite TTL later `get`s keep replaying the interrupt instead of retrying. The exit-aware TTL above also fixes this, because an interrupt is a non-success exit (`Exit.isSuccess(exit) === false`) and gets a zero/short TTL.

`getSuccess`, `values`, and `entries` skip failed entries; `getOption` and `get` propagate the cached error; `invalidateWhen` returns `false` for failed entries (the predicate only sees successes).

---

## 7. Inspection

```ts
const n = yield* Cache.size(cache); // number of stored entries — includes expired ones not yet touched
const ks = yield* Cache.keys(cache); // Iterable<Key>      — unexpired keys
const vs = yield* Cache.values(cache); // Iterable<A>        — resolved successful values only
const es = yield* Cache.entries(cache); // Iterable<[Key, A]> — resolved successful pairs only
```

- `size` is approximate: expired entries count until something touches them.
- `keys`/`values`/`entries` filter out expired entries and **remove them from the map as a side effect**; `values`/`entries` additionally skip failed and still-pending entries.
- `Cache` returns lazy `Iterable`s (materialize with `Array.from` before reuse); `ScopedCache` returns plain `Array`s (it must close expired entries' scopes eagerly).

---

## 8. ScopedCache — Entries That Own Resources

Use `ScopedCache` when the lookup acquires resources that must be released when the entry goes away. Each entry gets its own `Scope`; the lookup receives it in context, so `Effect.acquireRelease` works directly inside the lookup.

```ts
const program = Effect.gen(function* () {
	const cache = yield* ScopedCache.make({
		capacity: 20,
		lookup: (host: string) =>
			Effect.acquireRelease(connect(host), (conn) => conn.close),
		timeToLive: '10 minutes'
	});
	// ScopedCache.make: Effect<ScopedCache<string, Conn, ConnError>, never, Scope>

	const conn = yield* ScopedCache.get(cache, 'db.internal');
	// conn stays open while the entry is cached; repeated gets reuse it
}).pipe(Effect.scoped);
```

Key differences from `Cache`:

- **Construction requires a `Scope`** — the cache belongs to it. When that scope closes, the cache flips to `Closed`, and all remaining entry scopes are closed (in parallel, awaited).
- **`ScopedCache.makeWith` takes a single options object including `lookup`** — unlike `Cache.makeWith(lookup, options)`:

```ts
const cache = yield* ScopedCache.makeWith({
	capacity: 50,
	lookup: (region: string) => acquireClient(region),
	timeToLive: (exit, region) => (Exit.isSuccess(exit) ? '30 minutes' : Duration.zero)
});
```

- **Zero TTL does not remove the entry immediately** — unlike `Cache`, a `Duration.zero` TTL marks the entry expired but closes its scope only when next touched, so a failed lookup's resources linger and count toward `size`/capacity until then.
- **The lookup type is `(key: Key) => Effect<A, E, R | Scope>`** — the per-entry scope is provided by the cache.
- **`keys`/`values`/`entries` return `Array`s**, not lazy iterables.

### When entry finalizers run

The entry's scope is closed — releasing everything the lookup acquired — when the entry is:

1. **invalidated** (`invalidate`, matching `invalidateWhen`, `invalidateAll`),
2. **evicted** by capacity,
3. **expired and then touched** (`get` re-lookup, `has`, `getOption`, `getSuccess`, `keys`, `values`, `entries` all purge expired entries and close their scopes),
4. **replaced** (`set` over an existing key; `refresh` closes the old entry's scope after the new lookup completes),
5. **orphaned by cache close** (the owning scope closes).

```ts
const tracker: Array<string> = [];
const cache = yield* ScopedCache.make({
	capacity: 2,
	lookup: (key: string) =>
		Effect.acquireRelease(
			Effect.sync(() => (tracker.push(`open-${key}`), key)),
			() => Effect.sync(() => void tracker.push(`close-${key}`))
		)
});

yield* ScopedCache.get(cache, 'a');
yield* ScopedCache.get(cache, 'b');
yield* ScopedCache.get(cache, 'c'); // evicts 'a' -> tracker: open-a, open-b, close-a, open-c
yield* ScopedCache.invalidate(cache, 'b'); // -> close-b
```

### Closed-cache semantics

After the owning scope closes (`cache.state._tag === 'Closed'`): `get`, `getOption`, `getSuccess`, `has`, `set`, `invalidate`, `invalidateWhen`, `invalidateAll`, and `refresh` all **interrupt** the calling fiber (they do not fail with a typed error). `size` returns `0`; `keys`/`values`/`entries` return `[]`.

### Stale value hazard

A value obtained from `ScopedCache.get` is only guaranteed alive while its entry is cached. After invalidation/eviction/expiry-purge, its finalizers have run — do not stash the value beyond the entry's lifetime. If you need per-use checkout semantics, use `effect/Pool` instead.

The full method surface (`get`, `getOption`, `getSuccess`, `set`, `has`, `invalidate`, `invalidateWhen`, `invalidateAll`, `refresh`, `size`, `keys`, `values`, `entries`) mirrors `Cache`, including lookup deduplication, exit caching, LRU order (reads refresh recency; `has` doesn't), and stale-while-revalidate `refresh`.

---

## 9. Services in Lookups (requireServicesAt)

Lookups can use services. `requireServicesAt` controls *where* the type system demands them:

- **default (`'construction'` behavior)**: `Cache.make` itself requires `R`; services are captured when the cache is built, and the cache type is `Cache<Key, A, E, never>` — `get` needs nothing.
- **`'lookup'`**: `Cache.make` requires nothing; the cache is `Cache<Key, A, E, R>` and every `get`/`refresh` call site must supply `R`.

```ts
import { Context } from 'effect';

class Db extends Context.Service<Db, {
	readonly query: (sql: string) => Effect.Effect<string>;
}>()('Db') {}

// Default: Db is required (and captured) where the cache is constructed
const cacheA = yield* Cache.make({
	capacity: 100,
	lookup: (id: number) =>
		Effect.gen(function* () {
			const db = yield* Db;
			return yield* db.query(`select * from users where id = ${id}`);
		})
}); // Effect<Cache<number, string>, never, Db>

// 'lookup': construct anywhere; provide Db at each get
const cacheB = yield* Cache.make({
	capacity: 100,
	lookup: (id: number) => Effect.flatMap(Db, (db) => db.query(`...${id}`)),
	requireServicesAt: 'lookup'
}); // Effect<Cache<number, string, never, Db>>
const row = yield* Cache.get(cacheB, 1).pipe(Effect.provideService(Db, dbImpl));
```

At runtime the lookup always sees the construction-time context merged with the caller's context (the caller's services win on conflicts). Tracing is connected: the lookup runs on the calling fiber, so spans created inside the lookup are children of the caller's current span. Remember the lookup runs **once per miss** — only the first caller's context matters for a given entry.

The same option exists on `ScopedCache.make`/`makeWith`.

---

## 10. Single-Value Caching (Effect.cached*)

When there is no key, skip `Cache` entirely:

```ts
// Cache the first result forever. Note the nesting: Effect<Effect<A, E, R>> —
// yield* once to allocate the cache, then reuse the inner effect.
const cached = yield* Effect.cached(expensiveTask);
const a = yield* cached;
const b = yield* cached; // no recomputation

// With TTL
const cachedTtl = yield* Effect.cachedWithTTL(expensiveTask, '150 millis');

// With TTL + manual invalidation
const [cachedInv, invalidate] = yield* Effect.cachedInvalidateWithTTL(expensiveTask, '1 hour');
yield* cachedInv;
yield* invalidate; // next run recomputes
```

---

## Key Patterns

### Cached repository service via Layer

```ts
import { Cache, Context, Duration, Effect, Exit, Layer, Schema } from 'effect';

class User extends Schema.Class<User>('User')({
	id: Schema.Number,
	name: Schema.String
}) {}

class UserNotFound extends Schema.TaggedErrorClass<UserNotFound>()('UserNotFound', {
	id: Schema.Number
}) {}

declare const fetchUser: (id: number) => Effect.Effect<User, UserNotFound>;

class Users extends Context.Service<Users, {
	readonly byId: (id: number) => Effect.Effect<User, UserNotFound>;
	readonly updated: (user: User) => Effect.Effect<void>;
	readonly evict: (id: number) => Effect.Effect<void>;
}>()('app/Users') {
	static readonly layer = Layer.effect(
		Users,
		Effect.gen(function* () {
			const cache = yield* Cache.makeWith(
				(id: number) => fetchUser(id),
				{
					capacity: 10_000,
					timeToLive: (exit) => (Exit.isSuccess(exit) ? '5 minutes' : Duration.zero)
				}
			);
			return {
				byId: (id) => Cache.get(cache, id),
				updated: (user) => Cache.set(cache, user.id, user), // write-through
				evict: (id) => Cache.invalidate(cache, id)
			};
		})
	);
}
```

### ScopedCache of live connections, owned by a Layer

`Layer.effect` runs its construction effect in the layer's scope (`Scope` is excluded from the layer's requirements), so the cache — and every cached connection — lives exactly as long as the layer.

```ts
import { Context, Effect, Layer, ScopedCache } from 'effect';

declare const connect: (host: string) => Effect.Effect<Conn, ConnError>;

class Connections extends Context.Service<Connections, {
	readonly forHost: (host: string) => Effect.Effect<Conn, ConnError>;
	readonly drop: (host: string) => Effect.Effect<void>;
}>()('app/Connections') {
	static readonly layer = Layer.effect(
		Connections,
		Effect.gen(function* () {
			const cache = yield* ScopedCache.make({
				capacity: 20, // at most 20 open connections; LRU closes the rest
				lookup: (host: string) =>
					Effect.acquireRelease(connect(host), (conn) => conn.close),
				timeToLive: '10 minutes' // expired connections are closed on next touch
			});
			return {
				forHost: (host) => ScopedCache.get(cache, host),
				drop: (host) => ScopedCache.invalidate(cache, host) // closes the connection
			};
		})
	);
}
```

### Refresh-ahead (background revalidation)

`refresh` keeps serving the old value while the new lookup runs, so readers never block on revalidation:

```ts
import { Schedule } from 'effect';

declare const cache: Cache.Cache<string, AppConfig>;

const refreshLoop = Effect.gen(function* () {
	const keys = Array.from(yield* Cache.keys(cache));
	yield* Effect.forEach(keys, (key) => Effect.ignore(Cache.refresh(cache, key)), {
		concurrency: 4
	});
}).pipe(
	Effect.repeat(Schedule.spaced('30 seconds')),
	Effect.forkScoped // tie the refresher to the surrounding scope
);
```

### Negative caching with distinct failure TTL

```ts
const dns = yield* Cache.makeWith(
	(hostname: string) => resolveHost(hostname),
	{
		capacity: 5000,
		timeToLive: (exit) => (Exit.isSuccess(exit) ? '10 minutes' : '15 seconds')
	}
);
```

### Testing TTL and eviction with TestClock

```ts
import { assert, it } from '@effect/vitest';
import { TestClock } from 'effect/testing';

it.effect('expires entries after the TTL', () =>
	Effect.gen(function* () {
		const cache = yield* Cache.make({
			capacity: 10,
			lookup: (key: string) => Effect.succeed(key.length),
			timeToLive: '1 hour'
		});
		yield* Cache.get(cache, 'a');
		yield* TestClock.adjust('59 minutes');
		assert.isTrue(yield* Cache.has(cache, 'a'));
		yield* TestClock.adjust('2 minutes');
		assert.isFalse(yield* Cache.has(cache, 'a'));
	}));
```

---

## Common Mistakes

1. **v3 method calls don't exist** — `cache.get(key)`, `cache.contains(key)`, `cache.cacheStats` are gone. v4 uses dual module functions: `Cache.get(cache, key)` or `cache.pipe(Cache.get(key))`; `contains` is now `has`; there are no `cacheStats`/`entryStats`/`getEither`.
2. **v4 renames type parameters, it does not reorder them** — v3's `Cache<Key, Value, Error>` becomes `Cache<Key, A, E, R>`: same value-before-error order with a services parameter appended. Only the pre-v3 `@effect/io` era used `Cache<Key, Error, Value>`.
3. **`Cache.makeWith(lookup, options)` vs `ScopedCache.makeWith({ lookup, ...options })`** — `Cache.makeWith` takes the lookup as a separate first argument; `ScopedCache.makeWith` (and both `make`s) take one options object containing `lookup`.
4. **Failures are cached with the default infinite TTL** — one transient lookup error fails that key forever. Use `makeWith` with an exit-aware TTL (`Exit.isSuccess(exit) ? ttl : Duration.zero`).
5. **Interrupting the fiber that started a lookup poisons the entry** — the lookup runs on the first caller's fiber; if it is interrupted, the interrupt exit is cached and replayed to waiters and later `get`s. The exit-aware TTL in (4) also covers interrupts.
6. **`timeToLive` in `make` is a `Duration.Input` value, not a function** — the `(exit, key) => Duration.Input` form only exists on `makeWith`; passing a function to `make` won't compile.
7. **`refresh` is not deduplicated** — concurrent `refresh` calls each run the lookup; only `get` shares in-flight lookups. Serialize refreshes yourself if the lookup is expensive.
8. **Don't mutate key objects after first use** — plain objects compare structurally in v4 (equal-content literals do hit), but `Equal`/`Hash` cache their results per object, so a mutated key misbehaves silently. Prefer primitives or immutable `Data.Class`/`Schema.Class` keys.
9. **Don't `Effect.acquireRelease` inside a plain `Cache` lookup** — `Scope` leaks into `R` and finalizers attach to whatever outer scope is around, not to the entry: nothing is released on eviction/invalidation. Use `ScopedCache`, which provides a per-entry scope.
10. **ScopedCache values die with their entry** — after `invalidate`/eviction/expiry-purge the value's finalizers have run. Don't hold the value beyond the entry's lifetime; use `effect/Pool` for checkout semantics.
11. **Operations on a closed `ScopedCache` interrupt, they don't fail** — once the owning scope closes, `get`/`set`/`invalidate`/`refresh` interrupt the caller; there is no typed error to catch.
12. **`Cache.size` counts expired entries** — they linger until touched; `keys`/`values`/`entries` purge them as a side effect. Don't treat `size` as "number of valid entries".
13. **`Cache.keys`/`values`/`entries` return lazy `Iterable`s** — iteration performs the expiry purge; materialize with `Array.from` before iterating twice. (`ScopedCache` returns plain arrays.)
14. **`Effect.cached*` are double-wrapped** — `cached`/`cachedWithTTL` return `Effect<Effect<A, E, R>>`; `cachedInvalidateWithTTL` returns `Effect<[Effect<A, E, R>, Effect<void>]>`. `yield*` once to allocate the memo, then reuse the inner effect; re-running the outer effect creates a fresh, empty cache.
15. **`getOption` can still fail** — it awaits pending lookups and replays cached errors (`Effect<Option<A>, E>`). If you want a never-failing peek at resolved successes, use `getSuccess`.
