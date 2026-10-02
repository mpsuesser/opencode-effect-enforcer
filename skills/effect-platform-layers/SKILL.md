---
name: effect-platform-layers
description: Structure Effect platform layer provision for cross-platform applications using Effect platform abstractions.
---

# Platform Layers

Master Effect platform layer provision for cross-platform applications. Use this skill when structuring applications that use Effect platform abstractions to ensure portability across Node.js and Bun environments.

Targets **Effect 4.0.0**. Keep `effect` and `@effect/*` packages on the same version and inspect the `effect@4.0.0` source tag. APIs explicitly marked `@stability unstable` can change in minor releases, including third-party client surfaces such as NodeRedis.

## The Golden Rule

**Application code uses abstract interfaces. Platform-specific layers are provided either at the program entry point or inside a runtime-facing adapter module's `defaultLayer`.**

```typescript
// Application code - platform agnostic
import { Effect, FileSystem, Path, pipe } from 'effect';

const readConfig = Effect.gen(function* () {
	const fs = yield* FileSystem.FileSystem;
	const path = yield* Path.Path;
	const configPath = path.join('config', 'app.json');
	return yield* fs.readFileString(configPath);
});

// Entry point - platform specific
import { NodeServices, NodeRuntime } from '@effect/platform-node';

declare const program: Effect.Effect<void, never, never>;

pipe(program, Effect.provide(NodeServices.layer), NodeRuntime.runMain);
```

```typescript
// WRONG - platform-specific imports in application code
import { readFileSync } from 'fs'; // Ties code to Node.js
import { FileSystem } from '@effect/platform-node'; // Platform-specific
```

Runtime-facing adapter modules may own their platform wiring directly:

```typescript
export const defaultLayer = layer.pipe(
	Layer.provide(NodeFileSystem.layer),
	Layer.provide(NodePath.layer)
);
```

The important boundary is that downstream callers still depend on the abstract service, not on Node/Bun modules.

For HTTP provider adapters, the abstract dependency is `HttpClient.HttpClient`. Keep it visible on the adapter's raw layer and name the adapter after the upstream it owns:

<!-- typecheck -->
```typescript
import { Context, Effect, Layer } from 'effect';
import { FetchHttpClient, HttpClient } from 'effect/http';

export class ProviderGateway extends Context.Service<ProviderGateway, {
	readonly health: Effect.Effect<void>;
}>()('app/ProviderGateway') {}

const makeProviderGateway = Effect.gen(function* () {
	yield* HttpClient.HttpClient;
	return ProviderGateway.of({ health: Effect.void });
});

export const layer: Layer.Layer<ProviderGateway, never, HttpClient.HttpClient> =
	Layer.effect(ProviderGateway, makeProviderGateway);

export const defaultLayer: Layer.Layer<ProviderGateway> = layer.pipe(
	Layer.provide(FetchHttpClient.layer)
);
```

Use `layer` when the application or test owns transport selection. Use `defaultLayer` only when this runtime-facing adapter intentionally owns the default transport. Do not provide the transport inside `layer`, because that erases the dependency graph and prevents straightforward substitution.

## Platform Import Patterns

### Node.js

```typescript
import { NodeServices, NodeRuntime } from '@effect/platform-node';
import { Effect, pipe } from 'effect';

declare const program: Effect.Effect<void, never, never>;

pipe(program, Effect.provide(NodeServices.layer), NodeRuntime.runMain);
```

### Bun

```typescript
import { BunServices, BunRuntime } from '@effect/platform-bun';
import { Effect, pipe } from 'effect';

declare const program: Effect.Effect<void, never, never>;

pipe(program, Effect.provide(BunServices.layer), BunRuntime.runMain);
```

### Browser

```typescript
import { BrowserRuntime } from '@effect/platform-browser';
import { Effect, pipe } from 'effect';

declare const program: Effect.Effect<void, never, never>;

pipe(program, BrowserRuntime.runMain);
```

`BrowserRuntime.runMain` keeps the main fiber alive when a `pagehide` event is persisted for the browser back/forward cache. It interrupts the fiber on non-persisted `pagehide`, when the document is actually being discarded. Browser teardown is best-effort, so asynchronous finalizers are not guaranteed to finish before the page disappears.

## Context Layer Services

Each platform context (`NodeServices.layer`, `BunServices.layer`) provides these services:

| Service                 | Tag                                       | Description                                         | Import from               |
| ----------------------- | ----------------------------------------- | --------------------------------------------------- | ------------------------- |
| **FileSystem**          | `FileSystem.FileSystem`                   | File I/O operations (read, write, stat, etc.)       | `effect`                  |
| **Path**                | `Path.Path`                               | Path manipulation (join, normalize, relative, etc.) | `effect`                  |
| **Stdio**               | `Stdio.Stdio`                             | Standard I/O streams (stdin, stdout, stderr)        | `effect`                  |
| **Terminal**            | `Terminal.Terminal`                       | Terminal/console I/O with ANSI support              | `effect`                  |
| **Crypto**              | `Crypto.Crypto`                           | Cryptographic random bytes, UUIDs, and digests      | `effect`                  |
| **ChildProcessSpawner** | `ChildProcessSpawner.ChildProcessSpawner` | Spawn and manage child processes                    | `effect/process` |

`Crypto.Crypto` is included in the Node/Bun aggregate layers; browser applications can provide `BrowserCrypto.layer` when they need the crypto service. These aggregate layers are core service bundles: they do **not** provide specialized integrations such as HTTP clients/servers, sockets, workers, or Redis. For sockets, import `Socket.Socket` / `SocketServer.SocketServer` from `effect/socket` and provide socket-specific layers such as `NodeSocket.layerWebSocket(...)`, `NodeSocket.layerNet(...)`, `BunSocket.layerWebSocket(...)`, `BrowserSocket.layerWebSocket(...)`, or Node/Bun socket-server layers as appropriate.

Runtime application/provider HTTP belongs behind Effect `HttpClient`, not raw `fetch`. Only a named low-level platform transport adapter may use fetch directly, with a documented justification and full ownership of interruption, status-before-decode, schema decoding, and typed errors. Provider adapters also own redacted diagnostic evidence and retry exhaustion; provider calls run outside database transactions, and retries apply only to proven-idempotent operations. In particular, do not decorate a shared client with automatic retry when it can execute ordinary non-idempotent POST/PATCH requests.

`Migrator.fromFileSystem` now requires both `FileSystem.FileSystem` and `Path.Path`. `NodeServices.layer` and `BunServices.layer` already satisfy both. If a migration runtime provides only an individual file-system layer, add the matching host path layer too; on Windows, core `Path.layer` is not a substitute for a platform-aware path implementation because it uses POSIX semantics.

### Redis Layers

Redis is deliberately outside the aggregate platform layers. `NodeRedis.layer` and `NodeRedis.layerConfig` use `redis` (node-redis), with a supported peer range of `redis >=5.0.0 <7.0.0`, and accept node-redis `RedisClientOptions`. When migrating from `ioredis`:

- Move host, port, TLS, and reconnect settings under `socket`.
- Rename `db` to `database`.
- Use node-redis camel-cased commands such as `hLen` and `lRange` on `NodeRedis.NodeRedis.client`.
- Use `sendCommand` for arbitrary raw commands.
- Do not force a RESP protocol unless required; protocol selection follows the installed node-redis default.

The Node layer connects while it is built and therefore can fail with `Redis.RedisError`. The initial connection fails fast by default; supplying `socket.reconnectStrategy` opts into caller-defined initial retry behavior. After the client first becomes ready, the built-in strategy uses node-redis exponential backoff and stops on socket timeouts. Scope finalization calls `close()`, which waits for in-flight and blocking commands and can delay layer shutdown.

### Usage Example

<!-- typecheck -->
```typescript
import { Console, Crypto, Effect, FileSystem, Path, Stream, Terminal } from 'effect';
import { ChildProcess, ChildProcessSpawner } from 'effect/process';

const buildProject = Effect.gen(function* () {
	const fs = yield* FileSystem.FileSystem;
	const path = yield* Path.Path;
	const terminal = yield* Terminal.Terminal;
	const crypto = yield* Crypto.Crypto;
	const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;

	// Use Path for cross-platform paths
	const outDir = path.join('dist', 'bundle');

	// Use FileSystem for I/O
	yield* fs.makeDirectory(outDir, { recursive: true });

	// Use Terminal dimensions and Crypto for output metadata
	const columns = yield* terminal.columns;
	const rows = yield* terminal.rows;
	const buildId = yield* crypto.randomUUIDv7;
	yield* terminal.display(`Building project ${buildId} (${columns}x${rows})...\n`);

	// Use ChildProcessSpawner for processes
	const handle = yield* spawner.spawn(
		ChildProcess.make('npm', ['run', 'build'])
	);
	yield* handle.all.pipe(
		Stream.decodeText(),
		Stream.splitLines,
		Stream.runForEach((line) => Console.log(`[build] ${line}`))
	);
	return yield* handle.exitCode;
}).pipe(Effect.scoped);
```

## Layer Composition Patterns

### Basic Provision

```typescript
import { NodeServices, NodeRuntime } from '@effect/platform-node';
import { Effect, pipe } from 'effect';

declare const program: Effect.Effect<void, never, never>;

// Single platform context provides all services
pipe(program, Effect.provide(NodeServices.layer), NodeRuntime.runMain);
```

### Adding Custom Services

```typescript
import { NodeServices, NodeRuntime } from '@effect/platform-node';
import { Effect, Layer, pipe } from 'effect';

declare const DatabaseLive: Layer.Layer<never, never, never>;
declare const ConfigServiceLive: Layer.Layer<never, never, never>;
declare const LoggerLive: Layer.Layer<never, never, never>;
declare const program: Effect.Effect<void, never, never>;

const AppLayer = Layer.mergeAll(DatabaseLive, ConfigServiceLive, LoggerLive);

pipe(
	program,
	Effect.provide(AppLayer),
	Effect.provide(NodeServices.layer), // Platform services last
	NodeRuntime.runMain
);
```

### Overriding Platform Services

```typescript
import { NodeServices, NodeRuntime } from '@effect/platform-node';
import { Effect, FileSystem, Layer, pipe } from 'effect';

declare const program: Effect.Effect<string, never, FileSystem.FileSystem>;

// A complete test double without asserting an incomplete object.
const CustomFS = FileSystem.layerNoop({
	readFileString: () => Effect.succeed('custom content')
});

pipe(
	program,
	Effect.provide(CustomFS), // Innermost provision wins for program reads
	Effect.provide(NodeServices.layer),
	NodeRuntime.runMain
);
```

Provision nests: `program.pipe(Effect.provide(A), Effect.provide(B))` builds A inside B, and A wins for overlapping services seen by `program`. An already-built aggregate such as `NodeServices.layer` wires its own internal dependencies; replacing the FileSystem seen by application code does not rewire its child-process spawner. Compose individual platform layers when those internal dependencies must also be replaced.

## Testing with Mock Layers

**CRITICAL**: Prefer mock abstract services for unit tests. For runtime-adapter or layer-composition tests, it is acceptable to provide the real Node/Bun layers directly when that is the behavior under review.

### Mocking FileSystem

```typescript
import { Effect, FileSystem, Layer } from 'effect';
import { expect, it } from '@effect/vitest';

declare const readConfig: Effect.Effect<string, never, FileSystem.FileSystem>;

// makeNoop supplies NotFound for many operations, exists=false, remove=void,
// and defects for directory/temp creation. Override each operation the test uses.
const MockFileSystem = Layer.succeed(
	FileSystem.FileSystem,
	FileSystem.makeNoop({
		readFileString: (path) => Effect.succeed(`mock content for ${path}`),
		exists: (path) => Effect.succeed(true)
	})
);

it.effect('should read config', () =>
	Effect.gen(function* () {
		const result = yield* readConfig;
		expect(result).toContain('mock content');
	}).pipe(Effect.provide(MockFileSystem)));
```

### Mocking Multiple Services

```typescript
import { Effect, FileSystem, Layer, Path, Terminal } from 'effect';
import { it } from '@effect/vitest';

declare const program: Effect.Effect<
	void,
	never,
	FileSystem.FileSystem | Path.Path | Terminal.Terminal
>;

const TestContext = Layer.mergeAll(
	FileSystem.layerNoop({
		readFileString: () => Effect.succeed('test')
	}),

	Path.layer, // Complete, deterministic POSIX path operations

	Layer.succeed(
		Terminal.Terminal,
		Terminal.make({
			columns: Effect.succeed(80),
			rows: Effect.succeed(24),
			readInput: Effect.die('readInput not used in this test'),
			readLine: Effect.succeed('test input'),
			display: () => Effect.void
		})
	)
);

it.effect('integration test', () =>
	program.pipe(Effect.provide(TestContext)));
```

### Using layerNoop for Convenient Test Layers

```typescript
import { Effect, FileSystem } from 'effect';
import { it } from '@effect/vitest';

// FileSystem.layerNoop wraps makeNoop in a Layer for convenience
const TestFS = FileSystem.layerNoop({
	readFileString: () => Effect.succeed('test content'),
	writeFileString: () => Effect.void,
	exists: () => Effect.succeed(true)
});

it.effect('with layerNoop', () =>
	Effect.gen(function* () {
		const fs = yield* FileSystem.FileSystem;
		yield* fs.writeFileString('test.txt', 'content');
	}).pipe(Effect.provide(TestFS)));
```

## Architecture Patterns

### Layered Application Structure

```
src/
├── domain/           # Pure domain logic (no platform deps)
├── services/         # Business services (uses abstract platform)
├── infrastructure/   # Platform adapters (if needed)
└── main/
    ├── main.ts       # Entry point with NodeServices
    └── main.test.ts  # Tests with mock contexts
```

### Service Implementation

<!-- typecheck -->
```typescript
// services/ConfigService.ts
import { Effect, FileSystem, Layer, Path, Context } from 'effect';
import * as Schema from 'effect/Schema';

class Config extends Schema.Class<Config>('Config')({
	name: Schema.String,
	version: Schema.String
}) {}

const ConfigJson = Schema.fromJsonString(Config);

class ConfigError extends Schema.TaggedError<ConfigError>()(
	'ConfigError',
	{
		operation: Schema.Literals(['load', 'save']),
		cause: Schema.Defect()
	}
) {}

/** Loads and saves schema-validated application configuration. */
export class ConfigService extends Context.Service<
	ConfigService,
	{
		readonly load: Effect.Effect<Config, ConfigError>;
		save(config: Config): Effect.Effect<void, ConfigError>;
	}
>()('ConfigService') {}

/** Requires abstract file-system and path services; preserves boundary failures. */
export const ConfigServiceLive = Layer.effect(
	ConfigService,
	Effect.gen(function* () {
		const fs = yield* FileSystem.FileSystem;
		const path = yield* Path.Path;

		const load = Effect.gen(function* () {
			const configPath = path.join('config', 'app.json');
			const content = yield* fs.readFileString(configPath);
			return yield* Schema.decodeUnknownEffect(ConfigJson)(content);
		}).pipe(Effect.mapError((cause) => new ConfigError({ operation: 'load', cause })));

		const save = Effect.fn('Config.save')(
			function* (config: Config) {
				const configPath = path.join('config', 'app.json');
				const content = yield* Schema.encodeEffect(ConfigJson)(config);
				yield* fs.makeDirectory(path.dirname(configPath), { recursive: true });
				yield* fs.writeFileString(configPath, content);
			},
			Effect.mapError((cause) => new ConfigError({ operation: 'save', cause }))
		);

		return { load, save };
	})
);
```

### Entry Point

```typescript
// main/main.ts
import { NodeServices, NodeRuntime } from '@effect/platform-node';
import { Effect, Layer, pipe } from 'effect';
import { ConfigService, ConfigServiceLive } from '../services/ConfigService.js';

const MainLayer = Layer.mergeAll(
	ConfigServiceLive
	// ... other services
);

const program = Effect.gen(function* () {
	const config = yield* ConfigService;
	yield* config.load;
	// ... application logic
});

pipe(
	program,
	Effect.provide(MainLayer),
	Effect.provide(NodeServices.layer),
	NodeRuntime.runMain
);
```

## Common Patterns

### Runtime-Specific Entry Points

```typescript
// main-node.ts
import { NodeServices, NodeRuntime } from '@effect/platform-node';
import { Effect } from 'effect';

declare const program: Effect.Effect<void, never, never>;

program.pipe(Effect.provide(NodeServices.layer), NodeRuntime.runMain);
```

Use `BunServices.layer` with `BunRuntime.runMain` in the Bun entry point. Separate entry points avoid eagerly loading adapters for a different runtime or selecting a layer independently of its runner.

### Scoped Platform Resources

<!-- typecheck -->
```typescript
import { Effect, FileSystem, Path } from 'effect';

const withTempDirectory = Effect.gen(function* () {
	const fs = yield* FileSystem.FileSystem;
	const path = yield* Path.Path;

	const tempDir = yield* fs.makeTempDirectoryScoped({ prefix: 'app-' });
	const file = path.join(tempDir, 'result.txt');
	yield* fs.writeFileString(file, 'result');

	// Return a durable value, not the path to a resource about to be deleted.
	return yield* fs.readFileString(file);
}).pipe(Effect.scoped);
```

## Anti-Patterns

### Platform-Specific Imports in Application Code

```typescript
// WRONG - ties application to Node.js
import * as fs from 'fs';
import * as path from 'path';

const readConfig = () => {
	const content = fs.readFileSync(path.join('config', 'app.json'), 'utf8');
	return JSON.parse(content);
};
```

### Direct Platform Module Usage

```typescript
// WRONG - bypasses Effect abstractions
import { FileSystem } from '@effect/platform-node';
import { Effect } from 'effect';

const program = Effect.gen(function* () {
	const fs = yield* FileSystem.FileSystem;
	// ...
});
```

### Providing Platform Layers in Application Code

```typescript
// WRONG - application code should not know about platform
import { NodeServices } from '@effect/platform-node';
import { Effect } from 'effect';

declare const program: Effect.Effect<void, never, never>;

export const myService = program.pipe(
	Effect.provide(NodeServices.layer) // Should be at entry point only
);
```

## Key Principles

1. **Import abstractions, provide implementations**: Application code imports from `effect` (e.g. `FileSystem`, `Path`, `Terminal`), entry points provide platform-specific contexts
2. **One platform layer per runtime**: Use exactly one of `NodeServices.layer` or `BunServices.layer`
3. **Platform layer last**: Provide custom services first, platform context last
4. **Test through services**: Use complete test layers for unit tests; real platform layers belong in runtime-adapter or composition tests
5. **Own platform wiring**: Entry points and runtime-facing adapter `defaultLayer` exports may import platform-specific modules
6. **Keep HTTP transport requirements visible**: Provider adapter `layer` requires `HttpClient.HttpClient`; an optional `defaultLayer` may provide the chosen transport
7. **Make adapters own the boundary**: Named adapters classify status before schema decoding, map typed failures, retain redacted evidence, and expose retry exhaustion
8. **Do not retry by accident**: Restrict retrying/rate-limited clients to proven-idempotent operations; non-idempotent calls need an explicit provider guarantee or idempotency key
9. **Do not hold transactions across providers**: Complete network calls before opening the database transaction used to persist their result
