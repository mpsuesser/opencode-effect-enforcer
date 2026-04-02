---
name: effect-layer-design
description: Design and compose Effect layers for clean dependency management
---

# Layer Design Skill

Create layers that construct services while managing their dependencies cleanly.

## Effect Source Reference

The Effect v4 source is available at `.references/effect-v4/` in your project root.
Browse and read files there directly to look up APIs, types, and implementations.

Reference this for:

- Layer source: `packages/effect/src/Layer.ts`
- ServiceMap source: `packages/effect/src/ServiceMap.ts`
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
import { ServiceMap, Effect, Layer } from 'effect';

interface ConfigData {
	readonly logLevel: string;
	readonly connection: string;
}

export class Config extends ServiceMap.Service<
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
import { ServiceMap, Effect, Layer, Console } from 'effect';

interface ConfigData {
	readonly logLevel: string;
	readonly connection: string;
}

export class Config extends ServiceMap.Service<
	Config,
	{
		readonly getConfig: Effect.Effect<ConfigData>;
	}
>()('Config') {}

export class Logger extends ServiceMap.Service<
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
import { ServiceMap, Effect, Layer } from 'effect';

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

export class Config extends ServiceMap.Service<
	Config,
	{
		readonly getConfig: Effect.Effect<ConfigData>;
	}
>()('Config') {}

export class Database extends ServiceMap.Service<
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
import { ServiceMap, Layer } from 'effect';

declare class Config extends ServiceMap.Service<Config, {}>()('Config') {}
declare class Logger extends ServiceMap.Service<Logger, {}>()('Logger') {}

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
import { ServiceMap, Layer } from 'effect';

declare class Config extends ServiceMap.Service<Config, {}>()('Config') {}
declare class Logger extends ServiceMap.Service<Logger, {}>()('Logger') {}

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

## Pattern: Lazy Composition with Layer.unwrap

When composing a fully-wired `defaultLayer` that references other modules' default layers, use `Layer.unwrap(Effect.sync(...))` to defer composition until runtime. This avoids `undefined` values caused by circular import evaluation order.

```typescript
import { Effect, Layer } from 'effect';

// Raw layer — declares its dependencies in the type
export const layer: Layer.Layer<MyService, never, DepA | DepB> =
	Layer.effect(
		MyService,
		Effect.gen(function* () {
			const depA = yield* DepA;
			const depB = yield* DepB;
			return MyService.of({ /* ... */ });
		})
	);

// Fully-wired layer — deferred to avoid circular imports
export const defaultLayer = Layer.unwrap(
	Effect.sync(() =>
		layer.pipe(
			Layer.provide(DepA.defaultLayer),
			Layer.provide(DepB.defaultLayer)
		)
	)
);
```

**Naming convention:** `layer` exposes the service's true dependency graph in its type signature. `defaultLayer` is the opinionated production wiring with all dependencies satisfied. Tests compose against `layer` directly, providing mock layers.

## Pattern: Breaking Circular Dependencies with Layer.suspend

When two modules' default layers depend on each other (true circular dependency), use `Layer.suspend` to break the cycle:

```typescript
import { Layer } from 'effect';

export const defaultLayer = Layer.suspend(() =>
	layer.pipe(
		Layer.provide(ServiceA.defaultLayer),
		Layer.provide(ServiceB.defaultLayer)
	)
);
```

Prefer `Layer.unwrap(Effect.sync(...))` when simple deferral suffices. Reserve `Layer.suspend` for true circular dependencies where both modules reference each other's layers.

## Pattern: Layered Architecture

Build applications in layers:

```typescript
import { ServiceMap, Layer } from 'effect';

declare class Config extends ServiceMap.Service<Config, {}>()('Config') {}
declare class Database extends ServiceMap.Service<Database, {}>()('Database') {}
declare class Cache extends ServiceMap.Service<Cache, {}>()('Cache') {}
declare class PaymentDomain extends ServiceMap.Service<PaymentDomain, {}>()(
	'PaymentDomain'
) {}
declare class OrderDomain extends ServiceMap.Service<OrderDomain, {}>()(
	'OrderDomain'
) {}
declare class PaymentGateway extends ServiceMap.Service<PaymentGateway, {}>()(
	'PaymentGateway'
) {}
declare class NotificationService extends ServiceMap.Service<
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
import { ServiceMap, Effect, Layer } from 'effect';

interface Connection {
	readonly close: () => void;
}

export class Database extends ServiceMap.Service<
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
import { ServiceMap, Effect, Layer } from 'effect';

declare class Config extends ServiceMap.Service<
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

## Error Handling in Layers

Handle construction errors:

```typescript
import { ServiceMap, Effect, Layer, Schema } from 'effect';

interface Connection {
	readonly close: () => void;
}

class ConnectionError extends Schema.TaggedErrorClass<ConnectionError>()(
	'ConnectionError',
	{
		message: Schema.String
	}
) {}

class DatabaseConstructionError extends Schema.TaggedErrorClass<DatabaseConstructionError>()(
	'DatabaseConstructionError',
	{ cause: ConnectionError }
) {}

export class Database extends ServiceMap.Service<
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

## Naming Convention

- `*Live` - Production implementation
- `*Test` - Test implementation
- `*Mock` - Mock for testing
- Descriptive names for specialized implementations

## Quality Checklist

- [ ] Layer type accurately reflects dependencies
- [ ] Resource cleanup using `acquireRelease` if needed
- [ ] Layer can be tested with mock dependencies
- [ ] No dependency leakage into service interface
- [ ] Appropriate use of merge vs provide
- [ ] Error handling for construction failures
- [ ] JSDoc with example usage

Layers should make dependency management explicit while keeping service interfaces clean and focused.
