---
name: effect-pubsub-event-bus
description: Build typed event buses using Effect PubSub and Stream. Use this skill when implementing publish/subscribe communication between services, replacing callback-based event systems, or building reactive service architectures with typed event streams.
---

# PubSub Event Bus with Effect v4

## Overview

Effect's `PubSub` module provides a typed, composable publish/subscribe primitive. Combined with `Stream.fromPubSub` and `Effect.forkScoped`, it replaces imperative callback-based event buses with a fully typed, stream-based subscription model where cleanup is automatic.

**When to use this skill:**

- Building intra-service communication (event bus, message broker)
- Replacing callback-based event systems with typed streams
- Implementing reactive patterns where services subscribe to domain events
- Managing per-instance event channels with scoped cleanup

## Import Pattern

```typescript
import { Effect, PubSub, Stream } from 'effect';
```

## Core Pattern: Typed Event Bus Service

Define events as a discriminated union, then build a Bus service that publishes and subscribes using `PubSub`:

```typescript
import { Effect, Layer, PubSub, Schema, Context, Stream } from 'effect';

// ─── Event Definitions ──────────────────────────────────────

class FileChanged extends Schema.TaggedClass<FileChanged>()('FileChanged', {
	path: Schema.String,
	kind: Schema.Literals(['created', 'modified', 'deleted'])
}) {}

class ConfigReloaded extends Schema.TaggedClass<ConfigReloaded>()(
	'ConfigReloaded',
	{
		source: Schema.String
	}
) {}

type BusEvent = FileChanged | ConfigReloaded;

// ─── Bus Service ─────────────────────────────────────────────

export namespace Bus {
	export interface Interface {
		readonly publish: (event: BusEvent) => Effect.Effect<void>;
		readonly subscribe: <T extends BusEvent>(
			eventClass: new (...args: ReadonlyArray<never>) => T
		) => Stream.Stream<T>;
		readonly subscribeAll: Stream.Stream<BusEvent>;
	}

	export class Service extends Context.Service<Service, Interface>()(
		'@app/Bus'
	) {}

	export const layer = Layer.effect(
		Service,
		Effect.gen(function* () {
			const pubsub = yield* PubSub.unbounded<BusEvent>();

			// Cleanup: shutdown PubSub when scope closes
			yield* Effect.addFinalizer(() => PubSub.shutdown(pubsub));

			const publish = Effect.fn('Bus.publish')(function* (
				event: BusEvent
			) {
				yield* PubSub.publish(pubsub, event);
			});

			const subscribe = <T extends BusEvent>(
				eventClass: new (...args: ReadonlyArray<never>) => T
			): Stream.Stream<T> =>
				Stream.fromPubSub(pubsub).pipe(
					Stream.filter((evt): evt is T => evt instanceof eventClass)
				);

			const subscribeAll = Stream.fromPubSub(pubsub);

			return Service.of({ publish, subscribe, subscribeAll });
		})
	);
}
```

## Subscribing to Events

Consumers use `Stream.fromPubSub` (via the Bus service) + `Effect.forkScoped` to register subscriptions that are automatically cleaned up when the scope closes:

```typescript
import { Effect, Stream } from 'effect';

const setupFileWatcher = Effect.gen(function* () {
	const bus = yield* Bus.Service;

	// Fork a scoped fiber that processes FileChanged events
	yield* bus.subscribe(FileChanged).pipe(
		Stream.filter((evt) => evt.path.endsWith('.ts')),
		Stream.runForEach((evt) =>
			Effect.gen(function* () {
				yield* Effect.logInfo(
					`File changed: ${evt.path} (${evt.kind})`
				);
				yield* reloadModule(evt.path);
			})
		),
		Effect.forkScoped
	);
});
```

Key points:

- **`Effect.forkScoped`** ties the subscription fiber's lifetime to the enclosing scope — no explicit unsubscribe needed
- **Stream combinators** (`filter`, `map`, `debounce`, `groupBy`) compose naturally before `runForEach`
- **No `acquireRelease` bookkeeping** — the stream and its fiber are cleaned up automatically

### Why `forkScoped` and not `forkChild`

`Effect.forkScoped` ties the fiber to the `Scope` lifecycle, while `Effect.forkChild` ties it to the parent fiber. For subscriptions registered during service construction (inside `Layer.effect`), `forkScoped` is correct because the subscription must live as long as the layer's scope, not the constructing fiber.

## Publishing Events

Publishing is straightforward — call `PubSub.publish` or use the Bus service:

```typescript
const onFileChange = Effect.fn('Watcher.onFileChange')(function* (
	path: string,
	kind: 'created' | 'modified' | 'deleted'
) {
	const bus = yield* Bus.Service;
	yield* bus.publish(new FileChanged({ path, kind }));
});
```

## Pattern: Per-Type PubSub Channels

For high-throughput systems, maintain a `Map` of per-type PubSub channels to avoid filtering overhead on the wildcard channel:

```typescript
import { Effect, PubSub, Stream } from 'effect';

interface Payload {
	readonly type: string;
	readonly data: unknown;
}

const make = Effect.gen(function* () {
	const wildcard = yield* PubSub.unbounded<Payload>();
	const typed = new Map<string, PubSub.PubSub<Payload>>();

	yield* Effect.addFinalizer(() =>
		Effect.gen(function* () {
			yield* PubSub.shutdown(wildcard);
			for (const ps of typed.values()) {
				yield* PubSub.shutdown(ps);
			}
		})
	);

	const getOrCreate = (type: string) =>
		Effect.gen(function* () {
			const existing = typed.get(type);
			if (existing) return existing;
			const ps = yield* PubSub.unbounded<Payload>();
			typed.set(type, ps);
			return ps;
		});

	const publish = Effect.fn('Bus.publish')(function* (event: Payload) {
		yield* PubSub.publish(wildcard, event);
		const ps = typed.get(event.type);
		if (ps) yield* PubSub.publish(ps, event);
	});

	const subscribe = (type: string): Stream.Stream<Payload> =>
		Stream.unwrap(
			getOrCreate(type).pipe(Effect.map((ps) => Stream.fromPubSub(ps)))
		);

	const subscribeAll = Stream.fromPubSub(wildcard);

	return { publish, subscribe, subscribeAll };
});
```

## Pattern: Graceful Shutdown Event

Publish a final event before shutting down PubSub channels so subscribers can perform cleanup:

```typescript
yield*
	Effect.addFinalizer(() =>
		Effect.gen(function* () {
			// Notify all subscribers that the bus is shutting down
			yield* PubSub.publish(
				wildcard,
				new InstanceDisposed({ reason: 'scope-closed' })
			);
			// Then shut down the channel
			yield* PubSub.shutdown(wildcard);
		})
	);
```

Subscribers can detect this event and perform teardown:

```typescript
yield*
	bus.subscribeAll.pipe(
		Stream.takeUntil((evt) => evt instanceof InstanceDisposed),
		Stream.runForEach(handleEvent),
		Effect.forkScoped
	);
```

## Testing PubSub Services

Testing PubSub subscriptions requires specific choreography:

1. Fork the consumer fiber
2. Wait for subscriber readiness explicitly when possible; otherwise use a tiny registration barrier
3. Publish events
4. Gate on a `Deferred` for synchronization

```typescript
import { Deferred, Effect, PubSub, Stream } from 'effect';

it.effect('should receive published events', () =>
	Effect.gen(function* () {
		const bus = yield* Bus.Service;
		const received: Array<string> = [];
		const done = yield* Deferred.make<void>();

		// 1. Fork the consumer
		yield* bus.subscribe(FileChanged).pipe(
			Stream.runForEach((evt) =>
				Effect.gen(function* () {
					received.push(evt.path);
					if (received.length === 2) {
						yield* Deferred.succeed(done, undefined);
					}
				})
			),
			Effect.forkScoped
		);

		// 2. Registration barrier
		yield* Effect.sleep('10 millis');

		// 3. Publish events
		yield* bus.publish(new FileChanged({ path: 'a.ts', kind: 'modified' }));
		yield* bus.publish(new FileChanged({ path: 'b.ts', kind: 'created' }));

		// 4. Wait for events to be received
		yield* Deferred.await(done);

		expect(received).toEqual(['a.ts', 'b.ts']);
	}).pipe(Effect.provide(Bus.layer))
);
```

**Notes:**

- The `runForEach` handler is effectful, so complete the gate with `yield* Deferred.succeed(done, undefined)`. There is no `Deferred.unsafeDone` in v4; reach for the low-level `Deferred.doneUnsafe(done, Effect.void)` only inside a truly synchronous callback that has no surrounding effect.
- The tiny sleep above is an acceptable fallback for `Stream.fromPubSub` registration when no explicit readiness hook exists. If you control the consumer stream, prefer a readiness `Deferred` or latch instead.
- To drain a `PubSub` subscription for assertions, prefer `PubSub.takeUpTo(sub, n)`: it returns immediately with whatever is buffered (possibly an empty array). `PubSub.takeAll(sub)` **suspends when the subscription is empty** and returns a `NonEmptyArray`, so it cannot be used to assert “no more events” — it would hang waiting for one.

## PubSub Configuration

### Bounded vs Unbounded

```typescript
// Unbounded — no capacity limit / backpressure for active subscribers
const ps = yield* PubSub.unbounded<Event>();

// Bounded — applies backpressure when full
const ps = yield* PubSub.bounded<Event>(1024);

// Sliding — drops oldest events when full
const ps = yield* PubSub.sliding<Event>(1024);

// Dropping — drops newest events when full
const ps = yield* PubSub.dropping<Event>(1024);

// Optional replay buffer: late subscribers first receive the most recent N values
const withReplay = yield* PubSub.unbounded<Event>({ replay: 10 });
const boundedReplay = yield* PubSub.bounded<Event>({ capacity: 1024, replay: 10 });
```

Choose based on your use case:

- **`unbounded`** — no capacity limit or backpressure; nothing is dropped for subscribers that are already attached
- **`bounded`** — when backpressure is acceptable and memory must be bounded
- **`sliding`** — when the latest events matter most (metrics, status updates)
- **`dropping`** — when burst absorption is needed but current events take priority

**PubSub is not an event log.** Messages are delivered to *active* subscribers only. A subscriber that attaches after a value was published does not see that value unless a `replay` buffer is configured, and `replay` only retains the most recent N values — it is bounded, recent-only, and not durable storage. If you need every consumer to observe the full history, subscribe before publishing (see the testing choreography above) or persist events separately.

## DO / DON'T

### DO: Use `Stream.fromPubSub` + `forkScoped` for subscriptions

```typescript
yield*
	Stream.fromPubSub(pubsub).pipe(
		Stream.filter(isRelevant),
		Stream.runForEach(handle),
		Effect.forkScoped
	);
```

### DON'T: Use `PubSub.subscribe` with manual cleanup

```typescript
// ❌ Overly complex — manual subscription management
const sub = yield* PubSub.subscribe(pubsub);
yield* Effect.acquireRelease(Effect.succeed(sub), (s) => Queue.shutdown(s));
```

### DO: Shut down PubSub in finalizers

```typescript
yield* Effect.addFinalizer(() => PubSub.shutdown(pubsub));
```

### DON'T: Leave PubSub channels open

```typescript
// ❌ Resource leak — subscribers may hang indefinitely
const pubsub = yield* PubSub.unbounded<Event>();
// No shutdown registered
```

### DO: Use `Stream.takeUntil` for shutdown-aware subscriptions

```typescript
yield*
	stream.pipe(
		Stream.takeUntil((evt) => evt instanceof ShutdownEvent),
		Stream.runForEach(handle),
		Effect.forkScoped
	);
```

## Related Skills

- **effect-service-implementation**: Service declaration patterns
- **effect-layer-design**: Layer composition and dependency management
- **effect-stream**: Stream processing patterns
- **effect-testing**: Testing Effect programs with @effect/vitest
