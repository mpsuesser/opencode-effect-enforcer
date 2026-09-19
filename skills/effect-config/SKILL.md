---
name: effect-config
description: Load and validate typed configuration with Config and ConfigProvider. Use this skill when reading environment variables, building structured config, providing test config, or working with .env files, JSON config, and custom config sources.
---

You are an Effect TypeScript expert specializing in typed configuration loading, validation, and provider composition.

## Effect Source Reference

The Effect v4 source is available at `~/.local/share/opencode/repos/github.com/Effect-TS/effect@main/`.
Browse and read files there directly to look up APIs, types, and implementations.

Reference these files for Config/ConfigProvider details:

- `packages/effect/CONFIG.md` — primary guide
- `packages/effect/src/Config.ts` — Config API source
- `packages/effect/src/ConfigProvider.ts` — ConfigProvider API source

## Core Imports

```ts
import { Config, ConfigProvider, Effect, Schema } from 'effect';
```

## Why Not `process.env`

Never read `process.env` directly in Effect code. `Config` provides:

1. **Type safety** — primitives decode strings into `number`, `boolean`, `Date`, `Duration`, etc.
2. **Validation** — invalid values produce structured `ConfigError` with clear messages
3. **Composability** — nest, combine, transform, and default configs declaratively
4. **Testability** — swap providers without mocking `process.env`
5. **Schema integration** — use `Config.schema` with `Schema.Struct` for complex shapes

## Config Primitives

Each constructor reads a single value and decodes it. The optional `name` parameter sets the root path segment for lookup. Omit it when the config is part of a larger `Config.schema`.

```ts
Config.String('HOST'); // string
Config.NonEmptyString('HOST'); // string (rejects "")
Config.Number('RATE'); // number (includes NaN, Infinity)
Config.Finite('RATE'); // number (rejects NaN, Infinity)
Config.Int('PORT'); // number (integers only)
Config.Boolean('DEBUG'); // boolean (accepts true/false, yes/no, on/off, 1/0, y/n)
Config.Port('PORT'); // number (integer in 1–65535)
Config.URL('CALLBACK_URL'); // URL
Config.Date('EXPIRES_AT'); // Date (rejects invalid dates)
Config.Duration('TIMEOUT'); // Duration (parses "10 seconds", "500 millis", "Infinity", "-Infinity")
Config.LogLevel('LOG_LEVEL'); // string (All|Fatal|Error|Warn|Info|Debug|Trace|None)
Config.Redacted('API_KEY'); // Redacted<string> (hidden from logs and toString)
Config.Literal('production', 'ENV'); // literal type (accepts only the given literal)
Config.Literals(['development', 'production'], 'ENV'); // accepts one of several literals
```

## Config Combinators

### `Config.withDefault` — Fallback for Missing Keys

Only triggers when data is **missing**. Validation errors (wrong type, out of range) still propagate.

```ts
const port = Config.Int('PORT').pipe(Config.withDefault(3000));
```

### `Config.option` — Optional Values

Returns `Option.some(value)` on success, `Option.none()` when data is missing.

```ts
const maybePort = Config.option(Config.Int('PORT'));
```

### `Config.map` — Transform a Value

```ts
const upperHost = Config.String('HOST').pipe(
	Config.map((s) => s.toUpperCase())
);
```

### `Config.orElse` — Fallback on Any Error

Unlike `withDefault`, this catches **all** `ConfigError`s:

```ts
const host = Config.String('HOST').pipe(
	Config.orElse(() => Config.succeed('localhost'))
);
```

### `Config.all` — Combine Multiple Configs

Accepts a record or a tuple:

```ts
// As a record
const appConfig = Config.all({
	host: Config.String('host'),
	port: Config.Int('port'),
	debug: Config.Boolean('debug')
});

// As a tuple
const pair = Config.all([Config.String('a'), Config.Int('b')]);
```

### `Config.nested` — Scope Under a Prefix

Prepends a path segment to every key the inner config reads. With environment variables, nesting uses `_` as separator.

```ts
const dbConfig = Config.all({
	host: Config.String('host'),
	port: Config.Int('port')
}).pipe(Config.nested('database'));

// Reads from env: database_host, database_port
// Or from JSON: { database: { host: "...", port: 5432 } }
```

## Config.schema — Structured Config from Schema

For larger configs, use `Config.schema` with a concrete `StringTree` shape. The schema's canonical encoded shape determines whether the provider loads a scalar, object, array, or each member of a mixed-shape union.

```ts
const AppConfig = Config.schema(
	Schema.Struct({
		host: Schema.String,
		port: Schema.Int,
		debug: Schema.Boolean
	})
);
```

With an optional name parameter for nesting:

```ts
const ServerConfig = Config.schema(
	Schema.Struct({
		host: Schema.String,
		port: Schema.Int,
		logLevel: Schema.Literals(['debug', 'info', 'warn', 'error'])
	}),
	'server' // reads from server_host, server_port, server_logLevel in env
);
```

### Config constructors versus schemas

PascalCase names on `Config` construct configs, not schemas. Combine
`Config.Boolean`, `Config.Port`, and `Config.LogLevel` with `Config.all`; use
Schema values inside `Config.schema`. The specialized implementation schemas
are internal. `Config.mapEffect` is the effectful mapping combinator.

<!-- typecheck -->
```ts
import { Config, ConfigProvider, Schema } from 'effect';

const settings = Config.all({
	port: Config.Port('PORT'),
	debug: Config.Boolean('DEBUG'),
	exporters: Config.Array(Schema.String, 'EXPORTERS'),
	labels: Config.Record(Schema.String, Schema.String, 'LABELS'),
	limit: Config.ByteSize('LIMIT')
});
const parsed = settings.parse(ConfigProvider.fromUnknown({
	PORT: '8080', DEBUG: 'yes', EXPORTERS: 'otlp,console',
	LABELS: 'service.name=api', LIMIT: '64 KiB'
}));
```

`Config.Array(value, path?, options?)` and `Config.Record(key, value, path?, options?)`
also accept an options object without a path. They read structural values or
separated strings. Plain `Schema.Array` / `Schema.Record` in `Config.schema` load
structural children. Opaque encodings such as `Schema.Any`, `Schema.Unknown`, and
`Schema.Json` are rejected; use a concrete shape or
`Schema.fromJsonString(Schema.Json)` for scalar JSON.

Environment/bracket array indices must be unpadded decimal integers from 0 through
4294967294. Numeric-looking keys such as `01` remain object keys; use `[1]` for
array paths.

Missing or unavailable representations are decoded as `undefined` before `Config.withDefault` and `Config.option` decide semantic absence. A successful decoded `undefined` or an explicitly present empty structure remains a real value and is not replaced by a default.

## Two Ways to Run a Config

### 1. Yield in `Effect.gen` — uses current ConfigProvider from service map

```ts
const program = Effect.gen(function* () {
	const host = yield* Config.String('HOST');
	const port = yield* Config.Int('PORT');
	console.log(`${host}:${port}`);
});
```

### 2. Call `.parse(provider)` directly — useful for testing

```ts
const host = Config.String('HOST');
const provider = ConfigProvider.fromUnknown({ HOST: 'localhost' });
const result = Effect.runSync(host.parse(provider));
// "localhost"
```

## ConfigProvider Sources

### `ConfigProvider.fromEnv` — Environment Variables (Default)

The default provider. Path segments are joined with `_` for lookup. Env var names are split on `_` to build a tree, so `DATABASE_HOST=localhost` is accessible at both `["DATABASE_HOST"]` (flat) and `["DATABASE", "HOST"]` (nested).

```ts
// Default — reads from process.env (merged with import.meta.env when available)
// No explicit provision needed; this is the default ConfigProvider.

// For testing, pass an explicit env object:
const provider = ConfigProvider.fromEnv({
	env: {
		DATABASE_HOST: 'localhost',
		DATABASE_PORT: '5432'
	}
});
```

Empty strings are treated as missing by default. Pass `{ preserveEmptyStrings: true }` when an empty string is an explicit value.

### `ConfigProvider.fromEnvRecord` — Explicit Environment Records

Use `fromEnvRecord` when the environment record is supplied explicitly, especially in restricted runtimes where `fromEnv` cannot perform automatic environment detection. Unlike the `env` option of `fromEnv`, the record may contain `undefined` values; those entries are ignored.

```ts
const provider = ConfigProvider.fromEnvRecord({
	HOST: 'localhost',
	PORT: '3000',
	OPTIONAL_VALUE: undefined
});
```

### `ConfigProvider.fromUnknown` — Plain JS Objects

Ideal for testing or embedding config in code. Supports nested objects and arrays. Primitive values are automatically stringified.

```ts
const provider = ConfigProvider.fromUnknown({
	database: {
		host: 'localhost',
		port: 5432,
		credentials: {
			username: 'admin',
			password: 'secret'
		}
	},
	servers: ['server1', 'server2', 'server3']
});
```

### `ConfigProvider.fromDotEnvContents` — Parse `.env` Strings

Supports `export` prefixes, single/double/backtick quoting, inline comments, and escaped newlines.

```ts
const contents = `
# Database settings
HOST=localhost
PORT=3000
SECRET="my-secret-value"
`;

const provider = ConfigProvider.fromDotEnvContents(contents);

// With variable expansion:
const provider2 = ConfigProvider.fromDotEnvContents(
	`PASSWORD=secret\nDB_PASS=$PASSWORD`,
	{
		expandVariables: true
	}
);
```

### `ConfigProvider.fromDotEnv` — Load `.env` Files

Reads a `.env` file from disk. Returns an Effect (requires `FileSystem` in context).

```ts
const program = Effect.gen(function* () {
	const provider = yield* ConfigProvider.fromDotEnv();
	// or: yield* ConfigProvider.fromDotEnv({ path: "/custom/.env" })
	return provider;
});
```

### `ConfigProvider.fromDir` — Directory Trees (Kubernetes ConfigMap/Secret)

Reads config from a file-system tree where each file is a leaf and each directory is a container. Requires `Path` and `FileSystem` in context.

```
/etc/myapp/
  database/
    host       # contains "localhost"
    port       # contains "5432"
  api_key      # contains "sk-abc123"
```

```ts
const program = Effect.gen(function* () {
	const provider = yield* ConfigProvider.fromDir({ rootPath: '/etc/myapp' });
	return provider;
});
```

### `ConfigProvider.make` — Custom Sources

Build a provider from any backing store. Return `undefined` for "not found". Only fail with `SourceError` for actual I/O errors.

```ts
const data: Record<string, string> = {
	host: 'localhost',
	port: '5432'
};

const provider = ConfigProvider.make((path) => {
	const key = path.join('.');
	const value = data[key];
	return Effect.succeed(
		value !== undefined ? ConfigProvider.makeValue(value) : undefined
	);
});
```

## ConfigProvider Combinators

### `ConfigProvider.orElse` — Fallback Sources

Falls back to a second provider when the first returns `undefined` (path not found). Does **not** catch `SourceError`.

```ts
const envProvider = ConfigProvider.fromEnv({
	env: { HOST: 'prod.example.com' }
});
const defaults = ConfigProvider.fromUnknown({
	HOST: 'localhost',
	PORT: '3000'
});

const combined = ConfigProvider.orElse(envProvider, defaults);
```

At the `Config` level, `Config.orElse` preserves evidence that the primary branch read provider input. Consequently, an outer `Config.withDefault` or `Config.option` does not hide a partially supplied `Config.all` group.

### `ConfigProvider.nested` — Prefix All Lookups

Prepends path segments so that all lookups are scoped:

```ts
const provider = ConfigProvider.fromEnv({
	env: { APP_HOST: 'localhost', APP_PORT: '3000' }
});

// Lookups for ["HOST"] now resolve to ["APP", "HOST"]
const scoped = ConfigProvider.nested(provider, 'APP');
```

### `ConfigProvider.constantCase` — CamelCase to SCREAMING_SNAKE_CASE

Bridges camelCase schema keys to environment variable naming:

```ts
const provider = ConfigProvider.fromEnv({
	env: { DATABASE_HOST: 'localhost' }
}).pipe(ConfigProvider.constantCase);

// path ["databaseHost"] now resolves to ["DATABASE_HOST"]
```

### `ConfigProvider.mapInput` — Arbitrary Path Transforms

```ts
const upper = ConfigProvider.mapInput(provider, (path) =>
	path.map((seg) => (typeof seg === 'string' ? seg.toUpperCase() : seg))
);
```

## Installing a Provider

### `ConfigProvider.layer` — Replace the Active Provider

```ts
const TestLayer = ConfigProvider.layer(
	ConfigProvider.fromUnknown({ port: 8080 })
);

const program = Effect.gen(function* () {
	const port = yield* Config.Int('port');
	return port;
});

Effect.runSync(Effect.provide(program, TestLayer)); // 8080
```

## Config-Backed Layer Constructors

Library-style services should usually expose a concrete `layer(options)` for direct use and tests, plus `layerConfig(config)` when callers need runtime configuration. Type the latter with `Config.Wrap<Options>` and decode it once with `Config.unwrap`.

`Config.Wrap<Options>` accepts either one `Config<Options>` or a recursively wrapped object whose leaves are `Config` values. It does not accept raw concrete option values.

```ts
export const layer = (options: ClientOptions) =>
	Layer.effect(Client.Service, makeClient(options));

export const layerConfig = (config: Config.Wrap<ClientOptions>) =>
	Layer.effect(
		Client.Service,
		Config.unwrap(config).pipe(
			Effect.flatMap(makeClient),
			Effect.map(Client.Service.of)
		)
	);
```

Use `layer(options)` when options are already decoded. Use `layerConfig(...)` only at a configuration boundary; do not repeatedly read configuration inside business operations.

### `ConfigProvider.layerAdd` — Add Without Replacing

By default the new provider is a **fallback**:

```ts
// process.env is tried first; defaults is the fallback
const DefaultsLayer = ConfigProvider.layerAdd(
	ConfigProvider.fromUnknown({ HOST: 'localhost', PORT: '3000' })
);

// Set { asPrimary: true } to make the new provider the primary source instead
```

### `Effect.provideService` — One-Off Override

```ts
const provider = ConfigProvider.fromUnknown({ HOST: 'localhost' });

const program = Effect.gen(function* () {
	const host = yield* Config.String('HOST');
	return host;
}).pipe(Effect.provideService(ConfigProvider.ConfigProvider, provider));
```

## Testing Patterns

Always use `ConfigProvider.fromUnknown` or `ConfigProvider.fromEnvRecord({...})` in tests for deterministic, hermetic config:

```ts
import { Config, ConfigProvider, Effect } from 'effect';

// Pattern 1: .parse(provider) for direct testing
const config = Config.all({
	host: Config.String('host'),
	port: Config.Int('port')
});

const testProvider = ConfigProvider.fromUnknown({
	host: 'localhost',
	port: 5432
});

const result = Effect.runSync(config.parse(testProvider));
// { host: "localhost", port: 5432 }

// Pattern 2: ConfigProvider.layer for program-level tests
const TestConfigLayer = ConfigProvider.layer(
	ConfigProvider.fromUnknown({
		server: { host: 'localhost', port: 3000 },
		debug: true
	})
);

const program = Effect.gen(function* () {
	const host = yield* Config.String('host').pipe(Config.nested('server'));
	return host;
});

Effect.runSync(Effect.provide(program, TestConfigLayer));
```

## Error Handling

Config operations fail with `ConfigError`, which wraps either:

- **`SourceError`** — the provider could not read data (I/O failure, permission error)
- **`SchemaError`** — data was found but didn't match the schema (wrong type, out of range, missing key)

```ts
const program = Config.Int('PORT')
	.parse(ConfigProvider.fromUnknown({ PORT: 'not-a-number' }))
	.pipe(
		Effect.tapError((error) =>
			Effect.sync(() => {
				if (error.cause._tag === 'SchemaError') {
					console.log('Validation failed:', error.message);
				} else {
					console.log('Source error:', error.message);
				}
			})
		)
	);
```

**Important**: `Config.withDefault` and `Config.option` only recover from **missing-data** errors. Validation errors still propagate.

## Practical Example: Full Application Config

```ts
import { Config, ConfigProvider, Effect, Schema } from 'effect';

// Define structured config sections with Config.schema
const ServerConfig = Config.schema(
	Schema.Struct({
		host: Schema.String,
		port: Schema.Int,
		logLevel: Schema.Literals(['debug', 'info', 'warn', 'error'])
	}),
	'server'
);

const DbConfig = Config.schema(
	Schema.Struct({
		url: Schema.String,
		poolSize: Schema.Int
	}),
	'db'
);

// Combine with primitive configs
const AppConfig = Config.all({
	server: ServerConfig,
	db: DbConfig,
	debug: Config.Boolean('debug').pipe(Config.withDefault(false))
});

// In production — just yield it, reads from process.env
const program = Effect.gen(function* () {
	const config = yield* AppConfig;
	console.log(config);
});

// For testing — provide a specific provider
const testProvider = ConfigProvider.fromUnknown({
	server: { host: 'localhost', port: 3000, logLevel: 'debug' },
	db: { url: 'postgres://localhost/testdb', poolSize: 5 },
	debug: true
});

Effect.runSync(
	program.pipe(Effect.provide(ConfigProvider.layer(testProvider)))
);
```

With environment variables, the same config reads:

```
server_host=localhost
server_port=3000
server_logLevel=debug
db_url=postgres://localhost/mydb
db_poolSize=10
debug=true
```

## Anti-Patterns

### NEVER read process.env directly

```ts
// BAD
const port = parseInt(process.env.PORT ?? '3000');

// GOOD
const port = Config.Int('PORT').pipe(Config.withDefault(3000));
```

### NEVER validate config manually

```ts
// BAD
const raw = process.env.LOG_LEVEL;
if (!['debug', 'info', 'warn', 'error'].includes(raw)) throw new Error('...');

// GOOD
const logLevel = Config.schema(
	Schema.Literals(['debug', 'info', 'warn', 'error']),
	'LOG_LEVEL'
);
```

### NEVER mock process.env in tests

```ts
// BAD
process.env.HOST = 'localhost';

// GOOD
const provider = ConfigProvider.fromUnknown({ HOST: 'localhost' });
Effect.runSync(config.parse(provider));
```
