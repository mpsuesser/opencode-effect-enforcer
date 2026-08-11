---
name: effect-concurrency-testing
description: Test Effect concurrency primitives including PubSub, Deferred, Latch, Fiber coordination, SubscriptionRef, and Stream. Use this skill when testing concurrent effects, event-driven systems, or fiber coordination.
---

# Effect Concurrency Testing Skill

This skill provides patterns for testing Effect's concurrency primitives: fibers, latches, deferreds, PubSub, SubscriptionRef, and streams.

## Core Principles

**CRITICAL**: Choose the correct coordination primitive based on what you need to synchronize.

| Need                              | Use                                                                                   |
| --------------------------------- | ------------------------------------------------------------------------------------- |
| Simple fiber yield                | `Effect.yieldNow`                                                                     |
| Wait for subscriber ready         | `Deferred.make()` + `Deferred.await`                                                  |
| Wait for stream element           | `Latch.make()` + `Stream.tap(() => latch.open)`                                       |
| Passive subscription registration | explicit readiness signal if possible; otherwise a tiny one-tick yield/sleep fallback |
| Time-dependent behavior           | `TestClock.adjust`                                                                    |
| Verify events published           | `PubSub.subscribe` + `PubSub.takeUpTo`                                                |
| Check fiber status                | `fiber.pollUnsafe()`                                                                  |

For `Stream.fromPubSub` subscription registration, prefer an explicit readiness signal when you control the stream. If the API offers no readiness hook and you only need registration to settle before publishing, a tiny `Effect.yieldNow()` or very short sleep is an acceptable last resort. Avoid broad polling or arbitrary delays.

## Fiber Coordination Patterns

### Effect.yieldNow - Simple Fiber Scheduling

Use `Effect.yieldNow` when you need to allow other fibers to execute. This is preferred over `TestClock.adjust` for non-time-dependent code.

```typescript
import { it } from '@effect/vitest';
import { Effect, Exit, Fiber, Latch } from 'effect';

it.effect('fiber polling with yieldNow', () =>
	Effect.gen(function* () {
		const latch = yield* Latch.make();

		const fiber = yield* latch.await.pipe(Effect.forkChild);

		yield* Effect.yieldNow();

		expect(fiber.pollUnsafe()).toBeUndefined();

		yield* latch.open;

		expect(yield* fiber.await).toEqual(Exit.void);
	})
);
```

### Latch - Explicit Coordination

`Latch.make()` creates a gate that blocks fibers until opened:

```typescript
import { it } from '@effect/vitest';
import { Effect, Fiber, Latch } from 'effect';

it.effect('latch coordination', () =>
	Effect.gen(function* () {
		const latch = yield* Latch.make();

		const fiber = yield* Effect.gen(function* () {
			yield* latch.await;
			return 'completed';
		}).pipe(Effect.forkChild);

		yield* Effect.yieldNow();
		expect(fiber.pollUnsafe()).toBeUndefined();

		yield* latch.open;

		const result = yield* Fiber.join(fiber);
		expect(result).toBe('completed');
	})
);
```

### Latch Operations

```typescript
import { Latch } from 'effect';

declare const latch: Latch.Latch;

latch.await; // Wait until latch is open
latch.open; // Open the latch (current and future waiters proceed)
latch.close; // Close the latch (future waiters suspend again)
latch.release; // Wake current waiters only; latch stays closed for future waiters
latch.whenOpen; // Run effect only when latch is open
```

### Deferred - Signal Readiness Between Fibers

Use `Deferred` when one fiber needs to signal another with a value:

```typescript
import { it } from '@effect/vitest';
import { Effect, Deferred, Fiber } from 'effect';

it.effect('deferred signaling', () =>
	Effect.gen(function* () {
		const signal = yield* Deferred.make<number>();

		const consumer = yield* Effect.gen(function* () {
			const value = yield* Deferred.await(signal);
			return value * 2;
		}).pipe(Effect.forkChild);

		yield* Deferred.succeed(signal, 21);

		const result = yield* Fiber.join(consumer);
		expect(result).toBe(42);
	})
);
```

### fiber.pollUnsafe() - Check Completion Without Blocking

```typescript
import { Exit, Fiber } from 'effect';

declare const fiber: Fiber.Fiber<string>;

fiber.pollUnsafe();
// Returns undefined if running
// Returns Exit<A, E> if completed (success, failure, or interrupted)

// Check if still running
expect(fiber.pollUnsafe()).toBeUndefined();

// Check if completed
expect(fiber.pollUnsafe()).toBeDefined();

// Check specific completion
expect(fiber.pollUnsafe()).toEqual(Exit.succeed('result'));
```

## PubSub Event Testing

### Direct Event Verification

Use `Effect.scoped` to manage PubSub subscription lifecycle:

```typescript
import { it } from '@effect/vitest';
import { Effect, PubSub } from 'effect';

it.effect('verify published events', () =>
	Effect.gen(function* () {
		const pubsub = yield* PubSub.unbounded<string>();

		yield* Effect.scoped(
			Effect.gen(function* () {
				const sub = yield* PubSub.subscribe(pubsub);

				yield* PubSub.publish(pubsub, 'event-1');
				yield* PubSub.publish(pubsub, 'event-2');

				const events = yield* PubSub.takeAll(sub);

				expect(events).toEqual(['event-1', 'event-2']);
			})
		);
	})
);
```

Both events are published **before** `PubSub.takeAll`, so it returns immediately. `PubSub.takeAll` suspends when the subscription is empty and always returns a `NonEmptyArray`; for non-blocking drains or “no more events” assertions, use `PubSub.takeUpTo(sub, n)` instead, which returns whatever is buffered (possibly an empty array).

### Testing Event Publishers

When testing a service that publishes events:

```typescript
import { it } from '@effect/vitest';
import { Effect, PubSub, Context, Layer } from 'effect';

interface UserEvent {
	readonly type: 'created' | 'deleted';
	readonly userId: string;
}

class EventBus extends Context.Service<EventBus, PubSub.PubSub<UserEvent>>()(
	'EventBus'
) {}

class UserService extends Context.Service<
	UserService,
	{ readonly createUser: (id: string) => Effect.Effect<void> }
>()('UserService') {}

declare const UserServiceLive: Layer.Layer<UserService, never, EventBus>;

it.effect('should publish user created event', () =>
	Effect.gen(function* () {
		const pubsub = yield* PubSub.unbounded<UserEvent>();

		yield* Effect.scoped(
			Effect.gen(function* () {
				const sub = yield* PubSub.subscribe(pubsub);

				const service = yield* UserService;
				yield* service.createUser('user-123');

				const events = yield* PubSub.takeAll(sub);

				expect(events).toHaveLength(1);
				expect(events[0]).toEqual({
					type: 'created',
					userId: 'user-123'
				});
			})
		);
	}).pipe(
		Effect.provide(UserServiceLive),
		Effect.provide(Layer.succeed(EventBus, pubsub))
	)
);
```

### Concurrent Publisher/Subscriber Testing

```typescript
import { it } from '@effect/vitest';
import { Deferred, Effect, PubSub, Fiber, Latch, Array as A } from 'effect';

it.effect('concurrent publishers and subscribers', () =>
	Effect.gen(function* () {
		const values = A.range(0, 9);
		const latch = yield* Latch.make();
		const ready = yield* Deferred.make<void>();
		const pubsub = yield* PubSub.bounded<number>(10);

		const subscriber = yield* PubSub.subscribe(pubsub).pipe(
			Effect.flatMap((sub) =>
				Effect.gen(function* () {
					// Signal that the subscription is registered before publishing
					yield* Deferred.succeed(ready, undefined);
					yield* latch.await;
					return yield* Effect.forEach(values, () =>
						PubSub.take(sub)
					);
				})
			),
			Effect.scoped,
			Effect.forkScoped
		);

		// Wait until the subscriber has actually subscribed (PubSub is not
		// an event log — publishing before subscription would drop messages)
		yield* Deferred.await(ready);

		yield* PubSub.publishAll(pubsub, values);
		yield* latch.open;

		const result = yield* Fiber.join(subscriber);
		expect(result).toEqual(values);
	})
);
```

## SubscriptionRef Testing

### Testing Stream Changes with Latches

The latch pattern ensures the stream subscription is ready before mutations:

```typescript
import { it } from '@effect/vitest';
import { Effect, Fiber, Latch, Number } from 'effect';
import { Stream, SubscriptionRef } from 'effect';

it.effect('multiple subscribers can receive changes', () =>
	Effect.gen(function* () {
		const ref = yield* SubscriptionRef.make(0);
		const latch1 = yield* Latch.make();
		const latch2 = yield* Latch.make();

		const fiber1 = yield* SubscriptionRef.changes(ref).pipe(
			Stream.tap(() => latch1.open),
			Stream.take(3),
			Stream.runCollect,
			Effect.forkScoped
		);

		yield* latch1.await;
		yield* SubscriptionRef.update(ref, Number.increment);

		const fiber2 = yield* SubscriptionRef.changes(ref).pipe(
			Stream.tap(() => latch2.open),
			Stream.take(2),
			Stream.runCollect,
			Effect.forkScoped
		);

		yield* latch2.await;
		yield* SubscriptionRef.update(ref, Number.increment);

		const result1 = yield* Fiber.join(fiber1);
		const result2 = yield* Fiber.join(fiber2);

		expect(result1).toEqual([0, 1, 2]);
		expect(result2).toEqual([1, 2]);
	})
);
```

### Testing Subscription Interruption

```typescript
import { it } from '@effect/vitest';
import { Effect, Exit, Fiber, Latch, Number } from 'effect';
import { Pull, Stream, SubscriptionRef } from 'effect';

it.effect('subscriptions are interruptible', () =>
	Effect.gen(function* () {
		const ref = yield* SubscriptionRef.make(0);
		const latch = yield* Latch.make();

		const fiber = yield* SubscriptionRef.changes(ref).pipe(
			Stream.tap(() => latch.open),
			Stream.take(10),
			Stream.runCollect,
			Effect.forkScoped
		);

		yield* latch.await;
		yield* SubscriptionRef.update(ref, Number.increment);
		yield* Fiber.interrupt(fiber);

		const result = yield* Fiber.await(fiber);

		expect(Exit.isFailure(result) && Pull.isDoneCause(result.cause)).toBe(
			true
		);
	})
);
```

## Stream Testing

### Collecting Stream Results

```typescript
import { it } from '@effect/vitest';
import { Effect } from 'effect';
import { Stream } from 'effect';

it.effect('should collect stream elements', () =>
	Effect.gen(function* () {
		const result = yield* Stream.make(1, 2, 3, 4, 5).pipe(
			Stream.filter((n) => n % 2 === 0),
			Stream.runCollect
		);

		expect(result).toEqual([2, 4]);
	})
);
```

### Testing Stream Side Effects

```typescript
import { it } from '@effect/vitest';
import { Effect, Ref } from 'effect';
import { Stream } from 'effect';

it.effect('should track side effects', () =>
	Effect.gen(function* () {
		const log = yield* Ref.make<string[]>([]);

		yield* Stream.make('a', 'b', 'c').pipe(
			Stream.tap((item) => Ref.update(log, (items) => [...items, item])),
			Stream.runDrain
		);

		const logged = yield* Ref.get(log);
		expect(logged).toEqual(['a', 'b', 'c']);
	})
);
```

### Testing Stream Errors

```typescript
import { it } from '@effect/vitest';
import { Effect, Exit, Schema } from 'effect';
import { Stream } from 'effect';

class StreamError extends Schema.TaggedErrorClass<StreamError>()(
	'StreamError',
	{
		message: Schema.String
	}
) {}

it.effect('should handle stream errors', () =>
	Effect.gen(function* () {
		const result = yield* Stream.make(1, 2, 3).pipe(
			Stream.mapEffect((n) =>
				n === 2
					? Effect.fail(new StreamError({ message: 'boom' }))
					: Effect.succeed(n)
			),
			Stream.runCollect,
			Effect.exit
		);

		expect(Exit.isFailure(result)).toBe(true);
	})
);
```

### Testing Stream Finalization

```typescript
import { it } from '@effect/vitest';
import { Effect, Ref } from 'effect';
import { Stream } from 'effect';

it.effect('should run finalizers', () =>
	Effect.gen(function* () {
		const finalized = yield* Ref.make(false);

		yield* Stream.make(1, 2, 3).pipe(
			Stream.ensuring(Ref.set(finalized, true)),
			Stream.take(1),
			Stream.runDrain
		);

		expect(yield* Ref.get(finalized)).toBe(true);
	})
);
```

## Interruption Testing

### Testing Fiber Interruption

```typescript
import { it } from '@effect/vitest';
import { Effect, Exit, Fiber, Cause } from 'effect';

it.effect('should handle interruption', () =>
	Effect.gen(function* () {
		const fiber = yield* Effect.never.pipe(Effect.forkChild);

		yield* Fiber.interrupt(fiber);

		const result = yield* Fiber.await(fiber);

		expect(Exit.hasInterrupts(result)).toBe(true);
	})
);
```

### Testing Interrupted-Only Cause

```typescript
import { it } from '@effect/vitest';
import { Effect, Exit, Fiber, Cause } from 'effect';

it.effect('should have interrupted-only cause', () =>
	Effect.gen(function* () {
		const fiber = yield* Effect.never.pipe(Effect.forkChild);

		yield* Fiber.interrupt(fiber);

		const result = yield* Fiber.await(fiber);

		expect(
			Exit.isFailure(result) && Cause.hasInterruptsOnly(result.cause)
		).toBe(true);
	})
);
```

## Time-Dependent Concurrency Testing

Use `TestClock` only when testing time-dependent behavior like delays, timeouts, or schedules.

```typescript
import { it } from '@effect/vitest';
import { Effect, Fiber, Duration } from 'effect';
import { TestClock } from 'effect/testing';

it.effect('should handle delayed concurrent operations', () =>
	Effect.gen(function* () {
		const fiber = yield* Effect.gen(function* () {
			yield* Effect.sleep(Duration.seconds(5));
			return 'done';
		}).pipe(Effect.forkChild);

		yield* TestClock.adjust(Duration.seconds(5));

		const result = yield* Fiber.join(fiber);
		expect(result).toBe('done');
	})
);
```

## Anti-Patterns

### DON'T use TestClock for non-time-dependent code

```typescript
import { Effect, Duration } from 'effect';
import { TestClock } from 'effect/testing';

// BAD - Using TestClock when not needed
Effect.gen(function* () {
	const fiber = yield* someEffect.pipe(Effect.forkChild);
	yield* TestClock.adjust(Duration.millis(100));
	yield* Fiber.join(fiber);
});

// GOOD - Use yieldNow for simple yielding
Effect.gen(function* () {
	const fiber = yield* someEffect.pipe(Effect.forkChild);
	yield* Effect.yieldNow();
	yield* Fiber.join(fiber);
});
```

### DON'T poll in a loop without yieldNow

```typescript
import { Effect, Fiber } from 'effect';

declare const fiber: Fiber.Fiber<void>;

// BAD - Busy loop
while (fiber.pollUnsafe() === undefined) {
	// Spins forever!
}

// GOOD - Yield between polls or use Fiber.await
Effect.gen(function* () {
	while (fiber.pollUnsafe() === undefined) {
		yield* Effect.yieldNow();
	}
});

// BETTER - Just await the fiber
Effect.gen(function* () {
	yield* Fiber.await(fiber);
});
```

### DON'T forget Effect.scoped for PubSub subscriptions

```typescript
import { Effect, PubSub } from 'effect';

declare const pubsub: PubSub.PubSub<string>;

// BAD - Subscription leaks
Effect.gen(function* () {
	const sub = yield* PubSub.subscribe(pubsub);
	// Sub is never cleaned up!
});

// GOOD - Scoped subscription
Effect.gen(function* () {
	yield* Effect.scoped(
		Effect.gen(function* () {
			const sub = yield* PubSub.subscribe(pubsub);
			// takeUpTo never suspends; takeAll would hang here (nothing published)
			const events = yield* PubSub.takeUpTo(sub, 10);
			// Sub cleaned up when scope closes
		})
	);
});
```

### DON'T start subscriptions after mutations

```typescript
import { Effect, Fiber } from 'effect';
import { Stream, SubscriptionRef } from 'effect';

declare const ref: SubscriptionRef.SubscriptionRef<number>;

// BAD - May miss events: the subscription starts AFTER the first mutation
Effect.gen(function* () {
	yield* SubscriptionRef.update(ref, (n) => n + 1);

	const fiber = yield* SubscriptionRef.changes(ref).pipe(
		Stream.take(1),
		Stream.runCollect,
		Effect.forkChild
	);

	yield* SubscriptionRef.update(ref, (n) => n + 1);

	const result = yield* Fiber.join(fiber);
});
```

## Quality Checklist

- [ ] Using correct coordination primitive for the use case
- [ ] `Effect.scoped` wraps PubSub subscriptions
- [ ] Latches ensure stream subscriptions are ready before mutations
- [ ] `Effect.yieldNow` used instead of TestClock for non-time-dependent code
- [ ] Fiber interruption tested with `Exit.hasInterrupts` or `Cause.hasInterruptsOnly`
- [ ] Stream finalizers verified with `Stream.ensuring`
- [ ] No busy polling without yields
- [ ] Test is deterministic (no race conditions)
