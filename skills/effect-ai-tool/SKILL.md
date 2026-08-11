---
name: effect-ai-tool
description: Define and implement AI tools using Effect AI's Tool and Toolkit APIs. Use when building LLM integrations with type-safe tool definitions, parameter validation, and handler implementations. Covers user-defined tools, provider-defined tools, and toolkit composition.
---

# Effect AI Tool Skill

Use this skill when implementing tools for AI language models using the Effect AI library. This covers tool definition, parameter schemas, success/failure handling, and toolkit composition.

## Effect AI Documentation Access

For comprehensive Effect AI documentation, view the Effect v4 repository at `packages/ai/`

Reference this for:

- Tool.make, Tool.dynamic, and Tool.providerDefined APIs
- Toolkit.make for composing multiple tools
- Schema.Struct(...) for Tool.make parameters
- Handler implementation patterns
- OpenAI provider-defined tools via `@effect/ai-openai/OpenAiTool`

## Core Concepts

### Tool Anatomy

```typescript
Effect<A, E, R>
       ↓
Tool<Name, Config, Requirements>

Config := {
  parameters: Schema.Struct<Fields>
  success: Schema<A>
  failure: Schema<E>
  failureMode: "error" | "return"
}
```

### Toolkit Flow

```typescript
Tool₁, Tool₂, Tool₃
       ↓ Toolkit.make
Toolkit<{tool1: Tool₁, tool2: Tool₂, tool3: Tool₃}>
       ↓ .toLayer(handlers)
Layer<Handlers>
       ↓ Effect.provide
Effect with tool execution capability
```

## Production Harness Pattern: Effectful Local Tool Wrappers

`Tool.make` is the core user-defined Effect AI tool API. Effect AI also has `Tool.dynamic` for runtime-discovered tools and `Tool.providerDefined` for native provider capabilities. In larger coding-agent harnesses, it is common to wrap local tool definitions in an effectful layer so it can capture services once and keep a single `Effect.runPromise` bridge at the outer async framework boundary.

This wrapper is local to your harness, not part of Effect AI itself.

```typescript
import { Effect } from 'effect';

export const ReadTool = defineEffect(
	'read',
	Effect.gen(function* () {
		const fs = yield* AppFileSystem.Service;

		const run = Effect.fn('ReadTool.execute')(function* (params: Params) {
			return yield* fs.readFileString(params.path);
		});

		return {
			description: 'Read a file',
			async execute(params: Params) {
				return Effect.runPromise(run(params));
			}
		};
	})
);
```

Use this pattern when the surrounding framework wants an async callback surface but your real implementation should stay in Effect.

## Creating User-Defined Tools

### Basic Tool Definition

```typescript
import * as Tool from 'effect/unstable/ai/Tool';
import * as Schema from 'effect/Schema';

const GetCurrentTime = Tool.make('GetCurrentTime', {
	description: 'Returns the current timestamp in milliseconds',
	success: Schema.Number
});

const result = Tool.Success<typeof GetCurrentTime>;
```

**Key Pattern: Tool.make**

- First parameter: tool name (string literal)
- Second parameter: configuration object
- No parameters field = empty parameters `{}`
- Default success: `Schema.Void`
- Default failure: `Schema.Never`

### Tool from Domain Schema

If you have an existing domain schema you want to use as a tool, create the tool with `Tool.make` and reference the schema directly:

```typescript
import * as Tool from 'effect/unstable/ai/Tool';
import * as Schema from 'effect/Schema';

const UserResult = Schema.Struct({
	id: Schema.String,
	name: Schema.String
});

const GetUserTool = Tool.make('GetUser', {
	description: 'Retrieve user information by ID',
	parameters: Schema.Struct({
		userId: Schema.String
	}),
	success: UserResult
});

type Params = Tool.Parameters<typeof GetUserTool>;
type Success = Tool.Success<typeof GetUserTool>;
```

**Key Pattern: Tool.make with domain schemas**

- Use `Tool.make` for user-defined tools
- Reference existing domain schemas in `parameters`, `success`, and `failure` fields
- Tool name is the first argument (string literal)
- Use `Tool.dynamic` for runtime-discovered tools and `Tool.providerDefined` / `OpenAiTool` for provider-native tools
- There is no `Tool.fromTaggedRequest` in v4

### Tool with Parameters

```typescript
import * as Tool from 'effect/unstable/ai/Tool';
import { Schema } from 'effect';

const GetWeather = Tool.make('GetWeather', {
	description: 'Get weather information for a location',
	parameters: Schema.Struct({
		location: Schema.String,
		units: Schema.optional(Schema.Literals(['celsius', 'fahrenheit']))
	}),
	success: Schema.Struct({
		temperature: Schema.Number,
		condition: Schema.String,
		humidity: Schema.Number
	})
});

type Params = Tool.Parameters<typeof GetWeather>;
type Success = Tool.Success<typeof GetWeather>;
```

**Key Pattern: parameters**

- `Tool.make` parameters must be an Effect `Schema.Top`
- Wrap field records with `Schema.Struct({...})`; `Tool.make` does not wrap raw field objects automatically
- `Tool.dynamic` can use either typed Effect schemas or raw JSON Schema discovered at runtime
- Use `Schema.optional()` for optional parameters

### Tool with Failure Handling

```typescript
import * as Tool from 'effect/unstable/ai/Tool';
import { Schema } from 'effect';

class UserNotFound extends Schema.TaggedErrorClass<UserNotFound>()(
	'UserNotFound',
	{
		userId: Schema.String
	}
) {}

class DatabaseError extends Schema.TaggedErrorClass<DatabaseError>()(
	'DatabaseError',
	{
		message: Schema.String
	}
) {}

const FindUser = Tool.make('FindUser', {
	description: 'Find user by ID',
	parameters: Schema.Struct({
		userId: Schema.String
	}),
	success: Schema.Struct({
		id: Schema.String,
		name: Schema.String,
		email: Schema.String
	}),
	failure: Schema.Union([
		Schema.instanceOf(UserNotFound),
		Schema.instanceOf(DatabaseError)
	]),
	failureMode: 'error'
});

type Error = Tool.Failure<typeof FindUser>;
```

**Key Pattern: failureMode**

- `"error"` (default): Failures go to Effect error channel
- `"return"`: Failures returned as tool result (captured, not thrown)

### Tool with Service Dependencies

```typescript
import * as Tool from 'effect/unstable/ai/Tool';
import * as Context from 'effect/Context';
import { Schema } from 'effect';

class Database extends Context.Service<
	Database,
	{
		readonly query: (sql: string) => Effect.Effect<unknown>;
	}
>()('Database') {}

const QueryDatabase = Tool.make('QueryDatabase', {
	description: 'Execute a database query',
	parameters: Schema.Struct({
		sql: Schema.String
	}),
	success: Schema.Unknown,
	dependencies: [Database]
});

type Requirements = Tool.Requirements<typeof QueryDatabase>;
```

**Key Pattern: dependencies**

- Array of service tags
- Requirements extracted at type level
- Must be provided when creating handlers

## Creating Toolkits

### Basic Toolkit

```typescript
import * as Toolkit from 'effect/unstable/ai/Toolkit';
import * as Tool from 'effect/unstable/ai/Tool';
import { Effect, Schema } from 'effect';

const GetCurrentTime = Tool.make('GetCurrentTime', {
	description: 'Get the current timestamp',
	success: Schema.Number
});

const GetWeather = Tool.make('GetWeather', {
	description: 'Get weather for a location',
	parameters: Schema.Struct({
		location: Schema.String
	}),
	success: Schema.Struct({
		temperature: Schema.Number,
		condition: Schema.String
	})
});

const MyToolkit = Toolkit.make(GetCurrentTime, GetWeather);

type Tools = Toolkit.Tools<typeof MyToolkit>;
```

**Key Pattern: Toolkit.make**

- Accepts variadic tool arguments
- Returns `Toolkit<Record<Name, Tool>>`
- Tools indexed by their name property

### Implementing Tool Handlers

```typescript
import { Effect } from 'effect';

const MyToolkitLayer = MyToolkit.toLayer({
	GetCurrentTime: () => Effect.succeed(Date.now()),

	GetWeather: ({ location }) =>
		Effect.gen(function* () {
			const data = yield* fetchWeatherData(location);
			return {
				temperature: data.temp,
				condition: data.conditions
			};
		})
});

declare const fetchWeatherData: (location: string) => Effect.Effect<{
	readonly temp: number;
	readonly conditions: string;
}>;
```

**Key Pattern: toLayer**

- Object mapping tool names to handler functions
- Handler signature: `(params, context) => Effect<Success, Failure, Requirements>`; use `context.preliminary(...)` for progress updates
- Returns `Layer<Handlers>`

### Alternative: Handlers as Context

```typescript
import { Effect } from 'effect';

const program = Effect.gen(function* () {
	const handlers = yield* MyToolkit.toHandlers({
		GetCurrentTime: () => Effect.succeed(Date.now()),

		GetWeather: ({ location }) =>
			Effect.gen(function* () {
				const data = yield* fetchWeatherData(location);
				return {
					temperature: data.temp,
					condition: data.conditions
				};
			})
	});

	const result = yield* Effect.provide(myEffect, handlers);
	return result;
});

declare const fetchWeatherData: (location: string) => Effect.Effect<{
	readonly temp: number;
	readonly conditions: string;
}>;

declare const myEffect: Effect.Effect<unknown, never, Handlers>;
```

**Key Pattern: toHandlers**

- Similar to toLayer but returns a `Context` instead of Layer
- Use when you need direct handler context (not Layer composition)
- Returns `Effect<Context<Handlers>>`
- Provide directly to effects that require handlers

### Providing Dependencies to Handlers

```typescript
import * as Context from 'effect/Context';
import { Effect } from 'effect';

interface WeatherData {
	readonly temperature: number;
	readonly condition: string;
}

class WeatherService extends Context.Service<
	WeatherService,
	{
		readonly fetch: (location: string) => Effect.Effect<WeatherData>;
	}
>()('WeatherService') {}

const GetWeatherWithDeps = Tool.make('GetWeather', {
	parameters: Schema.Struct({
		location: Schema.String
	}),
	success: Schema.Struct({
		temperature: Schema.Number,
		condition: Schema.String
	}),
	dependencies: [WeatherService]
});

const toolkit = Toolkit.make(GetWeatherWithDeps);

const toolkitLayer = toolkit.toLayer({
	GetWeather: ({ location }) =>
		Effect.gen(function* () {
			const service = yield* WeatherService;
			const data = yield* service.fetch(location);
			return {
				temperature: data.temperature,
				condition: data.condition
			};
		})
});

const program = Effect.gen(function* () {
	const handlers = yield* toolkitLayer;
	const resultStream = yield* handlers.handle('GetWeather', { location: 'NYC' });
	return resultStream;
}).pipe(Effect.provide(WeatherServiceLive));

declare const WeatherServiceLive: Layer<WeatherService>;
```

**Key Pattern: Handler Context**

- Handlers run with injected dependencies
- Access via `yield* Tag` in Effect.gen
- Dependencies must be provided to final effect

## Dynamic Tools

Use `Tool.dynamic` when tool schemas are discovered at runtime, such as from MCP or external configuration. If `parameters` is an Effect `Schema`, handlers receive typed decoded params; if `parameters` is raw JSON Schema, handler params are `unknown`.

```typescript
const TypedDynamic = Tool.dynamic('runtimeSearch', {
	description: 'Search with a runtime-provided typed schema',
	parameters: Schema.Struct({ query: Schema.String }),
	success: Schema.Array(Schema.String)
});

type TypedParams = Tool.Parameters<typeof TypedDynamic>; // { query: string }

const UntypedDynamic = Tool.dynamic('mcpTool', {
	description: 'Runtime MCP tool with raw JSON Schema',
	parameters: {
		type: 'object',
		properties: { query: { type: 'string' } },
		required: ['query']
	}
});

type UntypedParams = Tool.Parameters<typeof UntypedDynamic>; // unknown
```

## Registry-Owned Tool Resolution

In production agent harnesses, resolve tools through a registry service instead of scattering direct imports across prompt/session code.

The registry is the right place to:

- initialize effect-built tools once
- compute dynamic descriptions from permissions, config, or available subagents
- expose stable named handles for orchestration and tests

```typescript
export namespace ToolRegistry {
	export interface Interface {
		readonly named: {
			task: LocalToolInfo;
			read: LocalToolInfo;
		};
	}
}

const registry = yield* ToolRegistry.Service;
const task = yield* Effect.promise(() => registry.named.task.init());
```

Keep static descriptions on the tool for invariant behavior. Put runtime-specific descriptions and policy shaping in the registry layer.

### Merging Toolkits

```typescript
import * as Toolkit from 'effect/unstable/ai/Toolkit';

const mathToolkit = Toolkit.make(
	Tool.make('add', {
		parameters: Schema.Struct({ a: Schema.Number, b: Schema.Number }),
		success: Schema.Number
	}),
	Tool.make('subtract', {
		parameters: Schema.Struct({ a: Schema.Number, b: Schema.Number }),
		success: Schema.Number
	})
);

const utilityToolkit = Toolkit.make(
	Tool.make('getCurrentTime', { success: Schema.Number }),
	Tool.make('generateUUID', { success: Schema.String })
);

const combined = Toolkit.merge(mathToolkit, utilityToolkit);

type AllTools = Toolkit.Tools<typeof combined>;
```

**Key Pattern: Toolkit.merge**

- Combines multiple toolkits into one
- Later toolkits override earlier ones on name collision
- Type-safe union of all tools
- **Note**: In v4, the preferred pattern is `Toolkit.make(tool1, tool2, ...)` — passing all tools to the constructor rather than merging separate toolkits. Use `Toolkit.make` with all tools when possible.

## Provider-Defined Tools

`Tool.providerDefined` models provider-native capabilities. For OpenAI, prefer the curated `OpenAiTool` constructors from `@effect/ai-openai` (`WebSearch`, `CodeInterpreter`, `FileSearch`, `ImageGeneration`, `Mcp`, plus handler-required local tools such as `Shell`, `LocalShell`, and `ApplyPatch`).

### Basic Provider Tool

```typescript
import * as Tool from 'effect/unstable/ai/Tool';
import { Schema } from 'effect';

const AnthropicBash = Tool.providerDefined({
	id: 'anthropic.bash',
	customName: 'Bash',
	providerName: 'bash_20241022',
	args: Schema.Struct({
		command: Schema.String
	})
});

const bashTool = AnthropicBash({ command: 'ls -la' });

type ToolType = typeof bashTool;
```

**Key Pattern: Tool.providerDefined**

- Returns a function that accepts args
- `id`: Unique identifier `<provider>.<tool-name>`
- `customName`: Name used by Effect AI / Toolkit to identify this tool
- `providerName`: Name recognized by the AI provider
- `args`: Schema for provider-specific configuration arguments
- `requiresHandler`: Set to `true` only when your application must execute/process provider tool calls locally

### OpenAI Provider Tools

```typescript
import { OpenAiTool } from '@effect/ai-openai';

const nativeTools = Toolkit.make(
	OpenAiTool.WebSearch({}),
	OpenAiTool.FileSearch({ vector_store_ids: ['vs_123'] }),
	OpenAiTool.ImageGeneration({}),
	OpenAiTool.Mcp({
		server_label: 'docs',
		server_url: 'https://mcp.example.com/mcp'
	})
);
```

`OpenAiTool.Mcp` uses the canonical custom name `OpenAiMcp`. Treat handler-required local OpenAI tools (`Shell`, `LocalShell`, `ApplyPatch`) as privileged operations: provide handlers only behind sandboxing, authorization, and audit policy.

### Provider Tool with Handler

```typescript
import * as Tool from 'effect/unstable/ai/Tool';
import { Schema } from 'effect';

const WebSearch = Tool.providerDefined({
	id: 'custom.web_search',
	customName: 'WebSearch',
	providerName: 'web_search',
	args: Schema.Struct({
		maxResults: Schema.Number
	}),
	requiresHandler: true,
	parameters: Schema.Struct({
		query: Schema.String
	}),
	success: Schema.Struct({
		results: Schema.Array(
			Schema.Struct({
				title: Schema.String,
				url: Schema.String,
				snippet: Schema.String
			})
		)
	})
});

const searchTool = WebSearch({ maxResults: 10, failureMode: 'return' });

const toolkit = Toolkit.make(searchTool);

const toolkitLayer = toolkit.toLayer({
	WebSearch: ({ query }) =>
		Effect.gen(function* () {
			const results = yield* performSearch(query);
			return { results };
		})
});

declare const performSearch: (query: string) => Effect.Effect<
	Array<{
		readonly title: string;
		readonly url: string;
		readonly snippet: string;
	}>
>;
```

**Key Pattern: requiresHandler**

- `false` (default): Provider executes tool completely
- `true`: Your handler processes provider results
- Handler receives `parameters` from provider

## Tool Result Flow

### Understanding ToolCallPart and ToolResultPart

```typescript
import * as Prompt from 'effect/unstable/ai/Prompt';

const toolCallPart = Prompt.makePart('tool-call', {
	id: 'call_123',
	name: 'GetWeather',
	params: { location: 'NYC' },
	providerExecuted: false
});

const toolResultPart = Prompt.makePart('tool-result', {
	id: 'call_123',
	name: 'GetWeather',
	result: {
		temperature: 72,
		condition: 'sunny'
	},
	isFailure: false
});
```

**Key Pattern: Tool Call Flow**

1. LLM generates `ToolCallPart` in response
2. Your code runs `yield* toolkit.handle(...)` to get a `Stream` of handler results
3. Preliminary results can be emitted for progress; the final result is authoritative
4. Create a `ToolResultPart` from the final handler result for manual loops (LanguageModel does this automatically when tool resolution is enabled)
5. Send the tool result back to the LLM

### Approval Flow

`Tool.make` and `Tool.dynamic` support `needsApproval`. When approval is needed, automatic tool resolution emits a `tool-approval-request` instead of executing the handler. The caller appends a `Prompt.toolApprovalResponsePart` in a tool message and calls the model again.

```typescript
const DeleteFile = Tool.make('DeleteFile', {
	parameters: Schema.Struct({ path: Schema.String }),
	success: Schema.Void,
	needsApproval: true
});

const approvalResponse = Prompt.toolApprovalResponsePart({
	approvalId: 'approval_123',
	approved: false,
	reason: 'User denied deletion'
});
```

Approved calls execute on the next model call; denied calls are converted to failed tool results with `{ type: 'execution-denied', reason }`.

### Executing Tool Handlers

```typescript
import { Effect, Stream } from 'effect';

const program = Effect.gen(function* () {
	const toolkit = yield* MyToolkitLayer;

	const resultStream = yield* toolkit.handle('GetWeather', {
		location: 'San Francisco'
	});

	yield* resultStream.pipe(
		Stream.runForEach((result) =>
			Effect.gen(function* () {
				yield* Effect.log(result.preliminary ? 'progress' : 'final');
				yield* Effect.log(result.isFailure);
				yield* Effect.log(result.result);
				yield* Effect.log(result.encodedResult);
			})
		)
	);
});

interface HandlerResult<T> {
	readonly isFailure: boolean;
	readonly result: Result<T>;
	readonly encodedResult: unknown;
	readonly preliminary: boolean;
}

type Result<T> = Tool.Success<T> | Tool.Failure<T>;
```

Handlers can emit progress before the final result with `context.preliminary(...)`:

```typescript
const toolkitLayer = LongRunningToolkit.toLayer({
	LongTask: (params, context) =>
		Effect.gen(function* () {
			yield* context.preliminary({ status: 'started' });
			const result = yield* runLongTask(params);
			return { status: 'done', result };
		})
});
```

**Key Pattern: toolkit.handle**

- Returns `Effect<Stream<HandlerResult<Tool>>>`
- `preliminary: true`: progress update; do not persist as final history
- `preliminary: false`: final result to send/persist
- `isFailure`: Whether handler failed
- `result`: Typed success or failure value
- `encodedResult`: JSON-serializable for LLM

## Advanced Patterns

### Tool Annotations

```typescript
import * as Tool from 'effect/unstable/ai/Tool';
import { Schema } from 'effect';

const ReadOnlyQuery = Tool.make('query', {
	parameters: Schema.Struct({ sql: Schema.String }),
	success: Schema.Unknown
})
	.annotate(Tool.Readonly, true)
	.annotate(Tool.Destructive, false)
	.annotate(Tool.Idempotent, true);
```

**Available Annotations and Defaults:**

- `Tool.Readonly`: Tool only reads data; default `false`
- `Tool.Destructive`: Tool performs destructive operations; default `true`
- `Tool.Idempotent`: Safe to call multiple times; default `false`
- `Tool.OpenWorld`: Can handle arbitrary external data; default `true`
- `Tool.Strict`: OpenAI strict JSON Schema override; default `undefined` so provider/config decides
- `Tool.Title`: Human-readable title

MCP emits the first four annotations as tool hints. They are hints, not authorization decisions. OpenAI function tools use `Tool.Strict` or `OpenAiLanguageModel.Config.strictJsonSchema` for strict mode.

### JSON Schema Generation

```typescript
import * as Tool from 'effect/unstable/ai/Tool';

const tool = Tool.make('example', {
	parameters: Schema.Struct({
		name: Schema.String,
		age: Schema.optional(Schema.Number)
	})
});

const jsonSchema = Tool.getJsonSchema(tool);
```

**Output:**

```json
{
	"type": "object",
	"properties": {
		"name": { "type": "string" },
		"age": { "type": "number" }
	},
	"required": ["name"],
	"additionalProperties": false
}
```

### Tool Guards

```typescript
import * as Tool from 'effect/unstable/ai/Tool';

const userTool = Tool.make('example');
const providerTool = Tool.providerDefined({
	id: 'provider.tool',
	customName: 'Example',
	providerName: 'example',
	args: Schema.Struct({})
})({});

Tool.isUserDefined(userTool);
Tool.isProviderDefined(providerTool);
```

### Dynamic Tool Selection

```typescript
import { Effect, Match } from 'effect';

const executeTool = (toolName: string, params: unknown) =>
	Effect.gen(function* () {
		const toolkit = yield* MyToolkitLayer;

		const handler = Match.value(toolName).pipe(
			Match.when('GetWeather', () =>
				toolkit.handle('GetWeather', params)
			),
			Match.when('GetCurrentTime', () =>
				toolkit.handle('GetCurrentTime', params)
			),
			Match.orElse(() =>
				Effect.fail(new Error(`Unknown tool: ${toolName}`))
			)
		);

		return yield* handler;
	});
```

## Complete Example

```typescript
import * as Tool from 'effect/unstable/ai/Tool';
import * as Toolkit from 'effect/unstable/ai/Toolkit';
import { Effect, Schema, Layer, Stream } from 'effect';

class UserNotFound extends Schema.TaggedErrorClass<UserNotFound>()(
	'UserNotFound',
	{
		userId: Schema.String
	}
) {}

class Database extends Context.Service<
	Database,
	{
		readonly query: (sql: string) => Effect.Effect<unknown>;
	}
>()('Database') {}

const GetUser = Tool.make('GetUser', {
	description: 'Retrieve user information by ID',
	parameters: Schema.Struct({
		userId: Schema.String
	}),
	success: Schema.Struct({
		id: Schema.String,
		name: Schema.String,
		email: Schema.String
	}),
	failure: Schema.instanceOf(UserNotFound),
	failureMode: 'error',
	dependencies: [Database]
});

const CreateUser = Tool.make('CreateUser', {
	description: 'Create a new user',
	parameters: Schema.Struct({
		name: Schema.String,
		email: Schema.String
	}),
	success: Schema.Struct({
		id: Schema.String,
		name: Schema.String,
		email: Schema.String
	}),
	dependencies: [Database]
});

const GetCurrentTime = Tool.make('GetCurrentTime', {
	description: 'Get the current Unix timestamp',
	success: Schema.Number
});

const UserToolkit = Toolkit.make(GetUser, CreateUser, GetCurrentTime);

const UserToolkitLive = UserToolkit.toLayer({
	GetUser: ({ userId }) =>
		Effect.gen(function* () {
			const db = yield* Database;
			const user = yield* db.query(
				`SELECT * FROM users WHERE id = ?`,
				userId
			);

			if (!user) {
				return yield* Effect.fail(new UserNotFound({ userId }));
			}

			return user as { id: string; name: string; email: string };
		}),

	CreateUser: ({ name, email }) =>
		Effect.gen(function* () {
			const db = yield* Database;
			const id = crypto.randomUUID();

			yield* db.query(
				`INSERT INTO users (id, name, email) VALUES (?, ?, ?)`,
				id,
				name,
				email
			);

			return { id, name, email };
		}),

	GetCurrentTime: () => Effect.succeed(Date.now())
});

const DatabaseLive = Layer.succeed(Database, {
	query: (sql: string, ...params: ReadonlyArray<unknown>) =>
		Effect.logInfo(`Query: ${sql}`).pipe(Effect.as({}))
});

const program = Effect.gen(function* () {
	const toolkit = yield* UserToolkitLive;

	const createStream = yield* toolkit.handle('CreateUser', {
		name: 'Alice',
		email: 'alice@example.com'
	});

	yield* createStream.pipe(
		Stream.runForEach((result) => Effect.log('Created user:', result.result))
	);

	const getStream = yield* toolkit.handle('GetUser', {
		userId: 'user-123'
	});

	yield* getStream.pipe(
		Stream.runForEach((result) => Effect.log('Retrieved user:', result.result))
	);

	const timeStream = yield* toolkit.handle('GetCurrentTime', {});

	yield* timeStream.pipe(
		Stream.runForEach((result) => Effect.log('Current time:', result.result))
	);
}).pipe(Effect.provide(DatabaseLive));
```

## Import Patterns

**CRITICAL**: Always use namespace imports:

```typescript
import * as Tool from 'effect/unstable/ai/Tool';
import * as Toolkit from 'effect/unstable/ai/Toolkit';
import * as Prompt from 'effect/unstable/ai/Prompt';
import { Schema, Effect, Data, Context, Layer } from 'effect';

const myTool = Tool.make('example');
const myToolkit = Toolkit.make(myTool);
```

**NEVER** do this:

```typescript
import { make } from 'effect/unstable/ai/Tool';
import { make as makeToolkit } from 'effect/unstable/ai/Toolkit';
```

## Quality Checklist

### Mandatory - Every Tool

- [ ] Tool name is descriptive and unique
- [ ] Description explains what the tool does
- [ ] Parameters use `Schema.Struct(...)` or another `Schema.Top` schema (not raw field objects)
- [ ] Success schema matches handler return type
- [ ] Failure schema includes all tagged errors
- [ ] failureMode matches recovery strategy
- [ ] Dependencies declared if accessing services
- [ ] Handler implements correct signature
- [ ] Type signatures use Tool.Parameters, Tool.Success, Tool.Failure

### Conditional - Include When Appropriate

- [ ] Tool.Readonly annotation for read-only tools
- [ ] Tool.Destructive annotation for mutating operations
- [ ] Tool.Idempotent annotation for safe retries
- [ ] Custom annotations via Tool.annotate
- [ ] Provider-defined tools for native provider features
- [ ] Toolkit.make with all tools (preferred in v4) or Toolkit.merge for combining tool collections
- [ ] Error handling with catchTag in handlers

## Common Patterns

### Validation in Handlers

```typescript
const ValidatedTool = Tool.make('validate', {
	parameters: Schema.Struct({
		input: Schema.String
	}),
	success: Schema.Struct({
		valid: Schema.Boolean,
		errors: Schema.Array(Schema.String)
	})
});

const toolkit = Toolkit.make(ValidatedTool);

const toolkitLayer = toolkit.toLayer({
	validate: ({ input }) =>
		Effect.gen(function* () {
			const errors: Array<string> = [];

			if (input.length < 3) {
				errors.push('Input too short');
			}

			if (!/^[a-z]+$/.test(input)) {
				errors.push('Input must be lowercase letters');
			}

			return {
				valid: errors.length === 0,
				errors
			};
		})
});
```

### Async Operations in Handlers

```typescript
const FetchTool = Tool.make('fetch', {
	parameters: Schema.Struct({
		url: Schema.String
	}),
	success: Schema.String
});

const toolkit = Toolkit.make(FetchTool);

const toolkitLayer = toolkit.toLayer({
	fetch: ({ url }) =>
		Effect.tryPromise({
			try: () => fetch(url).then((r) => r.text()),
			catch: (error) => new Error(`Fetch failed: ${error}`)
		})
});
```

### Conditional Tool Execution

```typescript
const ConditionalTool = Tool.make('process', {
	parameters: Schema.Struct({
		mode: Schema.Literals(['fast', 'thorough'])
	}),
	success: Schema.String
});

const toolkit = Toolkit.make(ConditionalTool);

const toolkitLayer = toolkit.toLayer({
	process: ({ mode }) =>
		mode === 'fast'
			? Effect.succeed('Fast result')
			: Effect.gen(function* () {
					yield* Effect.sleep('1 second');
					return 'Thorough result';
				})
});
```

## When to Use This Skill

- Building LLM integrations with tool calling
- Creating type-safe AI agent capabilities
- Implementing function calling for Claude/OpenAI
- Defining validated tool parameters and results
- Composing multiple tools into toolkits
- Managing tool handler dependencies
- Integrating provider-native tools (bash, web search)

## Key Principles Summary

1. **Tool.make** - Define user tools with parameters, success, and failure schemas
2. **Tool.dynamic** - Define runtime-discovered tools; raw JSON Schema params are `unknown`
3. **Tool.providerDefined / OpenAiTool** - Use provider-native tools with `customName`
4. **Parameters** - `Tool.make` takes `Schema.Top` schemas such as `Schema.Struct(...)`; raw JSON Schema belongs with `Tool.dynamic`
5. **Toolkit.make** - Compose multiple tools together
6. **toLayer** - Implement handlers returning Layer
7. **toHandlers** - Implement handlers returning Context
8. **toolkit.handle** - Execute tools and consume a Stream of preliminary/final results
9. **HandlerResult** - Access typed result, encoded JSON, failure flag, and preliminary flag
10. **needsApproval** - Produces approval requests until caller supplies approval responses
11. **failureMode** - Control error vs return failure strategy
12. **dependencies** - Declare service requirements
13. **Namespace imports** - Always `import * as Tool`
14. **Prompt.makePart** - Create tool-call, tool-result, and approval parts with params

Your tool implementations should be type-safe, validated, and provide excellent developer experience with full schema support.

## Related Skills

- effect-ai-language-model - Using tools with generateText/streamText
- effect-ai-prompt - Tool call/result message integration
- effect-ai-streaming - Processing tool call streams
- effect-ai-provider - Provider-defined tools
