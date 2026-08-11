---
name: effect-command-executor
description: Spawn and manage child processes using Effect's ChildProcess module. Use this skill when running shell commands, capturing process output, piping commands, streaming long-running process output, or managing process lifecycles with scoped cleanup.
---

# Child Process Execution with Effect v4

## Overview

The `ChildProcess` module provides type-safe, composable process execution with automatic resource cleanup via `Scope`. Commands are AST values — built first with `make` and `pipeTo`, then executed via the `ChildProcessSpawner` service.

**When to use this skill:**

- Running shell commands or external programs
- Capturing command output as string, lines, or stream
- Piping commands together (shell pipeline equivalent)
- Streaming output from long-running processes
- Managing process lifecycles with scoped cleanup

**Note:** This skill covers child process execution, NOT `@effect/cli` for building CLI applications.

## Import Pattern

```typescript
import { ChildProcess, ChildProcessSpawner } from 'effect/unstable/process';
```

Platform layer (Node.js):

```typescript
import { NodeServices } from '@effect/platform-node';
```

## Creating Commands

### Template Literal Form

```typescript
import { ChildProcess } from 'effect/unstable/process';

// Simple command — parsed by whitespace
const cmd = ChildProcess.make`echo hello world`;

// With interpolation — expressions become separate arguments
const name = 'my-package';
const cmd2 = ChildProcess.make`bun publish ${name}`;

// Array expressions expand to multiple arguments
const files = ['a.ts', 'b.ts', 'c.ts'];
const cmd3 = ChildProcess.make`oxfmt ${files}`;
```

### Options + Template Literal Form

```typescript
import { ChildProcess } from 'effect/unstable/process';

// Options object returns a tagged template function
const cmd = ChildProcess.make({ cwd: '/tmp' })`ls -la`;

const cmd2 = ChildProcess.make({
	cwd: '/app',
	env: { NODE_ENV: 'production' },
	extendEnv: true
})`node server.js`;
```

### Array Form

```typescript
import { ChildProcess } from 'effect/unstable/process';

// Explicit command + args array
const cmd = ChildProcess.make('git', ['status'], {
	extendEnv: true,
	stdin: 'ignore'
});

// With options
const cmd2 = ChildProcess.make('bun', ['lint'], {
	env: { FORCE_COLOR: '1' },
	extendEnv: true,
	stdin: 'ignore'
});

// Command only (no args)
const cmd3 = ChildProcess.make('node', {
	cwd: '/app',
	extendEnv: true,
	stdin: 'ignore'
});
```

### Command Options

```typescript
import { ChildProcess } from 'effect/unstable/process';

const cmd = ChildProcess.make('node', ['script.js'], {
	// Working directory
	cwd: '/path/to/project',

	// Environment variables
	env: { NODE_ENV: 'production', API_KEY: 'xyz' },

	// Merge with process.env (default: undefined)
	extendEnv: true,

	// Run inside a shell (generally disadvised)
	shell: false,

	// Detach from parent (default: true on non-Windows)
	detached: true,

	// stdio configuration — use 'ignore' for non-interactive commands
	stdin: 'ignore', // "pipe" | "inherit" | "ignore" | Stream
	stdout: 'pipe', // "pipe" | "inherit" | "ignore" | Sink
	stderr: 'pipe', // "pipe" | "inherit" | "ignore" | Sink

	// Kill signal defaults
	killSignal: 'SIGTERM',
	forceKillAfter: '3 seconds',

	// Additional file descriptors
	additionalFds: {
		fd3: { type: 'output' }, // readable by parent
		fd4: { type: 'input' } // writable by parent
	}
});
```

### Combinators

```typescript
import { ChildProcess } from 'effect/unstable/process';

// Set cwd (applies to all commands in a pipeline)
const cmd = ChildProcess.make`ls -la`.pipe(ChildProcess.setCwd('/tmp'));

// Set env (applies to all commands in a pipeline)
const cmd2 = ChildProcess.make`node script.js`.pipe(
	ChildProcess.setEnv({ NODE_ENV: 'test' })
);

// Prefix a command (e.g. `time`, `nice`, `sudo`)
const cmd3 = ChildProcess.make`echo foo`.pipe(ChildProcess.prefix`time`);
// executes: time echo foo
```

## Executing Commands

Commands are `Effect` values: `yield*` on a command evaluates through its `Effectable` implementation, calls `ChildProcessSpawner.spawn`, and returns a `ChildProcessHandle`. `spawner.spawn` still requires `Scope`; helpers such as `string`, `lines`, and `exitCode` manage scope internally.

### Get the Spawner Service

```typescript
import { Effect } from 'effect';
import { ChildProcessSpawner } from 'effect/unstable/process';

const program = Effect.gen(function* () {
	const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
	// use spawner.string, spawner.lines, spawner.spawn, etc.
});
```

### Capture as String

```typescript
import { Effect, String } from 'effect';
import { ChildProcess, ChildProcessSpawner } from 'effect/unstable/process';

const program = Effect.gen(function* () {
	const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
	const version = yield* spawner
		.string(ChildProcess.make('node', ['--version']))
		.pipe(Effect.map(String.trim));
	// version: "v22.0.0"
});
```

### Capture as Lines

```typescript
import { Effect } from 'effect';
import { ChildProcess, ChildProcessSpawner } from 'effect/unstable/process';

const program = Effect.gen(function* () {
	const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
	const files = yield* spawner.lines(
		ChildProcess.make('git', ['diff', '--name-only', 'main...HEAD'])
	);
	const tsFiles = files.filter((f) => f.endsWith('.ts'));
});
```

### Progressive Output with Side Effects

```typescript
import { Effect, Stream } from 'effect';
import { ChildProcess, ChildProcessSpawner } from 'effect/unstable/process';

const program = Effect.gen(function* () {
	const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
	let output = '';
	const handle = yield* spawner.spawn(
		ChildProcess.make('bun', ['test'], {
			extendEnv: true,
			stdin: 'ignore'
		})
	);
	yield* Stream.runForEach(Stream.decodeText(handle.all), (chunk) =>
		Effect.sync(() => {
			output += chunk;
		})
	).pipe(Effect.forkScoped);
	const exitCode = yield* handle.exitCode;
	return { output, exitCode };
}).pipe(Effect.scoped);
```

Use this pattern when you need per-chunk side effects (progress reporting, streaming to UI) during command execution. `spawner.string`/`spawner.lines` cannot provide per-chunk callbacks.

### Get Exit Code

```typescript
import { Effect } from 'effect';
import { ChildProcess, ChildProcessSpawner } from 'effect/unstable/process';

const program = Effect.gen(function* () {
	const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
	const exitCode = yield* spawner.exitCode(
		ChildProcess.make('test', ['-f', 'package.json'])
	);
	// exitCode: ExitCode (branded number)
	if (exitCode !== ChildProcessSpawner.ExitCode(0)) {
		yield* Effect.fail(new Error('file not found'));
	}
});
```

### Stream Output (Long-Running Processes)

```typescript
import { Console, Effect, Stream } from 'effect';
import { ChildProcess, ChildProcessSpawner } from 'effect/unstable/process';

const program = Effect.gen(function* () {
	const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;

	// Stream lines from a command
	yield* spawner
		.streamLines(ChildProcess.make`tail -f /var/log/app.log`)
		.pipe(Stream.runForEach((line) => Console.log(line)));

	// Stream raw string chunks
	yield* spawner
		.streamString(ChildProcess.make`my-program`)
		.pipe(Stream.runForEach((chunk) => Console.log(chunk)));
});
```

## Process Handle (spawn)

Use `spawner.spawn` when you need the process handle for interactive control, streaming output while running, or checking exit codes.

```typescript
import { Console, Effect, Stream } from 'effect';
import { ChildProcess, ChildProcessSpawner } from 'effect/unstable/process';

const program = Effect.gen(function* () {
	const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;

	const handle = yield* spawner.spawn(
		ChildProcess.make('bun', ['lint'], {
			env: { FORCE_COLOR: '1' },
			extendEnv: true,
			stdin: 'ignore'
		})
	);

	// Stream combined stdout+stderr while process runs
	yield* handle.all.pipe(
		Stream.decodeText(),
		Stream.splitLines,
		Stream.runForEach((line) => Console.log(`[lint] ${line}`))
	);

	// Wait for exit
	const exitCode = yield* handle.exitCode;
	if (exitCode !== ChildProcessSpawner.ExitCode(0)) {
		yield* Effect.fail(new Error(`lint failed: exit ${exitCode}`));
	}
}).pipe(Effect.scoped); // <-- spawn requires Scope
```

### ChildProcessHandle API

| Property/Method   | Type                                           | Description                                                                |
| ----------------- | ---------------------------------------------- | -------------------------------------------------------------------------- |
| `pid`             | `ProcessId`                                    | Process identifier (branded number)                                        |
| `exitCode`        | `Effect<ExitCode, PlatformError>`              | Waits for exit, returns exit code                                          |
| `isRunning`       | `Effect<boolean, PlatformError>`               | Check if still running                                                     |
| `kill(options?)`  | `Effect<void, PlatformError>`                  | Kill with signal; pass `{ forceKillAfter: '3 seconds' }` to ensure cleanup |
| `stdin`           | `Sink<void, Uint8Array, never, PlatformError>` | Write to process stdin                                                     |
| `stdout`          | `Stream<Uint8Array, PlatformError>`            | Read process stdout                                                        |
| `stderr`          | `Stream<Uint8Array, PlatformError>`            | Read process stderr                                                        |
| `all`             | `Stream<Uint8Array, PlatformError>`            | Interleaved stdout+stderr                                                  |
| `getInputFd(fd)`  | `Sink<void, Uint8Array, ...>`                  | Write to additional fd                                                     |
| `getOutputFd(fd)` | `Stream<Uint8Array, ...>`                      | Read from additional fd                                                    |

## Piping Commands

```typescript
import { Effect } from 'effect';
import { ChildProcess, ChildProcessSpawner } from 'effect/unstable/process';

const program = Effect.gen(function* () {
	const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;

	// stdout → stdin (default)
	const lines = yield* spawner.lines(
		ChildProcess.make('git', [
			'log',
			'--pretty=format:%s',
			'-n',
			'20'
		]).pipe(ChildProcess.pipeTo(ChildProcess.make('head', ['-n', '5'])))
	);

	// Pipe stderr instead of stdout
	const errors = yield* spawner.lines(
		ChildProcess.make`my-program`.pipe(
			ChildProcess.pipeTo(ChildProcess.make`grep error`, {
				from: 'stderr'
			})
		)
	);

	// Pipe combined stdout+stderr
	const all = yield* spawner.lines(
		ChildProcess.make`my-program`.pipe(
			ChildProcess.pipeTo(ChildProcess.make`tee output.log`, {
				from: 'all'
			})
		)
	);
});
```

## Providing the Platform Layer

`ChildProcess` commands require a `ChildProcessSpawner` implementation. In Node.js:

```typescript
import { NodeServices } from '@effect/platform-node';
import { Effect } from 'effect';

// NodeServices.layer provides: ChildProcessSpawner, Crypto, FileSystem, Path, Stdio, Terminal
const program = Effect.gen(function* () {
	// ...
}).pipe(Effect.scoped, Effect.provide(NodeServices.layer));
```

Or provide just the spawner:

```typescript
import { NodeChildProcessSpawner } from '@effect/platform-node';

const program = myEffect.pipe(Effect.provide(NodeChildProcessSpawner.layer));
```

## Complete Example: DevTools Service

```typescript
import { NodeServices } from '@effect/platform-node';
import {
	Console,
	Effect,
	Layer,
	Schema,
	Context,
	Stream,
	String
} from 'effect';
import { ChildProcess, ChildProcessSpawner } from 'effect/unstable/process';

class DevToolsError extends Schema.TaggedErrorClass<DevToolsError>()(
	'DevToolsError',
	{
		cause: Schema.Defect()
	}
) {}

class DevTools extends Context.Service<
	DevTools,
	{
		readonly nodeVersion: Effect.Effect<string, DevToolsError>;
		readonly recentCommitSubjects: Effect.Effect<
			ReadonlyArray<string>,
			DevToolsError
		>;
		readonly runLintFix: Effect.Effect<void, DevToolsError>;
		changedTypeScriptFiles(
			baseRef: string
		): Effect.Effect<ReadonlyArray<string>, DevToolsError>;
	}
>()('app/DevTools') {
	static readonly layer = Layer.effect(
		DevTools,
		Effect.gen(function* () {
			const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;

			const nodeVersion = spawner
				.string(ChildProcess.make('node', ['--version']))
				.pipe(
					Effect.map(String.trim),
					Effect.mapError((cause) => new DevToolsError({ cause }))
				);

			const changedTypeScriptFiles = Effect.fn(
				'DevTools.changedTypeScriptFiles'
			)(function* (baseRef: string) {
				yield* Effect.annotateCurrentSpan({ baseRef });
				const files = yield* spawner
					.lines(
						ChildProcess.make('git', [
							'diff',
							'--name-only',
							`${baseRef}...HEAD`
						])
					)
					.pipe(
						Effect.mapError((cause) => new DevToolsError({ cause }))
					);
				return files.filter((file) => file.endsWith('.ts'));
			});

			const recentCommitSubjects = spawner
				.lines(
					ChildProcess.make('git', [
						'log',
						'--pretty=format:%s',
						'-n',
						'20'
					]).pipe(
						ChildProcess.pipeTo(
							ChildProcess.make('head', ['-n', '5'])
						)
					)
				)
				.pipe(Effect.mapError((cause) => new DevToolsError({ cause })));

			const runLintFix = Effect.gen(function* () {
				const handle = yield* spawner
					.spawn(
						ChildProcess.make('bun', ['lint'], {
							env: { FORCE_COLOR: '1' },
							extendEnv: true,
							stdin: 'ignore'
						})
					)
					.pipe(
						Effect.mapError((cause) => new DevToolsError({ cause }))
					);

				yield* handle.all.pipe(
					Stream.decodeText(),
					Stream.splitLines,
					Stream.runForEach((line) => Console.log(`[lint] ${line}`)),
					Effect.mapError((cause) => new DevToolsError({ cause }))
				);

				const exitCode = yield* handle.exitCode.pipe(
					Effect.mapError((cause) => new DevToolsError({ cause }))
				);
				if (exitCode !== ChildProcessSpawner.ExitCode(0)) {
					return yield* new DevToolsError({
						cause: new Error(
							`bun lint failed with exit code ${exitCode}`
						)
					});
				}
			}).pipe(Effect.scoped);

			return DevTools.of({
				nodeVersion,
				changedTypeScriptFiles,
				recentCommitSubjects,
				runLintFix
			});
		})
	).pipe(Layer.provide(NodeServices.layer));
}
```

## DO / DON'T

### DO: Use `Effect.scoped` when calling `spawner.spawn`

```typescript
// spawn returns a handle that requires Scope for lifecycle management
const program = Effect.gen(function* () {
	const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
	const handle = yield* spawner.spawn(ChildProcess.make`my-server`);
	// handle is automatically cleaned up when scope closes
}).pipe(Effect.scoped);
```

### DON'T: Use `spawner.spawn` without scoping

```typescript
// Process handle leaks — no scope to manage cleanup
const program = Effect.gen(function* () {
	const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
	const handle = yield* spawner.spawn(ChildProcess.make`my-server`);
	// ❌ no Effect.scoped — process may leak
});
```

### DO: Use `spawner.string` / `spawner.lines` for simple output capture

```typescript
// These convenience methods handle scope internally
const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
const output = yield* spawner.string(ChildProcess.make`echo hello`);
const lines = yield* spawner.lines(ChildProcess.make`ls -1`);
```

### DON'T: Use `spawn` + manual stream collection when `string`/`lines` suffices

```typescript
// Unnecessarily complex for simple output capture
const handle = yield* spawner.spawn(ChildProcess.make`echo hello`);
const chunks = yield* Stream.runCollect(handle.stdout);
// ❌ overkill — just use spawner.string
```

### DO: Use `Effect.mapError` to wrap `PlatformError` in domain errors

```typescript
class MyError extends Schema.TaggedErrorClass<MyError>()('MyError', {
	cause: Schema.Defect()
}) {}

const result =
	yield*
	spawner
		.string(ChildProcess.make`git status`)
		.pipe(Effect.mapError((cause) => new MyError({ cause })));
```

### DON'T: Let `PlatformError` leak into your service API

```typescript
// ❌ exposes platform implementation details to consumers
class MyService extends Context.Service<
	MyService,
	{
		readonly status: Effect.Effect<string, PlatformError.PlatformError>; // ❌
	}
>()('MyService') {}
```

### DO: Check `ExitCode` with the branded constructor

```typescript
if (exitCode !== ChildProcessSpawner.ExitCode(0)) {
	yield* Effect.fail(new Error(`command failed: ${exitCode}`));
}
```

### DON'T: Compare exit codes as raw numbers

```typescript
// ❌ ExitCode is a branded type — direct number comparison may not work as expected
if (exitCode !== 0) {
	/* ... */
}
```

### DO: Use `handle.all` for interleaved stdout+stderr

```typescript
yield*
	handle.all.pipe(
		Stream.decodeText(),
		Stream.splitLines,
		Stream.runForEach((line) => Console.log(line))
	);
```

### DON'T: Mix `handle.stdout`/`handle.stderr` with `handle.all`

```typescript
// ❌ Using stdout/stderr alongside all may cause interleaving issues
yield* Stream.merge(handle.stdout, handle.all).pipe(Stream.runCollect);
```

## Error Handling

Child process operations fail with `PlatformError`:

```typescript
import { Effect } from 'effect';
import { ChildProcess, ChildProcessSpawner } from 'effect/unstable/process';

const program = Effect.gen(function* () {
	const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;

	const result = yield* spawner
		.string(ChildProcess.make`non-existent-command`)
		.pipe(
			Effect.catchTag('PlatformError', (error) =>
				Effect.succeed(`fallback: ${error.message}`)
			)
		);
});
```

## Boundary Abort Signals

Prefer Effect interruption as the cancellation signal between your own services. If a host API hands you an `AbortSignal`, convert it once at the outer boundary instead of threading `AbortSignal` through unrelated services.

Keep process kill, timeout, and output-drain logic inside the process adapter that owns the `ChildProcessHandle`.

## Bridging External Signals

Use `Effect.callback` to convert an `AbortSignal` (or any event-driven API) into an Effect. The cleanup Effect removes the listener, and the already-aborted edge case is handled first:

```typescript
import { Effect } from 'effect';

const fromAbortSignal = (signal: AbortSignal) =>
	Effect.callback<void>((resume) => {
		if (signal.aborted) return resume(Effect.void);
		const handler = () => resume(Effect.void);
		signal.addEventListener('abort', handler, { once: true });
		return Effect.sync(() => signal.removeEventListener('abort', handler));
	});
```

### Abort / Timeout Multiplexing

Combine `Effect.raceAll` with discriminated result types to handle exit, abort, and timeout in a single expression:

```typescript
import { Effect } from 'effect';

const exit =
	yield*
	Effect.raceAll([
		handle.exitCode.pipe(
			Effect.map((code) => ({ kind: 'exit' as const, code }))
		),
		fromAbortSignal(signal).pipe(
			Effect.map(() => ({ kind: 'abort' as const }))
		),
		Effect.sleep(timeout).pipe(
			Effect.map(() => ({ kind: 'timeout' as const }))
		)
	]);
if (exit.kind !== 'exit') {
	yield* handle.kill({ forceKillAfter: '3 seconds' });
}
```

## Related Skills

- **effect-platform-abstraction**: FileSystem, Path, and other platform services
- **effect-testing**: Testing Effect programs with @effect/vitest
- **effect-error-handling**: Typed error handling patterns with catchTag
