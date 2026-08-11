---
name: effect-stream
description: Build effectful pull-based streaming pipelines with Effect Stream — creation, transformation, consumption, NDJSON/Msgpack encoding, concurrency, resource safety. Use when working with values produced over time, paginated APIs, event listeners, or streaming I/O.
---

You are an Effect TypeScript expert specializing in pull-based streaming with `Stream`, `Sink`, and `Channel`.

## Effect Source Reference

The Effect v4 source is available at `~/.cache/effect-v4/`.
Browse and read files there directly to look up APIs, types, and implementations.

Reference this for:

- Stream constructors and combinators (`packages/effect/src/Stream.ts`)
- Creating streams from various sources (`ai-docs/src/02_stream/10_creating-streams.ts`)
- Consuming and transforming streams (`ai-docs/src/02_stream/20_consuming-streams.ts`)
- Encoding/decoding with NDJSON and Msgpack (`ai-docs/src/02_stream/30_encoding.ts`)

## Core Model

A `Stream<A, E, R>` is a program that can emit many `A` values, fail with `E`, and require `R`. Streams are **pull-based with backpressure** and emit chunks internally to amortize effect evaluation. They support monadic composition and error handling similar to `Effect`, adapted for multiple values.

```ts
import { Effect, Schedule, Schema, Sink, Stream } from 'effect';
import { Ndjson, Msgpack } from 'effect/unstable/encoding';
```

For Node.js readable streams:

```ts
import { NodeStream } from '@effect/platform-node';
```

---

## 1. Creating Streams

### From values and iterables

```ts
// Fixed values
const s1 = Stream.make(1, 2, 3);

// From any iterable
const s2 = Stream.fromIterable([1, 2, 3, 4, 5]);

// Integer range (inclusive on both ends)
const s3 = Stream.range(1, 100);

// Infinite stream via pure iteration
const s4 = Stream.iterate(1, (n) => n * 2); // 1, 2, 4, 8, ...

// Single value from an effect
const s5 = Stream.fromEffect(Effect.succeed(42));

// Empty stream
const s6 = Stream.empty;
```

### From effects (polling / repeating)

```ts
// Poll an effect on a schedule — useful for metrics, health checks, cache refresh
const samples = Stream.fromEffectSchedule(
	Effect.succeed(3),
	Schedule.spaced('30 seconds')
).pipe(Stream.take(10));

// Repeat an effect forever (no schedule delay)
const forever = Stream.fromEffectRepeat(Effect.succeed('tick'));
```

### Paginated APIs

`Stream.paginate` drives cursor-based pagination. Return the current page and `Option.some(nextCursor)` or `Option.none()` to stop.

```ts
import * as Option from 'effect/Option';

const fetchAllPages = Stream.paginate(
	0, // initial cursor
	Effect.fn(function* (page) {
		yield* Effect.sleep('50 millis'); // simulate network
		const results = Array.from(
			{ length: 100 },
			(_, i) => `Job ${i + 1 + page * 100}`
		);
		const nextPage = page < 10 ? Option.some(page + 1) : Option.none();
		return [results, nextPage] as const;
	})
);
```

### From async iterables

```ts
class IterError extends Schema.TaggedErrorClass<IterError>()('IterError', {
	cause: Schema.Defect()
}) {}

async function* generate() {
	yield 'a';
	yield 'b';
	yield 'c';
}

const letters = Stream.fromAsyncIterable(
	generate(),
	(cause) => new IterError({ cause })
);
```

### From DOM events

```ts
// Direct event listener binding
const clicks = Stream.fromEventListener<PointerEvent>(button, 'click');
```

### From callback-based APIs

`Stream.callback` gives you a `Queue` to push values into. Use `Effect.acquireRelease` inside to register/unregister listeners with guaranteed cleanup.

```ts
const callbackStream = Stream.callback<PointerEvent>(
	Effect.fn(function* (queue) {
		function onEvent(event: PointerEvent) {
			Queue.offerUnsafe(queue, event);
		}
		yield* Effect.acquireRelease(
			Effect.sync(() => button.addEventListener('click', onEvent)),
			() =>
				Effect.sync(() => button.removeEventListener('click', onEvent))
		);
	})
);
```

Options: `{ bufferSize?: number, strategy?: "sliding" | "dropping" | "suspend" }`

### From ReadableStream (DOM/Web)

```ts
const webStream = Stream.fromReadableStream({
	evaluate: () => response.body!,
	onError: (cause) => new MyError({ cause }),
	releaseLockOnEnd: false // default: cancels reader; true releases lock instead
});
```

### From Node.js readable streams

```ts
import { NodeStream } from '@effect/platform-node';
import { Readable } from 'node:stream';

class NodeErr extends Schema.TaggedErrorClass<NodeErr>()('NodeErr', {
	cause: Schema.Defect()
}) {}

const nodeStream = NodeStream.fromReadable({
	evaluate: () => Readable.from(['Hello', ' ', 'world']),
	onError: (cause) => new NodeErr({ cause }),
	closeOnDone: true // true by default
});
```

### Advanced constructors

```ts
// Unwrap: create a stream from an effect that returns a stream
const unwrapped = Stream.unwrap(Effect.succeed(Stream.make(1, 2, 3)));

// From a Channel directly
const fromChan = Stream.fromChannel(myChannel);
```

---

## 2. Transforming Streams

### Pure transforms

```ts
// Per-element mapping (receives element and index)
stream.pipe(Stream.map((value, index) => value * 2));

// Filter elements
stream.pipe(Stream.filter((x) => x > 10));

// Windowing
stream.pipe(Stream.take(5)); // first 5 elements
stream.pipe(Stream.drop(3)); // skip first 3
stream.pipe(Stream.takeWhile((x) => x < 100));
```

### Effectful transforms

```ts
// mapEffect with concurrency control
stream.pipe(
	Stream.mapEffect((order) => enrichOrder(order), { concurrency: 4 })
);
```

### FlatMap

Transform each element into a stream and flatten. Supports concurrency.

```ts
Stream.make('US', 'CA', 'NZ').pipe(
	Stream.flatMap(
		(country) =>
			Stream.range(1, 50).pipe(
				Stream.map((i) => ({ id: `${country}_${i}`, country }))
			),
		{ concurrency: 2 }
	)
);
```

### Accumulation

```ts
// Running accumulator — emits initial state plus each accumulated state
// Output: [0, 1, 3, 6]
Stream.make(1, 2, 3).pipe(Stream.scan(0, (acc, n) => acc + n));

// Effectful variant
Stream.make(1, 2, 3).pipe(
	Stream.scanEffect(0, (acc, n) => Effect.succeed(acc + n))
);
```

### Grouping and batching

```ts
// Group into fixed-size chunks
stream.pipe(Stream.grouped(100));

// Group by size OR time window (whichever comes first)
stream.pipe(Stream.groupedWithin(100, '1 second'));
```

### Rate control

```ts
// Debounce — emit only the latest element after a pause
stream.pipe(Stream.debounce('300 millis'));

// Throttle — control throughput
stream.pipe(
	Stream.throttle({
		cost: () => 1,
		units: 10,
		duration: '1 second',
		strategy: 'shape' // "shape" delays, "enforce" drops
	})
);

// Timeout — end stream if no element produced within duration
stream.pipe(Stream.timeout('5 seconds'));

// Timeout with fallback — switch to another stream on timeout
stream.pipe(
	Stream.timeoutOrElse({
		duration: '5 seconds',
		orElse: () => Stream.make(fallbackValue)
	})
);
```

Both `timeout` and `timeoutOrElse` are dual functions. `timeout` is implemented as `timeoutOrElse` with `Stream.empty` as the fallback. Non-finite durations return the stream unchanged; zero duration immediately switches to `orElse`.

### Indexing and neighbors

```ts
stream.pipe(Stream.zipWithIndex); // [A, number]
stream.pipe(Stream.zipWithNext); // [A, Option<A>]
stream.pipe(Stream.zipWithPrevious); // [Option<A>, A]
stream.pipe(Stream.zipWithPreviousAndNext); // [Option<A>, A, Option<A>]
```

---

## 3. Consuming Streams

All `run*` methods return `Effect` values — the stream is only pulled when the effect is executed.

```ts
// Collect all elements into an array
const all = Stream.runCollect(stream);
// Effect<Array<A>, E, R>

// Run for side effects, ignore output
const drained = Stream.runDrain(stream);
// Effect<void, E, R>

// Execute effectful consumer per element
stream.pipe(Stream.runForEach((item) => Effect.log(`Got: ${item}`)));
// Effect<void, E, R>

// Fold to a single value (initial is a LazyArg — a thunk)
stream.pipe(
	Stream.runFold(
		() => 0,
		(acc, n) => acc + n
	)
);
// Effect<number, E, R>

// First / last element as Option
Stream.runHead(stream); // Effect<Option<A>, E, R>
Stream.runLast(stream); // Effect<Option<A>, E, R>

// Count / Sum helpers
Stream.runCount(stream); // Effect<number, E, R>
Stream.runSum(stream); // Effect<number, E, R> (stream must be Stream<number>)

// Consume with a Sink
stream.pipe(
	Stream.map((order) => order.totalCents),
	Stream.run(Sink.sum)
);
```

---

## 4. Encoding & Decoding (NDJSON / Msgpack)

Use `Stream.pipeThroughChannel` with codec channels from `effect/unstable/encoding`.

```ts
import { Ndjson, Msgpack } from 'effect/unstable/encoding';
```

### Text decoding (split multi-byte characters)

To turn a byte stream into text, use `Stream.decodeText` (or `Channel.decodeText`) rather than hand-rolling `new TextDecoder().decode(chunk)` per chunk. These helpers decode with streaming enabled, so multi-byte UTF-8 characters split across `Uint8Array` chunk boundaries are reassembled correctly; per-chunk `TextDecoder` calls would corrupt characters that straddle a boundary.

```ts
byteStream.pipe(Stream.decodeText, Stream.runForEach(handleText));
```

### NDJSON — string variants

```ts
// Decode: raw NDJSON string → parsed JSON objects
rawStream.pipe(
	Stream.pipeThroughChannel(Ndjson.decodeString()),
	Stream.runCollect
);

// Decode with schema validation
rawStream.pipe(
	Stream.pipeThroughChannel(Ndjson.decodeSchemaString(MySchema)()),
	Stream.runCollect
);

// Encode: objects → NDJSON strings
objectStream.pipe(
	Stream.pipeThroughChannel(Ndjson.encodeString()),
	Stream.runCollect
);

// Encode through schema (applies transforms like date formatting)
typedStream.pipe(
	Stream.pipeThroughChannel(Ndjson.encodeSchemaString(MySchema)()),
	Stream.runCollect
);
```

### NDJSON — binary variants (Uint8Array)

For TCP sockets, file descriptors, etc.

```ts
binaryStream.pipe(Stream.pipeThroughChannel(Ndjson.decode())); // Uint8Array → objects
objectStream.pipe(Stream.pipeThroughChannel(Ndjson.encode())); // objects → Uint8Array
```

### NDJSON options

```ts
// Ignore blank lines instead of raising NdjsonError
Stream.pipeThroughChannel(Ndjson.decodeString({ ignoreEmptyLines: true }));
```

### Msgpack

Same API shape — replace `Ndjson` with `Msgpack`. Note that `Msgpack.decodeSchema(schema)` is curried: it returns a factory you must invoke (`()`) to get the `Channel` value passed to `Stream.pipeThroughChannel`, exactly like the NDJSON schema helpers.

```ts
const decoder = Msgpack.decodeSchema(
	Schema.Struct({
		id: Schema.Number,
		name: Schema.String
	})
)();

binaryStream.pipe(Stream.pipeThroughChannel(decoder), Stream.runCollect);
```

### Realistic pipeline: decode → transform → re-encode

```ts
const pipeline = rawNdjsonStream.pipe(
	Stream.pipeThroughChannel(Ndjson.decodeSchemaString(LogEntry)()),
	Stream.filter((entry) => entry.level === 'error'),
	Stream.pipeThroughChannel(Ndjson.encodeSchemaString(LogEntry)()),
	Stream.runCollect
);
```

### Handling encoding errors

`Ndjson.NdjsonError` has a `kind` field: `"Pack"` (encoding) or `"Unpack"` (decoding).

```ts
rawStream.pipe(
	Stream.pipeThroughChannel(Ndjson.decodeString()),
	Stream.catchTag('NdjsonError', (err) =>
		Stream.succeed({ recovered: true, kind: err.kind })
	),
	Stream.runCollect
);
```

---

## 5. Error Handling

### catchTag / catchTags

Recover from specific tagged errors, producing a fallback stream.

```ts
stream.pipe(
	Stream.catchTag('NetworkError', (err) => Stream.succeed(fallbackValue))
);
```

### retry

Retry a failing stream with a schedule. The stream restarts from the beginning on each retry.

```ts
stream.pipe(Stream.retry(Schedule.recurs(3)));

// With exponential backoff
stream.pipe(Stream.retry(Schedule.exponential('100 millis')));
```

### orElseIfEmpty / orElseSucceed

```ts
// Provide a default stream if the source emits nothing
stream.pipe(Stream.orElseIfEmpty(() => Stream.make(defaultValue)));

// Provide a single fallback value when the source fails
stream.pipe(Stream.orElseSucceed((error) => defaultValue));
```

---

## 6. Concurrency & Merging

### merge

Interleave elements from two streams concurrently in arrival order.

```ts
Stream.merge(streamA, streamB);
Stream.merge(streamA, streamB, { haltStrategy: 'left' }); // stop when left ends
// HaltStrategy: "left" | "right" | "both" | "either"
```

### mergeAll

Merge many streams concurrently. The streams are passed as a single **iterable**, followed by the options.

```ts
Stream.mergeAll([streamA, streamB, streamC], {
	concurrency: 4
});
```

### interleave

Deterministically alternate elements from two streams (round-robin).

```ts
Stream.interleave(left, right);

// Custom interleave pattern via boolean decider stream
Stream.interleaveWith(left, right, Stream.make(true, false, false, true));
```

### mergeResult

Tag values from two streams: left as `Result.succeed`, right as `Result.fail`.

```ts
Stream.mergeResult(left, right); // Stream<Result<LeftA, RightA>>
```

### mergeEffect

Run a background effect concurrently with a stream; keep the stream's elements.

```ts
stream.pipe(Stream.mergeEffect(Effect.log('background task')));
```

### zipWith

Pair elements from two streams positionally.

```ts
Stream.zipWith(numbersStream, labelsStream, (n, label) => `${label}: ${n}`);
```

### broadcast

PubSub-backed multicast: the source is consumed once and fanned out to every subscriber. Returns a scoped effect, and the **producer starts immediately** — it does not wait for subscribers to attach.

```ts
Effect.scoped(
	Effect.gen(function* () {
		const shared = yield* stream.pipe(
			Stream.broadcast({ capacity: 16, replay: 3 })
		);
		// Each consumer subscribes independently. Because the producer starts
		// immediately, a late subscriber only sees values still held in `replay`.
		const fiberA = yield* Stream.runCollect(shared).pipe(Effect.forkChild);
		const fiberB = yield* Stream.runCollect(shared).pipe(Effect.forkChild);
		// ...
	})
);
```

Options: `{ capacity: number | "unbounded", strategy?: "sliding" | "dropping" | "suspend", replay?: number }`

Because the producer starts immediately, subscribers that attach after the source has already emitted will miss earlier values unless `replay` is configured (and `replay` only retains the most recent N values — it is not a full log). For a **fixed, known set of consumers**, prefer `broadcastN`: it subscribes all downstream streams before starting the source, so none of them miss values.

### broadcastN

Fixed-fanout multicast (added in beta.68). Produces a tuple of `n` streams; the source starts only **after all `n` downstream streams have been subscribed**, so every consumer sees the full sequence without needing `replay`. If a downstream stream is interrupted, it unsubscribes and no longer contributes backpressure.

```ts
Effect.scoped(
	Effect.gen(function* () {
		const [left, right] = yield* Stream.make(1, 2, 3).pipe(
			Stream.broadcastN({ n: 2, capacity: 8 })
		);

		const [leftValues, rightValues] = yield* Effect.all(
			[Stream.runCollect(left), Stream.runCollect(right)],
			{ concurrency: 'unbounded' }
		);
		// leftValues and rightValues each === [1, 2, 3]
	})
);
```

Options: `{ n: number, capacity: number | "unbounded", strategy?: "sliding" | "dropping" | "suspend", replay?: number }`

### share

Like broadcast but subscribes lazily when the first consumer starts, keeps upstream alive while consumers exist.

```ts
const shared = yield* stream.pipe(Stream.share({ capacity: 16 }));
```

---

## 7. Resource Safety

### scoped

Run a stream that requires `Scope` in a managed scope, ensuring finalizers run when the stream completes.

```ts
const safeStream = Stream.scoped(
	Stream.fromEffect(
		Effect.acquireRelease(
			Effect.log('acquire').pipe(Effect.as('resource')),
			() => Effect.log('release')
		)
	)
);
// Stream<string, never, never> — Scope is eliminated
```

As of beta.69, `Stream.scoped` provides its managed scope to the **pull effects** as well — including effects created by `Stream.fromEffect` and by sequential `Stream.mapEffect`. So `Effect.acquireRelease` finalizers used inside those pulls run when the stream completes, not leaked until the outer program ends.

### unwrap

Create a stream from an effect that produces a stream. The outer effect runs once; the inner stream is then consumed.

```ts
const stream = Stream.unwrap(
	Effect.gen(function* () {
		const config = yield* loadConfig;
		return Stream.fromIterable(config.items);
	})
);
```

### callback with acquireRelease

The `Stream.callback` constructor accepts a scoped effect, so you can register and unregister resources:

```ts
Stream.callback<Event>(
	Effect.fn(function* (queue) {
		yield* Effect.acquireRelease(
			Effect.sync(() =>
				emitter.on('data', (e) => Queue.offerUnsafe(queue, e))
			),
			() => Effect.sync(() => emitter.removeAllListeners('data'))
		);
	})
);
```

---

## 8. Piping Through Channels

`Stream.pipeThroughChannel` connects a stream to a `Channel` for encode/decode, compression, framing, etc.

```ts
// pipeThroughChannel: upstream errors flow into the channel
stream.pipe(Stream.pipeThroughChannel(myChannel));

// pipeThroughChannelOrFail: upstream errors preserved alongside channel errors
stream.pipe(Stream.pipeThroughChannelOrFail(myChannel));
```

---

## Key Patterns

### Pagination → transform → consume

```ts
const pipeline = Stream.paginate(0, fetchPage).pipe(
	Stream.mapEffect(enrichItem, { concurrency: 8 }),
	Stream.filter((item) => item.isValid),
	Stream.grouped(50),
	Stream.runForEach((batch) => writeBatch(batch))
);
```

### Event stream → debounce → side effect

```ts
const autosave = Stream.fromEventListener(input, 'input').pipe(
	Stream.debounce('500 millis'),
	Stream.mapEffect((e) => saveDocument(e.target.value)),
	Stream.runDrain
);
```

### Decode NDJSON file → filter → re-encode

```ts
const filterErrors = fileStream.pipe(
	Stream.pipeThroughChannel(Ndjson.decodeSchemaString(LogEntry)()),
	Stream.filter((entry) => entry.level === 'error'),
	Stream.pipeThroughChannel(Ndjson.encodeSchemaString(LogEntry)()),
	Stream.runCollect
);
```

### Retry with backoff

```ts
const resilient = unreliableStream.pipe(
	Stream.retry(Schedule.exponential('100 millis').pipe(Schedule.take(5))),
	Stream.runCollect
);
```

`Schedule.take(n)` bounds an unbounded schedule to `n` recurrences (`Schedule.compose` is not exported in beta.74). To log full retry metadata without changing the schedule's behavior, add `Schedule.tap`, whose callback receives `{ attempt, input, output, duration, elapsed }`:

```ts
const monitored = Schedule.exponential('100 millis').pipe(
	Schedule.take(5),
	Schedule.tap((meta) =>
		Effect.log(
			`attempt ${meta.attempt}, next delay ${meta.duration}, elapsed ${meta.elapsed}`
		)
	)
);
```

## Common Mistakes

1. **Forgetting `runFold` initial is a thunk** — `Stream.runFold(() => 0, f)` not `Stream.runFold(0, f)`
2. **Using `Stream.acquireRelease` when it doesn't exist** — use `Stream.scoped` + `Effect.acquireRelease` or `Stream.callback` with `Effect.acquireRelease` instead
3. **Not specifying `onError` for `fromAsyncIterable` / `fromReadableStream`** — these require an error mapper
4. **Assuming `retry` resumes** — `Stream.retry` restarts the entire stream from the beginning on each retry
5. **Ignoring `haltStrategy` on `merge`** — default is `"both"` (wait for both to end); use `"either"` to stop as soon as one ends
