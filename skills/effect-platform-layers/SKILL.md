---
name: effect-platform-layers
description: Structure Effect platform layer provision for cross-platform applications using Effect platform abstractions.
---

# Platform Layers

Master Effect platform layer provision for cross-platform applications. Use this skill when structuring applications that use Effect platform abstractions to ensure portability across Node.js and Bun environments.

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

## Context Layer Services

Each platform context (`NodeServices.layer`, `BunServices.layer`) provides these services:

| Service                 | Tag                                       | Description                                         | Import from               |
| ----------------------- | ----------------------------------------- | --------------------------------------------------- | ------------------------- |
| **FileSystem**          | `FileSystem.FileSystem`                   | File I/O operations (read, write, stat, etc.)       | `effect`                  |
| **Path**                | `Path.Path`                               | Path manipulation (join, normalize, relative, etc.) | `effect`                  |
| **Stdio**               | `Stdio.Stdio`                             | Standard I/O streams (stdin, stdout, stderr)        | `effect`                  |
| **Terminal**            | `Terminal.Terminal`                       | Terminal/console I/O with ANSI support              | `effect`                  |
| **Crypto**              | `Crypto.Crypto`                           | Cryptographic random bytes, UUIDs, and digests      | `effect`                  |
| **ChildProcessSpawner** | `ChildProcessSpawner.ChildProcessSpawner` | Spawn and manage child processes                    | `effect/unstable/process` |

`Crypto.Crypto` is included in the Node/Bun aggregate layers; browser applications can provide `BrowserCrypto.layer` when they need the crypto service. These aggregate layers are core service bundles: they do **not** provide specialized integrations such as HTTP clients/servers, sockets, workers, or Redis. For sockets, import `Socket.Socket` / `SocketServer.SocketServer` from `effect/unstable/socket` and provide socket-specific layers such as `NodeSocket.layerWebSocket(...)`, `NodeSocket.layerNet(...)`, `BunSocket.layerWebSocket(...)`, `BrowserSocket.layerWebSocket(...)`, or Node/Bun socket-server layers as appropriate.

### Usage Example

```typescript
import { Console, Crypto, Effect, FileSystem, Path, Stream, Terminal } from 'effect';
import { ChildProcess, ChildProcessSpawner } from 'effect/unstable/process';

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
});
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

declare const program: Effect.Effect<void, never, never>;

// Custom FileSystem implementation
const CustomFS = Layer.succeed(FileSystem.FileSystem, {
	/* custom implementation */
} as FileSystem.FileSystem);

pipe(
	program,
	Effect.provide(NodeServices.layer),
	Effect.provide(CustomFS), // Override after platform layer
	NodeRuntime.runMain
);
```

## Testing with Mock Layers

**CRITICAL**: Prefer mock abstract services for unit tests. For runtime-adapter or layer-composition tests, it is acceptable to provide the real Node/Bun layers directly when that is the behavior under review.

### Mocking FileSystem

```typescript
import { Effect, FileSystem, Layer } from 'effect';
import { expect, test } from 'vitest';

declare const readConfig: Effect.Effect<string, never, FileSystem.FileSystem>;

// Use FileSystem.makeNoop for testing — provides default "NotFound" stubs
// for all methods, then override only the ones you need
const MockFileSystem = Layer.succeed(
	FileSystem.FileSystem,
	FileSystem.makeNoop({
		readFileString: (path) => Effect.succeed(`mock content for ${path}`),
		exists: (path) => Effect.succeed(true)
	})
);

test('should read config', () =>
	Effect.gen(function* () {
		const result = yield* readConfig;
		expect(result).toContain('mock content');
	}).pipe(Effect.provide(MockFileSystem), Effect.runPromise));
```

### Mocking Multiple Services

```typescript
import { Effect, FileSystem, Layer, Path, Terminal } from 'effect';
import { test } from 'vitest';

declare const program: Effect.Effect<
	void,
	never,
	FileSystem.FileSystem | Path.Path | Terminal.Terminal
>;

const TestContext = Layer.mergeAll(
	Layer.succeed(FileSystem.FileSystem, {
		readFileString: () => Effect.succeed('test')
		// ...
	} as FileSystem.FileSystem),

	Layer.succeed(Path.Path, {
		join: (...parts) => parts.join('/'),
		normalize: (path) => path
		// ...
	} as Path.Path),

	Layer.succeed(
		Terminal.Terminal,
		Terminal.make({
			columns: Effect.succeed(80),
			rows: Effect.succeed(24),
			readInput: Effect.dieMessage('readInput not used in this test'),
			readLine: Effect.succeed('test input'),
			display: () => Effect.void
		})
	)
);

test('integration test', () =>
	program.pipe(Effect.provide(TestContext), Effect.runPromise));
```

### Using layerNoop for Convenient Test Layers

```typescript
import { Effect, FileSystem } from 'effect';
import { test } from 'vitest';

// FileSystem.layerNoop wraps makeNoop in a Layer for convenience
const TestFS = FileSystem.layerNoop({
	readFileString: () => Effect.succeed('test content'),
	writeFileString: () => Effect.void,
	exists: () => Effect.succeed(true)
});

test('with layerNoop', () =>
	Effect.gen(function* () {
		const fs = yield* FileSystem.FileSystem;
		yield* fs.writeFileString('test.txt', 'content');
	}).pipe(Effect.provide(TestFS), Effect.runPromise));
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

```typescript
// services/ConfigService.ts
import { Effect, FileSystem, Layer, Path, Schema, Context } from 'effect';

interface Config {
	readonly name: string;
	readonly version: string;
}

declare const ConfigSchema: Schema.Schema<Config>;

class ConfigError extends Schema.TaggedErrorClass<ConfigError>()(
	'ConfigError',
	{
		message: Schema.String
	}
) {}

export class ConfigService extends Context.Service<
	ConfigService,
	{
		readonly load: Effect.Effect<Config, ConfigError>;
		save(config: Config): Effect.Effect<void, ConfigError>;
	}
>()('ConfigService') {}

export const ConfigServiceLive = Layer.effect(
	ConfigService,
	Effect.gen(function* () {
		const fs = yield* FileSystem.FileSystem;
		const path = yield* Path.Path;

		const load = Effect.gen(function* () {
			const configPath = path.join('config', 'app.json');
			const content = yield* fs.readFileString(configPath);
			return yield* Schema.decode(ConfigSchema)(JSON.parse(content));
		});

		const save = (config: Config) =>
			Effect.gen(function* () {
				const configPath = path.join('config', 'app.json');
				const content = JSON.stringify(config, null, 2);
				yield* fs.writeFileString(configPath, content);
			});

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

### Conditional Platform Loading

```typescript
import { NodeServices, NodeRuntime } from '@effect/platform-node';
import { BunServices } from '@effect/platform-bun';
import { Effect, pipe } from 'effect';

declare const program: Effect.Effect<void, never, never>;

const PlatformContext =
	process.env.RUNTIME === 'bun' ? BunServices.layer : NodeServices.layer;

pipe(
	program,
	Effect.provide(PlatformContext),
	NodeRuntime.runMain // Runtime matches context
);
```

### Scoped Platform Resources

```typescript
import { Effect, FileSystem, Path } from 'effect';

const withTempDirectory = Effect.gen(function* () {
	const fs = yield* FileSystem.FileSystem;
	const path = yield* Path.Path;

	const tempDir = yield* Effect.acquireRelease(
		Effect.gen(function* () {
			const dir = path.join('temp', `${Date.now()}`);
			yield* fs.makeDirectory(dir, { recursive: true });
			return dir;
		}),
		(dir) => fs.remove(dir, { recursive: true })
	);

	return tempDir;
});
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
4. **Mock in tests**: Use `Layer.succeed` with mock implementations, never import platform-specific modules in tests
5. **Entry point decides platform**: Only `main.ts` (or equivalent entry) should import platform-specific modules
