---
name: effect-config
description: Load and validate typed configuration with Config and ConfigProvider. Use this skill when reading environment variables, building structured config, providing test config, or working with .env files, JSON config, and custom config sources.
---

You are an Effect TypeScript expert specializing in typed configuration loading, validation, and provider composition.

## Effect Source Reference

The Effect v4 source is available at `.references/effect-v4/` in your project root.
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
Config.string('HOST'); // string
Config.nonEmptyString('HOST'); // string (rejects "")
Config.number('RATE'); // number (includes NaN, Infinity)
Config.finite('RATE'); // number (rejects NaN, Infinity)
Config.int('PORT'); // number (integers only)
Config.boolean('DEBUG'); // boolean (accepts true/false, yes/no, on/off, 1/0, y/n)
Config.port('PORT'); // number (integer in 1–65535)
Config.url('CALLBACK_URL'); // URL
Config.date('EXPIRES_AT'); // Date (rejects invalid dates)
Config.duration('TIMEOUT'); // Duration (parses "10 seconds", "500 millis", etc.)
Config.logLevel('LOG_LEVEL'); // string (All|Fatal|Error|Warn|Info|Debug|Trace|None)
Config.redacted('API_KEY'); // Redacted<string> (hidden from logs and toString)
Config.literal('production', 'ENV'); // literal type (accepts only the given literal)
```

## Config Combinators

### `Config.withDefault` — Fallback for Missing Keys

Only triggers when data is **missing**. Validation errors (wrong type, out of range) still propagate.

```ts
const port = Config.int('PORT').pipe(Config.withDefault(3000));
```

### `Config.option` — Optional Values

Returns `Option.some(value)` on success, `Option.none()` when data is missing.

```ts
const maybePort = Config.option(Config.int('PORT'));
```

### `Config.map` — Transform a Value

```ts
const upperHost = Config.string('HOST').pipe(
	Config.map((s) => s.toUpperCase())
);
```

### `Config.orElse` — Fallback on Any Error

Unlike `withDefault`, this catches **all** `ConfigError`s:

```ts
const host = Config.string('HOST').pipe(
	Config.orElse(() => Config.succeed('localhost'))
);
```

### `Config.all` — Combine Multiple Configs

Accepts a record or a tuple:

```ts
// As a record
const appConfig = Config.all({
	host: Config.string('host'),
	port: Config.int('port'),
	debug: Config.boolean('debug')
});

// As a tuple
const pair = Config.all([Config.string('a'), Config.int('b')]);
```

### `Config.nested` — Scope Under a Prefix

Prepends a path segment to every key the inner config reads. With environment variables, nesting uses `_` as separator.

```ts
const dbConfig = Config.all({
	host: Config.string('host'),
	port: Config.int('port')
}).pipe(Config.nested('database'));

// Reads from env: database_host, database_port
// Or from JSON: { database: { host: "...", port: 5432 } }
```

## Config.schema — Structured Config from Schema

For larger configs, use `Config.schema` with a `Schema.Struct`. The schema automatically decodes raw string values into target types (e.g. `"8080"` becomes `8080`, `"true"` becomes `true`).

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

### Config Schemas for Use with `Config.schema`

| Schema                      | Type           | Notes                                      |
| --------------------------- | -------------- | ------------------------------------------ |
| `Config.Boolean`            | `boolean`      | Decodes `true/false/yes/no/on/off/1/0/y/n` |
| `Config.Duration`           | `Duration`     | Decodes human-readable duration strings    |
| `Config.Port`               | `number`       | Integer in 1–65535                         |
| `Config.LogLevel`           | `string`       | One of the standard log level literals     |
| `Config.Record(key, value)` | `Record<K, V>` | Also parses flat `"k1=v1,k2=v2"` strings   |

## Two Ways to Run a Config

### 1. Yield in `Effect.gen` — uses current ConfigProvider from service map

```ts
const program = Effect.gen(function* () {
	const host = yield* Config.string('HOST');
	const port = yield* Config.int('PORT');
	console.log(`${host}:${port}`);
});
```

### 2. Call `.parse(provider)` directly — useful for testing

```ts
const host = Config.string('HOST');
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
	const port = yield* Config.int('port');
	return port;
});

Effect.runSync(Effect.provide(program, TestLayer)); // 8080
```

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
	const host = yield* Config.string('HOST');
	return host;
}).pipe(Effect.provideService(ConfigProvider.ConfigProvider, provider));
```

## Testing Patterns

Always use `ConfigProvider.fromUnknown` or `ConfigProvider.fromEnv({ env: {...} })` in tests for deterministic, hermetic config:

```ts
import { Config, ConfigProvider, Effect } from 'effect';

// Pattern 1: .parse(provider) for direct testing
const config = Config.all({
	host: Config.string('host'),
	port: Config.int('port')
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
	const host = yield* Config.string('host').pipe(Config.nested('server'));
	return host;
});

Effect.runSync(Effect.provide(program, TestConfigLayer));
```

## Error Handling

Config operations fail with `ConfigError`, which wraps either:

- **`SourceError`** — the provider could not read data (I/O failure, permission error)
- **`SchemaError`** — data was found but didn't match the schema (wrong type, out of range, missing key)

```ts
const program = Config.int('PORT')
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
	debug: Config.boolean('debug').pipe(Config.withDefault(false))
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
const port = Config.int('PORT').pipe(Config.withDefault(3000));
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
