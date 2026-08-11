# Effect-First Development

This document defines the working model behind Effect-first code using the Effect v4 ecosystem.

## Definition

Effect-first development means domain code is written in Effect-native constructs first, and native JavaScript/TypeScript patterns only at explicit boundaries.

The goal is to make failure, absence, decoding, and dependency wiring explicit and typed.

## Primary References

- [Effect documentation](https://effect.website/docs)
- [Effect v4 GitHub](https://github.com/Effect-TS/effect)
- [Effect Schema docs](https://effect.website/docs/schema/introduction)

## Operating Model

Use three layers:

1. Boundary layer:
    - Parse and decode unknown input with `Schema.decodeUnknown*`.
    - Convert nullish values to `Option`.
    - Convert throwable/rejecting APIs to typed Effect failures.
2. Domain layer:
    - Use Effect modules (`Arr`, `Option`, `R`, `Schema`, `Str`, `HashMap`, `HashSet`) and typed services.
    - Keep business logic pure, explicit, and exhaustive.
3. Runtime layer:
    - Compose layers and run effects.
    - Keep platform concerns (process, filesystem, env, network) outside core domain logic.

## Laws and Conventions

### EF-1: Errors are data, not side effects

- If logic can fail, return `Effect.Effect<A, E, R>` with a typed error `E`.
- Use `Schema.TaggedErrorClass` for public or cross-module failures.
- Do not `throw` or use `new Error(...)` in production domain logic.
- Do not use `try { } catch` blocks in Effect code; use `Effect.try` or `Effect.tryPromise` to capture throwable operations into the typed error channel.

Example:

```ts
import { Effect } from 'effect';
import * as Option from 'effect/Option';
import * as Schema from 'effect/Schema';

class MissingConfigError extends Schema.TaggedErrorClass<MissingConfigError>(
	'MissingConfigError'
)(
	'MissingConfigError',
	{ key: Schema.String },
	{ description: 'Required configuration key is missing' }
) {}

const requireEnv = (key: string) =>
	Effect.sync(() => process.env[key]).pipe(
		Effect.flatMap((value) =>
			Option.match(Option.fromNullishOr(value), {
				onNone: () => Effect.fail(new MissingConfigError({ key })),
				onSome: Effect.succeed
			})
		)
	);
```

### EF-2: Absence is `Option`

- Inside domain code, avoid `| null` and `| undefined`.
- Convert nullable values at boundaries via `Option.fromNullishOr`.
- Consume via `Option.map`, `Option.flatMap`, `Option.match`, `Option.getOrElse`.
- Do not use `Option.getOrThrow` — it defeats the purpose of `Option`. Always handle both cases explicitly.

Example:

```ts
import { pipe } from 'effect';
import * as Option from 'effect/Option';

const toDisplayName = (rawName: string | null | undefined) =>
	pipe(
		Option.fromNullishOr(rawName),
		Option.map((name) => name.trim()),
		Option.filter((name) => name.length > 0),
		Option.getOrElse(() => 'anonymous')
	);
```

### EF-3: Decode unknown input with `Schema`

- Unknown or external data must be decoded at the boundary.
- Prefer `Schema.decodeUnknownEffect` for effectful paths and `Schema.decodeUnknownSync` only where sync failure handling is explicit.
- Never use `JSON.parse` / `JSON.stringify`; use schema JSON codecs (`Schema.UnknownFromJsonString`, `Schema.fromJsonString`, `Schema.decodeUnknown*`, `Schema.encode*`).
- Prefer `Schema.Class` over `Schema.Struct` for all decoded shapes — including HTTP response bodies, API payloads, and ephemeral wire formats, not just domain models. Named `Schema.Class` types enable `instanceof` discrimination (e.g., `Schema.Union([SuccessResponse, ErrorResponse])` then `if (parsed instanceof ErrorResponse)`), which is compile-time safe.
- Do not name schemas with a `Schema` suffix; schema constants should be named after the domain type.
- For non-class schemas, export type aliases with the same identifier name as the schema value.

Example:

```ts
import * as Schema from 'effect/Schema';

export class CreateTaskInput extends Schema.Class<CreateTaskInput>(
	'CreateTaskInput'
)({
	id: Schema.String,
	title: Schema.String,
	priority: Schema.Int
}) {}

export const decodeCreateTaskInput =
	Schema.decodeUnknownEffect(CreateTaskInput);
```

### EF-4: Canonical imports

- Required aliases:
    - `import * as Arr from "effect/Array"`
    - `import * as Option from "effect/Option"`
    - `import * as P from "effect/Predicate"`
    - `import * as R from "effect/Record"`
    - `import * as Schema from "effect/Schema"`
- Prefer dedicated namespace imports for stable helper/data modules:
    - `import * as Str from "effect/String"`
    - `import * as Eq from "effect/Equal"`
    - `import * as Bool from "effect/Boolean"`
- Reserve root imports from `"effect"` for core combinators/types such as `Effect`, `Match`, `pipe`, and `flow`.
- Keep unstable imports deliberate and local.

### EF-5: Effect modules over native collection helpers

- Use `Arr`, `R`, `Str`, `Eq`, `HashMap`, `HashSet`, `MutableHashMap`, `MutableHashSet`.
- Avoid domain usage of native `Object`, `Map`, `Set`, `Date`, and direct native string helpers.
- Do not use imperative `for` / `for...of` loops in domain code. Use `Arr.map`, `Arr.filter`, `Arr.filterMap`, or `Arr.reduce` for pure transformations. For effectful iteration, use `Effect.forEach` (which also supports concurrency).
- When behavior is unchanged, prefer the tersest helper form: direct helper refs over trivial wrapper lambdas, `flow(...)` over passthrough `pipe(...)` callbacks, and shared thunk helpers when already in scope.

Example:

```ts
import { pipe } from 'effect';
import * as Arr from 'effect/Array';
import * as Option from 'effect/Option';

const findActiveEmail = (
	users: ReadonlyArray<{ readonly active: boolean; readonly email: string }>
) =>
	pipe(
		users,
		Arr.findFirst((user) => user.active),
		Option.map((user) => user.email)
	);
```

### EF-6: Predicate checks over raw runtime checks

- Prefer `P.isString`, `P.isNumber`, `P.isObject`, and predicate composition.
- Avoid raw `typeof`/ad-hoc runtime checks when a Predicate helper exists.

### EF-7: Branch with `Match` / `Arr.match`; model states with schema tagged unions

- Replace brittle if/else ladders with `Match`.
- For empty/non-empty array branching, prefer `Arr.match` over manual length checks.
- Do not use native `switch` statements for domain branching.
- Model domain states as schema tagged unions (see EF-13), then branch exhaustively.

Example:

```ts
import { Match } from 'effect';
import * as Arr from 'effect/Array';

type SyncPhase = 'idle' | 'running' | 'failed';

const phaseLabel = (phase: SyncPhase) =>
	Match.value(phase).pipe(
		Match.when('idle', () => 'idle'),
		Match.when('running', () => 'running'),
		Match.when('failed', () => 'failed'),
		Match.exhaustive
	);

const summarizeAttempts = (attempts: ReadonlyArray<number>) =>
	Arr.match(attempts, {
		onEmpty: () => 'no-attempts',
		onNonEmpty: (values) => `attempts:${Arr.length(values)}`
	});
```

### EF-7b: Prefer `Bool.match` for booleans

- For boolean-driven branching, prefer `Bool.match` from `effect/Boolean` over ad-hoc `if/else`.
- This keeps control flow expression-oriented and consistent with Effect matching style.

### EF-8: Services use `Context.Service` + `Layer`

- Service identity comes from a unique string key.
- Service constructors are explicit and layered.
- Dependency wiring happens in Layer composition, not hidden global state.
- Service identity must use a descriptive, unique string key.
- If an effectful helper hides dependencies, configuration, policy, or lifecycle state, promote it into its own service instead of leaving it as a static module helper.
- If a service starts owning busy/idle state, in-flight runner maps, cancellation handles, or registry/orchestration behavior, extract that coordinator concern into its own service.
- Do not `yield*` a `Ref`, `Deferred`, `Fiber`, or `Latch` directly — this was removed in v4. Use explicit method calls: `Ref.get(ref)`, `Deferred.await(deferred)`, `Fiber.join(fiber)`, `Latch.await(latch)`.

Example:

```ts
import { Context } from 'effect';

export class MyService extends Context.Service<
	MyService,
	{
		readonly ping: () => string;
	}
>()('MyService') {}
```

### EF-9: Time/randomness should be effectful

- Prefer Effect runtime services such as `Clock` and `Random`.
- Avoid direct `Date.now()` and `Math.random()` in domain logic.

### EF-9b: Runtime HTTP uses Effect HTTP modules

- Do not use native `fetch` in runtime source.
- Compose requests/responses with `HttpClientRequest`, `HttpClientResponse`, `Headers`, `UrlParams`, `HttpMethod`, and `HttpBody`.
- Provide runtime client layers explicitly (`@effect/platform-bun/BunHttpClient.layer` for Bun runtimes).

### EF-10: Tests stay effect-native

- Use `@effect/vitest` and `it.effect(...)` for effectful tests.
- Keep fixtures typed and schema-validated where useful.

### EF-11: Public APIs are documented

- Exported APIs in package/tooling source require JSDoc.
- Examples must remain docgen-clean.

### EF-12: Schema annotations are intentional

- Add schema annotations when they materially improve external docs, decode errors, introspection, or reusable schema helpers.
- Internal, local, or still-evolving schemas do not need annotations by default.
- When you do annotate, descriptions should encode intent, not repeat the symbol name.

Example:

```ts
import * as Schema from 'effect/Schema';

export const Tenant = Schema.String;

export const TenantHeader = Tenant.annotate({
	title: 'TenantHeader',
	description: 'Tenant identifier read from the x-tenant header.'
});

export type Tenant = typeof Tenant.Type;
```

### EF-12b: Schema-first internal domain building blocks

- If an intermediate domain concept is named, reused, matched on, or structurally validated, model it as a schema first instead of an ad-hoc boolean helper.
- Prefer built-in schema constructors/checks such as `Schema.NonEmptyString`, `Schema.NonEmptyArray`, `Schema.TupleWithRest`, `Schema.Union`, `Schema.isPattern`, and `Schema.isIncludes` before reaching for `Schema.makeFilter`.
- Derive domain guards with `Schema.is(SomeSchema)`.
- If an internal literal domain needs type guards, use `Schema.is(Schema.Literal(...))`. For exhaustive matching over literals, use `Match`. For annotation-bearing schema values, use `Schema.Literal(...).annotate({...})`.
- Prefer named intermediate schemas; export and document them when reusable or when they materially clarify the module’s domain model, otherwise keep them module-local.

### EF-12c: Reusable schema checks carry metadata

- Reusable `Schema.makeFilter`, `Schema.makeFilterGroup`, and reusable built-in check blocks must include `identifier`, `title`, and `description`.
- Keep `message` focused on the user-facing decode failure.
- Tiny one-off test checks may stay lighter when the schema itself is not reusable.

### EF-13: Discriminated union schemas

- If schema properties are a union of literal strings (for example `kind`, `state`, `category`), compose class variants into a `Schema.Union` and finalize with `Schema.toTaggedUnion("<field>")`.
- Prefer `Schema.Class` for tagged union member schemas.
- Use `Schema.TaggedUnion` only for canonical `_tag` object-union construction.
- Reference: [Effect schema docs](packages/effect/SCHEMA.md:1891) (via effect_ref_read) and [toTaggedUnion notes](packages/effect/SCHEMA.md:1934) (via effect_ref_read).

Example:

```ts
import * as Schema from 'effect/Schema';

export class ExternalJobCreated extends Schema.Class<ExternalJobCreated>(
	'ExternalJobCreated'
)(
	{
		kind: Schema.tag('created'),
		id: Schema.String
	},
	{ description: 'Created event from external job source.' }
) {}

export class ExternalJobCompleted extends Schema.Class<ExternalJobCompleted>(
	'ExternalJobCompleted'
)(
	{
		kind: Schema.tag('completed'),
		id: Schema.String,
		at: Schema.String
	},
	{ description: 'Completed event from external job source.' }
) {}

export const ExternalJobEvent = Schema.Union(
	ExternalJobCreated,
	ExternalJobCompleted
)
	.pipe(Schema.toTaggedUnion('kind'))
	.annotate({
		title: 'ExternalJobEvent',
		description: 'External job event union discriminated by `kind`.'
	});

export type ExternalJobEvent = typeof ExternalJobEvent.Type;

export const InternalJobEvent = Schema.TaggedUnion({
	Created: { id: Schema.String },
	Completed: { id: Schema.String, at: Schema.String }
}).annotate({
	title: 'InternalJobEvent',
	description: 'Canonical internal union discriminated by `_tag`.'
});
```

### EF-14: Effect-returning functions use `Effect.fn` or `Effect.fnUntraced`

- Prefer `Effect.fn("Name")(...)` for reusable/public effectful functions.
- Use `Effect.fnUntraced(...)` for internal hot paths where tracing overhead is unnecessary.
- Reference: [Effect.fn docs](packages/effect/src/Effect.ts:12850) (via effect_ref_read) and [Effect.fnUntraced docs](packages/effect/src/Effect.ts:12821) (via effect_ref_read).

Example:

```ts
import { Effect } from 'effect';
import * as Schema from 'effect/Schema';

export const loadUser = Effect.fn('User.load')(function* (userId: string) {
	yield* Effect.logDebug('loading user', userId);
	return { userId };
});

const parseInternal = Effect.fnUntraced(function* (input: string) {
	return yield* Schema.decodeUnknownEffect(Schema.UnknownFromJsonString)(
		input
	);
});
```

### EF-15: Effects must be observable

- Do not use `console.log`, `console.error`, or other `console.*` methods in Effect code. Use `Effect.logInfo`, `Effect.logError`, etc. for structured, testable logging.
- Instrument key workflows with logs, log annotations, spans, and metrics.
- Prefer built-in helpers:
    - Logging: `Effect.logWithLevel`, `Effect.log`, `Effect.logFatal`, `Effect.logWarning`, `Effect.logError`, `Effect.logInfo`, `Effect.logDebug`, `Effect.logTrace`
    - Logger/context: `Effect.withLogger`, `Effect.annotateLogs`, `Effect.annotateLogsScoped`, `Effect.withLogSpan`
    - Metrics/tracking: `Effect.track`, `Effect.trackSuccesses`, `Effect.trackErrors`, `Effect.trackDefects`, `Effect.trackDuration`
    - Tracing: `Effect.annotateSpans`, `Effect.annotateCurrentSpan`

Example:

```ts
import { Effect } from 'effect';
import * as Metric from 'effect/Metric';

const durationMs = Metric.histogram('workflow_duration_ms', {
	boundaries: Metric.boundariesFromIterable([10, 50, 100, 250, 500, 1000])
});
const failures = Metric.counter('workflow_failures_total');

const workflow = Effect.fn('Workflow.run')(function* (requestId: string) {
	yield* Effect.annotateCurrentSpan('requestId', requestId);
	yield* Effect.logInfo('workflow started');
	return 'ok';
}).pipe(
	Effect.withLogSpan('workflow.run'),
	Effect.annotateLogs({ service: 'my-app' }),
	Effect.trackDuration(durationMs),
	Effect.trackErrors(failures)
);
```

### EF-16: Durations and windows use `effect/Duration`

- Model timeouts, intervals, and windows with `Duration`.
- Avoid magic number time values in domain logic.

Example:

```ts
import { Duration, Effect } from 'effect';

const timeout = Duration.seconds(30);
const pollInterval = Duration.millis(250);

const program = Effect.sleep(pollInterval).pipe(Effect.timeout(timeout));
```

### EF-17: Nullable/nullish schema fields should decode to `Option`

- Use dedicated schema helpers for optional/null conversions:
    - `Schema.OptionFromNullOr`
    - `Schema.OptionFromNullishOr`
    - `Schema.OptionFromOptionalKey`
    - `Schema.OptionFromOptional`
- Reference: [Schema Option helpers](packages/effect/src/Schema.ts:5422) (via effect_ref_read) and [Schema optional field docs](packages/effect/SCHEMA.md:636) (via effect_ref_read).

Example:

```ts
import * as Schema from 'effect/Schema';

export class AccountInput extends Schema.Class<AccountInput>('AccountInput')({
	nickname: Schema.OptionFromNullishOr(Schema.String),
	bio: Schema.OptionFromNullOr(Schema.String),
	phone: Schema.OptionFromOptionalKey(Schema.String),
	timezone: Schema.OptionFromOptional(Schema.String)
}) {}
```

### EF-18: Exported helper APIs should be dual

- For reusable helper combinators, support both styles:
    - Data-first: `fn(self, arg)`
    - Data-last: `pipe(self, fn(arg))`
- Build these helpers with `dual` from `effect/Function`.
- Reference: [dual API](packages/effect/src/Function.ts:106) (via effect_ref_read).

Example:

```ts
import { dual } from 'effect/Function';
import { pipe } from 'effect';

export const addPrefix: {
	(prefix: string): (self: string) => string;
	(self: string, prefix: string): string;
} = dual(2, (self: string, prefix: string) => `${prefix}${self}`);

const a = addPrefix('value', 'p:');
const b = pipe('value', addPrefix('p:'));
```

### EF-19: JSON parse/stringify must use Schema

- Use `Schema.UnknownFromJsonString` for unknown JSON payloads.
- Use `Schema.fromJsonString(MySchema)` for typed JSON string boundaries.
- Avoid direct `JSON.parse` / `JSON.stringify` in Effect-first code.
- Reference: [UnknownFromJsonString](packages/effect/SCHEMA.md:4011) (via effect_ref_read) and [fromJsonString](packages/effect/SCHEMA.md:4028) (via effect_ref_read).

Example:

```ts
import * as Schema from 'effect/Schema';

export class User extends Schema.Class<User>('User')({
	id: Schema.String,
	name: Schema.String
}) {}

const UserJson = Schema.fromJsonString(User);

const decodeUserJson = Schema.decodeUnknownEffect(UserJson);
const encodeUserJson = Schema.encodeUnknownEffect(UserJson);
```

### EF-20: Completion gate is strict

You are not done if these fail:

- `bun run check`
- `bun run lint`
- `bun run test`

### EF-21: Runtime execution stays at the boundary

- Application entrypoints and tests may execute effects with `Effect.run*`.
- Library and domain exports should return `Effect` values.
- Keep runtime execution in one place so wiring, logging, and lifecycle behavior stay auditable.
- Reference: [runPromise](packages/effect/src/Effect.ts:8423) (via effect_ref_read), [runSync](packages/effect/src/Effect.ts:8606) (via effect_ref_read), and [runFork](packages/effect/src/Effect.ts:8264) (via effect_ref_read).

Example:

```ts
import { Effect } from 'effect';

export const runJob = Effect.fn('Job.run')(function* (id: string) {
	return { id };
});

// Runtime boundary only (for example, in main.ts):
// Effect.runPromise(runJob("job-1"))
```

### EF-22: Promise boundaries must be lifted into Effect

- Use `Effect.tryPromise` for Promise APIs that may reject.
- Keep Promise rejection details in typed failure values.
- Domain APIs should return `Effect`, not raw `Promise`.

Example:

```ts
import { Effect } from 'effect';

const fetchText = (url: string) =>
	Effect.tryPromise({
		try: () => fetch(url).then((response) => response.text()),
		catch: (cause) => new HttpRequestError({ url, message: String(cause) })
	});
```

### EF-23: Resource lifetime must be explicit and scoped

- Use `Effect.acquireUseRelease` for acquisition/use/release flows.
- Prefer `Effect.scoped` for helper composition that allocates resources.
- Do not manually open resources without an explicit finalization strategy.
- Reference: [acquireUseRelease](packages/effect/src/Effect.ts:6254) (via effect_ref_read) and [scoped](packages/effect/src/Effect.ts:6079) (via effect_ref_read).

Example:

```ts
import { Effect } from 'effect';

const withConnection = <A, E, R>(
	use: (conn: Connection) => Effect.Effect<A, E, R>
) => Effect.acquireUseRelease(openConnection, use, closeConnection);
```

### EF-24: Retry policy is declarative

- Encode retries with `Effect.retry` and `Schedule`.
- Avoid manual retry loops and ad-hoc mutable counters.
- Keep retry policy close to the failing effect.
- Reference: [retry](packages/effect/src/Effect.ts:3978) (via effect_ref_read).

Example:

```ts
import { Effect, Schedule } from 'effect';

const resilientFetch = fetchRemote.pipe(Effect.retry(Schedule.recurs(3)));
```

### EF-25: Timeouts are modeled outcomes

- Use `Effect.timeoutOption` when timeout should become `Option.None`.
- Use `Effect.timeoutOrElse` when timeout should produce a typed fallback effect.
- Avoid manually racing ad-hoc timers for business logic timeouts.
- Reference: [timeoutOption](packages/effect/src/Effect.ts:4421) (via effect_ref_read) and [timeoutOrElse](packages/effect/src/Effect.ts:4467) (via effect_ref_read).

Example:

```ts
import { Duration, Effect } from 'effect';

const lookupCachedOnTimeout = slowLookup.pipe(
	Effect.timeoutOrElse({
		duration: Duration.seconds(2),
		onTimeout: () => Effect.succeed('cached-value')
	})
);
```

### EF-26: Structured concurrency is the default

- Prefer `Effect.forkChild` so lifecycle is supervised by parent scope.
- Use `Effect.forkDetach` only for explicit daemon semantics.
- Make fork intent explicit in code review and comments for detached work.
- Reference: [forkChild](packages/effect/src/Effect.ts:7978) (via effect_ref_read) and [forkDetach](packages/effect/src/Effect.ts:8121) (via effect_ref_read).

Example:

```ts
import { Effect, Fiber } from 'effect';

const runWithHeartbeat = Effect.fn('Worker.run')(function* () {
	const heartbeat = yield* Effect.forkChild(heartbeatLoop);
	const result = yield* doWork;
	yield* Fiber.interrupt(heartbeat);
	return result;
});
```

### EF-27: Parallel fan-out needs explicit concurrency

- For non-trivial fan-out, set concurrency in `Effect.forEach`, `Effect.all`, or `Effect.validate`.
- Avoid implicit unbounded parallelism on large collections.
- Concurrency should be part of API intent for throughput-sensitive paths.
- Reference: [forEach concurrency](packages/effect/src/Effect.ts:990) (via effect_ref_read), [all concurrency](packages/effect/src/Effect.ts:751) (via effect_ref_read), [withConcurrency](packages/effect/src/Effect.ts:6001) (via effect_ref_read).

Example:

```ts
import { Effect } from 'effect';

const hydrateUsers = (ids: ReadonlyArray<string>) =>
	Effect.forEach(ids, fetchUser, { concurrency: 8 });
```

### EF-28: Configuration is an effect, not a global read

- Use `Config` and `ConfigProvider` for configuration loading and parsing.
- Keep direct `process.env` access out of domain code.
- Layer/provide config sources explicitly for tests and non-default environments.
- Reference: [Config](packages/effect/src/Config.ts) (via effect_ref_read) and [ConfigProvider](packages/effect/src/ConfigProvider.ts:358) (via effect_ref_read).

Example:

```ts
import { Config, Effect } from 'effect';

const loadPort = Effect.fn('Config.loadPort')(function* () {
	return yield* Config.int('PORT');
});
```

### EF-29: Secrets must stay redacted

- Use `Config.redacted` for secret config values.
- Use `Redacted.make` for sensitive values coming from non-config sources.
- Never log secret values after unwrapping.
- Reference: [Config.redacted](packages/effect/src/Config.ts:1161) (via effect_ref_read) and [Redacted](packages/effect/src/Redacted.ts) (via effect_ref_read).

Example:

```ts
import { Config, Effect } from 'effect';

const loadApiKey = Effect.fn('Config.loadApiKey')(function* () {
	const apiKey = yield* Config.redacted('API_KEY');
	yield* Effect.logDebug(`apiKey=${String(apiKey)}`);
	return apiKey;
});
```

### EF-30: Recovery should be precise, not blanket

- Prefer `Effect.catchTag` and `Effect.catchFilter` for targeted recovery.
- Do not hide unrelated failures behind broad fallback handlers.
- Keep recoverable error cases explicit in code.

Example:

```ts
import { Effect } from 'effect';
import * as Option from 'effect/Option';

const findUserOptional = (id: string) =>
	findUser(id).pipe(
		Effect.map(Option.some),
		Effect.catchTag('UserNotFoundError', () =>
			Effect.succeed(Option.none())
		)
	);
```

### EF-31: Separate expected failures from defects

- Use `Effect.fail` for expected business/domain failures.
- Reserve `Effect.die` / `Effect.orDie` for:
    - Invariant violations and impossible states.
    - Unrecoverable infrastructure failures where surfacing the error provides no actionable recovery path (e.g., the data directory is unwritable).
    - Discarding irrelevant upstream error types: when a consuming service cannot meaningfully recover from a dependency's error type and the error is not part of the consumer's own contract, `Effect.orDie` is legitimate. For example, a config loader that depends on an auth service may use `yield* authSvc.all().pipe(Effect.orDie)` because auth failures during config loading are unrecoverable.
- Do not model normal user-facing errors as defects.
- Reference: [die](packages/effect/src/Effect.ts:1745) (via effect_ref_read) and [orDie](packages/effect/src/Effect.ts:3557) (via effect_ref_read).

Example:

```ts
import { Effect } from 'effect';

const validateInput = Effect.fn('Input.validate')(function* (value: string) {
	if (value.length === 0) {
		return yield* Effect.fail(
			new ValidationError({ message: 'value must be non-empty' })
		);
	}

	if (value === '__unreachable__') {
		return yield* Effect.die('unreachable state');
	}

	return value;
});
```

### EF-32: Layer memoization isolation must be intentional

- Understand that layer provisioning is shared by default.
- When isolation is required, use `Effect.provide(..., { local: true })` or `Layer.fresh`.
- Document why isolation is necessary for behavior-sensitive paths.
- Compose `defaultLayer` values directly by default.
- Use `Layer.suspend(() => ...)` only when import evaluation order or a real circular dependency requires deferred composition.
- Reference: [Effect.provide local option](packages/effect/src/Effect.ts:5592) (via effect_ref_read) and [Layer.fresh](packages/effect/src/Layer.ts:1621) (via effect_ref_read).

Example:

```ts
import { Effect, Layer } from 'effect';

const runIsolated = program.pipe(
	Effect.provide(Layer.fresh(AppLayer), { local: true })
);
```

### EF-33: Schema-first development for domain models

- If a data shape is decoded from external input, will be discriminated via `instanceof`, or participates in a `Schema.Union`, define it as `Schema.Class` first — regardless of whether it is a "domain model" or an ephemeral HTTP response shape.
- Prefer `Schema.Class` (or another schema constructor) over plain `type` / `interface` for property-based domain shapes.
- Derive runtime types from schema definitions instead of duplicating parallel `type` / `interface` models.
- Keep plain `type` / `interface` for cases schema cannot represent cleanly (complex type-level transforms, utility types, overload-only surfaces).

Example:

```ts
import * as Schema from 'effect/Schema';

// Prefer schema-first over plain interfaces for domain payloads.
export class CreateOrderInput extends Schema.Class<CreateOrderInput>(
	'CreateOrderInput'
)(
	{
		orderId: Schema.String,
		customerId: Schema.String
	},
	{ description: 'Input payload for creating an order.' }
) {}
```

### EF-34: Schema defaults over fallback object logic

- Put defaults in schema definitions, not in handler/service fallback object literals.
- Use `Schema.withConstructorDefault` for constructor-time defaults.
- Use `Schema.withDecodingDefault` / `Schema.withDecodingDefaultKey` for decode-time defaults.

Example:

```ts
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

export class VersionSyncOptions extends Schema.Class<VersionSyncOptions>(
	'VersionSyncOptions'
)(
	{
		shouldCheck: Schema.Boolean.pipe(
			Schema.withDecodingDefault(Effect.succeed(true)),
			Schema.withConstructorDefault(Effect.succeed(true))
		),
		categories: Schema.Array(Schema.String).pipe(
			Schema.withDecodingDefault(Effect.succeed([])),
			Schema.withConstructorDefault(Effect.succeed([]))
		)
	},
	{ description: 'Version sync options with schema-level defaults.' }
) {}
```

### EF-35: Schema-backed guards and internal domain modeling

- If a guard validates domain strings/paths/tags, define a branded schema and use `Schema.is(...)`.
- If a domain constraint is named, reused, matched on, or structurally validated, model it as a schema first rather than a forest of ad-hoc predicate helpers.
- Prefer built-in schema constructors/checks before `Schema.makeFilter`.
- Keep guard intent and reusable check intent in schema annotations and check metadata.
- For internal literal domains, use `Schema.is(Schema.Literal(...))` for type guards, `Match` for exhaustive matching, and `Schema.Literal(...).annotate({...})` for annotated schema values.
- Prefer named intermediate schemas; export them only when reusable or when they materially clarify the module's domain model.
- Propagate branded schema types through the persistence layer (e.g., ORM column types: `text().$type<AccessToken>()`) to enforce compile-time safety across the entire stack and prevent parameter-swapping bugs.

Example:

```ts
import { Match, pipe } from 'effect';
import * as Arr from 'effect/Array';
import * as P from 'effect/Predicate';
import * as Schema from 'effect/Schema';
import * as Str from 'effect/String';

type TopicKind = 'plain' | 'scoped';

const ContainsScopeSeparator = Schema.String.check(
	Schema.isIncludes(':', {
		identifier: 'ContainsScopeSeparatorCheck',
		title: 'Contains Scope Separator',
		description: 'A string that contains `:`.',
		message: 'Topic text must contain :'
	})
).pipe(
	Schema.brand('ContainsScopeSeparator'),
	Schema.annotate({
		title: 'ContainsScopeSeparator',
		description: 'A string that contains the topic scope separator `:`.'
	})
);

const isContainsScopeSeparator = Schema.is(ContainsScopeSeparator);

const TopicSegment = Schema.NonEmptyString.check(
	Schema.makeFilter(P.not(isContainsScopeSeparator), {
		identifier: 'TopicSegmentNoSeparatorCheck',
		title: 'Topic Segment No Separator',
		description: 'A topic segment that does not contain `:`.',
		message: 'Topic segments must not contain :'
	})
).pipe(
	Schema.brand('TopicSegment'),
	Schema.annotate({
		title: 'TopicSegment',
		description: 'A non-empty topic segment without the scope separator.'
	})
);

const isTopicSegment = Schema.is(TopicSegment);

const splitNonEmpty =
	(separator: string | RegExp) =>
	(value: string): ReadonlyArray<string> =>
		pipe(Str.split(separator)(value), Arr.filter(Str.isNonEmpty));

const classifyTopicKind = Match.type<string>().pipe(
	Match.when(isContainsScopeSeparator, () => 'scoped' as const),
	Match.orElse(() => 'plain' as const)
);

const validateTopicSegments = (kind: TopicKind, value: string) =>
	Match.value(kind).pipe(
		Match.when('plain', () => isTopicSegment(value)),
		Match.when('scoped', () =>
			pipe(value, splitNonEmpty(':'), Arr.every(isTopicSegment))
		),
		Match.exhaustive
	);

export const TopicName = Schema.NonEmptyString.check(
	Schema.makeFilterGroup(
		[
			Schema.makeFilter(P.not(Str.endsWith(':')), {
				identifier: 'TopicNameNoTrailingSeparatorCheck',
				title: 'Topic Name No Trailing Separator',
				description: 'A topic name that does not end with `:`.',
				message: 'Topic names must not end with :'
			}),
			Schema.makeFilter(
				(value: string) =>
					validateTopicSegments(classifyTopicKind(value), value),
				{
					identifier: 'TopicNameSegmentsCheck',
					title: 'Topic Name Segments',
					description:
						'A topic name whose segments are valid topic segments.',
					message: 'Topic names must contain only valid segments'
				}
			)
		],
		{
			identifier: 'TopicNameChecks',
			title: 'Topic Name',
			description: 'Checks for a plain or scoped topic name.'
		}
	)
).pipe(
	Schema.brand('TopicName'),
	Schema.annotate({
		title: 'TopicName',
		description:
			'A topic name composed from valid plain or scoped segments.'
	})
);
```

Avoid this:

- A forest of `const hasX = ...`, `const isY = /.../.test(...)`, and unannotated predicate helpers when the named concepts can be expressed as schemas and reused with `Schema.is(...)`.

### EF-36: Prefer schema equivalence for domain comparisons

- For schema-modeled domain values, use `Schema.toEquivalence(schema)` instead of manual `===` / `!==`.
- This keeps comparison semantics aligned with schema intent and future schema changes.

Example:

```ts
import * as Schema from 'effect/Schema';

const stringArrayEq = Schema.toEquivalence(Schema.Array(Schema.String));

const arraysEqual = (
	left: ReadonlyArray<string>,
	right: ReadonlyArray<string>
) => stringArrayEq(left, right);
```

### EF-37: Use schema transformations for deterministic conversions

- If conversion is deterministic and type-shaping (path normalization, filename conversion, tagged-string normalization), model it with `Schema.decodeTo(..., SchemaTransformation.transform(...))`.
- Prefer schema transformation helpers over ad-hoc conversion functions.

Example:

```ts
import { SchemaTransformation } from 'effect';
import * as Schema from 'effect/Schema';
import * as Str from 'effect/String';

const NativePathToPosixPath = Schema.String.pipe(
	Schema.decodeTo(
		Schema.String.check(Schema.isPattern(/^[^\\]*$/)).pipe(
			Schema.brand('PosixPath')
		),
		SchemaTransformation.transform({
			decode: (pathString) => Str.replaceAll('\\', '/')(pathString),
			encode: (pathString) => pathString
		})
	)
);
```

### EF-38: Never use native array sort in Effect-first code

- Use `Arr.sort(values, order)` from `effect/Array`.
- Define ordering with `effect/Order` (`Order.String`, `Order.Number`, `Order.mapInput`, etc.).
- Do not call native `.sort()` directly on arrays.

Example:

```ts
import { Order } from 'effect';
import * as Arr from 'effect/Array';

const byName = Order.mapInput(
	Order.String,
	(item: { readonly name: string }) => item.name
);
const sorted = Arr.sort(items, byName);
```

### EF-39: Avoid ad-hoc `String(...)` coercion for domain comparisons

- When unknown/scalar data must normalize to domain strings, model the conversion with schema transformations.
- Compare resulting values with `Schema.toEquivalence(Schema.String)` (or domain schema equivalence), not raw string equality.

Example:

```ts
import { SchemaTransformation } from 'effect';
import * as Schema from 'effect/Schema';

const UnknownToString = Schema.Unknown.pipe(
	Schema.decodeTo(
		Schema.String,
		SchemaTransformation.transform({
			decode: (value) => `${value}`,
			encode: (value) => value
		})
	)
);
```

### EF-40: Use Effect.cached for memoization and deduplication

- Replace ad-hoc memoization (Promise-based `task` fields, `Fiber` tracking, mutable `result` caches) with `Effect.cached`.
- `Effect.cached(effect)` returns an Effect that runs `effect` at most once, sharing the result with all subsequent callers.
- For invalidatable caches, use `Effect.cachedInvalidateWithTTL(effect, Duration.infinity)` which returns a `[cachedEffect, invalidate]` tuple. Call `yield* invalidate` to force re-computation on next access.
- For time-based caches, use `Effect.cachedWithTTL(effect, duration)`.
- Prefer `Effect.cachedInvalidateWithTTL` with `Duration.infinity` over mutable `let` rebinding of cached effects.

Example:

```ts
import { Duration, Effect } from 'effect';

// One-shot lazy memoization
const cachedConfig = yield* Effect.cached(loadConfig());

// Manually invalidatable cache
const [cachedConfig, invalidate] =
	yield*
	Effect.cachedInvalidateWithTTL(
		loadConfig().pipe(Effect.orElseSucceed(() => defaultConfig)),
		Duration.infinity
	);
// Later: yield* invalidate to force reload on next access
```

## Copy-Paste Templates

### Template: Tagged error

```ts
import * as Schema from 'effect/Schema';

class DomainError extends Schema.TaggedErrorClass<DomainError>('DomainError')(
	'DomainError',
	{
		message: Schema.String
	},
	{ description: 'Domain failure' }
) {}
```

### Template: Safe nullable boundary conversion

```ts
import { pipe } from 'effect';
import * as Option from 'effect/Option';

const fromNullableName = (name: string | null | undefined) =>
	pipe(
		Option.fromNullishOr(name),
		Option.filter((value) => value.length > 0)
	);
```

### Template: Decode unknown at API edge

```ts
import * as Schema from 'effect/Schema';

export class Payload extends Schema.Class<Payload>('Payload')({
	query: Schema.String
}) {}

const decodePayload = Schema.decodeUnknownEffect(Payload);
```

### Template: Schema naming + type alias (no `Schema` suffix)

```ts
import * as Schema from 'effect/Schema';

export const OrderId = Schema.String;
export type OrderId = typeof OrderId.Type;
```

### Template: Schema-first replacement for interface

```ts
import * as Schema from 'effect/Schema';

export class UserProfile extends Schema.Class<UserProfile>('UserProfile')(
	{
		id: Schema.String,
		displayName: Schema.String
	},
	{ description: 'User profile model used in domain workflows.' }
) {}
```

### Template: Match over switch

```ts
import { Match } from 'effect';
import * as Arr from 'effect/Array';

type Phase = 'draft' | 'running' | 'done';

const phaseLabel = (phase: Phase) =>
	Match.value(phase).pipe(
		Match.when('draft', () => 'draft'),
		Match.when('running', () => 'running'),
		Match.when('done', () => 'done'),
		Match.exhaustive
	);

const summarize = (items: ReadonlyArray<string>) =>
	Arr.match(items, {
		onEmpty: () => 'none',
		onNonEmpty: (values) => `count:${Arr.length(values)}`
	});
```

### Template: Effect-returning function constructor

```ts
import { Effect } from 'effect';

export const runTask = Effect.fn('Task.run')(function* (taskId: string) {
	yield* Effect.logInfo('run task', taskId);
	return taskId;
});
```

### Template: Option schema from nullish/optional

```ts
import * as Schema from 'effect/Schema';

export class Input extends Schema.Class<Input>('Input')({
	maybeName: Schema.OptionFromNullishOr(Schema.String),
	maybeEmail: Schema.OptionFromOptionalKey(Schema.String)
}) {}
```

### Template: Dual helper (data-first + data-last)

```ts
import { dual } from 'effect/Function';

export const rename: {
	(
		to: string
	): (self: { readonly name: string }) => { readonly name: string };
	(self: { readonly name: string }, to: string): { readonly name: string };
} = dual(2, (self, to) => ({ ...self, name: to }));
```

### Template: JSON boundary without native JSON APIs

```ts
import * as Schema from 'effect/Schema';

export class Payload extends Schema.Class<Payload>('Payload')({
	query: Schema.String
}) {}

const PayloadJson = Schema.fromJsonString(Payload);

export const decodePayloadJson = Schema.decodeUnknownEffect(PayloadJson);
export const encodePayloadJson = Schema.encodeUnknownEffect(PayloadJson);
```

### Template: Runtime boundary execution

```ts
import { Effect } from 'effect';

export const buildReport = Effect.fn('Report.build')(function* () {
	return 'ok';
});

// runtime boundary only
// Effect.runPromise(buildReport())
```

### Template: Scoped resource helper

```ts
import { Effect } from 'effect';

export const withResource = <A, E, R>(
	use: (resource: Resource) => Effect.Effect<A, E, R>
) => Effect.acquireUseRelease(acquireResource, use, releaseResource);
```

### Template: Retry + timeout

```ts
import { Duration, Effect, Schedule } from 'effect';

export const resilientTask = task.pipe(
	Effect.retry(Schedule.recurs(3)),
	Effect.timeoutOption(Duration.seconds(5))
);
```

### Template: Config + redacted secret

```ts
import { Config, Effect } from 'effect';

export const loadConfig = Effect.fn('Config.load')(function* () {
	const port = yield* Config.int('PORT');
	const apiKey = yield* Config.redacted('API_KEY');
	return { port, apiKey };
});
```

### Template: Isolated layer provide

```ts
import { Effect, Layer } from 'effect';

export const runIsolated = program.pipe(
	Effect.provide(Layer.fresh(AppLayer), { local: true })
);
```

## LLM Review Checklist

Use this before submitting code:

1. No `any`, no type assertions, no `@ts-ignore`, no non-null assertions.
2. No untyped error throwing in domain logic.
3. Nullish converted to `Option` at boundaries.
4. Unknown input decoded with `Schema`.
5. Canonical namespace imports (`Option`, `Schema`, `Arr`, `P`, `R`, etc.) present and used.
6. No native `Object/Map/Set/Date/String` helpers in domain logic.
7. Branching logic is exhaustive where appropriate (`Match.exhaustive`, schema `.match`, and `Arr.match` for array emptiness).
8. No new schema constants end with `Schema`.
9. For non-class schemas, new schema constants expose `export type X = typeof X.Type`.
10. Schema annotations are used only where they materially improve docs, errors, or introspection.
11. `Effect`-returning reusable functions are created with `Effect.fn`/`Effect.fnUntraced`.
12. Critical flows include logs/spans/metrics instrumentation.
13. Durations/time windows use `Duration` values.
14. Nullish schema fields use `Schema.OptionFrom*` helpers when representing absence as `Option`.
15. Exported helper combinators support dual API via `dual`.
16. No `JSON.parse` / `JSON.stringify` in Effect-first domain paths.
17. Prefer `Schema.Class` over `Schema.Struct` for all decoded shapes (domain models, HTTP responses, API payloads).
18. Required verification commands are green.
19. `Effect.run*` appears only in runtime boundaries (entrypoint/test harness).
20. Promise-based APIs are lifted with `Effect.tryPromise`.
21. Acquired resources use `Effect.acquireUseRelease` or `Effect.scoped`.
22. Retries are declared with `Effect.retry` + `Schedule`.
23. Timeouts use `Effect.timeoutOption` / `Effect.timeoutOrElse`.
24. Forking intent is explicit (`forkChild` default; `forkDetach` justified).
25. Large fan-out operations specify concurrency deliberately.
26. Config values come from `Config` / `ConfigProvider`, not direct `process.env` in domain logic.
27. Secrets are `Redacted` (`Config.redacted` / `Redacted.make`) and not logged raw.
28. Recovery uses `catchTag` / `catchFilter` for targeted cases.
29. Expected failures use `Effect.fail`; defects are reserved for invariants and discarding irrelevant upstream error types via `orDie`.
30. Isolation-sensitive layer provisioning uses `{ local: true }` or `Layer.fresh`.
31. All decoded shapes (domain models, HTTP responses, API payloads) are schema-first with `Schema.Class`; plain `type` / `interface` is used only when schema is not a practical fit.
32. Literal-string discriminant unions use `Schema.Union` + `Schema.toTaggedUnion`. For exhaustive matching over literals, use `Match`. For type guards, use `Schema.is(Schema.Literal(...))`.
33. Schema defaults use `Schema.withConstructorDefault` / `Schema.withDecodingDefault*`, not ad-hoc fallback objects in handlers/services.
34. Named or reused domain constraints are modeled as schemas first; built-in schema constructors/checks are preferred before `Schema.makeFilter`.
35. Guard helpers for domain strings/paths/tags come from branded schemas with `Schema.is(...)`, not ad-hoc `regex.test(...)` predicates.
36. Reusable schema checks and filter groups carry `identifier`, `title`, and `description`.
37. Intermediate schemas are exported only when reusable or materially clarifying; otherwise they stay module-local.
38. Schema-modeled comparisons use `Schema.toEquivalence(...)` where practical.
39. Deterministic format conversions use `Schema.decodeTo(..., SchemaTransformation.transform(...))`.
40. Trivial helper wrapper lambdas are collapsed to direct helper refs where safe, and passthrough `pipe(...)` callbacks are expressed with `flow(...)`.
41. Runtime source avoids `node:fs` / `node:path` / `node:child_process`; use Effect `FileSystem` / `Path` / process services.
42. Runtime source avoids native `fetch`; HTTP boundaries use `effect/unstable/http` + platform layers (`BunHttpClient.layer`, etc.).
43. Runtime sorting uses `Arr.sort` with explicit `Order`, not native `Array.prototype.sort`.
44. Boolean branching prefers `Bool.match` over ad-hoc `if/else` when branching on booleans.
45. HTTP request/response composition uses Effect HTTP modules (`HttpClientRequest`, `HttpClientResponse`, `Headers`, `UrlParams`, `HttpMethod`, `HttpBody`).
