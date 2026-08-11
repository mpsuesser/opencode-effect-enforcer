---
name: effect-cli
description: Build type-safe CLI applications using Effect CLI module for argument parsing, options, commands, and dependency injection.
---

# Effect CLI (v4)

Build type-safe command-line applications with typed arguments, flags, subcommands, and dependency injection.

## Import Pattern

```typescript
import { Argument, Command, Flag, Prompt } from 'effect/unstable/cli';
```

Platform services and runtime for the entry point:

```typescript
import { NodeRuntime, NodeServices } from '@effect/platform-node';
```

## Positional Arguments (Argument)

Positional arguments are parsed in order. `Argument.boolean` intentionally does not exist — use `Flag.boolean` or `Argument.choice("name", ["true", "false"])` instead.

### Constructors

```typescript
import { Argument } from 'effect/unstable/cli';

Argument.string('name'); // string
Argument.integer('count'); // number (integer)
Argument.float('ratio'); // number (float)
Argument.date('deadline'); // Date
Argument.file('input'); // file path (string)
Argument.file('input', { mustExist: true }); // file path that must exist
Argument.directory('dir'); // directory path (string)
Argument.directory('dir', { mustExist: true }); // directory that must exist
Argument.path('target'); // any path (string)
Argument.choice('env', ['dev', 'staging', 'prod']); // constrained string union
Argument.choiceWithValue('level', [
	// choice with mapped values
	['debug', 0],
	['info', 1],
	['error', 3]
]);
Argument.redacted('secret'); // Redacted<string>
Argument.fileText('config'); // reads file content as string
Argument.fileParse('config'); // reads and parses file (auto-detects format)
Argument.fileSchema('config', MySchema); // reads and validates file via Schema
```

### Combinators

```typescript
import { Argument } from 'effect/unstable/cli';

// Description for help text
Argument.string('file').pipe(Argument.withDescription('Input file'));

// Default value
Argument.integer('port').pipe(Argument.withDefault(8080));

// Optional (returns Option<T>)
Argument.string('config').pipe(Argument.optional);

// Variadic (returns ReadonlyArray<T>)
Argument.string('files').pipe(Argument.variadic);
Argument.string('files').pipe(Argument.variadic({ min: 1 }));
Argument.string('files').pipe(Argument.variadic({ min: 1, max: 5 }));

// Direct variadic form is also supported
Argument.variadic(Argument.string('files'));
Argument.variadic(Argument.string('files'), { min: 1 });

// Cardinality shortcuts
Argument.string('files').pipe(Argument.atLeast(1));
Argument.string('files').pipe(Argument.atMost(5));
Argument.string('files').pipe(Argument.between(1, 5));

// Transform
Argument.integer('port').pipe(Argument.map((p) => `http://localhost:${p}`));

// Validate with Schema
Argument.string('input').pipe(Argument.withSchema(Schema.NonEmptyString));

// Fallback from env config
Argument.string('repo').pipe(
	Argument.withFallbackConfig(Config.string('REPOSITORY'))
);

// Fallback interactive prompt
Argument.string('name').pipe(
	Argument.withFallbackPrompt(Prompt.text({ message: 'Name' }))
);

// Custom metavar for help text
Argument.integer('port').pipe(Argument.withMetavar('PORT'));

// Filter with error message
Argument.integer('count').pipe(
	Argument.filter(
		(n) => n > 0,
		(n) => `Expected positive, got ${n}`
	)
);
```

## Named Flags (Flag)

Flags are named options with `--name` or `-alias` syntax.

### Constructors

```typescript
import { Flag } from 'effect/unstable/cli';

Flag.boolean('verbose'); // --verbose / --no-verbose
Flag.string('config'); // --config value
Flag.integer('port'); // --port 8080
Flag.float('rate'); // --rate 3.14
Flag.date('since'); // --since 2024-01-01
Flag.file('input'); // --input file.txt
Flag.file('input', { mustExist: true }); // file must exist
Flag.directory('output'); // --output ./dist
Flag.path('config-path'); // --config-path /etc/app
Flag.choice('env', ['dev', 'staging', 'prod']); // --env dev
Flag.choiceWithValue('log-level', [
	// choice with mapped values
	['debug', 'Debug' as const],
	['info', 'Info' as const],
	['error', 'Error' as const]
]);
Flag.redacted('password'); // Redacted<string>
Flag.fileText('config-file'); // reads file content
Flag.fileParse('config'); // reads and parses file (auto-detects format)
Flag.fileSchema('config', MySchema); // reads and validates via Schema
Flag.keyValuePair('env'); // --env FOO=bar → Record<string, string>
```

### Combinators

```typescript
import { Flag } from 'effect/unstable/cli';

// Alias
Flag.boolean('verbose').pipe(Flag.withAlias('v')); // --verbose or -v

// Hidden from help, completions, and typo suggestions, but still parsed
Flag.boolean('experimental-foo').pipe(Flag.withHidden);

// Description
Flag.string('config').pipe(Flag.withDescription('Path to config file'));

// Default value (makes flag optional with fallback)
Flag.integer('port').pipe(Flag.withDefault(3000));

// Optional (returns Option<T>)
Flag.string('token').pipe(Flag.optional);

// Custom metavar for help
Flag.string('db-url').pipe(Flag.withMetavar('URL')); // --db-url URL

// Repetition
Flag.string('tag').pipe(Flag.atLeast(1)); // --tag a --tag b
Flag.string('warning').pipe(Flag.atMost(3));
Flag.string('host').pipe(Flag.between(1, 3));

// Transform
Flag.integer('port').pipe(Flag.map((p) => `http://localhost:${p}`));

// Validate with Schema
Flag.string('email').pipe(Flag.withSchema(EmailSchema));

// Filter
Flag.integer('port').pipe(
	Flag.filter(
		(p) => p >= 1 && p <= 65535,
		(p) => `Port ${p} out of range`
	)
);

// Fallback from env config
Flag.boolean('verbose').pipe(
	Flag.withFallbackConfig(Config.boolean('VERBOSE'))
);

// Fallback interactive prompt
Flag.string('name').pipe(
	Flag.withFallbackPrompt(Prompt.text({ message: 'Name' }))
);
```

Hidden flags parse normally, but generated help, shell completions, and typo suggestions omit them.

### Prompt Defaults

```typescript
import { Prompt } from 'effect/unstable/cli';

Prompt.integer({ message: 'Count', default: 42 });
Prompt.file({ message: 'Pick file', default: '/workspace/config.json' });
```

Integer prompt defaults are editable and Enter submits the default if unchanged. `Prompt.file` resolves/selects the default as the initial path.

## Commands

### Creating Commands

`Command.make` accepts a name, optional config object, and optional handler:

```typescript
import { Console, Effect } from 'effect';
import { Argument, Command, Flag } from 'effect/unstable/cli';

// Simple command (no config, no handler)
const version = Command.make('version');

// Command with config (no handler yet)
const deploy = Command.make('deploy', {
	env: Flag.string('env'),
	force: Flag.boolean('force'),
	files: Argument.string('files').pipe(Argument.variadic)
});

// Command with config and inline handler
const greet = Command.make(
	'greet',
	{
		name: Argument.string('name').pipe(
			Argument.withDescription('Person to greet')
		),
		times: Flag.integer('times').pipe(Flag.withDefault(1))
	},
	Effect.fn(function* ({ name, times }) {
		for (let i = 0; i < times; i++) {
			yield* Console.log(`Hello, ${name}!`);
		}
	})
);
```

### Handler Pattern

Handlers use `Effect.fn` with a generator that destructures the config:

```typescript
const cmd = Command.make(
	'deploy',
	{
		env: Flag.choice('env', ['dev', 'staging', 'prod']),
		dryRun: Flag.boolean('dry-run')
	},
	Effect.fn(function* ({ env, dryRun }) {
		if (dryRun) {
			yield* Console.log(`Would deploy to ${env}`);
		} else {
			yield* Console.log(`Deploying to ${env}...`);
		}
	})
);
```

Alternatively, add a handler later with `Command.withHandler`:

```typescript
const cmd = Command.make('greet', {
	name: Flag.string('name')
}).pipe(Command.withHandler(({ name }) => Console.log(`Hello, ${name}!`)));
```

### Command Metadata

```typescript
Command.make('deploy', config, handler).pipe(
	Command.withDescription('Deploy the application'),
	Command.withShortDescription('Deploy app'), // used in subcommand listings
	Command.withAlias('d'), // alternate name
	Command.withHidden, // hide internal/experimental subcommands from parent help
	Command.withExamples([
		{
			command: 'myapp deploy --env prod',
			description: 'Deploy to production'
		},
		{ command: 'myapp deploy --env dev --dry-run', description: 'Dry run' }
	])
);
```

`Command.withHidden` keeps a subcommand invocable by exact name while omitting it from parent help output, shell completions, and "did you mean?" suggestions.

### Nested Config

Config objects can be nested for organization:

```typescript
const deploy = Command.make('deploy', {
	environment: Flag.string('env'),
	server: {
		host: Flag.string('host').pipe(Flag.withDefault('localhost')),
		port: Flag.integer('port').pipe(Flag.withDefault(3000))
	},
	files: Argument.string('files').pipe(Argument.variadic)
});
// Handler receives: { environment: string, server: { host: string, port: number }, files: ReadonlyArray<string> }
```

## Subcommands

### Basic Subcommands

```typescript
const app = Command.make('app');

const init = Command.make(
	'init',
	{},
	Effect.fn(function* () {
		yield* Console.log('Initializing...');
	})
);

const build = Command.make(
	'build',
	{
		target: Flag.choice('target', ['web', 'node'])
	},
	Effect.fn(function* ({ target }) {
		yield* Console.log(`Building for ${target}`);
	})
);

app.pipe(
	Command.withSubcommands([init, build]),
	Command.run({ version: '1.0.0' }),
	Effect.provide(NodeServices.layer),
	NodeRuntime.runMain
);
// Usage: app init | app build --target web
```

### Shared Parent Flags

Use `Command.withSharedFlags` to define flags on a parent that are available to all subcommands. Subcommands access parent config by yielding the parent command:

```typescript
const tasks = Command.make('tasks').pipe(
	Command.withSharedFlags({
		workspace: Flag.string('workspace').pipe(
			Flag.withAlias('w'),
			Flag.withDefault('personal')
		),
		verbose: Flag.boolean('verbose').pipe(Flag.withAlias('v'))
	})
);

const create = Command.make(
	'create',
	{
		title: Argument.string('title'),
		priority: Flag.choice('priority', ['low', 'normal', 'high']).pipe(
			Flag.withDefault('normal')
		)
	},
	Effect.fn(function* ({ title, priority }) {
		// Access parent config by yielding the parent command
		const root = yield* tasks;
		if (root.verbose) {
			yield* Console.log(`workspace=${root.workspace} action=create`);
		}
		yield* Console.log(
			`Created "${title}" in ${root.workspace} with ${priority} priority`
		);
	})
).pipe(
	Command.withDescription('Create a task'),
	Command.withExamples([
		{
			command: 'tasks create "Ship 4.0" --priority high',
			description: 'Create a high-priority task'
		}
	])
);

const list = Command.make(
	'list',
	{
		status: Flag.choice('status', ['open', 'done', 'all']).pipe(
			Flag.withDefault('open')
		),
		json: Flag.boolean('json')
	},
	Effect.fn(function* ({ status, json }) {
		const root = yield* tasks;
		if (json) {
			yield* Console.log(
				JSON.stringify({ workspace: root.workspace, status }, null, 2)
			);
		} else {
			yield* Console.log(`Listing ${status} tasks in ${root.workspace}`);
		}
	})
).pipe(Command.withDescription('List tasks'), Command.withAlias('ls'));

tasks.pipe(
	Command.withSubcommands([create, list]),
	Command.run({ version: '1.0.0' }),
	Effect.provide(NodeServices.layer),
	NodeRuntime.runMain
);
// Usage: tasks --workspace team-a list --status open
// Usage: tasks create "Ship 4.0" --priority high
// Usage: tasks ls --json
```

### Grouped Subcommands

```typescript
app.pipe(
	Command.withSubcommands([
		init,
		{ group: 'Development', commands: [build, test] },
		{ group: 'Deployment', commands: [deploy, rollback] }
	])
);
```

## Dependency Injection

### Provide a Layer

```typescript
const deploy = Command.make(
	'deploy',
	{
		env: Flag.string('env')
	},
	Effect.fn(function* ({ env }) {
		const fs = yield* FileSystem.FileSystem;
		// ...
	})
).pipe(Command.provide(FileSystemLive));

// Layer can depend on parsed input
Command.provide((config) =>
	config.env === 'local' ? LocalFsLayer : RemoteFsLayer
);
```

### Provide a Service

```typescript
Command.provideSync(MyService, makeMyService());
Command.provideEffect(MyService, Effect.succeed(makeMyService()));

// Can depend on parsed input
Command.provideSync(MyService, (config) => makeMyService(config.env));
```

## Running Commands

`Command.run` is a **pipeable combinator** that reads args from `Stdio`. The resulting effect requires `FileSystem`, `Path`, `Terminal`, `Stdio`, and `ChildProcessSpawner`; provide platform services and execute with the runtime:

```typescript
import { NodeRuntime, NodeServices } from '@effect/platform-node';
import { Effect } from 'effect';
import { Command, Flag } from 'effect/unstable/cli';

const myCommand = Command.make(
	'myapp',
	{
		name: Flag.string('name')
	},
	Effect.fn(function* ({ name }) {
		yield* Console.log(`Hello, ${name}!`);
	})
);

// Entry point pattern
myCommand.pipe(
	Command.run({ version: '1.0.0' }),
	Effect.provide(NodeServices.layer),
	NodeRuntime.runMain
);
```

Auto-generates `--help` and `--version` flags.

Built-in/global flags (`--help`, `--version`, `--completions`, `--log-level`, plus custom globals from `Command.withGlobalFlags`) are parsed for the active command path. A local flag on the selected command can intentionally reuse/override a global flag name or alias. Shared parent flags from `Command.withSharedFlags` remain command context and may be accepted before or after a subcommand.

### Testing with Explicit Args

Use `Command.runWith` to pass args directly (useful in tests):

```typescript
const run = Command.runWith(myCommand, { version: '1.0.0' });
// run(["--name", "Alice"]) => Effect<void, ...>
```

## Key Patterns

1. **`Argument` = positional, `Flag` = named** — No `Argument.boolean`; use `Flag.boolean` for toggles
2. **Handlers use `Effect.fn`** — `Effect.fn(function*({ ...config }) { ... })`
3. **Parent access via yield** — `const root = yield* parentCommand` inside subcommand handlers
4. **Shared flags** — `Command.withSharedFlags` on parent; only flags allowed (no arguments)
5. **Pipeable `Command.run`** — `command.pipe(Command.run({version}), Effect.provide(NodeServices.layer), NodeRuntime.runMain)`
6. **Platform services required** — `Command.run` requires `FileSystem`, `Path`, `Terminal`, `Stdio`, and `ChildProcessSpawner`; provide via `NodeServices.layer` / `BunServices.layer`
7. **All combinators are dual** — Work both as `pipe(Flag.withAlias("v"))` and `Flag.withAlias(flag, "v")`
