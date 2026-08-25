---
name: effect-scheduling
description: Design Effect v4 retries, repeats, polling, pacing, backoff, jitter, rate-limit-aware delays, and timeouts with Schedule. Use when replacing manual sleep loops or defining recurrence and failure policy.
---

You are an Effect TypeScript expert specializing in `Schedule`, retry, repeat, polling, and time policy.

## Source Of Truth

Verify APIs against `~/.local/share/opencode/repos/github.com/Effect-TS/effect@main/packages/effect/src/Schedule.ts` and `Effect.ts`. In Effect v4, `Schedule.concat` is current, `Schedule.tapInput` is absent, and `Schedule.tap` receives full metadata.

## Semantics

- `Effect.retry` reruns typed failures. It does not retry defects or interruption.
- `Effect.repeat` reruns successes. A typed failure stops repetition unless the pass handles it first.
- The source effect runs once before the schedule is stepped.
- `Schedule.recurs(3)` permits three recurrences after the initial evaluation: at most four evaluations total.
- Schedules can require services and fail; schedule errors join the resulting effect's error channel.
- Retry only the narrowest idempotent operation. Never retry non-idempotent writes unless an idempotency key, transaction, or equivalent guarantee makes replay safe.

## Policy Chooser

- Counter only: `Schedule.recurs(n)`.
- Delay after each completed run: `Schedule.spaced(duration)`.
- Cadence aligned to time boundaries: `Schedule.fixed(interval)`; slow work may make the next run immediate, and missed ticks are not replayed.
- Backoff: `Schedule.exponential(base)` or `Schedule.fibonacci(base)`.
- Desynchronize callers: pipe through `Schedule.jittered`.
- Bound an existing delay schedule: `Schedule.upTo({ times, duration })`.
- Run one schedule after another: `Schedule.concat(first, second)`; use `concatResult` when phase identity matters.
- Stop from full metadata: `Schedule.while(predicate)`; a type-guard predicate narrows both schedule input and output.
- Observe decisions: `Schedule.tap(({ attempt, input, output, duration, elapsed }) => ...)`.

```ts
const retryPolicy = Schedule.exponential('100 millis').pipe(
	Schedule.jittered,
	Schedule.upTo({ times: 5 }),
	Schedule.tap(({ attempt, input, duration, elapsed }) =>
		Effect.logWarning('request retry').pipe(
			Effect.annotateLogs({ attempt, error: input, duration, elapsed })
		)
	)
);

const result = request.pipe(
	Effect.retryOrElse(retryPolicy, (error, scheduleOutput) =>
		Effect.logError('request retries exhausted', error).pipe(
			Effect.zipRight(fallback(error, scheduleOutput))
		)
	)
);
```

`retryOrElse` receives the final typed error and the schedule's terminal output. A fallback must be truthful; otherwise let the final failure remain visible.

`Schedule.while` supports refinement predicates in both data-first and data-last forms. The resulting schedule carries the narrowed `metadata.input` and `metadata.output` types:

```ts
declare const mixed: Schedule.Schedule<number | string, Date | boolean>;

const numericDates = mixed.pipe(
	Schedule.while(
		(metadata): metadata is Schedule.Metadata<number, Date> =>
			typeof metadata.output === 'number' && metadata.input instanceof Date
	)
);
// Schedule.Schedule<number, Date>
```

## Polling And Item Failure Policy

Use `Effect.repeat(pass, Schedule.spaced(...))` for a worker that emits no meaningful values. Use `Stream.fromEffectSchedule` when each result is part of a stream pipeline.

Decide failures at the correct granularity:

- Pass failure should stop the worker: leave it typed and let the owner monitor the fiber.
- Expected pass failure should be logged and polling continue: handle that typed error inside `pass`, then repeat the successful handled pass.
- One bad item should not stop a batch: catch expected typed errors around each item only when skip/retry-later is actual product policy.
- Defects should reach supervision. Interruption is normal shutdown and must not be converted into a retryable error.

Long-lived polling fibers need explicit ownership. `forkScoped` ties lifetime to a scope but does not restart or propagate child failure automatically; monitor/join or supervise according to runtime policy.

## Rate-Limit-Aware Retry

Use `Schedule.modifyDelay` to select the greater of computed backoff and a typed provider retry delay. The callback is effectful and receives metadata; `Schedule.passthrough` is unnecessary when only `metadata.input` is needed.

```ts
const providerPolicy = Schedule.exponential('200 millis').pipe(
	Schedule.jittered,
	Schedule.upTo({ times: 5 }),
	Schedule.modifyDelay(({ input, duration }) =>
		Effect.succeed(
			Option.match(input.retryAfter, {
				onNone: () => duration,
				onSome: (retryAfter) => Duration.max(duration, retryAfter)
			})
		)
	)
);
```

Apply this to typed rate-limit/transient failures only. Do not retry authentication, validation, quota exhaustion, or permanent not-found failures without an explicit reason.

## Timeouts And Delays

- `Effect.timeout(duration)` interrupts the source on expiry and fails with `Cause.TimeoutError`.
- `Effect.timeoutOption(duration)` represents only timeout as `Option.none` while preserving source failures.
- `Effect.timeoutOrElse({ duration, orElse })` runs a typed fallback after interrupting the source.
- `Effect.delay(duration)` delays the start of one effect.
- `Effect.sleep(duration)` is appropriate when sleeping itself is workflow behavior.
- Do not build recurring work with manual sleep loops; compose `repeat`/`retry` with `Schedule`.
- Test time policies with `TestClock`, not real sleeps.

## Checklist

- Retry and repeat semantics are not confused.
- Initial attempt plus recurrence count is documented.
- Backoff is bounded and jittered where many callers can synchronize.
- Retried work is idempotent.
- Poll and per-item failure policies are explicit.
- Interruption remains cancellation.
- Exhaustion is observable or has a truthful fallback.
- Rate-limit metadata influences delay through `modifyDelay`.
- Refinement predicates passed to `Schedule.while` preserve their narrowed input and output types.
- No removed `Schedule.tapInput` or old sequential-composition name is used.
