---
name: effect-filesystem
description: Use Effect FileSystem for platform-abstract file I/O with Node.js/Bun layers or custom implementations.
---

# FileSystem Platform Abstraction

Use `effect` FileSystem for platform-abstract file I/O. Stock layers are provided for Node.js and Bun; `@effect/platform-browser` does not provide a FileSystem layer, so browser code needs a custom/injected implementation.

Targets **Effect 4.0.0**. Match platform package versions to `effect`; verify APIs against the `effect@4.0.0` source tag rather than unreleased `main`.

## Basic Pattern

```typescript
import { FileSystem } from 'effect';
import { Effect } from 'effect';

// Service injection via yield*
const program = Effect.gen(function* () {
	const fs = yield* FileSystem.FileSystem;

	// Use fs methods here
	const content = yield* fs.readFileString('path/to/file.txt');
	return content;
});
```

## Reading Operations

### Read File (Binary)

```typescript
import { FileSystem } from 'effect';
import { Effect } from 'effect';

const readBinary = Effect.gen(function* () {
	const fs = yield* FileSystem.FileSystem;
	const bytes = yield* fs.readFile('data.bin');
	return bytes; // Uint8Array
});
```

### Read File (String)

```typescript
import { FileSystem } from 'effect';
import { Effect } from 'effect';

const readText = Effect.gen(function* () {
	const fs = yield* FileSystem.FileSystem;
	const content = yield* fs.readFileString('config.json');
	return content; // string
});
```

### Stream File

```typescript
import { FileSystem } from 'effect';
import { Effect } from 'effect';

const streamFile = Effect.gen(function* () {
	const fs = yield* FileSystem.FileSystem;
	// fs.stream() returns a Stream directly — not an Effect
	const stream = fs.stream('large-file.log');
	return stream; // Stream<Uint8Array, PlatformError>
});
```

### Read Directory

```typescript
import { FileSystem } from 'effect';
import { Effect } from 'effect';

const listFiles = Effect.gen(function* () {
	const fs = yield* FileSystem.FileSystem;
	const entries = yield* fs.readDirectory('src/');
	return entries; // ReadonlyArray<string>
});
```

### Read Symbolic Link

```typescript
import { FileSystem } from 'effect';
import { Effect } from 'effect';

const readLink = Effect.gen(function* () {
	const fs = yield* FileSystem.FileSystem;
	const target = yield* fs.readLink('symlink');
	return target; // string
});
```

## Writing Operations

### Write File (Binary)

```typescript
import { FileSystem } from 'effect';
import { Effect } from 'effect';

const writeBinary = Effect.gen(function* () {
	const fs = yield* FileSystem.FileSystem;
	const data = new Uint8Array([0x48, 0x65, 0x6c, 0x6c, 0x6f]);
	yield* fs.writeFile('output.bin', data);
});
```

### Write File (String)

```typescript
import { FileSystem } from 'effect';
import { Effect } from 'effect';

const writeText = Effect.gen(function* () {
	const fs = yield* FileSystem.FileSystem;
	yield* fs.writeFileString('output.txt', 'Hello, World!');
});
```

### Sink (Stream Writing)

```typescript
import { FileSystem } from 'effect';
import { Effect, Stream, pipe } from 'effect';

const writeStream = Effect.gen(function* () {
	const fs = yield* FileSystem.FileSystem;
	// fs.sink() returns a Sink directly — not an Effect
	const sink = fs.sink('output.log');

	yield* pipe(
		Stream.fromIterable(['line 1\n', 'line 2\n', 'line 3\n']),
		Stream.mapEffect((s) => Effect.succeed(new TextEncoder().encode(s))),
		Stream.run(sink)
	);
});
```

## File Operations

### Copy File

```typescript
import { FileSystem } from 'effect';
import { Effect } from 'effect';

const copyFile = Effect.gen(function* () {
	const fs = yield* FileSystem.FileSystem;
	yield* fs.copyFile('source.txt', 'dest.txt');
});
```

### Copy (Recursive Directory)

```typescript
import { FileSystem } from 'effect';
import { Effect } from 'effect';

const copyDir = Effect.gen(function* () {
	const fs = yield* FileSystem.FileSystem;
	yield* fs.copy('src-dir/', 'dest-dir/');
});
```

### Rename/Move

```typescript
import { FileSystem } from 'effect';
import { Effect } from 'effect';

const renameFile = Effect.gen(function* () {
	const fs = yield* FileSystem.FileSystem;
	yield* fs.rename('old-name.txt', 'new-name.txt');
});
```

### Remove

```typescript
import { FileSystem } from 'effect';
import { Effect } from 'effect';

const removeFile = Effect.gen(function* () {
	const fs = yield* FileSystem.FileSystem;
	yield* fs.remove('file.txt');
});

// Remove directory recursively
const removeDir = Effect.gen(function* () {
	const fs = yield* FileSystem.FileSystem;
	yield* fs.remove('directory/', { recursive: true });
});
```

### Open File Handle

<!-- typecheck -->
```typescript
import { FileSystem } from 'effect';
import { Effect } from 'effect';

const useFileHandle = Effect.gen(function* () {
	const fs = yield* FileSystem.FileSystem;

	// File handles are scoped — automatically closed when scope exits
	yield* Effect.scoped(
		Effect.gen(function* () {
			const file = yield* fs.open('data.txt', { flag: 'r' });

			// Byte counts use ByteSize; seek positions are signed bigint inputs.
			const buffer = new Uint8Array(1024);
			const bytesRead = yield* file.read(buffer);
			const offset = yield* file.seek(0n, 'start');
		})
	);
});
```

`file.seek(offset, from)` accepts `bigint`, supports `from: 'start' | 'current'`,
and returns `Effect<bigint, PlatformError>`. A negative resulting position fails
without changing the cursor. Byte counts and `File.Info.size` use
`ByteSize.ByteSize`; size inputs use `ByteSize.Input`. Keep large offsets/counts
exact, and handle `Option.none()` for optional stat metadata outside the safe
integer range. Use scoped handle operations (`read`, `readAlloc`, `write`,
`writeAll`, `seek`, `stat`, `sync`, `truncate`) rather than raw descriptors.

### Byte sizes and exact offsets

<!-- typecheck -->
```ts
import { ByteSize, Effect, FileSystem } from 'effect';

const inspect = Effect.gen(function* () {
	const fs = yield* FileSystem.FileSystem;
	const file = yield* fs.open('data.bin');
	const position = yield* file.seek(0n, 'start');
	const chunk = yield* file.readAlloc(64 * 1024);
	return { position, chunk };
}).pipe(Effect.scoped);
const bodyLimit = ByteSize.mebibytes(1);
const parsedLimit = ByteSize.fromString('1.5 MiB');
```

`ByteSize.Input` string literals are canonical non-negative integers with recognized
units. Parse external strings or fractional quantities with `ByteSize.fromString`
(or the explicitly throwing `fromStringUnsafe` at a controlled boundary).
Do not convert large sizes/offsets to number and silently lose precision.
Buffer allocation lengths (`readAlloc`) and per-buffer read/write counts are
numbers. File stat sizes and streaming byte limits use ByteSize; seek uses bigint.

## Directory Operations

### Make Directory

```typescript
import { FileSystem } from 'effect';
import { Effect } from 'effect';

const createDir = Effect.gen(function* () {
	const fs = yield* FileSystem.FileSystem;
	yield* fs.makeDirectory('new-dir/');

	// Recursive directory creation
	yield* fs.makeDirectory('path/to/nested/dir/', { recursive: true });
});
```

### Make Temp Directory with Explicit Ownership

<!-- typecheck -->
```typescript
import { Effect, FileSystem, Path } from 'effect';

const useTempDir = Effect.gen(function* () {
	const fs = yield* FileSystem.FileSystem;
	const path = yield* Path.Path;
	return yield* Effect.acquireUseRelease(
		fs.makeTempDirectory(),
		(tempPath) => fs.writeFileString(path.join(tempPath, 'temp-file.txt'), 'data'),
		(tempPath) => fs.remove(tempPath, { recursive: true }).pipe(Effect.orDie)
	);
});
```

Release runs on success, failure, and interruption. Cleanup failure is surfaced as a defect here; prefer the built-in scoped variant for ordinary temporary work.

### Make Temp Directory (Scoped)

<!-- typecheck -->
```typescript
import { Effect, FileSystem, Path } from 'effect';

const useScopedTempDir = Effect.gen(function* () {
	const fs = yield* FileSystem.FileSystem;
	const path = yield* Path.Path;
	const tempPath = yield* fs.makeTempDirectoryScoped();

	// Use tempPath within scope
	yield* fs.writeFileString(path.join(tempPath, 'temp-file.txt'), 'data');

	// Automatically cleaned up when scope exits
}).pipe(Effect.scoped);
```

## Metadata Operations

### Stat (File Info)

<!-- typecheck -->
```typescript
import { FileSystem } from 'effect';
import { Effect, Console } from 'effect';

const getFileInfo = Effect.gen(function* () {
	const fs = yield* FileSystem.FileSystem;
	const info = yield* fs.stat('file.txt');

	yield* Console.log(`Type: ${info.type}`);
	// "File" | "Directory" | "SymbolicLink" | "BlockDevice" | "CharacterDevice" | "FIFO" | "Socket" | "Unknown"
	yield* Console.log(`Size: ${info.size}`); // ByteSize.ByteSize
	yield* Console.log(`Modified: ${info.mtime}`); // Option<Date>
	yield* Console.log(`Accessed: ${info.atime}`); // Option<Date>
	yield* Console.log(`Created: ${info.birthtime}`); // Option<Date>
});
```

### Access (Check Permissions)

```typescript
import { FileSystem } from 'effect';
import { Effect } from 'effect';

const checkAccess = Effect.gen(function* () {
	const fs = yield* FileSystem.FileSystem;

	// Check if file exists and is readable
	yield* fs.access('file.txt', { readable: true });

	// Check writable
	yield* fs.access('file.txt', { writable: true });

	// Check if file exists (ok)
	yield* fs.access('script.sh', { ok: true });
});
```

### Exists

```typescript
import { FileSystem } from 'effect';
import { Effect } from 'effect';

const fileExists = Effect.gen(function* () {
	const fs = yield* FileSystem.FileSystem;
	const exists = yield* fs.exists('file.txt');
	return exists; // boolean
});
```

### Real Path (Resolve Symlinks)

```typescript
import { FileSystem } from 'effect';
import { Effect } from 'effect';

const resolvePath = Effect.gen(function* () {
	const fs = yield* FileSystem.FileSystem;
	const realPath = yield* fs.realPath('symlink-or-relative-path');
	return realPath; // string (absolute path)
});
```

## Permission Operations

### Change Mode (chmod)

```typescript
import { FileSystem } from 'effect';
import { Effect } from 'effect';

const changeMode = Effect.gen(function* () {
	const fs = yield* FileSystem.FileSystem;
	yield* fs.chmod('script.sh', 0o755);
});
```

### Change Owner (chown)

```typescript
import { FileSystem } from 'effect';
import { Effect } from 'effect';

const changeOwner = Effect.gen(function* () {
	const fs = yield* FileSystem.FileSystem;
	yield* fs.chown('file.txt', 1000, 1000); // uid, gid
});
```

### Update Times (utimes)

<!-- typecheck -->
```typescript
import { Clock, Effect, FileSystem } from 'effect';

const updateTimes = Effect.gen(function* () {
	const fs = yield* FileSystem.FileSystem;
	const nowMillis = yield* Clock.currentTimeMillis;
	// Numeric utimes inputs are epoch seconds, not milliseconds.
	yield* fs.utimes('file.txt', nowMillis / 1000, nowMillis / 1000);
});
```

## Links

### Hard Link

```typescript
import { FileSystem } from 'effect';
import { Effect } from 'effect';

const createHardLink = Effect.gen(function* () {
	const fs = yield* FileSystem.FileSystem;
	yield* fs.link('original.txt', 'hardlink.txt');
});
```

### Symbolic Link

```typescript
import { FileSystem } from 'effect';
import { Effect } from 'effect';

const createSymlink = Effect.gen(function* () {
	const fs = yield* FileSystem.FileSystem;
	yield* fs.symlink('target.txt', 'symlink.txt');
});
```

## Watching

### Watch Files/Directories

<!-- typecheck -->
```typescript
import { FileSystem } from 'effect';
import { Effect, Stream, Console, pipe } from 'effect';

const watchFiles = Effect.gen(function* () {
	const fs = yield* FileSystem.FileSystem;
	// fs.watch() returns a Stream directly — not an Effect
	const events = fs.watch('src/'); // direct children only

	return events; // Stream<WatchEvent, PlatformError>
});

// Consume watch events
const consumeWatchEvents = Effect.gen(function* () {
	const fs = yield* FileSystem.FileSystem;
	const events = fs.watch('config/', { recursive: true });

	yield* pipe(
		events,
		Stream.runForEach((event) =>
			Console.log(`Event: ${event._tag}, Path: ${event.path}`)
		)
	);
});
```

Directory watching is non-recursive by default. Pass `{ recursive: true }` to include changes in nested subdirectories. Watching a file watches that file; the recursive option matters for directory trees.

## Size Helpers

<!-- typecheck -->
```typescript
import { ByteSize, Effect, FileSystem } from 'effect';
import * as Schema from 'effect/Schema';

// Create size values
const oneKb = ByteSize.bytes(1024);
const tenKb = ByteSize.kibibytes(10);
const oneMb = ByteSize.mebibytes(1);
const fiveGb = ByteSize.gibibytes(5);
const oneTb = ByteSize.tebibytes(1);
const onePb = ByteSize.pebibytes(1);

class FileTooLarge extends Schema.TaggedError<FileTooLarge>()('FileTooLarge', {
	path: Schema.String
}) {}

// Use with file operations
const checkFileSize = Effect.gen(function* () {
	const fs = yield* FileSystem.FileSystem;
	const info = yield* fs.stat('large-file.bin');

	const maxSize = ByteSize.mebibytes(100);
	if (info.size > maxSize) {
		return yield* Effect.fail(new FileTooLarge({ path: 'large-file.bin' }));
	}
});
```

## Error Handling

### SystemErrorTag Values

FileSystem operations fail with `PlatformError`. Its `reason` is `BadArgument` or `SystemError`. In **4.0.0**, `SystemError._tag` is the normalized category below; match `error.reason._tag` directly (there is no `reason.tag` field):

- `AlreadyExists` - File/directory already exists
- `BadResource` - Invalid file descriptor or handle
- `Busy` - Resource is busy
- `InvalidData` - Invalid data format
- `NotFound` - File/directory not found
- `PermissionDenied` - Insufficient permissions
- `TimedOut` - Operation timed out
- `UnexpectedEof` - Unexpected end of file
- `Unknown` - Unknown error
- `WouldBlock` - Operation would block
- `WriteZero` - Write operation wrote zero bytes

For an unknown error at a boundary, `PlatformError.isPlatformError(value)` narrows it to the wrapper before inspecting `reason`.

### Error Handling Pattern

<!-- typecheck -->
```typescript
import { FileSystem } from 'effect';
import { Effect, pipe } from 'effect';

const readConfigWithFallback = pipe(
	Effect.gen(function* () {
		const fs = yield* FileSystem.FileSystem;
		return yield* fs.readFileString('config.json');
	}),
	Effect.catchTag('PlatformError', (error) => {
		if (error.reason._tag === 'NotFound') {
			return Effect.succeed('{}');
		}
		// Permission and other failures remain visible to the caller.
		return Effect.fail(error);
	})
);
```

### Typed Error Recovery

<!-- typecheck -->
```typescript
import { FileSystem } from 'effect';
import { Effect, Schema, pipe } from 'effect';

class ConfigNotFound extends Schema.TaggedError<ConfigNotFound>()(
	'ConfigNotFound',
	{
		path: Schema.String
	}
) {}

class ConfigReadFailed extends Schema.TaggedError<ConfigReadFailed>()(
	'ConfigReadFailed',
	{
		path: Schema.String,
		reason: Schema.String
	}
) {}

const readConfig = Effect.fn('Config.read')(function* (path: string) {
	const fs = yield* FileSystem.FileSystem;

	const content = yield* pipe(
		fs.readFileString(path),
		Effect.mapError((error) =>
			error.reason._tag === 'NotFound'
				? new ConfigNotFound({ path })
				: new ConfigReadFailed({ path, reason: error.message })
		)
	);

	return content;
});
```

## Scoped Resources Pattern

<!-- typecheck -->
```typescript
import { Effect, FileSystem, Path } from 'effect';
import * as Str from 'effect/String';

const processInTempDir = Effect.gen(function* () {
	const fs = yield* FileSystem.FileSystem;
	const path = yield* Path.Path;

	// Create temp directory with automatic cleanup
	const tempDir = yield* fs.makeTempDirectoryScoped();

	// Do work in temp directory
	const inputPath = path.join(tempDir, 'input.txt');
	const outputPath = path.join(tempDir, 'output.txt');

	yield* fs.writeFileString(inputPath, 'data');
	const content = yield* fs.readFileString(inputPath);
	yield* fs.writeFileString(outputPath, Str.toUpperCase(content));

	const result = yield* fs.readFileString(outputPath);

	// Temp directory is automatically removed when scope exits
	return result;
}).pipe(Effect.scoped);
```

## Layer Provision

### Node.js

```typescript
import { FileSystem } from 'effect';
import { NodeFileSystem } from '@effect/platform-node';
import { Effect } from 'effect';

const program = Effect.gen(function* () {
	const fs = yield* FileSystem.FileSystem;
	return yield* fs.readFileString('data.txt');
});

// Provide Node.js implementation
const runnable = program.pipe(Effect.provide(NodeFileSystem.layer));

Effect.runPromise(runnable);
```

### Bun

```typescript
import { FileSystem } from 'effect';
import { BunFileSystem } from '@effect/platform-bun';
import { Effect } from 'effect';

declare const program: Effect.Effect<string, never, FileSystem.FileSystem>;

const runnable = program.pipe(Effect.provide(BunFileSystem.layer));

Effect.runPromise(runnable);
```

## DO

- Import from `effect`
- Use `yield* FileSystem.FileSystem` for service injection
- Provide platform layers at entry points or runtime-facing adapter `defaultLayer` exports
- Use scoped temp directories with `makeTempDirectoryScoped`
- Handle `PlatformError` with `catchTag("PlatformError", ...)`
- Use `ByteSize.bytes`, `ByteSize.kibibytes`, `ByteSize.mebibytes`, and other ByteSize constructors; the old FileSystem size helpers are removed
- Stream large files with `stream()` and `sink()`

## DON'T

- Import `node:fs`, `fs/promises`, or platform-specific modules in business logic
- Use synchronous fs operations
- Forget to cleanup temp directories (use scoped version)
- Mix platform-specific code with business logic
- Use `Date.now()` - use `Clock` service instead (see testability requirements)
- Hardcode platform-specific paths - use `Path` service for path operations
