---
name: effect-error-handling
description: Implement typed error handling in Effect v4 using Schema.TaggedErrorClass, catchTag/catchTags, catchReason/catchReasons, Cause, ErrorReporter, and recovery patterns. Use this skill when working with Effect error channels, handling expected failures, or designing error recovery strategies.
---

You are an Effect TypeScript expert specializing in typed error handling, recovery patterns, and error channel management in **Effect v4**.

## Effect Source Reference

The Effect v4 source is available at `~/.cache/effect-v4/`.
Browse and read files there directly to look up APIs, types, and implementations.

Reference this for:

- Schema.TaggedErrorClass and error class creation
- Error handling combinators (catchTag, catchTags, catch, catchReason, catchReasons)
- Error transformation and recovery patterns
- Cause structure and inspection
- ErrorReporter module
- Defects vs error channel distinction

## v3 to v4 Error API Changes

**This table is authoritative. Never use the v3 names.**

### Effect Catch Combinators

| v3 (DO NOT USE)             | v4 (USE THIS)               | Notes                                              |
| --------------------------- | --------------------------- | -------------------------------------------------- |
| `Effect.catchAll`           | `Effect.catch`              | Renamed                                            |
| `Effect.catchAllCause`      | `Effect.catchCause`         | Renamed                                            |
| `Effect.catchAllDefect`     | `Effect.catchDefect`        | Renamed                                            |
| `Effect.catchSome`          | `Effect.catchFilter`        | Uses `Filter` module instead of `Option`           |
| `Effect.catchSomeCause`     | `Effect.catchCauseFilter`   | Uses `Filter` module instead of `Option`           |
| `Effect.catchSomeDefect`    | Removed                     | No replacement                                     |
| `Effect.optionFromOptional` | `Effect.catchNoSuchElement` | Renamed                                            |
| `Effect.catchTag`           | `Effect.catchTag`           | Enhanced: accepts array of tags, optional `orElse` |
| `Effect.catchTags`          | `Effect.catchTags`          | Enhanced: optional `orElse` fallback               |
| `Effect.catchIf`            | `Effect.catchIf`            | Enhanced: optional `orElse` fallback               |
| (none)                      | `Effect.catchReason`        | NEW: catch nested reason within tagged error       |
| (none)                      | `Effect.catchReasons`       | NEW: catch multiple nested reasons                 |
| (none)                      | `Effect.unwrapReason`       | NEW: promote nested reasons to error channel       |
| (none)                      | `Effect.catchEager`         | NEW: synchronous recovery optimization             |
| (none)                      | `Effect.withErrorReporting` | NEW: report errors to registered ErrorReporters    |

### Cause Structure

| v3 (DO NOT USE)                  | v4 (USE THIS)                              | Notes                         |
| -------------------------------- | ------------------------------------------ | ----------------------------- |
| 6-variant recursive tree         | `{ reasons: ReadonlyArray<Reason<E>> }`    | Flattened                     |
| `Cause.sequential(l, r)`         | `Cause.combine(l, r)`                      | Concatenates reasons arrays   |
| `Cause.parallel(l, r)`           | `Cause.combine(l, r)`                      | Same as sequential            |
| `Cause.isFailType(cause)`        | `Cause.isFailReason(reason)`               | Operates on Reason, not Cause |
| `Cause.isDieType(cause)`         | `Cause.isDieReason(reason)`                | Operates on Reason, not Cause |
| `Cause.isInterruptType(cause)`   | `Cause.isInterruptReason(reason)`          | Operates on Reason, not Cause |
| `Cause.isFailure(cause)`         | `Cause.hasFails(cause)`                    | Renamed                       |
| `Cause.isDie(cause)`             | `Cause.hasDies(cause)`                     | Renamed                       |
| `Cause.isInterrupted(cause)`     | `Cause.hasInterrupts(cause)`               | Renamed                       |
| `Cause.isInterruptedOnly(cause)` | `Cause.hasInterruptsOnly(cause)`           | Renamed                       |
| `Cause.failureOption(cause)`     | `Cause.findErrorOption(cause)`             | Renamed                       |
| `Cause.failureOrCause(cause)`    | `Cause.findError(cause)`                   | Returns `Result.Result` now   |
| `Cause.dieOption(cause)`         | `Cause.findDefect(cause)`                  | Returns `Result.Result` now   |
| `Cause.interruptOption(cause)`   | `Cause.findInterrupt(cause)`               | Returns `Result.Result` now   |
| `Cause.failures(cause)`          | `cause.reasons.filter(Cause.isFailReason)` | Use array filter              |
| `Cause.defects(cause)`           | `cause.reasons.filter(Cause.isDieReason)`  | Use array filter              |

### Error Class Renames (`*Exception` to `*Error`)

| v3 (DO NOT USE)                        | v4 (USE THIS)                 |
| -------------------------------------- | ----------------------------- |
| `Cause.NoSuchElementException`         | `Cause.NoSuchElementError`    |
| `Cause.TimeoutException`               | `Cause.TimeoutError`          |
| `Cause.IllegalArgumentException`       | `Cause.IllegalArgumentError`  |
| `Cause.ExceededCapacityException`      | `Cause.ExceededCapacityError` |
| `Cause.UnknownException`               | `Cause.UnknownError`          |
| `Cause.RuntimeException`               | Removed                       |
| `Cause.InterruptedException`           | Removed                       |
| `Cause.InvalidPubSubCapacityException` | Removed                       |

### Schema Error Renames

| v3 (DO NOT USE)      | v4 (USE THIS)             |
| -------------------- | ------------------------- |
| `Schema.TaggedError` | `Schema.TaggedErrorClass` |
| `ParseError`         | `Schema.SchemaError`      |

## Core Error Handling Philosophy

Effect distinguishes between two types of failures:

1. **Expected Errors (Error Channel)** - Business logic failures that should be handled
    - Type-safe and tracked in the effect signature: `Effect<A, E, R>`
    - Represented by the `E` type parameter
    - Handle with catchTag, catchTags, catch, catchReason, catchReasons

2. **Unexpected Errors (Defects)** - Programming errors that indicate bugs
    - Not tracked in the type system
    - Result from programming mistakes (null refs, unhandled cases, assertions)
    - Usually should NOT be caught; use catchDefect only at boundaries

### Runtime Adapter Boundaries and Invariants

Do not force every impossible or adapter-internal failure into a tagged error just to satisfy a blanket rule.

Use typed errors for:

- caller-actionable failures
- business or protocol failures that the next layer can recover from
- public service contracts

Use defects or `Effect.orDie` for:

- impossible branches and invariant violations
- runtime-adapter internals where no caller can recover meaningfully
- collapsing noisy upstream error surfaces at a boundary that should not leak them further

`new Error(...)` is acceptable inside `Effect.die(...)`, invariant branches, or adapter-only defect paths. It is not acceptable as the public error model for recoverable domain behavior.

### When to Use Error Channel vs Defects

```typescript
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

declare const findUser: (userId: string) => Effect.Effect<User, UserNotFound>;
declare const validatePassword: (
	user: User,
	password: string
) => Effect.Effect<boolean, InvalidCredentials>;
declare const database: {
	query: (
		sql: string,
		...params: ReadonlyArray<unknown>
	) => Effect.Effect<unknown>;
};

interface User {
	readonly id: string;
	readonly name: string;
}

// CORRECT - Expected business failures in error channel
class UserNotFound extends Schema.TaggedErrorClass<UserNotFound>()(
	'UserNotFound',
	{
		userId: Schema.String,
		message: Schema.String
	}
) {}

class InvalidCredentials extends Schema.TaggedErrorClass<InvalidCredentials>()(
	'InvalidCredentials',
	{ reason: Schema.String, message: Schema.String }
) {}

const authenticateUser = (
	userId: string,
	password: string
): Effect.Effect<User, UserNotFound | InvalidCredentials> =>
	Effect.gen(function* () {
		const user = yield* findUser(userId); // Can fail with UserNotFound
		const valid = yield* validatePassword(user, password); // Can fail with InvalidCredentials
		return user;
	});

// CORRECT - Programmer errors as defects (use Effect.die)
const assertPositive = (n: number): Effect.Effect<number> =>
	n > 0
		? Effect.succeed(n)
		: Effect.die(new Error(`Expected positive number, got ${n}`));

// WRONG - Business failure as defect
const findUserWrong = (userId: string): Effect.Effect<User> =>
	Effect.gen(function* () {
		const user = yield* database.query(
			'SELECT * FROM users WHERE id = ?',
			userId
		);
		if (!user) {
			yield* Effect.die(new Error('User not found')); // Should be in error channel!
		}
		return user as User;
	});
```

## Error Class Decision Tree

Effect v4 provides three ways to define error classes. Choose based on context:

### `Schema.TaggedErrorClass` — Primary choice for domain errors

Schema-validated, automatically tagged with `_tag`, catchable via `catchTag`. Use for all cross-module and public API errors.

```typescript
import * as Schema from 'effect/Schema';

class NotFound extends Schema.TaggedErrorClass<NotFound>()(
	'NotFound',
	{ id: Schema.String, message: Schema.String },
	{ description: 'Entity was not found.' }
) {}

// Constructed with schema validation
const error = new NotFound({ id: '123', message: 'User not found' });
error._tag; // "NotFound"
```

### `Schema.ErrorClass` — For manual tag control

Schema-validated but no automatic `_tag`. Use when you need a custom discriminator field (e.g., HttpApiError types use `_tag: Schema.tag("NotFound")` manually).

```typescript
import * as Schema from 'effect/Schema';

class NotFound extends Schema.ErrorClass<NotFound>('NotFound')({
	_tag: Schema.tag('NotFound'),
	message: Schema.String
}) {}
```

### `Data.TaggedError` — Lightweight, no schema validation

No schema validation overhead. Use for module-internal errors or hot paths where schema decoding cost is unwanted.

```typescript
import * as Data from 'effect/Data';

class InternalError extends Data.TaggedError('InternalError')<{
	readonly message: string;
}> {}

// Still catchable via catchTag
const program = Effect.fail(new InternalError({ message: 'oops' })).pipe(
	Effect.catchTag('InternalError', (e) => Effect.succeed(e.message))
);
```

### Decision summary

| Scenario                                    | Use                       |
| ------------------------------------------- | ------------------------- |
| Cross-module / public API errors            | `Schema.TaggedErrorClass` |
| Errors that need `httpApiStatus` annotation | `Schema.TaggedErrorClass` |
| Errors with a `reason` union field          | `Schema.TaggedErrorClass` |
| Custom discriminator field (not `_tag`)     | `Schema.ErrorClass`       |
| Module-internal, no serialization needed    | `Data.TaggedError`        |

## Creating Tagged Errors

Always use `Schema.TaggedErrorClass` for domain errors with a `message` field.

### Basic Tagged Error

```typescript
import * as Schema from 'effect/Schema';

// Simple error with message only
export class NetworkError extends Schema.TaggedErrorClass<NetworkError>()(
	'NetworkError',
	{ message: Schema.String },
	{ description: 'Network request failed.' }
) {}

// Error with rich context
export class ValidationError extends Schema.TaggedErrorClass<ValidationError>()(
	'ValidationError',
	{
		field: Schema.String,
		message: Schema.String,
		value: Schema.optional(Schema.Unknown)
	},
	{ description: 'Input validation failed for a specific field.' }
) {}

// Usage
const error = new ValidationError({
	field: 'email',
	message: 'Invalid email format',
	value: 'not-an-email'
});
```

### Error with Reason Discriminator

For bindings that wrap a single external system, use a `reason` literal union to keep the error surface compact while remaining precise:

```typescript
import * as Schema from 'effect/Schema';

export class ApiError extends Schema.TaggedErrorClass<ApiError>()(
	'ApiError',
	{
		reason: Schema.Literals([
			'BadRequest',
			'Unauthorized',
			'NotFound',
			'RateLimited',
			'ServerError',
			'Timeout'
		]),
		message: Schema.String,
		statusCode: Schema.optional(Schema.Number),
		details: Schema.optional(Schema.Record(Schema.String, Schema.Unknown))
	},
	{ description: 'Failure from an external API operation.' }
) {}
```

### Error with Nested Reason Types (for `catchReason`/`catchReasons`)

When reason variants carry distinct payloads, model each as a separate `TaggedErrorClass` and compose with `Schema.Union`. This enables v4's `catchReason` and `catchReasons`:

```typescript
import * as Schema from 'effect/Schema';

export class RateLimitError extends Schema.TaggedErrorClass<RateLimitError>()(
	'RateLimitError',
	{ retryAfter: Schema.Number },
	{ description: 'Rate limit exceeded.' }
) {}

export class QuotaExceededError extends Schema.TaggedErrorClass<QuotaExceededError>()(
	'QuotaExceededError',
	{ limit: Schema.Number },
	{ description: 'Quota exhausted.' }
) {}

export class SafetyBlockedError extends Schema.TaggedErrorClass<SafetyBlockedError>()(
	'SafetyBlockedError',
	{ category: Schema.String },
	{ description: 'Blocked by safety filter.' }
) {}

export class AiError extends Schema.TaggedErrorClass<AiError>()(
	'AiError',
	{
		reason: Schema.Union([
			RateLimitError,
			QuotaExceededError,
			SafetyBlockedError
		])
	},
	{ description: 'Failure from an AI model call.' }
) {}
```

### Error with HTTP Status Annotation

For errors that map to HTTP responses, use the `httpApiStatus` annotation:

```typescript
import * as Schema from 'effect/Schema';

export class Unauthorized extends Schema.TaggedErrorClass<Unauthorized>()(
	'Unauthorized',
	{ message: Schema.String },
	{
		httpApiStatus: 401,
		description: 'Request lacks valid authentication credentials.'
	}
) {}

export class EntityNotFound extends Schema.TaggedErrorClass<EntityNotFound>()(
	'EntityNotFound',
	{ entityType: Schema.String, id: Schema.String, message: Schema.String },
	{
		httpApiStatus: 404,
		description: 'Requested entity does not exist.'
	}
) {}
```

### Error with Custom Properties

```typescript
import * as Schema from 'effect/Schema';

export class HttpError extends Schema.TaggedErrorClass<HttpError>()(
	'HttpError',
	{
		status: Schema.Number,
		body: Schema.String,
		message: Schema.String
	},
	{ description: 'HTTP response error.' }
) {
	get isClientError() {
		return this.status >= 400 && this.status < 500;
	}

	get isServerError() {
		return this.status >= 500;
	}
}
```

## Error Wrapping Conventions

When wrapping upstream errors in domain error classes, choose the `cause` field schema based on intent:

| `cause` Schema   | When to use                                                    | Example                          |
| ---------------- | -------------------------------------------------------------- | -------------------------------- |
| `Schema.Defect()` | Wrapping unknown/untyped upstream errors (throwables, defects) | `DevToolsError`, `DatabaseError` |
| `Schema.Unknown` | Preserving full upstream error structure for debugging         | `SubstackFetchError`             |
| `Schema.String`  | Message-only wrapping where structure is irrelevant            | `AuthError`                      |
| Omitted          | When the error tag + fields fully describe the failure         | `UserNotFound`, `Unauthorized`   |

```typescript
import * as Schema from 'effect/Schema';

// Defect-style: wraps throwables and unknown failures
export class DatabaseError extends Schema.TaggedErrorClass<DatabaseError>()(
	'DatabaseError',
	{
		operation: Schema.String,
		message: Schema.String,
		cause: Schema.Defect()
	},
	{ description: 'Database operation failed.' }
) {}

// Unknown-style: preserves full upstream error
export class FetchError extends Schema.TaggedErrorClass<FetchError>()(
	'FetchError',
	{
		url: Schema.String,
		message: Schema.String,
		cause: Schema.Unknown
	},
	{ description: 'HTTP fetch operation failed.' }
) {}

// String-style: message-only wrapper
export class AuthError extends Schema.TaggedErrorClass<AuthError>()(
	'AuthError',
	{
		cause: Schema.String
	},
	{ description: 'Authentication backend failure.' }
) {}
```

## Yieldable Errors

In `Effect.gen` blocks, tagged error instances can be yielded directly as a shorthand for `yield* Effect.fail(...)`. This works because `Schema.TaggedErrorClass`, `Schema.ErrorClass`, and `Data.TaggedError` all extend `Cause.YieldableError`.

```typescript
import { Effect } from 'effect';
import * as Schema from 'effect/Schema';

class NotFound extends Schema.TaggedErrorClass<NotFound>()('NotFound', {
	id: Schema.String,
	message: Schema.String
}) {}

// These two are equivalent:
const explicit = Effect.gen(function* () {
	return yield* Effect.fail(
		new NotFound({ id: '123', message: 'User not found' })
	);
});

const shorthand = Effect.gen(function* () {
	return yield* new NotFound({ id: '123', message: 'User not found' });
});
```

The shorthand form is idiomatic and preferred in Effect v4 generators. It reads naturally as "yield this error" and reduces noise.

## Handling Errors by Tag

### catchTag - Single Error Type

```typescript
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

declare const createGuestUser: (id: string) => User;

interface User {
	readonly id: string;
	readonly name: string;
}

class NotFound extends Schema.TaggedErrorClass<NotFound>()('NotFound', {
	id: Schema.String,
	message: Schema.String
}) {}

class Unauthorized extends Schema.TaggedErrorClass<Unauthorized>()(
	'Unauthorized',
	{
		message: Schema.String
	}
) {}

//          Effect<User, NotFound | Unauthorized, Dependencies>
//      v
const getUser = (id: string): Effect.Effect<User, NotFound | Unauthorized> =>
	Effect.fail(new NotFound({ id, message: `User ${id} not found` }));

// Handle single error type
//          Effect<User, Unauthorized, Dependencies>
//      v
const program = getUser('123').pipe(
	Effect.catchTag('NotFound', (error) =>
		// Return default user when not found
		Effect.succeed(createGuestUser(error.id))
	)
);
```

### catchTag - Array Form (v4)

In Effect v4, `catchTag` accepts an array of tags to handle multiple error types with a single handler:

```typescript
import { Effect, Schema } from 'effect';

class ParseError extends Schema.TaggedErrorClass<ParseError>()('ParseError', {
	input: Schema.String,
	message: Schema.String
}) {}

class ReservedPortError extends Schema.TaggedErrorClass<ReservedPortError>()(
	'ReservedPortError',
	{
		port: Schema.Number
	}
) {}

declare const loadPort: (
	input: string
) => Effect.Effect<number, ParseError | ReservedPortError>;

// Catch multiple tags with one handler - the error is typed as the union
const program = loadPort('80').pipe(
	Effect.catchTag(['ParseError', 'ReservedPortError'], (_) =>
		Effect.succeed(3000)
	)
);
```

### catchTag / catchTags - Optional `orElse` Fallback (v4)

In v4, `catchTag`, `catchTags`, and `catchIf` accept an optional trailing `orElse` parameter for unmatched errors:

```typescript
import { Effect, Schema } from 'effect';

class NotFound extends Schema.TaggedErrorClass<NotFound>()('NotFound', {
	message: Schema.String
}) {}

class Forbidden extends Schema.TaggedErrorClass<Forbidden>()('Forbidden', {
	message: Schema.String
}) {}

class ServerError extends Schema.TaggedErrorClass<ServerError>()(
	'ServerError',
	{
		message: Schema.String
	}
) {}

declare const riskyOp: () => Effect.Effect<
	string,
	NotFound | Forbidden | ServerError
>;

// The third argument is the orElse handler for unmatched errors
const program = riskyOp().pipe(
	Effect.catchTag(
		'NotFound',
		(e) => Effect.succeed('default'),
		(unmatched) => Effect.die(unmatched) // Forbidden | ServerError
	)
);

// Works with catchTags too
const program2 = riskyOp().pipe(
	Effect.catchTags(
		{
			NotFound: (e) => Effect.succeed('default'),
			Forbidden: (e) => Effect.succeed('forbidden')
		},
		(unmatched) => Effect.die(unmatched) // ServerError
	)
);
```

> **Type preservation (beta.71):** When you omit `orElse`, the tags you do not handle stay in the error channel — `catchTag(['NotFound'], ...)` on `Effect<string, NotFound | Forbidden | ServerError>` yields `Effect<string, Forbidden | ServerError>`. Supplying `orElse` handles those remaining variants, so the resulting error channel reflects only what the fallback produces. A beta.71 fix ensures `catchTag` / `catchTags` / `catchIf` no longer silently drop the unhandled error types from the inferred type.

### catchTags - Multiple Error Types

```typescript
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

interface Data {
	readonly data: ReadonlyArray<unknown>;
	readonly cached?: boolean;
	readonly timeout?: boolean;
	readonly parseError?: boolean;
}

class NetworkError extends Schema.TaggedErrorClass<NetworkError>()(
	'NetworkError',
	{
		message: Schema.String
	}
) {}

class TimeoutError extends Schema.TaggedErrorClass<TimeoutError>()(
	'TimeoutError',
	{
		message: Schema.String
	}
) {}

class ParseError extends Schema.TaggedErrorClass<ParseError>()('ParseError', {
	input: Schema.String,
	message: Schema.String
}) {}

//          Effect<Data, NetworkError | TimeoutError | ParseError, Dependencies>
//      v
const fetchData = (): Effect.Effect<
	Data,
	NetworkError | TimeoutError | ParseError
> => Effect.fail(new NetworkError({ message: 'Connection refused' }));

// Handle multiple error types at once
//          Effect<Data, never, Dependencies>
//      v
const program = fetchData().pipe(
	Effect.catchTags({
		NetworkError: (_error) => Effect.succeed({ data: [], cached: true }),

		TimeoutError: (_error) => Effect.succeed({ data: [], timeout: true }),

		ParseError: (error) =>
			// Access error-specific fields
			Effect.logError(`Failed to parse: ${error.input}`).pipe(
				Effect.as({ data: [], parseError: true })
			)
	})
);
```

### catch - Handle All Errors

`Effect.catch` (renamed from `catchAll` in v3) handles all errors with a single handler:

```typescript
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

declare const getDefaultResult: () => Result;

interface Result {
	readonly value: string;
}

class InvalidInput extends Schema.TaggedErrorClass<InvalidInput>()(
	'InvalidInput',
	{
		message: Schema.String
	}
) {}

class ProcessingError extends Schema.TaggedErrorClass<ProcessingError>()(
	'ProcessingError',
	{
		message: Schema.String
	}
) {}

const process = (): Effect.Effect<Result, InvalidInput | ProcessingError> =>
	Effect.fail(new InvalidInput({ message: 'Bad input' }));

const program = process().pipe(
	Effect.catch((error) =>
		// error is typed as: InvalidInput | ProcessingError
		Effect.logError(`Operation failed: ${error._tag}`).pipe(
			Effect.as(getDefaultResult())
		)
	)
);
```

**Migration note:** When replacing `Effect.promise(() => Service.method())` with direct service yields (`yield* service.method()`), errors that previously flowed as defects (untyped Promise rejections) become typed channel errors. Existing `catchDefect` handlers must be replaced with `catch` or `catchTag` to match the now-typed error channel.

### catchEager - Synchronous Recovery (v4)

`Effect.catchEager` is an optimization of `catch` that evaluates synchronous recovery effects immediately rather than suspending. Use for lightweight wrapping where the recovery handler is always synchronous:

```typescript
import { Effect, Schema } from 'effect';

class CliConfigError extends Schema.TaggedErrorClass<CliConfigError>()(
	'CliConfigError',
	{
		message: Schema.String
	}
) {}

const loadCredentials = Effect.tryPromise({
	try: () => readFile('~/.config/myapp/credentials.json'),
	catch: (cause) => cause
}).pipe(
	Effect.catchEager((cause) =>
		Effect.fail(
			new CliConfigError({
				message: `Failed to load credentials: ${cause}`
			})
		)
	)
);
```

### catchNoSuchElement - Convert NoSuchElementError to Option (v4)

`Effect.catchNoSuchElement` (renamed from `optionFromOptional` in v3) catches `Cause.NoSuchElementError` and converts the result to `Option`:

```typescript
import { Effect } from 'effect';
import * as Option from 'effect/Option';

declare const maybeFindItem: () => Effect.Effect<
	string,
	Cause.NoSuchElementError
>;

// Effect<Option<string>, never>
const program = Effect.catchNoSuchElement(maybeFindItem());
```

## Handling Nested Error Reasons (v4)

When errors use a `reason` field containing a tagged union (see "Error with Nested Reason Types" above), v4 provides three purpose-built APIs.

### catchReason - Catch One Specific Reason

Catches a specific `reason` variant within a tagged error without removing the parent error from the error channel:

```typescript
import { Effect } from 'effect';

declare const callModel: Effect.Effect<string, AiError>;

// Catch only RateLimitError reason within AiError
const program = callModel.pipe(
	Effect.catchReason(
		'AiError', // parent error _tag
		'RateLimitError', // reason _tag to catch
		(reason) => Effect.succeed(`Retry after ${reason.retryAfter} seconds`)
	)
);

// With optional orElse for uncaught reasons
const withFallback = callModel.pipe(
	Effect.catchReason(
		'AiError',
		'RateLimitError',
		(reason) => Effect.succeed(`Retry after ${reason.retryAfter} seconds`),
		(reason) => Effect.succeed(`Model call failed: ${reason._tag}`) // QuotaExceeded | SafetyBlocked
	)
);
```

### catchReasons - Catch Multiple Reasons

Handle multiple reason variants at once via an object of handlers:

```typescript
import { Effect } from 'effect';

declare const callModel: Effect.Effect<string, AiError>;

const program = callModel.pipe(
	Effect.catchReasons('AiError', {
		RateLimitError: (reason) =>
			Effect.succeed(`Retry after ${reason.retryAfter} seconds`),
		QuotaExceededError: (reason) =>
			Effect.succeed(`Quota exceeded at ${reason.limit} tokens`)
	})
	// SafetyBlockedError remains unhandled in the error channel
);
```

### unwrapReason - Promote Reasons to Error Channel

Unwraps the `reason` field, replacing the parent error with its reason variants in the error channel. Useful when you want to `catchTags` the individual reasons directly:

```typescript
import { Effect } from 'effect';

declare const callModel: Effect.Effect<string, AiError>;

const program = callModel.pipe(
	Effect.unwrapReason('AiError'),
	// Error channel is now: RateLimitError | QuotaExceededError | SafetyBlockedError
	Effect.catchTags({
		RateLimitError: (r) => Effect.succeed(`Back off for ${r.retryAfter}s`),
		QuotaExceededError: (r) =>
			Effect.succeed(`Increase quota beyond ${r.limit}`),
		SafetyBlockedError: (r) => Effect.succeed(`Blocked: ${r.category}`)
	})
);
```

## Catching by Filter (v4)

`Effect.catchFilter` replaces v3's `Effect.catchSome` (which used `Option`). It uses the `Filter` module:

```typescript
import { Effect, Filter } from 'effect';

// v3 (DO NOT USE):
// Effect.catchSome((error) =>
//   error === 42 ? Option.some(Effect.succeed("caught")) : Option.none()
// )

// v4:
const program = Effect.fail(42).pipe(
	Effect.catchFilter(
		Filter.fromPredicate((error: number) => error === 42),
		(error) => Effect.succeed('caught')
	)
);
```

`Effect.catchCauseFilter` is the Cause-level equivalent (replaces `catchSomeCause`).

## Cause Structure (v4)

In v4, `Cause<E>` is a flat wrapper around an array of reasons — **not** a recursive tree.

```typescript
interface Cause<E> {
	readonly reasons: ReadonlyArray<Reason<E>>;
}

type Reason<E> = Fail<E> | Die | Interrupt;
```

There are only three reason variants:

- `Fail<E>` — `{ readonly error: E }` — expected typed failures
- `Die` — `{ readonly defect: unknown }` — unexpected defects
- `Interrupt` — `{ readonly fiberId: number | undefined }` — fiber interruptions

An empty cause is `cause.reasons.length === 0`. The `Empty`, `Sequential`, and `Parallel` variants from v3 no longer exist.

### Inspecting Causes

```typescript
import { Cause } from 'effect';

const inspectCause = <E>(cause: Cause.Cause<E>) => {
	// Iterate over the flat reasons array
	for (const reason of cause.reasons) {
		if (Cause.isFailReason(reason)) {
			console.log('Expected error:', reason.error);
		} else if (Cause.isDieReason(reason)) {
			console.log('Defect:', reason.defect);
		} else if (Cause.isInterruptReason(reason)) {
			console.log('Interrupted by fiber:', reason.fiberId);
		}
	}
};
```

### Cause Extractors

```typescript
import { Cause } from 'effect';
import * as Option from 'effect/Option';

declare const cause: Cause.Cause<string>;

// Extract first error as Option
const errorOpt: Option.Option<string> = Cause.findErrorOption(cause);

// Extract first error as Result (Result.Result<E, Cause<never>>)
const errorResult = Cause.findError(cause);

// Extract first defect as Result
const defectResult = Cause.findDefect(cause);

// Check what a cause contains
Cause.hasFails(cause); // has at least one Fail reason
Cause.hasDies(cause); // has at least one Die reason
Cause.hasInterrupts(cause); // has at least one Interrupt reason
Cause.hasInterruptsOnly(cause); // only Interrupt reasons, no Fail/Die

// Human-readable rendering
const pretty: string = Cause.pretty(cause);
```

### Cause Constructors (v4)

```typescript
import { Cause } from 'effect';

Cause.empty; // empty cause (no reasons)
Cause.fail(error); // single Fail reason
Cause.die(defect); // single Die reason
Cause.interrupt(fiberId); // single Interrupt reason
Cause.combine(left, right); // concatenate two causes' reasons
Cause.fromReasons(reasons); // construct from array of Reason values
Cause.makeFailReason(error); // construct a Fail reason
Cause.makeDieReason(defect); // construct a Die reason
Cause.makeInterruptReason(fiberId); // construct an Interrupt reason
Cause.annotate(cause, annotations); // attach metadata
```

### Cause.Done - Graceful Completion Signal (v4)

`Cause.Done` is a special error class used as a graceful completion signal for queues and streams. It is not a failure — it signals orderly shutdown:

```typescript
import { Cause } from 'effect';

Cause.Done(); // create a Done signal
Cause.done(); // shorthand for Effect.fail(Cause.Done())
Cause.isDone(value); // type guard
```

## Exhaustive Error Handling with Match

Use Match for exhaustive error handling with compile-time guarantees:

```typescript
import * as Effect from 'effect/Effect';
import * as Match from 'effect/Match';
import * as Schema from 'effect/Schema';

declare const dangerousOperation: () => Effect.Effect<string, AppError>;

class ConnectionError extends Schema.TaggedErrorClass<ConnectionError>()(
	'ConnectionError',
	{
		message: Schema.String
	}
) {}

class AuthError extends Schema.TaggedErrorClass<AuthError>()('AuthError', {
	message: Schema.String
}) {}

class DataError extends Schema.TaggedErrorClass<DataError>()('DataError', {
	message: Schema.String
}) {}

type AppError = ConnectionError | AuthError | DataError;

const handleError = (error: AppError): Effect.Effect<string> =>
	Match.value(error).pipe(
		Match.tag('ConnectionError', () =>
			Effect.succeed('Please check your network connection')
		),
		Match.tag('AuthError', () => Effect.succeed('Authentication required')),
		Match.tag('DataError', (err) =>
			Effect.succeed(`Data error: ${err.message}`)
		),
		Match.exhaustive // Compiler ensures all cases handled
	);

const program = dangerousOperation().pipe(Effect.catch(handleError));
```

## Error Transformation

### mapError - Transform Error Type

```typescript
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

declare const fetchFromDatabase: () => Effect.Effect<Data, InfrastructureError>;

interface Data {
	readonly value: string;
}

class DomainError extends Schema.TaggedErrorClass<DomainError>()(
	'DomainError',
	{
		message: Schema.String
	}
) {}

class InfrastructureError extends Schema.TaggedErrorClass<InfrastructureError>()(
	'InfrastructureError',
	{ message: Schema.String, cause: Schema.optional(Schema.Unknown) }
) {}

// Transform infrastructure errors to domain errors
const program = fetchFromDatabase().pipe(
	Effect.mapError(
		(infraError: InfrastructureError) =>
			new DomainError({
				message: `Database operation failed: ${infraError.message}`
			})
	)
);
```

### Idempotent Error Wrapping

When writing reusable error-mapping combinators shared across multiple call sites, guard against double-wrapping:

```typescript
import { Effect, Schema } from 'effect';

class ServiceError extends Schema.TaggedErrorClass<ServiceError>()(
	'ServiceError',
	{
		message: Schema.String,
		cause: Schema.optional(Schema.Unknown)
	}
) {}

const mapServiceError =
	(message = 'Service operation failed') =>
	<A, E, R>(
		effect: Effect.Effect<A, E, R>
	): Effect.Effect<A, ServiceError, R> =>
		effect.pipe(
			Effect.mapError((cause) =>
				cause instanceof ServiceError
					? cause
					: new ServiceError({ message, cause })
			)
		);
```

The `instanceof` guard prevents double-wrapping when an upstream operation already returns the target error type.

## Error Recovery Patterns

### Fallback with orElse

```typescript
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

interface Data {
	readonly value: string;
}

class PrimaryServiceError extends Schema.TaggedErrorClass<PrimaryServiceError>()(
	'PrimaryServiceError',
	{ message: Schema.String }
) {}

class SecondaryServiceError extends Schema.TaggedErrorClass<SecondaryServiceError>()(
	'SecondaryServiceError',
	{ message: Schema.String }
) {}

const primaryService: Effect.Effect<Data, PrimaryServiceError> = Effect.fail(
	new PrimaryServiceError({ message: 'Primary down' })
);
const secondaryService: Effect.Effect<Data, SecondaryServiceError> =
	Effect.fail(new SecondaryServiceError({ message: 'Secondary down' }));

// Try primary, fallback to secondary
//          Effect<Data, SecondaryServiceError, Dependencies>
const program = primaryService.pipe(Effect.orElse(() => secondaryService));
```

### Retry with Schedule

```typescript
import * as Effect from 'effect/Effect';
import * as Schedule from 'effect/Schedule';
import * as Schema from 'effect/Schema';

interface Data {
	readonly value: string;
}

class TransientError extends Schema.TaggedErrorClass<TransientError>()(
	'TransientError',
	{
		message: Schema.String
	}
) {}

const unreliableOperation: Effect.Effect<Data, TransientError> = Effect.fail(
	new TransientError({ message: 'Temporary failure' })
);

// Retry with exponential backoff
const program = unreliableOperation.pipe(
	Effect.retry(
		Schedule.exponential('100 millis').pipe(Schedule.take(5)) // Max 5 retries
	)
);
```

### Provide Default Value

```typescript
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

declare const getDefaultConfig: () => Config;

interface Config {
	readonly port: number;
	readonly host: string;
}

class FetchError extends Schema.TaggedErrorClass<FetchError>()('FetchError', {
	message: Schema.String
}) {}

const fetchConfig: Effect.Effect<Config, FetchError> = Effect.fail(
	new FetchError({ message: 'Config not available' })
);

// Provide default on failure
const program = fetchConfig.pipe(
	Effect.orElseSucceed(() => getDefaultConfig())
);
```

### Convert Error to Option

```typescript
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

interface Item {
	readonly id: string;
	readonly name: string;
}

class NotFoundError extends Schema.TaggedErrorClass<NotFoundError>()(
	'NotFoundError',
	{
		message: Schema.String
	}
) {}

const findItem: Effect.Effect<Item, NotFoundError> = Effect.fail(
	new NotFoundError({ message: 'Not found' })
);

// Convert to Option (None if error)
//          Effect<Option<Item>, never, Dependencies>
const program = findItem.pipe(Effect.option);
```

## Error Channel vs Defect Operators

### Converting Errors to Defects

```typescript
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

interface Config {
	readonly port: number;
	readonly host: string;
}

class ConfigError extends Schema.TaggedErrorClass<ConfigError>()(
	'ConfigError',
	{
		message: Schema.String
	}
) {}

const loadConfig: Effect.Effect<Config, ConfigError> = Effect.fail(
	new ConfigError({ message: 'Missing config' })
);

// Convert error to defect (terminates fiber)
const program = loadConfig.pipe(
	Effect.orDie // Error becomes a defect
);

// With custom defect message
const program2 = loadConfig.pipe(
	Effect.orDieWith(
		(error) =>
			new Error(`Fatal: Configuration failed to load: ${error._tag}`)
	)
);
```

### Handling Defects (Boundary Only)

```typescript
import * as Effect from 'effect/Effect';

declare const dangerousPlugin: () => Effect.Effect<unknown>;
declare const getDefaultPluginBehavior: () => unknown;

// NOTE: ONLY use at application boundaries
const safeProgram = dangerousPlugin().pipe(
	Effect.catchDefect((defect) =>
		Effect.logError(`Plugin crashed: ${defect}`).pipe(
			Effect.as(getDefaultPluginBehavior())
		)
	)
);
```

## ErrorReporter (v4)

The `ErrorReporter` module is new in v4. It provides pluggable, structured error reporting with severity levels and metadata.

### Defining a Reporter

```typescript
import { ErrorReporter } from 'effect';

// Create a custom reporter — the callback receives a single options object
const myReporter = ErrorReporter.make(({ cause, error, severity, attributes }) => {
	console.error(`[${severity}]`, error.message, attributes);
});

// Register reporters via Layer
const ReporterLayer = ErrorReporter.layer([myReporter]);
```

### Reporting Errors

```typescript
import { Effect, ErrorReporter } from 'effect';

// Automatically report errors from an effect
const program = riskyOperation.pipe(Effect.withErrorReporting);

// Or, to report defects only:
const defectsOnly = riskyOperation.pipe(
	Effect.withErrorReporting({ defectsOnly: true })
);
```

### Per-Error Annotations

Error objects can carry reporting annotations as string-keyed properties (the keys are namespaced strings such as `"~effect/ErrorReporter/severity"`):

```typescript
import { ErrorReporter, Schema } from 'effect';

class MyError extends Schema.TaggedErrorClass<MyError>()('MyError', {
	message: Schema.String
}) {}

const error = new MyError({ message: 'something went wrong' });

// Mark an error to be ignored by reporters
ErrorReporter.ignore; // string key — set to true to skip reporting

// Override severity (defaults to "Info" when unset or invalid)
ErrorReporter.severity; // string key — "Trace" | "Debug" | "Info" | "Warn" | "Error" | "Fatal"

// Attach extra structured metadata
ErrorReporter.attributes; // string key — Record<string, unknown>

// Guards
ErrorReporter.isIgnored(error); // check if ignored
ErrorReporter.getSeverity(error); // read severity
ErrorReporter.getAttributes(error); // read attributes
```

## Layered Error Handling

Structure error handling in layers from specific to general:

```typescript
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

declare const validateUserData: (
	data: UserData
) => Effect.Effect<ValidatedUserData, ValidationError>;
declare const saveToDatabase: (
	data: ValidatedUserData
) => Effect.Effect<string, DatabaseError>;
declare const notifyUserCreated: (
	userId: string
) => Effect.Effect<void, NetworkError>;

interface UserData {
	readonly name: string;
	readonly email: string;
}

interface ValidatedUserData {
	readonly name: string;
	readonly email: string;
}

class ValidationError extends Schema.TaggedErrorClass<ValidationError>()(
	'ValidationError',
	{
		message: Schema.String
	}
) {}

class DatabaseError extends Schema.TaggedErrorClass<DatabaseError>()(
	'DatabaseError',
	{
		message: Schema.String
	}
) {}

class NetworkError extends Schema.TaggedErrorClass<NetworkError>()(
	'NetworkError',
	{
		message: Schema.String
	}
) {}

class UnknownError extends Schema.TaggedErrorClass<UnknownError>()(
	'UnknownError',
	{
		message: Schema.String,
		cause: Schema.optional(Schema.Unknown)
	}
) {}

const createUser = (data: UserData) =>
	Effect.gen(function* () {
		// Layer 1: Validate input
		const validated = yield* validateUserData(data).pipe(
			Effect.catchTag('ValidationError', (error) =>
				Effect.fail(
					new UnknownError({ message: error.message, cause: error })
				)
			)
		);

		// Layer 2: Database operation
		const userId = yield* saveToDatabase(validated).pipe(
			Effect.catchTag('DatabaseError', (error) =>
				Effect.fail(
					new UnknownError({ message: error.message, cause: error })
				)
			)
		);

		// Layer 3: Network notification
		yield* notifyUserCreated(userId).pipe(
			Effect.catchTag('NetworkError', (error) =>
				// Non-critical: log but don't fail
				Effect.logWarning(`Failed to notify: ${error._tag}`)
			)
		);

		return userId;
	});
```

## Domain-Specific Error Patterns

### HTTP Response Discrimination

Model ambiguous HTTP responses (where the body structure differs for success vs error) as a `Schema.Union` of `Schema.Class` types:

```typescript
import { Effect, Schema } from 'effect';
import { HttpClientResponse } from 'effect/unstable/HttpClient';

class TokenSuccess extends Schema.Class<TokenSuccess>('TokenSuccess')({
	access_token: AccessToken,
	expires_in: Schema.Number
}) {}

class TokenError extends Schema.Class<TokenError>('TokenError')({
	error: Schema.String,
	error_description: Schema.optional(Schema.String)
}) {}

const TokenResponse = Schema.Union([TokenSuccess, TokenError]);

// Decode and discriminate
const response = yield* HttpClientResponse.schemaBodyJson(TokenResponse)(res);
if (response instanceof TokenError) {
	return (
		yield*
		new AuthError({
			message: response.error_description ?? response.error
		})
	);
}
```

This replaces ad-hoc optional-field checking (`if (!body.access_token)`) with compile-time-safe discrimination via `instanceof`.

### Repository Errors

```typescript
import * as Schema from 'effect/Schema';

export class EntityNotFound extends Schema.TaggedErrorClass<EntityNotFound>()(
	'EntityNotFound',
	{
		entityType: Schema.String,
		id: Schema.String,
		message: Schema.String
	},
	{ httpApiStatus: 404, description: 'Requested entity does not exist.' }
) {}

export class DuplicateEntity extends Schema.TaggedErrorClass<DuplicateEntity>()(
	'DuplicateEntity',
	{
		entityType: Schema.String,
		id: Schema.String,
		message: Schema.String
	},
	{ httpApiStatus: 409, description: 'Entity already exists.' }
) {}

export class QueryError extends Schema.TaggedErrorClass<QueryError>()(
	'QueryError',
	{
		query: Schema.String,
		message: Schema.String,
		cause: Schema.optional(Schema.Unknown)
	},
	{ description: 'Database query failed.' }
) {}

export type RepositoryError = EntityNotFound | DuplicateEntity | QueryError;
```

### Service Errors

```typescript
import * as Schema from 'effect/Schema';

export class ServiceUnavailable extends Schema.TaggedErrorClass<ServiceUnavailable>()(
	'ServiceUnavailable',
	{
		service: Schema.String,
		message: Schema.String,
		retryAfter: Schema.optional(Schema.Number)
	},
	{ httpApiStatus: 503, description: 'Upstream service is unavailable.' }
) {}

export class ServiceTimeout extends Schema.TaggedErrorClass<ServiceTimeout>()(
	'ServiceTimeout',
	{
		service: Schema.String,
		message: Schema.String,
		timeoutMs: Schema.Number
	},
	{ httpApiStatus: 504, description: 'Upstream service timed out.' }
) {}

export class InvalidResponse extends Schema.TaggedErrorClass<InvalidResponse>()(
	'InvalidResponse',
	{
		service: Schema.String,
		message: Schema.String,
		response: Schema.optional(Schema.Unknown)
	},
	{ description: 'Upstream service returned an unexpected response.' }
) {}

export type ServiceError =
	| ServiceUnavailable
	| ServiceTimeout
	| InvalidResponse;
```

### Error Boundaries

```typescript
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

declare const processRequest: (
	request: Request
) => Effect.Effect<Response, ValidationError | NotFoundError | DatabaseError>;
declare const HttpResponse: {
	badRequest: (message: string) => Response;
	notFound: () => Response;
	internalServerError: () => Response;
};

interface Request {
	readonly url: string;
}

interface Response {
	readonly status: number;
}

class ValidationError extends Schema.TaggedErrorClass<ValidationError>()(
	'ValidationError',
	{
		message: Schema.String
	}
) {}

class NotFoundError extends Schema.TaggedErrorClass<NotFoundError>()(
	'NotFoundError',
	{
		message: Schema.String
	}
) {}

class DatabaseError extends Schema.TaggedErrorClass<DatabaseError>()(
	'DatabaseError',
	{
		message: Schema.String
	}
) {}

// Define clear boundaries where errors are handled
const apiEndpoint = (request: Request) =>
	Effect.gen(function* () {
		const result = yield* processRequest(request);
		return result;
	}).pipe(
		// Error boundary: convert all errors to HTTP responses
		Effect.catchTags({
			ValidationError: (error) =>
				Effect.succeed(HttpResponse.badRequest(error.message)),
			NotFoundError: () => Effect.succeed(HttpResponse.notFound()),
			DatabaseError: (error) =>
				Effect.logError(error).pipe(
					Effect.as(HttpResponse.internalServerError())
				)
		})
	);
```

## Quality Checklist

Before completing error handling implementation:

- [ ] All domain errors use `Schema.TaggedErrorClass` with a `message` field
- [ ] Error types have meaningful, specific names and `description` annotation
- [ ] Errors include relevant context (ids, values, reasons)
- [ ] Business failures in error channel, programmer errors as defects
- [ ] catchTag/catchTags used for specific error handling
- [ ] catch (NOT catchAll) only when handling truly all error types
- [ ] Error transformations preserve important context
- [ ] Recovery strategies match business requirements
- [ ] Defect handling only at application boundaries
- [ ] Error types exported from domain modules
- [ ] Tests cover error scenarios
- [ ] Type signatures accurately reflect error channel
- [ ] No v3 API names used (catchAll, catchSome, \*Exception, etc.)
- [ ] Errors with `reason` union consider `catchReason`/`catchReasons`/`unwrapReason`
- [ ] HTTP-facing errors carry `httpApiStatus` annotation
- [ ] Error wrapping uses appropriate `cause` field schema (`Schema.Defect()`/`Schema.Unknown`/`Schema.String`)

Your error handling implementations should be type-safe, exhaustive, and maintain clear separation between expected failures and programmer errors. Always use v4 API names.
