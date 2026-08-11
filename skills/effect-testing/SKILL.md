---
name: effect-testing
description: Write comprehensive tests using @effect/vitest for Effect code and vitest for pure functions. Use this skill when implementing tests for Effect-based applications, including services, layers, time-dependent effects, error handling, and property-based testing.
---

# Effect Testing Skill

This skill provides comprehensive guidance for testing Effect-based applications using `@effect/vitest` and standard `vitest`.

## Effect Source Reference

The Effect v4 source is available at `~/.cache/effect-v4/`.
Browse and read files there directly to look up APIs, types, and implementations.

Reference this for:

- Testing utilities: `packages/effect/src/Testing.ts`
- @effect/vitest source: `packages/vitest/`
- Migration guide: `MIGRATION.md`
- Effect source: `packages/effect/src/`

## Framework Selection

**CRITICAL**: Choose the correct testing framework based on the code being tested.

### Use @effect/vitest for Effect Code

Use `@effect/vitest` when testing:

- Functions that return `Effect<A, E, R>`
- Code that uses services and layers
- Time-dependent operations with `TestClock`
- Asynchronous operations coordinated with Effect
- STM (Software Transactional Memory) operations

```typescript
import { it, expect } from '@effect/vitest';
import { Effect } from 'effect';

declare const fetchUser: (id: string) => Effect.Effect<{ id: string }, Error>;

it.effect('should fetch user', () =>
	Effect.gen(function* () {
		const user = yield* fetchUser('123');
		expect(user.id).toBe('123');
	})
);
```

### Use Regular vitest for Pure Functions

Use standard `vitest` for:

- Pure functions with no Effect wrapper
- Simple data transformations
- Helper utilities
- Type constructors (brands, newtypes)

```typescript
import { describe, expect, it } from 'vitest';

declare const Cents: {
	make: (value: bigint) => bigint;
	add: (a: bigint, b: bigint) => bigint;
};

describe('Cents', () => {
	it('should add cents correctly', () => {
		const result = Cents.add(Cents.make(100n), Cents.make(50n));
		expect(result).toBe(150n);
	});
});
```

## Test Variants

### it.effect - Default Test Environment

Provides `TestContext` including `TestClock`, `TestRandom`, etc.

```typescript
import { it, expect } from '@effect/vitest';
import { Effect } from 'effect';

declare const someEffect: Effect.Effect<number>;
declare const expected: number;

it.effect('test name', () =>
	Effect.gen(function* () {
		// Test implementation with TestContext available
		const result = yield* someEffect;
		expect(result).toBe(expected);
	})
);
```

### it.live - Live Environment (DEFAULT for most tests)

Uses real services (real clock, real random, etc.).

```typescript
import { it } from '@effect/vitest';
import { Effect, Clock } from 'effect';

it.live('test with real time', () =>
	Effect.gen(function* () {
		const now = yield* Clock.currentTimeMillis;
		// Uses actual system time
	})
);
```

**IMPORTANT: `it.live` should be the default for all tests that touch services, databases, HTTP, filesystems, or any real I/O.** `TestClock` intercepts time-dependent operations and causes hangs and non-determinism in integration tests. Reserve `it.effect` (with `TestClock`) only for tests that explicitly need to simulate time advancement.

### Resource Management in Tests

`it.effect` already handles scoping internally — there is no separate `it.scoped` or `it.scopedLive` variant. Use `Effect.acquireRelease` or `Effect.scoped` directly within `it.effect`:

```typescript
import { it } from '@effect/vitest';
import { Effect } from 'effect';

declare const acquire: Effect.Effect<unknown>;
declare const release: Effect.Effect<void>;

it.effect('test with resources', () =>
	Effect.gen(function* () {
		const resource = yield* Effect.acquireRelease(acquire, () => release);
		// Resource automatically cleaned up when the test's scope closes
	})
);
```

## Assertions

### Use expect from vitest

For all assertions, use the standard `expect` from vitest:

```typescript
import { it, expect } from '@effect/vitest';
import { Effect } from 'effect';

declare const computation: Effect.Effect<number>;
declare const array: unknown[];

it.effect('assertions', () =>
	Effect.gen(function* () {
		const result = yield* computation;
		expect(result).toBe(42);
		expect(result).toBeGreaterThan(0);
		expect(array).toHaveLength(3);
	})
);
```

### Effect-Specific Utilities

`@effect/vitest` provides additional assertion utilities in `utils`:

```typescript
import { it } from '@effect/vitest';
import {
	assertEquals, // Uses Effect's Equal.equals
	assertTrue,
	assertFalse,
	assertSome, // For Option.Some
	assertNone, // For Option.None
	assertSuccess, // For Either.Right / Exit.Success
	assertFailure // For Either.Left / Exit.Failure
} from '@effect/vitest/utils';
import { Effect, Option, Either } from 'effect';

declare const someOptionalEffect: Effect.Effect<Option.Option<number>>;
declare const someEitherEffect: Effect.Effect<Either.Either<number, Error>>;
declare const expectedValue: number;

it.effect('with effect assertions', () =>
	Effect.gen(function* () {
		const option = yield* someOptionalEffect;
		assertSome(option, expectedValue);

		const either = yield* someEitherEffect;
		assertSuccess(either, expectedValue);
	})
);
```

## Testing with Services and Layers

### Providing Services to Tests

Use `Effect.provide` to supply test implementations:

```typescript
import { it, expect } from '@effect/vitest';
import { Effect, Context, Layer } from 'effect';

class UserService extends Context.Service<
	UserService,
	{
		getUser: (id: string) => Effect.Effect<{ name: string }>;
	}
>()('UserService') {}

declare const TestUserServiceLayer: Layer.Layer<UserService>;

it.effect('should work with dependencies', () =>
	Effect.gen(function* () {
		const userService = yield* UserService;
		const result = yield* userService.getUser('123');
		expect(result.name).toBe('John');
	}).pipe(Effect.provide(TestUserServiceLayer))
);
```

```typescript
// Concise alternative using Layer.mock (v4)
const TestUserService = Layer.mock(UserService)({
	getUser: (id) => Effect.succeed({ name: 'John' })
});
```

`Layer.mock(Service)({...})` is shorthand for `Layer.succeed(Service, Service.of({...}))` — use whichever reads more clearly in context.

### Using layer Helper

Share a layer across multiple tests with the `layer` function:

```typescript
import { layer, it, expect } from '@effect/vitest';
import { Effect, Context, Layer } from 'effect';

class Database extends Context.Service<
	Database,
	{
		query: (sql: string) => Effect.Effect<Array<unknown>>;
	}
>()('Database') {
	static Test = Layer.succeed(Database, {
		query: (sql) => Effect.succeed([])
	});
}

layer(Database.Test)((it) => {
	it.effect('test 1', () =>
		Effect.gen(function* () {
			const db = yield* Database;
			const results = yield* db.query('SELECT *');
			expect(results).toEqual([]);
		})
	);

	it.effect('test 2', () =>
		Effect.gen(function* () {
			const db = yield* Database;
			// Database available in all tests
		})
	);
});

// With name for describe block
layer(Database.Test)('Database tests', (it) => {
	it.effect('query test', () => Effect.succeed(true));
});
```

### Nested Layers

Compose layers for complex dependencies:

```typescript
import { layer, it } from '@effect/vitest';
import { Effect, Context, Layer } from 'effect';

class Database extends Context.Service<
	Database,
	{
		query: (sql: string) => Effect.Effect<Array<unknown>>;
	}
>()('Database') {}

class UserService extends Context.Service<
	UserService,
	{
		getUser: (id: string) => Effect.Effect<unknown>;
	}
>()('UserService') {}

declare const DatabaseLayer: Layer.Layer<Database>;
declare const UserServiceLayer: Layer.Layer<UserService, never, Database>;

layer(DatabaseLayer)((it) => {
	it.layer(UserServiceLayer)('user tests', (it) => {
		it.effect('has both dependencies', () =>
			Effect.gen(function* () {
				const db = yield* Database;
				const userService = yield* UserService;
				// Both available
			})
		);
	});
});
```

A nested `it.layer` suite **reuses** the parent suite's memoized layer allocations rather than rebuilding them. As of beta.67, each nested suite also **forks its own memo map**, so layers allocated locally inside one nested suite are isolated from sibling nested suites and are released independently when that suite finishes. The practical effect: shared parent layers (e.g. `DatabaseLayer`) are built once and reused, while sibling-local allocations do not leak across siblings even in concurrent suites.

### Excluding Test Services

Use live services instead of test services:

```typescript
import { layer, it } from '@effect/vitest';
import { Effect, Layer } from 'effect';

declare const MyServiceLayer: Layer.Layer<never>;

layer(MyServiceLayer, { excludeTestServices: true })((it) => {
	it.effect('uses real clock', () =>
		Effect.gen(function* () {
			// Uses actual Clock, not TestClock
		})
	);
});
```

## Time-Dependent Testing with TestClock

### Basic TestClock Usage

`TestClock` allows controlling time without waiting:

```typescript
import { it, expect } from '@effect/vitest';
import { Effect, Fiber } from 'effect';
import { TestClock } from 'effect/testing';

it.effect('should handle delays', () =>
	Effect.gen(function* () {
		const fiber = yield* Effect.forkChild(
			Effect.sleep('5 seconds').pipe(Effect.as('done'))
		);

		// Advance time by 5 seconds instantly
		yield* TestClock.adjust('5 seconds');

		const result = yield* Fiber.join(fiber);
		expect(result).toBe('done');
	})
);
```

### Testing Recurring Effects

Test periodic operations efficiently:

```typescript
import { it, expect } from '@effect/vitest';
import { Effect, Queue, Option } from 'effect';
import { TestClock } from 'effect/testing';

it.effect('should execute every minute', () =>
	Effect.gen(function* () {
		const queue = yield* Queue.unbounded<number>();

		// Fork effect that repeats every minute
		yield* Effect.forkChild(
			Queue.offer(queue, 1).pipe(
				Effect.delay('60 seconds'),
				Effect.forever
			)
		);

		// No effect before time passes
		const empty = yield* Queue.poll(queue);
		expect(Option.isNone(empty)).toBe(true);

		// Advance time
		yield* TestClock.adjust('60 seconds');

		// Effect executed once
		const value = yield* Queue.take(queue);
		expect(value).toBe(1);

		// Verify only one execution
		const stillEmpty = yield* Queue.poll(queue);
		expect(Option.isNone(stillEmpty)).toBe(true);
	})
);
```

### Testing Clock Methods

```typescript
import { it, expect } from '@effect/vitest';
import { Effect, Clock } from 'effect';
import { TestClock } from 'effect/testing';

it.effect('should track time correctly', () =>
	Effect.gen(function* () {
		const start = yield* Clock.currentTimeMillis;

		yield* TestClock.adjust('1 minute');

		const end = yield* Clock.currentTimeMillis;

		expect(end - start).toBeGreaterThanOrEqual(60_000);
	})
);
```

### TestClock with Deferred

```typescript
import { it, expect } from '@effect/vitest';
import { Effect, Deferred } from 'effect';
import { TestClock } from 'effect/testing';

it.effect('should handle deferred with delays', () =>
	Effect.gen(function* () {
		const deferred = yield* Deferred.make<number>();

		yield* Effect.forkChild(
			Effect.gen(function* () {
				yield* Effect.sleep('60 seconds');
				yield* Deferred.succeed(deferred, 42);
			})
		);

		yield* TestClock.adjust('60 seconds');

		const result = yield* Deferred.await(deferred);
		expect(result).toBe(42);
	})
);
```

## Error Testing

### Testing Expected Failures

Use `Effect.flip` to convert failures to successes:

```typescript
import { it, expect } from '@effect/vitest';
import { Effect, Schema } from 'effect';

class UserNotFoundError extends Schema.TaggedErrorClass<UserNotFoundError>()(
	'UserNotFoundError',
	{
		userId: Schema.String
	}
) {}

declare const failingOperation: () => Effect.Effect<never, UserNotFoundError>;

it.effect('should fail with error', () =>
	Effect.gen(function* () {
		const error = yield* Effect.flip(failingOperation());
		expect(error).toBeInstanceOf(UserNotFoundError);
		expect(error.userId).toBe('123');
	})
);
```

### Testing with Exit

Use `Effect.exit` to capture both success and failure:

```typescript
import { it, expect } from '@effect/vitest';
import { Effect, Exit } from 'effect';

declare const divide: (a: number, b: number) => Effect.Effect<number, string>;

it.effect('should handle success', () =>
	Effect.gen(function* () {
		const exit = yield* Effect.exit(divide(4, 2));
		expect(exit).toEqual(Exit.succeed(2));
	})
);

it.effect('should handle failure', () =>
	Effect.gen(function* () {
		const exit = yield* Effect.exit(divide(4, 0));
		expect(exit).toEqual(Exit.fail('Cannot divide by zero'));
	})
);
```

### Testing Error Types

```typescript
import { it, expect } from '@effect/vitest';
import { Effect, Exit, Cause, Schema } from 'effect';
import * as Option from 'effect/Option';

class NotFoundError extends Schema.TaggedErrorClass<NotFoundError>()(
	'NotFoundError',
	{
		id: Schema.String
	}
) {}

class UserService extends Context.Service<
	UserService,
	{
		getUser: (id: string) => Effect.Effect<unknown, NotFoundError>;
	}
>()('UserService') {}

declare const userService: {
	getUser: (id: string) => Effect.Effect<unknown, NotFoundError>;
};

it.effect('should fail with specific error', () =>
	Effect.gen(function* () {
		const exit = yield* Effect.exit(userService.getUser('nonexistent'));

		if (Exit.isFailure(exit)) {
			const cause = exit.cause;
			// v4: use hasFails (not isFailType) and findErrorOption (not failureOrCause)
			expect(Cause.hasFails(cause)).toBe(true);
			const errorOpt = Cause.findErrorOption(cause);
			expect(Option.isSome(errorOpt)).toBe(true);
			if (Option.isSome(errorOpt)) {
				expect(errorOpt.value).toBeInstanceOf(NotFoundError);
			}
		} else {
			throw new Error('Expected failure');
		}
	})
);
```

## Property-Based Testing

### Using it.prop for Pure Properties

```typescript
import { FastCheck } from 'effect/testing';
import { it } from '@effect/vitest';

it.prop(
	'addition is commutative',
	[FastCheck.integer(), FastCheck.integer()],
	([a, b]) => a + b === b + a
);

// With object syntax
it.prop(
	'multiplication distributes',
	{ a: FastCheck.integer(), b: FastCheck.integer(), c: FastCheck.integer() },
	({ a, b, c }) => a * (b + c) === a * b + a * c
);
```

### Using it.effect.prop for Effect Properties

```typescript
import { it } from '@effect/vitest';
import { Effect, Context } from 'effect';
import { FastCheck } from 'effect/testing';

class Database extends Context.Service<
	Database,
	{
		set: (key: string, value: number) => Effect.Effect<void>;
		get: (key: string) => Effect.Effect<number>;
	}
>()('Database') {}

it.effect.prop(
	'database operations are idempotent',
	[FastCheck.string(), FastCheck.integer()],
	([key, value]) =>
		Effect.gen(function* () {
			const db = yield* Database;

			yield* db.set(key, value);
			const result1 = yield* db.get(key);

			yield* db.set(key, value);
			const result2 = yield* db.get(key);

			return result1 === result2;
		})
);
```

### With Schema Arbitraries

```typescript
import { it, expect } from '@effect/vitest';
import { Effect, Schema } from 'effect';

const User = Schema.Struct({
	id: Schema.String,
	age: Schema.Number.check(Schema.isBetween({ minimum: 0, maximum: 120 }))
});

it.effect.prop('user validation works', { user: User }, ({ user }) =>
	Effect.gen(function* () {
		expect(user.age).toBeGreaterThanOrEqual(0);
		expect(user.age).toBeLessThanOrEqual(120);
		return true;
	})
);
```

### Configuring FastCheck

```typescript
import { it } from '@effect/vitest';
import { Effect } from 'effect';
import { FastCheck } from 'effect/testing';

it.effect.prop(
	'property test',
	[FastCheck.integer()],
	([n]) => Effect.succeed(n >= 0 || n < 0),
	{
		timeout: 10000,
		fastCheck: {
			numRuns: 1000,
			seed: 42,
			verbose: true
		}
	}
);
```

## Test Control

### Skipping Tests

```typescript
import { it } from '@effect/vitest';
import { Effect } from 'effect';

declare const condition: boolean;

it.effect.skip('not ready yet', () =>
	Effect.gen(function* () {
		// Will not run
	})
);

it.effect.skipIf(condition)('conditional skip', () =>
	Effect.gen(function* () {
		// Only runs if condition is false
	})
);
```

### Running Single Tests

```typescript
import { it } from '@effect/vitest';
import { Effect } from 'effect';

it.effect.only('debug this test', () =>
	Effect.gen(function* () {
		// Only this test runs
	})
);
```

### Running Conditionally

```typescript
import { it } from '@effect/vitest';
import { Effect } from 'effect';

it.effect.runIf(process.env.INTEGRATION_TESTS)('integration test', () =>
	Effect.gen(function* () {
		// Only runs if condition is true
	})
);
```

### Expecting Failures

```typescript
import { it, expect } from '@effect/vitest';
import { Effect } from 'effect';

it.effect.fails('known failing test', () =>
	Effect.gen(function* () {
		// This test is expected to fail
		// Will pass if it fails, fail if it passes
		expect(1).toBe(2);
	})
);
```

## Testing Flaky Operations

Use `it.flakyTest` for operations that may fail intermittently:

```typescript
import { it } from '@effect/vitest';
import { Effect, Random } from 'effect';

it.effect('retrying flaky operation', () =>
	it.flakyTest(
		Effect.gen(function* () {
			const random = yield* Random.nextBoolean;
			if (random) {
				yield* Effect.fail('Random failure');
			}
		}),
		'5 seconds' // Retry timeout
	)
);
```

## Logging in Tests

### Default Behavior (Suppressed)

```typescript
import { it } from '@effect/vitest';
import { Effect } from 'effect';

it.effect('logs are suppressed', () =>
	Effect.gen(function* () {
		yield* Effect.log("This won't appear");
	})
);
```

### Enabling Logs

```typescript
import { it } from '@effect/vitest';
import { Effect, Logger } from 'effect';

it.effect('logs visible', () =>
	Effect.gen(function* () {
		yield* Effect.log('This will appear');
	}).pipe(Effect.provide(Logger.pretty))
);

// Or use it.live
it.live('logs visible', () =>
	Effect.gen(function* () {
		yield* Effect.log('This will appear');
	})
);
```

## Testing Patterns

### Arrange-Act-Assert Pattern

```typescript
import { describe, it, expect } from '@effect/vitest';
import { Effect, Context, Layer } from 'effect';

class UserService extends Context.Service<
	UserService,
	{
		getUser: (id: string) => Effect.Effect<{ id: string; name: string }>;
	}
>()('UserService') {}

declare const TestUserServiceLayer: Layer.Layer<UserService>;

describe('UserService', () => {
	describe('getUser', () => {
		it.effect('should return user by id', () =>
			Effect.gen(function* () {
				// Arrange
				const userId = 'user-123';
				const expectedUser = { id: userId, name: 'Alice' };

				// Act
				const service = yield* UserService;
				const user = yield* service.getUser(userId);

				// Assert
				expect(user).toEqual(expectedUser);
			}).pipe(Effect.provide(TestUserServiceLayer))
		);
	});
});
```

### Testing STM Operations

```typescript
import { it, expect } from '@effect/vitest';
import { Effect, STM, TRef } from 'effect';

it.effect('should handle concurrent updates', () =>
	Effect.gen(function* () {
		const counter = yield* TRef.make(0);

		const increment = STM.updateAndGet(counter, (n) => n + 1);

		yield* STM.commit(increment);
		yield* STM.commit(increment);

		const final = yield* STM.commit(TRef.get(counter));
		expect(final).toBe(2);
	})
);
```

### Testing CRDT Operations

```typescript
import { it, expect } from '@effect/vitest';
import { Effect, STM } from 'effect';

declare const GCounter: {
	make: (id: string) => Effect.Effect<unknown>;
	increment: (counter: unknown, value: number) => STM.STM<void>;
	query: (counter: unknown) => STM.STM<unknown>;
	merge: (counter: unknown, state: unknown) => STM.STM<void>;
	value: (counter: unknown) => STM.STM<number>;
};

declare const ReplicaId: (id: string) => string;

it.effect('should merge states correctly', () =>
	Effect.gen(function* () {
		const counter1 = yield* GCounter.make(ReplicaId('replica-1'));
		const counter2 = yield* GCounter.make(ReplicaId('replica-2'));

		yield* STM.commit(GCounter.increment(counter1, 10));
		yield* STM.commit(GCounter.increment(counter2, 20));

		const state2 = yield* STM.commit(GCounter.query(counter2));
		yield* STM.commit(GCounter.merge(counter1, state2));

		const result = yield* STM.commit(GCounter.value(counter1));
		expect(result).toBe(30);
	})
);
```

## HTTP Mock Server Testing

For services that speak HTTP protocols (REST, SSE, streaming), **prefer HTTP mock server testing over service-level fakes**. This approach tests the full HTTP integration path — serialization, status codes, retries, SSE framing — and catches bugs that service fakes miss.

**When to use HTTP mock servers vs service fakes:**

- **HTTP mock server** (preferred): when the service communicates over HTTP/SSE and transport-level correctness matters. The real service layer (`MyService.defaultLayer`) is used, backed by a mock HTTP server at port 0.
- **Service fake** (`Layer.succeed`): when the service is a pure domain abstraction with no protocol-level concerns.

The pattern:

1. **Define a `TestServer` service** as a `Context.Service` with semantic helper methods (not raw `push(reply)`). For an LLM server, expose `text(content)`, `tool(call)`, `fail(error)`, `hang`, `hold(promise)`. Each method pushes a typed Step onto a queue.
2. **Implement with `Layer.effect`** — build an `HttpRouter` that dequeues steps on each request, use `HttpServerResponse.stream` for SSE endpoints, and bind to a random port with `NodeHttpServer.layer(() => Http.createServer(), { port: 0 })`.
3. **Use `Deferred`-based request counting** for `wait(count)` — the server increments a counter on each request and completes a `Deferred` when the count is reached, letting the test block until the expected number of calls arrive. This eliminates all `setTimeout`/polling from tests.
4. **Wire the mock URL into test config** via a callback: `config: (url) => ({ baseUrl: url })`.

### Typed Step ADT for Mock Responses

Define mock response types as a discriminated union so test intent is readable:

```typescript
type Step =
	| { readonly kind: 'text'; readonly content: string }
	| { readonly kind: 'tool'; readonly call: ToolCall }
	| { readonly kind: 'fail'; readonly error: string }
	| { readonly kind: 'hang' } // Keeps connection open indefinitely
	| { readonly kind: 'hold'; readonly wait: Promise<void> }; // Blocks until resolved

// Semantic helpers on the TestServer service:
// yield* server.text("hello")   — enqueue a text response
// yield* server.tool(toolCall)  — enqueue a tool call response
// yield* server.fail("error")   — enqueue a mid-stream SSE failure
// server.hang                   — enqueue a response that never completes
```

### SSE Response Patterns

For SSE endpoints, use `HttpServerResponse.stream` with different `Stream` constructors per step type:

```typescript
import { Effect, Stream } from 'effect';
import { HttpServerResponse } from 'effect/unstable/http';

// Normal SSE response — stream JSON lines, then [DONE]
const sse = (lines: ReadonlyArray<unknown>) =>
	HttpServerResponse.stream(
		Stream.fromIterable([
			[
				...lines.map((line) => `data: ${JSON.stringify(line)}`),
				'data: [DONE]'
			].join('\n\n') + '\n\n'
		]).pipe(Stream.encodeText),
		{ contentType: 'text/event-stream' }
	);

// Hang — connection stays open forever (for testing cancellation)
const hang = HttpServerResponse.stream(Stream.never, {
	contentType: 'text/event-stream'
});

// Mid-stream failure — partial data then error
const fail = (error: string) =>
	HttpServerResponse.stream(
		Stream.concat(
			Stream.fromIterable([`data: {"partial": true}\n\n`]),
			Stream.fail(new Error(error))
		).pipe(Stream.encodeText),
		{ contentType: 'text/event-stream' }
	);

// Hold — blocks until a promise resolves (for testing timing)
const hold = (wait: Promise<void>) =>
	HttpServerResponse.stream(
		Stream.fromEffect(Effect.promise(() => wait)).pipe(
			Stream.flatMap(() => Stream.fromIterable(['data: [DONE]\n\n'])),
			Stream.encodeText
		),
		{ contentType: 'text/event-stream' }
	);
```

### Test Fixture Composition

```typescript
// Test fixture composition
const withMockServer = <A, E, R>(
	self: (server: TestApiServer) => Effect.Effect<A, E, R>
) =>
	Effect.gen(function* () {
		const server = yield* TestApiServer;
		return yield* self(server);
	});

// In test — uses the REAL service layer, backed by mock HTTP
it.live('calls API correctly', () =>
	withMockServer((server) =>
		Effect.gen(function* () {
			yield* server.text('hello world');
			const result = yield* MyService.use((svc) => svc.callApi());
			expect(result).toEqual('hello world');
		})
	).pipe(
		Effect.provide(MyService.defaultLayer), // Real service, not a fake
		Effect.provide(TestApiServer.layer)
	)
);
```

### Test Fake Factories

When providing fake service layers in tests, return the test data alongside the layer to avoid duplicating constants between setup and assertions:

```typescript
export function fakeUserRepo(overrides?: { user?: User }) {
	const user = overrides?.user ?? new User({ id: '1', name: 'Test' });
	return {
		user,
		layer: Layer.succeed(
			UserRepo,
			UserRepo.of({
				findById: Effect.fn('TestUserRepo.findById')(function* (
					id: string
				) {
					if (id === user.id) return user;
					return yield* Effect.die(
						new Error(`Unknown test user: ${id}`)
					);
				})
			})
		)
	};
}

// Usage in test:
const { user, layer } = fakeUserRepo();
// assert against `user` values, provide `layer`
```

> Returning test data alongside the layer avoids duplicating constants between test setup and assertions.

## Lifecycle State-Machine Fakes

For long-lived services such as connection managers, runners, registries, or background sync loops, prefer explicit controllable test doubles over broad end-to-end flows when transport-level correctness is not the thing under test.

Model the fake as a small state machine with semantic controls:

- counters for call counts
- explicit transition methods like `disconnect()`, `reloadTools()`, `failNext()`
- `Deferred` values for blocking and release points
- direct assertions against cache/status transitions after each step

This keeps race and lifecycle tests fast, deterministic, and reviewable.

## Instance-Scoped Harness Tests

When testing tools or services that depend on instance-local context or `InstanceState`, prefer the real layer graph and a real instance/test harness over ad hoc module wrappers.

```typescript
const layer = Layer.mergeAll(
	MyTool.defaultLayer,
	Instruction.defaultLayer,
	OtherDependency.defaultLayer
);

it.live('runs with the real harness', () =>
	withTestInstance((dir) =>
		Effect.gen(function* () {
			const tool = yield* MyTool.Service;
			yield* tool.run(dir);
		})
	).pipe(Effect.provide(layer))
);
```

Use fake services when you are isolating pure domain behavior. Use the real harness when correctness depends on instance context, layer composition, or production orchestration.

## Interrupt Tests Should Prove Cleanup

If interruption is part of the contract, do not stop at asserting that the fiber was interrupted. Assert the cleanup effect too:

- busy/idle status reset
- pending work marked aborted/cancelled
- finalizers or teardown callbacks ran
- replacement work can start without a second manual cleanup call

## Testing with Non-Vitest Runners (bun:test)

When using `bun:test` or other non-vitest runners, `@effect/vitest`'s `it.effect`, `it.live`, and `layer()` helpers are unavailable. Build a custom test harness that replicates the same semantics:

```typescript
import { Effect, Layer } from 'effect';
import { TestClock, TestConsole } from 'effect/testing';
import { describe, it } from 'bun:test';

// Two layer stacks: one with TestClock, one without
const testEnv = Layer.mergeAll(TestConsole.layer, TestClock.layer());
const liveEnv = TestConsole.layer;

export const testEffect = <R, E>(layer: Layer.Layer<R, E>) => {
	const testLayer = Layer.provideMerge(layer, testEnv);
	const liveLayer = Layer.provideMerge(layer, liveEnv);

	return {
		effect: (name: string, fn: () => Effect.Effect<void, unknown, R>) =>
			it(name, () =>
				Effect.runPromise(fn().pipe(Effect.provide(testLayer)))
			),

		live: (name: string, fn: () => Effect.Effect<void, unknown, R>) =>
			it(name, () =>
				Effect.runPromise(fn().pipe(Effect.provide(liveLayer)))
			)
	};
};

// Usage:
const deps = Layer.mergeAll(MyService.defaultLayer, OtherService.defaultLayer);
const it = testEffect(deps);

describe('MyService', () => {
	it.live('handles request', () =>
		Effect.gen(function* () {
			const svc = yield* MyService.Service;
			const result = yield* svc.handle('input');
			expect(result).toBe('expected');
		})
	);
});
```

Key differences from `@effect/vitest`:

- Use `Effect.runPromise` manually — bun:test expects `Promise<void>` from async tests
- Layer composition uses `Layer.provideMerge` so services remain visible through the stack
- `it.live` is the default for integration tests; `it.effect` only for time-simulation tests

**`TestClock` without an ambient `Scope` (beta.70):** earlier betas required a surrounding `Scope` for `TestClock.adjust` to advance time. As of beta.70, `TestClock.layer()` works when provided directly to a program run with `Effect.runPromise` (no ambient `Scope`) — which is exactly what the harness above relies on. `testEffect(...).effect(...)` merges `TestClock.layer()` into the layer stack and runs with `Effect.runPromise`, and `TestClock.adjust` still drives time correctly.

## Testing Checklist

Before completing a testing task, verify:

- [ ] Correct framework chosen (@effect/vitest vs vitest vs bun:test harness)
- [ ] Test variant appropriate — `it.live` is the default; `it.effect` only for time-simulation
- [ ] Services provided via layers when needed
- [ ] HTTP-speaking services tested with HTTP mock server, not service fakes
- [ ] TestClock used only for tests that explicitly need time simulation
- [ ] Errors tested with Effect.flip or Effect.exit
- [ ] Edge cases covered
- [ ] Property-based tests for general properties
- [ ] Tests are deterministic (no polling/setTimeout — use Deferred-based synchronization)
- [ ] Interrupt tests assert resulting cleanup state, not just interruption itself
- [ ] Test names describe behavior clearly
- [ ] Resources properly scoped and cleaned up
- [ ] All tests pass

## Common Pitfalls

### Assertion Style

Effect v4 canonically uses `import { assert } from "@effect/vitest"` with methods like `assert.deepStrictEqual`, `assert.strictEqual`, and `assert.isTrue`. The `expect` API from vitest is still available and works fine. Pick one style and stay consistent within a test file.

```typescript
// ✅ Option A - assert style (canonical v4)
import { it, assert } from '@effect/vitest';
import { Effect } from 'effect';

declare const result: unknown;
declare const expected: unknown;

it.effect('test', () =>
	Effect.gen(function* () {
		assert.strictEqual(result, expected);
		assert.deepStrictEqual(result, { id: '123' });
		assert.isTrue(true);
	})
);

// ✅ Option B - expect style (still works)
import { it, expect } from '@effect/vitest';

it.effect('test', () =>
	Effect.gen(function* () {
		expect(result).toBe(expected);
	})
);
```

### Don't Forget to Fork for TestClock

```typescript
import { it } from '@effect/vitest';
import { Effect, Fiber } from 'effect';
import { TestClock } from 'effect/testing';

// ❌ Wrong - will hang waiting for real time
it.effect('test', () =>
	Effect.gen(function* () {
		yield* Effect.sleep('5 seconds'); // Blocks!
		yield* TestClock.adjust('5 seconds');
	})
);

// ✅ Correct - fork the effect
it.effect('test', () =>
	Effect.gen(function* () {
		const fiber = yield* Effect.forkChild(Effect.sleep('5 seconds'));
		yield* TestClock.adjust('5 seconds');
		yield* Fiber.join(fiber);
	})
);
```

### Provide Layers to Effect, Not Test

```typescript
import { it, expect } from '@effect/vitest';
import { Effect, Layer } from 'effect';

declare const someEffect: Effect.Effect<number>;
declare const expected: number;
declare const layer: Layer.Layer<never>;

// ❌ Wrong - providing to wrong level
it.effect('test', () =>
	Effect.gen(function* () {
		const result = yield* someEffect;
		expect(result).toBe(expected);
	})
); // ❌ Can't provide to test function
// .pipe(Effect.provide(layer))

// ✅ Correct - provide to Effect
it.effect(
	'test',
	() =>
		Effect.gen(function* () {
			const result = yield* someEffect;
			expect(result).toBe(expected);
		}).pipe(Effect.provide(layer)) // ✅ Provide to Effect
);
```

## Running Tests

```bash
# Run all tests
bun run test

# Run specific file
bunx vitest run path/to/file.test.ts

# Full check (format + lint + typecheck + test)
bun run check && bun run test
```

## Example: Complete Test Suite

```typescript
import { describe, expect, it, layer } from '@effect/vitest';
import { Effect, Context, Layer, Exit } from 'effect';

// Service definition
class Counter extends Context.Service<
	Counter,
	{
		increment: () => Effect.Effect<void>;
		value: () => Effect.Effect<number>;
	}
>()('Counter') {
	static Live = Layer.effect(
		Counter,
		Effect.gen(function* () {
			let count = 0;
			return {
				increment: () =>
					Effect.sync(() => {
						count++;
					}),
				value: () => Effect.succeed(count)
			};
		})
	);
}

// Tests
layer(Counter.Live)('Counter', (it) => {
	it.effect('should start at 0', () =>
		Effect.gen(function* () {
			const counter = yield* Counter;
			const value = yield* counter.value();
			expect(value).toBe(0);
		})
	);

	it.effect('should increment', () =>
		Effect.gen(function* () {
			const counter = yield* Counter;
			yield* counter.increment();
			const value = yield* counter.value();
			expect(value).toBe(1);
		})
	);

	it.effect('should handle multiple increments', () =>
		Effect.gen(function* () {
			const counter = yield* Counter;
			yield* counter.increment();
			yield* counter.increment();
			yield* counter.increment();
			const value = yield* counter.value();
			expect(value).toBe(3);
		})
	);
});
```

This skill ensures comprehensive, reliable testing of Effect-based applications following best practices.
