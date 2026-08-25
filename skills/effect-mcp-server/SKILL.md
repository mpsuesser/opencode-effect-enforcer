---
name: effect-mcp-server
description: Build MCP (Model Context Protocol) servers with Effect using McpServer, McpSchema, Tool, and Toolkit. Use this skill when implementing MCP servers that expose tools, resources, and prompts to LLM clients via stdio or HTTP transports.
---

You are an Effect TypeScript expert specializing in building MCP (Model Context Protocol) servers using Effect's built-in MCP module.

## Effect Source Reference

The Effect v4 source is available at `~/.local/share/opencode/repos/github.com/Effect-TS/effect@main/`.
Browse and read files there directly to look up APIs, types, and implementations.

Reference these files:

- `packages/effect/MCP.md` — primary MCP guide with full examples
- `packages/effect/src/unstable/ai/McpServer.ts` — server implementation and API
- `packages/effect/src/unstable/ai/McpSchema.ts` — schema types, param helper, error classes

## What is MCP

Model Context Protocol (MCP) is a standard protocol for LLM tool integration. It allows AI clients (Claude, etc.) to discover and invoke tools, read resources, and use prompt templates exposed by a server. Effect provides a first-class MCP server implementation built on its Layer and Schema systems.

## Core Imports

```typescript
import { Cause, Context, Effect, Layer, Logger } from 'effect';
import { Schema } from 'effect';
import { McpProtocol, McpServer, McpSchema, Tool, Toolkit } from 'effect/unstable/ai';
```

For platform-specific transports:

```typescript
// Node.js stdio transport
import { NodeRuntime, NodeSink, NodeStream } from '@effect/platform-node';

// Or using NodeStdio
import { NodeRuntime, NodeStdio } from '@effect/platform-node';
```

## Architecture Overview

An MCP server is composed of three kinds of **part layers** merged together, then provided with a **transport layer**:

```
Layer.mergeAll(
  ...resources,    // McpServer.resource(...)
  ...prompts,      // McpServer.prompt(...)
  toolkitLayer     // McpServer.toolkit(...) with implementations
).pipe(
  Layer.provide(transportLayer),   // McpServer.layerStdio(...) or McpServer.layerHttp(...)
  Layer.provide(loggingLayer)      // Logger — stderr for stdio transport
)
```

Every server runner now requires a non-empty `protocols` option. Put the preferred fallback revision first; an exact initialization offer is selected when present, otherwise the first adapter is used where the transport permits fallback. Streamable HTTP rejects an explicit unsupported `MCP-Protocol-Version` header with `400`.

## Protocol Revisions

Effect ships four dated adapters:

```typescript
const protocols = [
	McpProtocol.v2025_11_25,
	McpProtocol.v2025_06_18,
	McpProtocol.v2025_03_26,
	McpProtocol.v2024_11_05
] as const;
```

- `2024-11-05` and `2025-03-26` are compatibility revisions.
- `2025-06-18` supports form elicitation.
- `2025-11-25` adds sampling with tools, independently advertised form/URL elicitation modes, descriptor icons, and elicitation-complete notifications.
- Duplicate versions or an empty protocol declaration fail layer construction with `Cause.IllegalArgumentError`.
- `v2024_11_05` over `layerHttp` uses Effect's single-endpoint Streamable HTTP compatibility transport. It does not recreate the historical two-endpoint HTTP+SSE transport, GET SSE, event resumption, session expiry, or client session termination.

Each part layer has type `Layer.Layer<never, never, ...>` — they register themselves with the McpServer service and produce no output type.

## Tools and Toolkit

### Defining Tools

Tools are defined with `Tool.make` specifying a name, description, parameter schemas, and success schema:

```typescript
const GreetTool = Tool.make('GreetTool', {
	description: 'Generate a greeting message',
	parameters: {
		name: Schema.String,
		style: Schema.Union([
			Schema.Literal('formal'),
			Schema.Literal('casual')
		])
	},
	success: Schema.String
});

const CalculatorTool = Tool.make('CalculatorTool', {
	description: 'Perform basic arithmetic',
	parameters: {
		operation: Schema.Union([
			Schema.Literal('add'),
			Schema.Literal('subtract'),
			Schema.Literal('multiply'),
			Schema.Literal('divide')
		]),
		a: Schema.Number,
		b: Schema.Number
	},
	success: Schema.Number
});

const NotifyTool = Tool.make('NotifyTool', {
	description: 'Send an optional notification',
	parameters: {
		message: Schema.String,
		channel: Schema.optionalKey(Schema.String)
	},
	success: Schema.Void
});
```

MCP callers may omit fields declared with `Schema.optionalKey`; do not assume the protocol sends an `arguments` object containing every field. A `Schema.Void` tool may return `Effect.void`; `undefined` is a successful tool result, not an internal error.

### Creating a Toolkit

Group tools into a `Toolkit`:

```typescript
const MyToolkit = Toolkit.make(GreetTool, CalculatorTool);
```

### Registering with McpServer

`McpServer.toolkit(toolkit)` creates a layer that registers the toolkit. Implementations are provided via `Toolkit.toLayer`:

```typescript
const ToolkitLayer = McpServer.toolkit(MyToolkit).pipe(
	Layer.provideMerge(
		MyToolkit.toLayer({
			GreetTool: ({ name, style }) => {
				const greeting =
					style === 'formal' ? `Good day, ${name}.` : `Hey ${name}!`;
				return Effect.succeed(greeting);
			},
			CalculatorTool: ({ operation, a, b }) => {
				switch (operation) {
					case 'add':
						return Effect.succeed(a + b);
					case 'subtract':
						return Effect.succeed(a - b);
					case 'multiply':
						return Effect.succeed(a * b);
					case 'divide':
						return Effect.succeed(a / b);
				}
			}
		})
	)
);
```

The pattern is always: `McpServer.toolkit(tk).pipe(Layer.provideMerge(tk.toLayer({...})))`.

### MCP Tool Annotations

Effect tool annotations are emitted as MCP tool hints:

- `Tool.Readonly` → `readOnlyHint`, default `false`
- `Tool.Destructive` → `destructiveHint`, default `true`
- `Tool.Idempotent` → `idempotentHint`, default `false`
- `Tool.OpenWorld` → `openWorldHint`, default `true`

These hints help clients decide how to present tools, but they are not authorization decisions. Always enforce access control in your server handlers.

## Resources

### Static Resources

Expose a fixed URI resource:

```typescript
const ReadmeResource = McpServer.resource({
	uri: 'file:///README.md',
	name: 'README',
	description: 'Project README file',
	mimeType: 'text/markdown',
	content: Effect.succeed('# My Project\n\nProject documentation.')
});
```

The `content` field is an `Effect` that can produce a `string`, `Uint8Array`, or a `ReadResourceResult`.

### Parameterized Resource Templates

Use tagged template literals with `McpSchema.param` for dynamic URIs:

```typescript
const idParam = McpSchema.param('id', Schema.NumberFromString);

const UserResource = McpServer.resource`file://users/${idParam}.json`({
	name: 'User Data',
	description: 'User information by ID',
	completion: {
		id: (_input: string) => Effect.succeed([1, 2, 3, 4, 5])
	},
	content: Effect.fn(function* (_uri, id) {
		return JSON.stringify({ id, name: `User ${id}` }, null, 2);
	}),
	mimeType: 'application/json'
});
```

Key points:

- `McpSchema.param(name, schema)` creates a named URI parameter with automatic codec (e.g. `Schema.NumberFromString` for path segments)
- `completion` provides auto-completion values for each parameter
- `content` receives `(uri, ...params)` — the full URI string followed by decoded parameter values
- `audience` can be `["assistant"]`, `["user"]`, or `["assistant", "user"]`

## Prompts

Define reusable prompt templates:

```typescript
const AnalysisPrompt = McpServer.prompt({
	name: 'Analyze Data',
	description: 'Analyze data and provide insights',
	parameters: {
		dataType: Schema.String,
		focus: Schema.Union([
			Schema.Literal('summary'),
			Schema.Literal('details')
		])
	},
	completion: {
		dataType: () => Effect.succeed(['sales', 'users', 'metrics']),
		focus: () => Effect.succeed(['summary', 'details'])
	},
	content: ({ dataType, focus }) =>
		Effect.succeed(
			`Please analyze the ${dataType} data and provide a ${focus} analysis.`
		)
});
```

- `parameters` uses `Schema.Struct.Fields` (same as Schema.Struct field definitions)
- `completion` provides auto-complete values per parameter
- `content` receives the decoded parameters and returns `Effect<string | Array<PromptMessage>>`

## Elicitation

`McpServer.elicit` requests form-based structured input from the current client and decodes accepted content:

```typescript
const result = McpServer.elicit({
	message: `Please answer ("yes" | "no"):`,
	schema: Schema.Struct({
		answer: Schema.Union([Schema.Literal('yes'), Schema.Literal('no')])
	})
}).pipe(
	Effect.catchTag('ElicitationDeclined', () =>
		Effect.succeed({ answer: 'no' as const })
	)
);
```

- Returns `Effect<S["Type"], ElicitationDeclined, McpServerClient>`
- Handle `ElicitationDeclined` with `catchTag` for fallback behavior
- If the user cancels, the effect is interrupted
- The negotiated client must advertise form elicitation. In `2025-11-25`, an empty `elicitation` capability is treated as form support; explicit `elicitation.form` and `elicitation.url` capabilities are otherwise gated independently.

URL elicitation is a `2025-11-25` reverse-client operation. Use the scoped client facade, then notify that specific client when the external flow completes:

```typescript
const mcpClient = yield* McpSchema.McpServerClient;
const reverseClient = yield* mcpClient.getClient;

const response = yield* reverseClient.elicit(
	new McpSchema.ElicitRequestURLParams({
		mode: 'url',
		message: 'Authorize access',
		elicitationId: 'authorization-1',
		url: 'https://example.com/authorize'
	})
);

const server = yield* McpServer.McpServer;
yield* server.notifyElicitationComplete({
	clientId: mcpClient.clientId,
	elicitationId: 'authorization-1'
});
```

### Sampling With Tools

Server-initiated sampling is available through the same scoped reverse client. The `tools`, `toolChoice`, `tool_use`, and `tool_result` shapes require `2025-11-25` and a client that advertises `sampling.tools`; Effect rejects unsupported requests before sending them.

```typescript
const mcpClient = yield* McpSchema.McpServerClient;
const reverseClient = yield* mcpClient.getClient;

const sampled = yield* reverseClient.createMessage(
	McpSchema.CreateMessage.payloadSchema.make({
		messages: [
			McpSchema.SamplingMessage.make({
				role: 'user',
				content: McpSchema.TextContent.make({ text: 'What is the weather?' })
			})
		],
		tools: [
			new McpSchema.Tool({
				name: 'weather',
				inputSchema: {
					type: 'object',
					properties: { city: { type: 'string' } },
					required: ['city']
				}
			})
		],
		toolChoice: new McpSchema.ToolChoice({ mode: 'required' }),
		maxTokens: 128
	})
);
```

The reverse client also gates `includeContext` on `sampling.context`. Unsupported reverse operations fail with `McpReverseOperationUnsupported`; projection or transport failures use `McpReverseOperationError`.

## Icons And Server Metadata

Server runners accept `description`, `websiteUrl`, and `icons`. Icons use `McpSchema.Icon` with `src` plus optional `mimeType`, `sizes`, and `theme`:

```typescript
const serverIcon = new McpSchema.Icon({
	src: 'https://example.com/server.svg',
	mimeType: 'image/svg+xml',
	sizes: ['48x48', 'any'],
	theme: 'dark'
});
```

`McpSchema.Resource`, `McpSchema.ResourceTemplate`, `McpSchema.Prompt`, and `McpSchema.Tool` also accept `icons`. Add descriptor icons through the low-level `McpServer` registration surface (`addResource`, `addResourceTemplate`, `addPrompt`, or `addTool`); the high-level `resource`, `prompt`, and Effect `Toolkit` adapters do not currently expose an icon option. Revisions that do not support icons omit them during protocol projection.

## Transport Layers

### stdio Transport

For CLI-based MCP servers (most common — used by Claude Desktop, etc.):

```typescript
// The Stdio requirement is satisfied by NodeStdio.layer
Layer.mergeAll(/* parts */).pipe(
	Layer.provide(
		McpServer.layerStdio({
			name: 'My Server',
			version: '1.0.0',
			protocols: [McpProtocol.v2025_11_25]
		})
	),
	Layer.provide(NodeStdio.layer),
	Layer.provide(Layer.succeed(Logger.LogToStderr)(true))
);
```

**Critical**: When using stdio transport, logs MUST go to stderr. Any stdout output interferes with protocol communication. Use `Logger.consolePretty({ stderr: true })` or `Logger.LogToStderr`.

### HTTP Transport

For web-based MCP servers using Streamable HTTP:

```typescript
McpServer.layerHttp({
	name: 'My MCP Server',
	version: '1.0.0',
	path: '/mcp',
	protocols: [McpProtocol.v2025_11_25]
});
```

- Requires `HttpRouter.HttpRouter` in the context
- Implements single-endpoint Streamable HTTP with JSON-RPC
- The `path` parameter sets the HTTP endpoint path
- Non-`initialize` HTTP requests with no session id return `400`; an unknown `Mcp-Session-Id` returns `404`. Clients must keep and resend the session id from initialization.

### Type signatures

```typescript
// stdio: requires Stdio service
layerStdio: (options: {
	name: string;
	version: string;
	description?: string;
	websiteUrl?: string;
	icons?: ReadonlyArray<McpSchema.Icon>;
	protocols: readonly [McpProtocol.ProtocolAdapter, ...Array<McpProtocol.ProtocolAdapter>];
	extensions?: NonNullable<typeof McpSchema.ServerCapabilities.Type['extensions']>;
}) => Layer.Layer<McpServer.McpServer | McpSchema.McpServerClient, Cause.IllegalArgumentError, Stdio>;

// HTTP: requires HttpRouter
layerHttp: (options: {
	name: string;
	version: string;
	path: HttpRouter.PathInput;
	description?: string;
	websiteUrl?: string;
	icons?: ReadonlyArray<McpSchema.Icon>;
	protocols: readonly [McpProtocol.ProtocolAdapter, ...Array<McpProtocol.ProtocolAdapter>];
	extensions?: NonNullable<typeof McpSchema.ServerCapabilities.Type['extensions']>;
	allowedOrigins?: ReadonlyArray<string>;
}) => Layer.Layer<McpServer.McpServer | McpSchema.McpServerClient, Cause.IllegalArgumentError, HttpRouter.HttpRouter>;
```

## Client Capabilities

Access the connecting client's capabilities from within tool/resource handlers:

```typescript
const caps = yield* McpServer.clientCapabilities;
// caps: ClientCapabilities
```

## Conditional Tool/Resource/Prompt Enabling

Use `McpSchema.EnabledWhen` to conditionally list prompts, resources, resource templates, or tools based on initialized client data. The filter runs against the client initialization payload.

```typescript
import { Context, Effect, Layer } from 'effect';
import { Schema } from 'effect';
import { McpSchema, McpServer, Tool } from 'effect/unstable/ai';

const requiresRoots = Context.make(
	McpSchema.EnabledWhen,
	(client) => client.capabilities.roots !== undefined
);

const ReadWorkspace = Tool.make('ReadWorkspace', {
	description: 'Read workspace roots when the client supports roots',
	success: Schema.String
}).annotateMerge(requiresRoots);

const WorkspacePrompt = McpServer.prompt({
	name: 'Workspace Summary',
	description: 'Summarize workspace roots',
	annotations: requiresRoots,
	content: () => Effect.succeed('Summarize the available workspace roots.')
});

const WorkspaceResource = Layer.effectDiscard(
	McpServer.registerResource({
		uri: 'workspace://roots',
		name: 'Workspace Roots',
		annotations: requiresRoots,
		content: Effect.succeed('[]')
	})
);
```

## Relationship to OpenAI MCP Tools

`McpServer` exposes a server that MCP clients connect to over stdio or HTTP. `OpenAiTool.Mcp` is different: it is an OpenAI provider-defined tool that lets an OpenAI model call a remote MCP server. When using OpenAI's hosted MCP integration, use the canonical `OpenAiMcp` custom name from `OpenAiTool.Mcp` and handle provider approval flow through normal tool approval request/response parts.

## Complete Example — stdio Server

```typescript
import { NodeRuntime, NodeStdio } from '@effect/platform-node';
import { Effect, Layer, Logger } from 'effect';
import { Schema } from 'effect';
import { McpProtocol, McpSchema, McpServer, Tool, Toolkit } from 'effect/unstable/ai';

// --- Tools ---
const GreetTool = Tool.make('GreetTool', {
	description: 'Generate a greeting',
	parameters: { name: Schema.String },
	success: Schema.String
});

const MyToolkit = Toolkit.make(GreetTool);

// --- Resources ---
const ReadmeResource = McpServer.resource({
	uri: 'file:///README.md',
	name: 'README',
	mimeType: 'text/markdown',
	content: Effect.succeed('# Demo MCP Server')
});

const idParam = McpSchema.param('id', Schema.NumberFromString);

const ItemResource = McpServer.resource`file://items/${idParam}`({
	name: 'Item',
	completion: { id: () => Effect.succeed([1, 2, 3]) },
	content: Effect.fn(function* (_uri, id) {
		return JSON.stringify({ id, name: `Item ${id}` });
	}),
	mimeType: 'application/json'
});

// --- Prompts ---
const HelpPrompt = McpServer.prompt({
	name: 'Help',
	description: 'Get help on a topic',
	parameters: { topic: Schema.String },
	completion: { topic: () => Effect.succeed(['setup', 'usage', 'api']) },
	content: ({ topic }) => Effect.succeed(`Help me understand ${topic}`)
});

// --- Server ---
const ServerLayer = Layer.mergeAll(
	ReadmeResource,
	ItemResource,
	HelpPrompt,
	McpServer.toolkit(MyToolkit).pipe(
		Layer.provideMerge(
			MyToolkit.toLayer({
				GreetTool: ({ name }) => Effect.succeed(`Hello, ${name}!`)
			})
		)
	)
).pipe(
	Layer.provide(
		McpServer.layerStdio({
			name: 'Demo MCP Server',
			version: '1.0.0',
			protocols: [McpProtocol.v2025_11_25]
		})
	),
	Layer.provide(NodeStdio.layer),
	Layer.provide(Logger.layer([Logger.consolePretty({ stderr: true })]))
);

Layer.launch(ServerLayer).pipe(NodeRuntime.runMain);
```

## Common Patterns

### Tool with effectful implementation

```typescript
const FetchTool = Tool.make('FetchData', {
	description: 'Fetch data from database',
	parameters: { id: Schema.String },
	success: Schema.String
});

const FetchToolkit = Toolkit.make(FetchTool);

// Tool handler can use services from the context
McpServer.toolkit(FetchToolkit).pipe(
	Layer.provideMerge(
		FetchToolkit.toLayer({
			FetchData: ({ id }) =>
				Effect.gen(function* () {
					const db = yield* DatabaseService;
					const result = yield* db.findById(id);
					return JSON.stringify(result);
				})
		})
	)
);
```

### Multiple toolkits

```typescript
const ServerLayer = Layer.mergeAll(
	McpServer.toolkit(ReadToolkit).pipe(
		Layer.provideMerge(
			ReadToolkit.toLayer({
				/* ... */
			})
		)
	),
	McpServer.toolkit(WriteToolkit).pipe(
		Layer.provideMerge(
			WriteToolkit.toLayer({
				/* ... */
			})
		)
	)
	// resources and prompts...
);
```

### Resource content from Effect services

```typescript
const ConfigResource = McpServer.resource({
	uri: 'app://config',
	name: 'App Config',
	content: Effect.gen(function* () {
		const config = yield* ConfigService;
		return JSON.stringify(yield* config.getAll());
	})
});
```

## Key Rules

1. **Always merge part layers with `Layer.mergeAll`** — resources, prompts, and toolkit layers are independent and produce `Layer<never, never, ...>`
2. **Provide transport last** — `Layer.provide(McpServer.layerStdio(...))` or `Layer.provide(McpServer.layerHttp(...))`
3. **stderr for stdio** — Never log to stdout when using stdio transport
4. **Toolkit pattern** — `McpServer.toolkit(tk).pipe(Layer.provideMerge(tk.toLayer({...})))` is the canonical pattern
5. **Schema for parameters** — All tool parameters and resource template params use Effect Schema
6. **`McpSchema.param`** — Use for resource URI template parameters with automatic string codec
7. **`Effect.fn`** — Use for resource template content handlers that receive multiple arguments
8. **Launch with `Layer.launch`** — The server runs as a long-lived layer: `Layer.launch(ServerLayer).pipe(NodeRuntime.runMain)`
9. **Declare protocols explicitly** — Pass a non-empty `protocols` array to every `run`, `layer`, `layerStdio`, or `layerHttp`; put the fallback revision first
10. **Gate reverse operations by negotiated capabilities** — Sampling tools and URL elicitation are `2025-11-25` features and fail before transport when unsupported
