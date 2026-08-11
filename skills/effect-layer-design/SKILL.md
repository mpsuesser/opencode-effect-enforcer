---
name: effect-layer-design
description: Design and compose Effect layers for clean dependency management
---

# Layer Design Skill

Create layers that construct services while managing their dependencies cleanly.

## Effect Source Reference

The Effect v4 source is available at `~/.cache/effect-v4/`.
Browse and read files there directly to look up APIs, types, and implementations.

Reference this for:

- Layer source: `packages/effect/src/Layer.ts`
- Context source: `packages/effect/src/Context.ts`
- Migration guide: `MIGRATION.md`
- Effect source: `packages/effect/src/`

## Layer Structure

```typescript
import { Layer } from 'effect';

// Layer<RequirementsOut, Error, RequirementsIn>
//          ▲                ▲           ▲
//          │                │           └─ What this layer needs
//          │                └─ Errors during construction
//          └─ What this layer produces
```

## Pattern: Simple Layer (No Dependencies)

```typescript
import { Context, Effect, Layer } from 'effect';

interface ConfigData {
	readonly logLevel: string;
	readonly connection: string;
}

export class Config extends Context.Service<
	Config,
	{
		readonly getConfig: Effect.Effect<ConfigData>;
	}
>()('Config') {}

// Layer<Config, never, never>
//         ▲      ▲      ▲
//         │      │      └─ No dependencies
//         │      └─ Cannot fail
//         └─ Produces Config
export const ConfigLive = Layer.succeed(
	Config,
	Config.of({
		getConfig: Effect.succeed({
			logLevel: 'INFO',
			connection: 'mysql://localhost/db'
		})
	})
);
```

## Pattern: Layer with Dependencies

```typescript
import { Context, Effect, Layer, Console } from 'effect';

interface ConfigData {
	readonly logLevel: string;
	readonly connection: string;
}

export class Config extends Context.Service<
	Config,
	{
		readonly getConfig: Effect.Effect<ConfigData>;
	}
>()('Config') {}

export class Logger extends Context.Service<
	Logger,
	{
		readonly log: (message: string) => Effect.Effect<void>;
	}
>()('Logger') {}

// Layer<Logger, never, Config>
//         ▲      ▲      ▲
//         │      │      └─ Needs Config
//         │      └─ Cannot fail
//         └─ Produces Logger
export const LoggerLive = Layer.effect(
	Logger,
	Effect.gen(function* () {
		const config = yield* Config; // Access dependency
		return Logger.of({
			log: (message) =>
				Effect.gen(function* () {
					const { logLevel } = yield* config.getConfig;
					yield* Console.log(`[${logLevel}] ${message}`);
				})
		});
	})
);
```

## Pattern: Layer with Resource Management

Use `Layer.effect` for all layers, including those with resources that need cleanup. In Effect v4, `Layer.effect` automatically handles `Scope` lifecycle — `Layer.scoped` is no longer needed.

Resources are acquired and released using `Effect.acquireRelease` or `Effect.addFinalizer` inside the `Layer.effect` constructor:

```typescript
import { Context, Effect, Layer } from 'effect';

interface ConfigData {
	readonly logLevel: string;
	readonly connection: string;
}

interface Connection {
	readonly close: () => void;
}

interface DatabaseError {
	readonly _tag: 'DatabaseError';
}

export class Config extends Context.Service<
	Config,
	{
		readonly getConfig: Effect.Effect<ConfigData>;
	}
>()('Config') {}

export class Database extends Context.Service<
	Database,
	{
		readonly query: (sql: string) => Effect.Effect<unknown, DatabaseError>;
	}
>()('Database') {}

declare const connectToDatabase: (
	config: ConfigData
) => Effect.Effect<Connection, DatabaseError>;
declare const executeQuery: (
	connection: Connection,
	sql: string
) => Effect.Effect<unknown, DatabaseError>;

// Layer<Database, DatabaseError, Config>
export const DatabaseLive = Layer.effect(
	Database,
	Effect.gen(function* () {
		const config = yield* Config;
		const configData = yield* config.getConfig;

		// Acquire resource with automatic release — Layer.effect handles Scope
		const connection = yield* Effect.acquireRelease(
			connectToDatabase(configData),
			(conn) => Effect.sync(() => conn.close()) // Cleanup
		);

		return Database.of({
			query: (sql) => executeQuery(connection, sql)
		});
	})
);
```

## Composing Layers: Merge vs Provide

### Merge (Parallel Composition)

Combine independent layers:

```typescript
import { Context, Layer } from 'effect';

declare class Config extends Context.Service<Config, {}>()('Config') {}
declare class Logger extends Context.Service<Logger, {}>()('Logger') {}

declare const ConfigLive: Layer.Layer<Config, never, never>;
declare const LoggerLive: Layer.Layer<Logger, never, Config>;

// Layer<Config | Logger, never, Config>
//         ▲               ▲      ▲
//         │               │      └─ LoggerLive needs Config
//         │               └─ No errors
//         └─ Produces both Config and Logger
const AppConfigLive = Layer.merge(ConfigLive, LoggerLive);
```

Result combines:

- **Requirements**: Union (`never | Config = Config`)
- **Outputs**: Union (`Config | Logger`)

### Provide (Sequential Composition)

Chain dependent layers:

```typescript
import { Context, Layer } from 'effect';

declare class Config extends Context.Service<Config, {}>()('Config') {}
declare class Logger extends Context.Service<Logger, {}>()('Logger') {}

declare const ConfigLive: Layer.Layer<Config, never, never>;
declare const LoggerLive: Layer.Layer<Logger, never, Config>;

// Layer<Logger, never, never>
//         ▲      ▲      ▲
//         │      │      └─ ConfigLive satisfies LoggerLive's requirement
//         │      └─ No errors
//         └─ Only Logger in output
const FullLoggerLive = Layer.provide(LoggerLive, ConfigLive);
```

Result:

- **Requirements**: Outer layer's requirements (`never`)
- **Output**: Inner layer's output (`Logger`)

## Pattern: Direct Default Composition

Compose `defaultLayer` directly unless you have a real module-evaluation or circular-import problem. Most services do not need deferred composition.

```typescript
import { Layer } from 'effect';

// Raw layer — declares its dependencies in the type
export const layer: Layer.Layer<MyService, never, DepA | DepB> = Layer.effect(
	MyService,
	Effect.gen(function* () {
		const depA = yield* DepA;
		const depB = yield* DepB;
		return MyService.of({
			/* ... */
		});
	})
);

// Fully-wired layer — compose directly in the normal case
export const defaultLayer = layer.pipe(
	Layer.provide(DepA.defaultLayer),
	Layer.provide(DepB.defaultLayer)
);
```

### Deferred Composition with Layer.suspend

Use `Layer.suspend(() => ...)` when import evaluation order genuinely requires deferral:

```typescript
import { Layer } from 'effect';

export const defaultLayer = Layer.suspend(() =>
	layer.pipe(Layer.provide(Dep.defaultLayer))
);
```

`Layer.unwrap(Effect.sync(...))` still works, but it is not the universal default. Reach for deferred composition only when the dependency graph actually needs it.

**Naming convention:**

- **`layer`** — exposes the service's true dependency graph in its type signature. Tests compose against `layer` directly, providing mock layers.
- **`defaultLayer`** — the fully-wired production composition with all dependencies satisfied. Only define `defaultLayer` when `layer` has unsatisfied requirements. Self-contained layers (no external dependencies) export just `layer`.

### When to defer

Use deferred composition only for:

- real circular-import or module-evaluation hazards
- runtime-selected layer variants that should not be built eagerly
- recursive layer graphs that must be tied lazily

If none of those apply, compose directly.

## Pattern: Layered Architecture

Build applications in layers:

```typescript
import { Context, Layer } from 'effect';

declare class Config extends Context.Service<Config, {}>()('Config') {}
declare class Database extends Context.Service<Database, {}>()('Database') {}
declare class Cache extends Context.Service<Cache, {}>()('Cache') {}
declare class PaymentDomain extends Context.Service<PaymentDomain, {}>()(
	'PaymentDomain'
) {}
declare class OrderDomain extends Context.Service<OrderDomain, {}>()(
	'OrderDomain'
) {}
declare class PaymentGateway extends Context.Service<PaymentGateway, {}>()(
	'PaymentGateway'
) {}
declare class NotificationService extends Context.Service<
	NotificationService,
	{}
>()('NotificationService') {}

declare const ConfigLive: Layer.Layer<Config, never, never>;
declare const DatabaseLive: Layer.Layer<Database, never, Config>;
declare const CacheLive: Layer.Layer<Cache, never, Config>;
declare const PaymentDomainLive: Layer.Layer<PaymentDomain, never, Database>;
declare const OrderDomainLive: Layer.Layer<OrderDomain, never, Database>;
declare const PaymentGatewayLive: Layer.Layer<
	PaymentGateway,
	never,
	PaymentDomain
>;
declare const NotificationServiceLive: Layer.Layer<
	NotificationService,
	never,
	OrderDomain
>;

// Infrastructure: No dependencies
const InfrastructureLive = Layer.mergeAll(
	ConfigLive, // Layer<Config, never, never>
	DatabaseLive, // Layer<Database, never, Config>
	CacheLive // Layer<Cache, never, Config>
).pipe(
	Layer.provide(ConfigLive) // Satisfy Config requirement
);

// Domain: Depends on infrastructure
const DomainLive = Layer.mergeAll(
	PaymentDomainLive, // Layer<PaymentDomain, never, Database>
	OrderDomainLive // Layer<OrderDomain, never, Database>
).pipe(Layer.provide(InfrastructureLive));

// Application: Depends on domain
const ApplicationLive = Layer.mergeAll(
	PaymentGatewayLive,
	NotificationServiceLive
).pipe(Layer.provide(DomainLive));
```

## Pattern: Multiple Implementations

Switch implementations for different environments:

```typescript
import { Context, Effect, Layer } from 'effect';

interface Connection {
	readonly close: () => void;
}

export class Database extends Context.Service<
	Database,
	{
		readonly query: (sql: string) => Effect.Effect<{ rows: unknown[] }>;
	}
>()('Database') {}

declare const connectToProduction: () => Effect.Effect<Connection>;
declare const createDatabaseService: (connection: Connection) => {
	readonly query: (sql: string) => Effect.Effect<{ rows: unknown[] }>;
};

declare const myProgram: Effect.Effect<void, never, Database>;

// Production
export const DatabaseLive = Layer.effect(
	Database,
	Effect.gen(function* () {
		const connection = yield* connectToProduction();
		return createDatabaseService(connection);
	})
);

// Test
export const DatabaseTest = Layer.succeed(
	Database,
	Database.of({
		query: () => Effect.succeed({ rows: [] })
	})
);

// Use in application
const program = Effect.gen(function* () {
	const nodeEnv = yield* Config.string('NODE_ENV').pipe(
		Config.withDefault('production')
	);
	yield* myProgram.pipe(
		Effect.provide(nodeEnv === 'test' ? DatabaseTest : DatabaseLive)
	);
});
```

## Pattern: Layer Sharing

Layers are memoized - same instance shared across program:

```typescript
import { Context, Effect, Layer } from 'effect';

declare class Config extends Context.Service<
	Config,
	{ readonly value: string }
>()('Config') {}
declare const ConfigLive: Layer.Layer<Config, never, never>;

// Config is constructed once and shared
const program = Effect.all([
	Effect.gen(function* () {
		const config = yield* Config;
		// Uses shared instance
	}),
	Effect.gen(function* () {
		const config = yield* Config;
		// Same instance
	})
]).pipe(Effect.provide(ConfigLive));
```

> **Memo-map fork nuance:** Sharing is mediated by a `MemoMap`. A root memo map (`Layer.makeMemoMapUnsafe()`, used implicitly by `Effect.provide`) shares every layer allocation it builds. A _forked_ memo map (`Layer.forkMemoMap` / `Layer.forkMemoMapUnsafe`) can still see allocations its parent already built, but new allocations it builds stay isolated and are not written back to the parent. This is the mechanism `@effect/vitest` uses to reuse parent layers while isolating nested `it.layer` suites.

## Error Handling in Layers

Handle construction errors:

```typescript
import { Context, Effect, Layer, Schema } from 'effect';

interface Connection {
	readonly close: () => void;
}

class ConnectionError extends Schema.TaggedError<ConnectionError>()(
	'ConnectionError',
	{
		message: Schema.String
	}
) {}

class DatabaseConstructionError extends Schema.TaggedError<DatabaseConstructionError>()(
	'DatabaseConstructionError',
	{ cause: ConnectionError }
) {}

export class Database extends Context.Service<
	Database,
	{
		readonly query: (sql: string) => Effect.Effect<unknown>;
	}
>()('Database') {}

declare const connectToDatabase: () => Effect.Effect<
	Connection,
	ConnectionError
>;
declare const createDatabaseService: (connection: Connection) => {
	readonly query: (sql: string) => Effect.Effect<unknown>;
};

export const DatabaseLive = Layer.effect(
	Database,
	Effect.gen(function* () {
		const connection = yield* connectToDatabase().pipe(
			Effect.catchTag('ConnectionError', (error) =>
				Effect.fail(new DatabaseConstructionError({ cause: error }))
			)
		);
		return createDatabaseService(connection);
	})
);
```

## Composing Layers: ProvideMerge (for test stacks)

`Layer.provideMerge` satisfies dependencies AND passes them through to the output. This is critical for test layer stacks where multiple downstream layers need access to the same upstream services.

### Provide vs ProvideMerge

```typescript
import { Layer } from 'effect';

declare const ConfigLayer: Layer.Layer<Config>;
declare const DatabaseLayer: Layer.Layer<Database, never, Config>;
declare const UserServiceLayer: Layer.Layer<UserService, never, Database>;

// Layer.provide — satisfies requirement, REMOVES it from output
const db = DatabaseLayer.pipe(Layer.provide(ConfigLayer));
// db: Layer<Database>  — Config is NOT in the output

// Layer.provideMerge — satisfies requirement, KEEPS it in output
const dbWithConfig = DatabaseLayer.pipe(Layer.provideMerge(ConfigLayer));
// dbWithConfig: Layer<Database | Config>  — Config remains available
```

### When to use ProvideMerge

Use `Layer.provideMerge` when building test layer stacks where multiple layers share the same dependencies:

```typescript
import { Layer } from 'effect';

// Test layer composition — downstream layers need Config AND Database
const infra = Layer.mergeAll(ConfigLayer, DatabaseLayer).pipe(
	Layer.provideMerge(ConfigLayer) // Config stays visible for downstream
);

// Both UserService and OrderService can access Config and Database
const services = Layer.mergeAll(UserServiceLayer, OrderServiceLayer).pipe(
	Layer.provideMerge(infra)
);
```

Without `Layer.provideMerge`, you would need to manually merge every intermediate layer to keep services visible to downstream consumers.

## Pattern: SynchronizedRef + Deferred State Machine

For services that need atomic state transitions with concurrent callers, use `SynchronizedRef.modifyEffect` combined with `Deferred` for result sharing:

```typescript
import { Deferred, Effect, Fiber, Scope, SynchronizedRef } from 'effect';

type State<A, E> =
	| { readonly _tag: 'Idle' }
	| {
			readonly _tag: 'Running';
			readonly done: Deferred.Deferred<A, E>;
			readonly fiber: Fiber.Fiber<A, E>;
	  }
	| { readonly _tag: 'Pending'; readonly done: Deferred.Deferred<A, E> };

const make = <A, E>(scope: Scope.Scope) => {
	const ref = SynchronizedRef.makeUnsafe<State<A, E>>({ _tag: 'Idle' });

	const run = (work: Effect.Effect<A, E>) =>
		SynchronizedRef.modifyEffect(
			ref,
			Effect.fnUntraced(function* (state) {
				switch (state._tag) {
					case 'Running':
						// Already running — share the existing result
						return [Deferred.await(state.done), state];
					case 'Idle': {
						// Start new work
						const done = yield* Deferred.make<A, E>();
						const fiber = yield* Effect.forkIn(
							work.pipe(Effect.intoDeferred(done)),
							scope
						);
						return [
							Deferred.await(done),
							{ _tag: 'Running' as const, done, fiber }
						];
					}
					case 'Pending': {
						// Queued — share the pending result
						return [Deferred.await(state.done), state];
					}
				}
			})
		).pipe(Effect.flatten);

	return { run };
};
```

Key properties:

- **`SynchronizedRef.modifyEffect`** — atomically reads state, runs an effect, and updates state in one operation. No other caller can interleave.
- **`Deferred`** — shares the result of in-flight work with concurrent callers who arrive while it's running.
- **`Effect.forkIn(work, scope)`** — ties the worker fiber to the service scope, not the calling fiber.
- The state machine pattern ensures at most one concurrent execution of `work`, with all callers sharing the same result.

Use this pattern when:

- Multiple concurrent callers may trigger the same expensive operation
- Only one execution should run at a time
- All callers should receive the same result

## Naming Convention

- `*Live` - Production implementation
- `*Test` - Test implementation
- `*Mock` - Mock for testing
- Descriptive names for specialized implementations

## Quality Checklist

- [ ] Layer type accurately reflects dependencies
- [ ] `Service.of({...})` used when returning from `Layer.effect`, never a plain object
- [ ] Resource cleanup using `acquireRelease` or `addFinalizer` if needed
- [ ] Layer can be tested with mock dependencies
- [ ] No dependency leakage into service interface
- [ ] Appropriate use of merge vs provide vs provideMerge
- [ ] `defaultLayer` only present when `layer` has unsatisfied requirements
- [ ] `defaultLayer` composes directly unless deferred evaluation is truly required
- [ ] Error handling for construction failures
- [ ] JSDoc with example usage

Layers should make dependency management explicit while keeping service interfaces clean and focused.
