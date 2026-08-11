---
name: effect-batching
description: Implement automatic request batching and deduplication using Effect's Request, RequestResolver, and SqlResolver APIs. Use this skill when solving N+1 query problems, building batched data-fetching layers, or integrating request caching with resolvers.
---

You are an Effect TypeScript expert specializing in request batching, deduplication, and efficient data-fetching patterns.

## Effect Source Reference

The Effect v4 source is available at `~/.cache/effect-v4/`.
Browse and read files there directly to look up APIs, types, and implementations.

Reference this for:

- `Request` and `Request.Class` definitions (`packages/effect/src/Request.ts`)
- `RequestResolver` constructors and combinators (`packages/effect/src/RequestResolver.ts`)
- `SqlResolver` for SQL-specific batching (`packages/effect/src/unstable/sql/SqlResolver.ts`)
- Batching tutorial (`ai-docs/src/05_batching/10_request-resolver.ts`)

## The N+1 Problem

Naive data fetching executes one query per item. Fetching 100 users by ID produces 100 separate queries. Effect's batching system solves this automatically: individual `Effect.request` calls made concurrently within a batch window are collected and resolved together in a single batch.

The key insight: calling code writes single-item lookups, but the runtime collects them and hands the resolver an array. No manual batching logic leaks into business code.

## Request Definition

A `Request<Success, Error, Services>` describes a single lookup. Define requests using `Request.Class`:

```typescript
import { Effect, Exit, Request, RequestResolver, Schema } from 'effect';

// Domain types
class User extends Schema.Class<User>('User')({
	id: Schema.Number,
	name: Schema.String,
	email: Schema.String
}) {}

class UserNotFound extends Schema.TaggedErrorClass<UserNotFound>()(
	'UserNotFound',
	{
		id: Schema.Number
	}
) {}

// Request definition using Request.Class
// Type params: { payload fields }, Success, Error, Services
class GetUserById extends Request.Class<
	{ readonly id: number },
	User,
	UserNotFound,
	never
> {}
```

### Alternative: Interface + tagged constructor

For simpler cases or when you don't need a class:

```typescript
interface GetUserById extends Request.Request<User, UserNotFound> {
	readonly _tag: 'GetUserById';
	readonly id: number;
}
const GetUserById = Request.tagged<GetUserById>('GetUserById');

// Usage:
const req = GetUserById({ id: 42 });
```

### Request equality

Requests use structural equality by default (via `Equal` trait). Two `GetUserById({ id: 1 })` instances are considered equal, enabling automatic deduplication within a batch window.

## RequestResolver

A `RequestResolver<A>` handles batched execution of requests of type `A`. The resolver receives all collected requests as a `NonEmptyArray<Request.Entry<A>>` and must complete every entry.

### Basic resolver with `RequestResolver.make`

```typescript
const resolver = RequestResolver.make<GetUserById>(
	Effect.fn(function* (entries) {
		// `entries` is NonEmptyArray<Request.Entry<GetUserById>>
		// Each entry has:
		//   - entry.request: the original request (e.g. { id: 1 })
		//   - entry.context: captured Context with request-scoped services
		//   - entry.completeUnsafe(exit): complete with Exit value

		const ids = entries.map((e) => e.request.id);
		const users = yield* fetchUsersByIds(ids); // single batched call

		for (const entry of entries) {
			const user = users.find((u) => u.id === entry.request.id);
			if (user) {
				entry.completeUnsafe(Exit.succeed(user));
			} else {
				entry.completeUnsafe(
					Exit.fail(new UserNotFound({ id: entry.request.id }))
				);
			}
		}
	})
);
```

### Completing entries

Every entry in the batch MUST be completed. Failing to do so causes a `QueryFailure` error at runtime.

```typescript
// Complete with success
entry.completeUnsafe(Exit.succeed(value));

// Complete with typed error
entry.completeUnsafe(Exit.fail(new UserNotFound({ id: entry.request.id })));

// Complete with defect
entry.completeUnsafe(Exit.die(new Error('unexpected')));
```

### Pure resolvers

For simple cases:

```typescript
// Per-request pure function
const SquareResolver = RequestResolver.fromFunction<GetSquare>(
	(entry) => entry.request.value * entry.request.value
);

// Batched pure function (results must match request order)
const DoubleResolver = RequestResolver.fromFunctionBatched<GetDouble>(
	(entries) => entries.map((entry) => entry.request.value * 2)
);
```

### Per-request effectful resolver

When each request needs its own effect (no batching optimization, but still benefits from deduplication):

```typescript
const UserResolver = RequestResolver.fromEffect<GetUserById>((entry) =>
	Effect.gen(function* () {
		const result = yield* httpClient.get(`/users/${entry.request.id}`);
		return result;
	})
);
```

### Tagged resolver (multiple request types)

Handle different request types in a single resolver:

```typescript
type AppRequest = GetUser | GetPost;

const AppResolver = RequestResolver.fromEffectTagged<AppRequest>()({
	GetUser: (entries) =>
		Effect.succeed(entries.map((e) => `User ${e.request.id}`)),
	GetPost: (entries) =>
		Effect.succeed(entries.map((e) => `Post ${e.request.id}`))
});
```

### Grouped resolver

Group requests by a key so each group is resolved separately:

```typescript
const resolver = RequestResolver.makeGrouped<GetUserByRole, string>({
	key: ({ request }) => request.role,
	resolver: (entries, role) =>
		Effect.sync(() => {
			console.log(
				`Processing ${entries.length} requests for role: ${role}`
			);
			for (const entry of entries) {
				entry.completeUnsafe(
					Exit.succeed(`User ${entry.request.id} with role ${role}`)
				);
			}
		})
});
```

## Using Requests with Effect.request

`Effect.request` connects a request instance to its resolver, returning a normal `Effect`:

```typescript
const getUserById = (id: number) =>
	Effect.request(new GetUserById({ id }), resolver);
```

The resolver can also be an `Effect` that produces a resolver (useful when the resolver is constructed within a service layer):

```typescript
const getUserById = (id: number) =>
	Effect.request(new GetUserById({ id }), resolverEffect);
```

### Automatic batching

When multiple `Effect.request` calls run concurrently, they are automatically batched:

```typescript
// These 5 lookups produce ONE call to the resolver
// Duplicate IDs (1, 2) are deduplicated
const result =
	yield*
	Effect.forEach([1, 2, 1, 3, 2], (id) => getUserById(id), {
		concurrency: 'unbounded'
	});
```

## Batch Window Configuration

### `RequestResolver.setDelay`

Controls how long the resolver waits to collect requests before executing. More delay = larger batches but higher latency.

```typescript
const resolver = RequestResolver.make<GetUserById>(/* ... */).pipe(
	// Wait 10ms to collect more requests before flushing
	RequestResolver.setDelay('10 millis')
);
```

Default behavior (no `setDelay`): the resolver uses `Effect.yieldNow` which flushes after the current microtask, batching only requests that are already queued.

### `RequestResolver.setDelayEffect`

For custom delay logic (e.g., logging, dynamic delays):

```typescript
const resolver = pipe(
	baseResolver,
	RequestResolver.setDelayEffect(
		Effect.gen(function* () {
			yield* Effect.log('Waiting before processing batch...');
			yield* Effect.sleep('50 millis');
		})
	)
);
```

### `RequestResolver.batchN`

Limit maximum batch size. Larger batches are split into multiple resolver calls:

```typescript
const resolver = pipe(
	baseResolver,
	RequestResolver.batchN(100) // max 100 requests per batch
);
```

## Caching

### `RequestResolver.withCache`

Adds an in-memory LRU or FIFO cache to a resolver. Cached requests skip the resolver entirely on subsequent lookups:

```typescript
const resolver =
	yield*
	RequestResolver.make<GetUserById>(/* ... */).pipe(
		RequestResolver.withCache({ capacity: 1024 })
		// or: RequestResolver.withCache({ capacity: 1024, strategy: "fifo" })
	);
```

Note: `withCache` returns an `Effect<RequestResolver>` (it allocates mutable state), so use `yield*` when constructing.

Cache behavior:

- First lookup: request goes to resolver, result is cached
- Subsequent lookup for same request: served from cache immediately
- When capacity is exceeded, oldest entries are evicted (LRU or FIFO)
- In-flight deduplication: if the same request is pending, new callers attach to the pending result

### `RequestResolver.asCache`

Converts a resolver into a `Cache` instance for more control (TTL, etc.):

```typescript
const userCache =
	yield*
	pipe(
		resolver,
		RequestResolver.asCache({
			capacity: 1024,
			timeToLive: (exit, request) => '5 minutes'
		})
	);

// Use as a Cache
const user = yield* userCache.get(new GetUserById({ id: 1 }));
```

## Observability

### `RequestResolver.withSpan`

Adds a tracing span around the resolver execution with automatic span links from each request's parent span:

```typescript
const resolver = pipe(
	baseResolver,
	RequestResolver.withSpan('Users.getUserById.resolver')
);
```

The span automatically includes a `batchSize` attribute and links to each request's parent span, giving full visibility into batching behavior in your tracing backend.

Combine with `Effect.withSpan` on the individual request for end-to-end traces:

```typescript
const getUserById = (id: number) =>
	Effect.request(new GetUserById({ id }), resolver).pipe(
		Effect.withSpan('Users.getUserById', { attributes: { userId: id } })
	);
```

### Accessing request services

Inside a resolver, each `Request.Entry` carries its captured `Context` with request-scoped services:

```typescript
import { Context, Tracer } from 'effect';

const resolver = RequestResolver.make<GetUserById>(
	Effect.fn(function* (entries) {
		for (const entry of entries) {
			const requestSpan = Context.getOption(
				entry.context,
				Tracer.ParentSpan
			);
			// ... use span for correlation
		}
	})
);
```

## Complete Service Pattern

The idiomatic pattern wraps request + resolver + caching inside a service layer:

```typescript
import {
	Effect,
	Exit,
	Layer,
	Request,
	RequestResolver,
	Schema,
	Context
} from 'effect';

class User extends Schema.Class<User>('User')({
	id: Schema.Number,
	name: Schema.String,
	email: Schema.String
}) {}

class UserNotFound extends Schema.TaggedErrorClass<UserNotFound>()(
	'UserNotFound',
	{
		id: Schema.Number
	}
) {}

class Users extends Context.Service<
	Users,
	{
		getUserById(id: number): Effect.Effect<User, UserNotFound>;
	}
>()('app/Users') {
	static readonly layer = Layer.effect(
		Users,
		Effect.gen(function* () {
			class GetUserById extends Request.Class<
				{ readonly id: number },
				User,
				UserNotFound,
				never
			> {}

			const resolver = yield* RequestResolver.make<GetUserById>(
				Effect.fn(function* (entries) {
					const ids = entries.map((e) => e.request.id);
					const users = yield* fetchBatch(ids);
					for (const entry of entries) {
						const user = users.find(
							(u) => u.id === entry.request.id
						);
						entry.completeUnsafe(
							user
								? Exit.succeed(user)
								: Exit.fail(
										new UserNotFound({
											id: entry.request.id
										})
									)
						);
					}
				})
			).pipe(
				RequestResolver.setDelay('10 millis'),
				RequestResolver.withSpan('Users.getUserById.resolver'),
				RequestResolver.withCache({ capacity: 1024 })
			);

			const getUserById = (id: number) =>
				Effect.request(new GetUserById({ id }), resolver).pipe(
					Effect.withSpan('Users.getUserById', {
						attributes: { userId: id }
					})
				);

			return { getUserById } as const;
		})
	);
}
```

## SQL Integration with SqlResolver

`SqlResolver` (from `effect/unstable/sql`) provides schema-validated, batched SQL resolvers. Import:

```typescript
import { SqlResolver } from 'effect/unstable/sql';
```

### SqlResolver.ordered

Results map 1:1 to requests in order. Errors if result count doesn't match:

```typescript
const Insert = SqlResolver.ordered({
	Request: Schema.String,
	Result: Schema.Struct({ id: Schema.Number, name: Schema.String }),
	execute: (names) =>
		sql`INSERT INTO users ${sql.insert(names.map((name) => ({ name })))} RETURNING *`
});

const insertUser = SqlResolver.request(Insert);

// Batched: these two inserts become one SQL statement
const results =
	yield*
	Effect.all(
		{
			one: insertUser('alice'),
			two: insertUser('bob')
		},
		{ concurrency: 'unbounded' }
	);
```

### SqlResolver.grouped

Returns multiple results per request, grouped by key:

```typescript
const FindByName = SqlResolver.grouped({
	Request: Schema.String,
	RequestGroupKey: (name) => name,
	Result: Schema.Struct({ id: Schema.Number, name: Schema.String }),
	ResultGroupKey: (result) => result.name,
	execute: (names) => sql`SELECT * FROM users WHERE name IN ${sql.in(names)}`
});

const findByName = SqlResolver.request(FindByName);
// Returns NonEmptyArray<User> or fails with NoSuchElementError
```

### SqlResolver.findById

Resolves single results by ID. Returns `NoSuchElementError` for missing entries:

```typescript
const FindById = SqlResolver.findById({
	Id: Schema.Number,
	Result: Schema.Struct({ id: Schema.Number, name: Schema.String }),
	ResultId: (result) => result.id,
	execute: (ids) => sql`SELECT * FROM users WHERE id IN ${sql.in(ids)}`
});

const findById = SqlResolver.request(FindById);
// findById(1) => Effect<User, NoSuchElementError | SqlError | SchemaError>
```

### SqlResolver.void

For side-effect-only operations (inserts/updates with no return value):

```typescript
const DeleteUser = SqlResolver.void({
	Request: Schema.Number,
	execute: (ids) => sql`DELETE FROM users WHERE id IN ${sql.in(ids)}`
});

const deleteUser = SqlResolver.request(DeleteUser);
```

### Transaction awareness

`SqlResolver` automatically groups requests by the transaction connection captured in each `Request.Entry.context`, so requests within a transaction are batched separately from those outside one. This depends on using the same `SqlClient` service instance that opened the transaction; requests executed with another client or a manually reserved connection do not join that transaction.

## Resolver Combinators

### `RequestResolver.around`

Execute setup/teardown around each batch:

```typescript
const timedResolver = RequestResolver.around(
	resolver,
	(entries) => Effect.sync(() => Date.now()),
	(entries, startTime) =>
		Effect.log(
			`Batch of ${entries.length} completed in ${Date.now() - startTime}ms`
		)
);
```

### `RequestResolver.grouped`

Transform a resolver to group requests by a dynamic key:

```typescript
const byDepartment = RequestResolver.grouped(
	resolver,
	({ request }) => request.department
);
```

### `RequestResolver.race`

Race two resolvers, returning whichever completes first:

```typescript
const fast = RequestResolver.race(cacheResolver, dbResolver);
```

## Common Anti-Patterns

### WRONG: Completing only some entries

```typescript
// BAD - entries without matches are never completed -> QueryFailure
const resolver = RequestResolver.make<GetUserById>(
	Effect.fn(function* (entries) {
		for (const entry of entries) {
			const user = users.get(entry.request.id);
			if (user) {
				entry.completeUnsafe(Exit.succeed(user)); // What about misses?
			}
		}
	})
);
```

### CORRECT: Always complete every entry

```typescript
const resolver = RequestResolver.make<GetUserById>(
	Effect.fn(function* (entries) {
		for (const entry of entries) {
			const user = users.get(entry.request.id);
			entry.completeUnsafe(
				user
					? Exit.succeed(user)
					: Exit.fail(new UserNotFound({ id: entry.request.id }))
			);
		}
	})
);
```

### WRONG: Using Effect.forEach without concurrency

```typescript
// BAD - sequential execution, no batching occurs
yield* Effect.forEach([1, 2, 3], getUserById);
```

### CORRECT: Enable concurrency for batching

```typescript
// GOOD - concurrent execution triggers batching
yield* Effect.forEach([1, 2, 3], getUserById, { concurrency: 'unbounded' });
```
