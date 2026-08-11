---
name: effect-ai-provider
description: Configure and compose AI provider layers using @effect/ai packages. Covers Anthropic, OpenAI, OpenAI-Compat, and OpenRouter providers with config management, model abstraction, ExecutionPlan fallback, and runtime overrides for language model integration.
---

# Effect AI Provider

Configure AI provider layers for language model integration using Effect's AI ecosystem.

## When to Use This Skill

Use this skill when:

- Integrating AI language models (Anthropic, OpenAI, OpenRouter, etc.) into Effect applications
- Setting up multi-provider AI architectures with ExecutionPlan fallback
- Implementing stateful chat conversations with context history
- Managing AI provider configuration and API keys securely
- Composing AI capabilities with other Effect services

## Import Patterns

**CRITICAL**: Always use namespace imports. Use `{ }` destructured imports for the `effect` package barrel exports.

```typescript
// From the "effect" barrel — destructured
import {
	Config,
	Effect,
	ExecutionPlan,
	Layer,
	Ref,
	Schema,
	Context,
	Stream
} from 'effect';

// From "effect/unstable/ai" — namespace imports
import {
	AiError,
	Chat,
	LanguageModel,
	Model,
	Prompt,
	Tool,
	Toolkit
} from 'effect/unstable/ai';
// Or individually:
import * as LanguageModel from 'effect/unstable/ai/LanguageModel';
import * as Chat from 'effect/unstable/ai/Chat';
import * as Model from 'effect/unstable/ai/Model';
import * as Prompt from 'effect/unstable/ai/Prompt';
import * as AiError from 'effect/unstable/ai/AiError';

// Anthropic
import { AnthropicClient, AnthropicLanguageModel } from '@effect/ai-anthropic';

// OpenAI
import {
	OpenAiClient,
	OpenAiClientGenerated,
	OpenAiLanguageModel,
	OpenAiSchema,
	OpenAiTool
} from '@effect/ai-openai';

// OpenRouter
import {
	OpenRouterClient,
	OpenRouterLanguageModel
} from '@effect/ai-openrouter';

// HTTP client (required by all providers)
import { FetchHttpClient } from 'effect/unstable/http';
```

## Provider Layer Pattern

Every provider exposes two constructors:

- **`model(modelId, config?)`** — returns a `Model.Model` (preferred for `ExecutionPlan` and `Effect.provide`)
- **`layer({ model, config? })`** — returns a raw `Layer<LanguageModel.LanguageModel, never, Client>`

```haskell
-- Model constructor (preferred)
ProviderLanguageModel.model :: (modelId, config?) → Model.Model<providerName, LanguageModel, Client>

-- Layer constructor
ProviderLanguageModel.layer :: { model, config? } → Layer LanguageModel Client

-- Client layer
ProviderClient.layerConfig :: { apiKey } → Layer Client HttpClient
```

## Anthropic Provider

```typescript
import { AnthropicClient, AnthropicLanguageModel } from '@effect/ai-anthropic';
import { Config, Layer } from 'effect';
import { FetchHttpClient } from 'effect/unstable/http';

// Client layer (reusable across models)
const AnthropicClientLayer = AnthropicClient.layerConfig({
	apiKey: Config.redacted('ANTHROPIC_API_KEY')
}).pipe(Layer.provide(FetchHttpClient.layer));

// Option A: model() — returns Model.Model (preferred)
const claudeModel = AnthropicLanguageModel.model('claude-opus-4-6');
// Use with: Effect.provide(claudeModel) or in ExecutionPlan

// Option B: layer() — returns raw Layer<LanguageModel>
const AnthropicLive = AnthropicLanguageModel.layer({
	model: 'claude-sonnet-4-20250514'
}).pipe(Layer.provide(AnthropicClientLayer));
```

## OpenAI Provider

```typescript
import { OpenAiClient, OpenAiLanguageModel } from '@effect/ai-openai';
import { Config, Layer } from 'effect';
import { FetchHttpClient } from 'effect/unstable/http';

const OpenAiClientLayer = OpenAiClient.layerConfig({
	apiKey: Config.redacted('OPENAI_API_KEY')
}).pipe(Layer.provide(FetchHttpClient.layer));

// model() constructor (preferred)
const gptModel = OpenAiLanguageModel.model('gpt-5.2');

// layer() constructor
const OpenAiLive = OpenAiLanguageModel.layer({
	model: 'gpt-4.1'
}).pipe(Layer.provide(OpenAiClientLayer));
```

Public OpenAI modules:

- `OpenAiSchema` — typed Responses API request/response and SSE event schemas
- `OpenAiClient` — handwritten service with `createResponse`, `createResponseStream`, and `createEmbedding`
- `OpenAiClientGenerated` — generated direct endpoint access when you need raw OpenAI API coverage
- `OpenAiTool` — OpenAI provider-defined tools for native capabilities

```typescript
const client = yield* OpenAiClient.OpenAiClient;
const [body] = yield* client.createResponse({
	model: 'gpt-4.1',
	input: 'Say hello'
});
```

### OpenAI Provider-Defined Tools

Use `OpenAiTool` for OpenAI-native tools instead of hand-rolling provider-defined descriptors:

```typescript
const NativeTools = Toolkit.make(
	OpenAiTool.WebSearch({}),
	OpenAiTool.FileSearch({ vector_store_ids: ['vs_123'] }),
	OpenAiTool.Mcp({
		server_label: 'docs',
		server_url: 'https://mcp.example.com/mcp'
	})
);
```

Available hosted/provider tools include `WebSearch`, `CodeInterpreter`, `FileSearch`, `ImageGeneration`, and `Mcp` (`customName: "OpenAiMcp"`). MCP tool approval requests/results use this canonical `OpenAiMcp` name and the normal Effect AI approval request/response parts. Handler-required local tools such as `Shell`, `LocalShell`, and `ApplyPatch` run in your environment; provide handlers only behind explicit sandboxing, authorization, and audit policy.

## OpenAI-Compatible Providers

Use `apiUrl` with `@effect/ai-openai` for OpenAI-compatible APIs (Azure OpenAI, local models, etc.):

```typescript
import { OpenAiClient, OpenAiConfig } from '@effect/ai-openai';
import { Config, Layer } from 'effect';
import { FetchHttpClient, HttpClient, HttpClientRequest } from 'effect/unstable/http';

const CompatibleClientLayer = OpenAiClient.layerConfig({
	apiKey: Config.redacted('OPENAI_COMPAT_API_KEY'),
	apiUrl: Config.succeed('https://my-provider.example.com/v1')
}).pipe(Layer.provide(FetchHttpClient.layer));

// Keep withClientTransform for middleware/proxy/tracing/header transforms.
const withAuditHeader = OpenAiConfig.withClientTransform(
	HttpClient.mapRequest(HttpClientRequest.setHeader('x-audit-source', 'writer'))
);

const program = myEffect.pipe(withAuditHeader);
```

## OpenRouter Provider

Multi-provider access through unified interface:

```typescript
import {
	OpenRouterClient,
	OpenRouterLanguageModel
} from '@effect/ai-openrouter';
import { Config, Layer } from 'effect';
import { FetchHttpClient } from 'effect/unstable/http';

const OpenRouterClientLayer = OpenRouterClient.layerConfig({
	apiKey: Config.redacted('OPENROUTER_API_KEY')
}).pipe(Layer.provide(FetchHttpClient.layer));

// model() constructor — use provider-prefixed model IDs
const routerModel = OpenRouterLanguageModel.model('anthropic/claude-sonnet-4');
```

## ExecutionPlan (Multi-Provider Fallback)

`ExecutionPlan` defines a strategy for trying multiple providers with different configurations and retry counts:

```typescript
import { AnthropicClient, AnthropicLanguageModel } from '@effect/ai-anthropic';
import { OpenAiClient, OpenAiLanguageModel } from '@effect/ai-openai';
import { Effect, ExecutionPlan, Layer } from 'effect';
import { LanguageModel } from 'effect/unstable/ai';

// Try cheaper model first, fall back to more expensive one
const DraftPlan = ExecutionPlan.make(
	{
		provide: OpenAiLanguageModel.model('gpt-5.2'),
		attempts: 3 // retry up to 3 times before falling back
	},
	{
		provide: AnthropicLanguageModel.model('claude-opus-4-6'),
		attempts: 2
	}
);

// Inside a Layer.effect, call captureRequirements to capture current services
const draftsModel = yield* DraftPlan.captureRequirements;
// This satisfies the plan's client requirements from the current context

// Apply the plan to an effect
const result = yield* myEffect.pipe(Effect.withExecutionPlan(draftsModel));
```

## Chat Service (Stateful Conversations)

Maintain conversation history with automatic context management:

```typescript
import { Effect, Ref } from 'effect';
import { Chat, Prompt } from 'effect/unstable/ai';

// Create with system prompt
const session =
	yield*
	Chat.fromPrompt(
		Prompt.empty.pipe(Prompt.setSystem('You are a helpful assistant.'))
	);

// Or create empty
const emptySession = yield* Chat.empty;

// Or from raw messages
const agentSession =
	yield*
	Chat.fromPrompt([
		{ role: 'system', content: 'You are an assistant.' },
		{ role: 'user', content: 'Hello' }
	]);

// Generate text (history is maintained automatically)
const response =
	yield*
	session
		.generateText({
			prompt: 'What is Effect?'
		})
		.pipe(Effect.provide(modelLayer));

// Access conversation history
const history = yield* Ref.get(session.history);

// Export for persistence
const json = yield* session.exportJson;

// Restore from persisted state
const restored = yield* Chat.fromJson(json);
```

## Config Override Pattern

Runtime configuration adjustment on a per-effect basis using `withConfigOverride` (dual API):

```typescript
import { AnthropicLanguageModel } from '@effect/ai-anthropic';

// Apply overrides to any effect that uses the LanguageModel
const result =
	yield*
	model.generateText({ prompt: '...' }).pipe(
		AnthropicLanguageModel.withConfigOverride({
			temperature: 0.7,
			max_tokens: 4096
		})
	);

// Also available for OpenAI:
import { OpenAiLanguageModel } from '@effect/ai-openai';

const result2 =
	yield*
	model.generateText({ prompt: '...' }).pipe(
		OpenAiLanguageModel.withConfigOverride({
			temperature: 0.9,
			reasoning: { effort: 'medium', summary: 'auto' },
			text: { verbosity: 'low' },
			strictJsonSchema: true,
			fileIdPrefixes: ['file-']
		})
	);
```

`OpenAiLanguageModel.Config` accepts Responses API request fields plus `fileIdPrefixes`, `text.verbosity`, restored `reasoning` config, and `strictJsonSchema`. Do not manually send library-only fields (`fileIdPrefixes`, `strictJsonSchema`) to OpenAI APIs; the language model strips them before request construction.

## Model.make — Model Abstraction

Wrap provider layers with metadata. Takes 3 positional arguments: `(providerName, modelId, layer)`:

```typescript
import { Model } from 'effect/unstable/ai';

// This is what ProviderLanguageModel.model() calls internally:
const Claude = Model.make(
	'anthropic', // provider name
	'claude-sonnet-4-20250514', // model identifier
	AnthropicLanguageModel.layer({ model: 'claude-sonnet-4-20250514' })
);
```

In practice, use the provider's `.model()` shorthand instead of calling `Model.make` directly:

```typescript
// Preferred — equivalent to Model.make("anthropic", "claude-opus-4-6", layer)
const claudeModel = AnthropicLanguageModel.model('claude-opus-4-6');
```

## Context.Service Pattern

Define services using the shape-as-type-parameter pattern:

```typescript
import { Effect, Context, Stream } from 'effect';

export class AiWriter extends Context.Service<
	AiWriter,
	{
		draftAnnouncement(
			product: string
		): Effect.Effect<string, AiWriterError>;
		streamHighlights(version: string): Stream.Stream<string, AiWriterError>;
	}
>()('myapp/AiWriter') {
	static readonly layer = Layer.effect(
		AiWriter,
		Effect.gen(function* () {
			const model = AnthropicLanguageModel.model('claude-opus-4-6');
			const modelLayer = yield* model.captureRequirements;

			const draftAnnouncement = Effect.fn('AiWriter.draftAnnouncement')(
				function* (product: string) {
					const lm = yield* LanguageModel.LanguageModel;
					const response = yield* lm.generateText({
						prompt: `Write a launch announcement for ${product}`
					});
					return response.text;
				},
				Effect.provide(modelLayer),
				Effect.mapError((e) => AiWriterError.fromAiError(e))
			);

			return AiWriter.of({ draftAnnouncement, streamHighlights });
		})
	).pipe(Layer.provide(AnthropicClientLayer));
}
```

## Custom Error Wrapping

Wrap `AiError` into domain-specific tagged errors:

```typescript
import { Schema } from 'effect';
import { AiError } from 'effect/unstable/ai';

export class MyAiError extends Schema.TaggedErrorClass<MyAiError>()(
	'MyAiError',
	{
		reason: AiError.AiErrorReason
	}
) {
	static fromAiError(error: AiError.AiError) {
		return new MyAiError({ reason: error.reason });
	}
}

// Usage: Effect.mapError((e) => MyAiError.fromAiError(e))
```

## Available Providers

| Package                 | Provider      | Models                                          |
| ----------------------- | ------------- | ----------------------------------------------- |
| `@effect/ai-anthropic`  | Anthropic     | Claude Opus 4, Claude Sonnet 4, etc.            |
| `@effect/ai-openai`     | OpenAI        | GPT-5, GPT-4.1, o-series, etc.                  |
| `@effect/ai-openai`     | OpenAI-Compat | Any OpenAI-compatible API via `apiUrl`          |
| `@effect/ai-openrouter` | OpenRouter    | Multi-provider proxy (any model ID)             |

**Note**: There are no `@effect/ai-google` or `@effect/ai-amazon-bedrock` packages. Use OpenRouter to access Google/Bedrock models.

## Complete Working Example

Full application with ExecutionPlan, Chat, and streaming:

```typescript
import { AnthropicClient, AnthropicLanguageModel } from '@effect/ai-anthropic';
import { OpenAiClient, OpenAiLanguageModel } from '@effect/ai-openai';
import {
	Config,
	Effect,
	ExecutionPlan,
	Layer,
	Ref,
	Schema,
	Context,
	Stream
} from 'effect';
import {
	AiError,
	Chat,
	LanguageModel,
	Model,
	Prompt,
	type Response
} from 'effect/unstable/ai';
import { FetchHttpClient } from 'effect/unstable/http';

// ---------------------------------------------------------------------------
// Provider client layers
// ---------------------------------------------------------------------------

const AnthropicClientLayer = AnthropicClient.layerConfig({
	apiKey: Config.redacted('ANTHROPIC_API_KEY')
}).pipe(Layer.provide(FetchHttpClient.layer));

const OpenAiClientLayer = OpenAiClient.layerConfig({
	apiKey: Config.redacted('OPENAI_API_KEY')
}).pipe(Layer.provide(FetchHttpClient.layer));

// ---------------------------------------------------------------------------
// ExecutionPlan — try cheap model first, fall back to expensive
// ---------------------------------------------------------------------------

const DraftPlan = ExecutionPlan.make(
	{ provide: OpenAiLanguageModel.model('gpt-5.2'), attempts: 3 },
	{ provide: AnthropicLanguageModel.model('claude-opus-4-6'), attempts: 2 }
);

// ---------------------------------------------------------------------------
// Custom error type
// ---------------------------------------------------------------------------

export class WriterError extends Schema.TaggedErrorClass<WriterError>()(
	'WriterError',
	{
		reason: AiError.AiErrorReason
	}
) {
	static fromAiError(error: AiError.AiError) {
		return new WriterError({ reason: error.reason });
	}
}

// ---------------------------------------------------------------------------
// Service definition
// ---------------------------------------------------------------------------

export class AiWriter extends Context.Service<
	AiWriter,
	{
		draft(
			product: string
		): Effect.Effect<{ provider: string; text: string }, WriterError>;
		chat(message: string): Effect.Effect<string, WriterError>;
		streamHighlights(version: string): Stream.Stream<string, WriterError>;
	}
>()('app/AiWriter') {
	static readonly layer = Layer.effect(
		AiWriter,
		Effect.gen(function* () {
			const draftsModel = yield* DraftPlan.captureRequirements;
			const chatModel = OpenAiLanguageModel.model('gpt-4.1');
			const chatModelLayer = yield* chatModel.captureRequirements;

			// --- Chat session with history ---
			const session = yield* Chat.fromPrompt(
				Prompt.empty.pipe(
					Prompt.setSystem('You are a helpful writing assistant.')
				)
			);

			const draft = Effect.fn('AiWriter.draft')(
				function* (product: string) {
					const provider = yield* Model.ProviderName;
					const lm = yield* LanguageModel.LanguageModel;
					const response = yield* lm.generateText({
						prompt: `Write a launch announcement for ${product}.`
					});
					return { provider, text: response.text };
				},
				Effect.withExecutionPlan(draftsModel),
				Effect.mapError((e) => WriterError.fromAiError(e))
			);

			const chat = Effect.fn('AiWriter.chat')(
				function* (message: string) {
					const response = yield* session
						.generateText({ prompt: message })
						.pipe(Effect.provide(chatModelLayer));
					const history = yield* Ref.get(session.history);
					yield* Effect.logInfo(
						`History: ${history.content.length} messages`
					);
					return response.text;
				},
				Effect.mapError((e) => WriterError.fromAiError(e))
			);

			const streamHighlights = (version: string) =>
				LanguageModel.streamText({
					prompt: `Release highlights for v${version} as bullets.`
				}).pipe(
					Stream.filter(
						(part): part is Response.TextDeltaPart =>
							part.type === 'text-delta'
					),
					Stream.map((part) => part.delta),
					Stream.provide(chatModelLayer),
					Stream.mapError((e) => WriterError.fromAiError(e))
				);

			return AiWriter.of({ draft, chat, streamHighlights });
		})
	).pipe(Layer.provide([OpenAiClientLayer, AnthropicClientLayer]));
}

// ---------------------------------------------------------------------------
// Usage
// ---------------------------------------------------------------------------

const program = Effect.gen(function* () {
	const writer = yield* AiWriter;
	const result = yield* writer.draft('Effect Cloud');
	yield* Effect.logInfo(`Provider: ${result.provider}, Text: ${result.text}`);
});

Effect.runPromise(program.pipe(Effect.provide(AiWriter.layer)));
```

## Anti-Patterns

```typescript
// WRONG: Hardcoded API keys
AnthropicClient.layerConfig({ apiKey: 'sk-...' });

// RIGHT: Config.redacted for secrets
AnthropicClient.layerConfig({ apiKey: Config.redacted('ANTHROPIC_API_KEY') });

// WRONG: Missing FetchHttpClient layer
AnthropicClient.layerConfig({ apiKey: Config.redacted('KEY') });
// Will fail at runtime — providers require an HttpClient

// RIGHT: Always provide an HTTP client layer
AnthropicClient.layerConfig({ apiKey: Config.redacted('KEY') }).pipe(
	Layer.provide(FetchHttpClient.layer)
);

// WRONG: Old Chat.make API
const chat = yield* Chat.make({ system: 'You are helpful' });

// RIGHT: Chat.fromPrompt with Prompt composition
const chat =
	yield*
	Chat.fromPrompt(Prompt.empty.pipe(Prompt.setSystem('You are helpful')));

// WRONG: Old Model.make API with object arg
Model.make({ name: 'claude', layer: AnthropicLive });

// RIGHT: Model.make with 3 positional args (or use .model() shorthand)
Model.make('anthropic', 'claude-opus-4-6', anthropicLayer);
// Better: AnthropicLanguageModel.model("claude-opus-4-6")

// WRONG: Importing non-existent providers
import { GoogleClient } from '@effect/ai-google'; // Does NOT exist
import { BedrockClient } from '@effect/ai-amazon-bedrock'; // Does NOT exist
```

## Quality Checklist

- [ ] Use `Config.redacted` for API keys (never hardcode)
- [ ] Provide `FetchHttpClient.layer` to all client layers
- [ ] Use `.model()` constructor for `ExecutionPlan` and `Effect.provide`
- [ ] Use `ExecutionPlan` for multi-provider fallback with retry
- [ ] Use `withConfigOverride` for per-effect config adjustments
- [ ] Use `apiUrl` for OpenAI-compatible base URLs; reserve client transforms for middleware/proxy/tracing/headers
- [ ] Use `OpenAiTool` for OpenAI provider-defined tools
- [ ] Use `Chat.fromPrompt` / `Chat.empty` / `Chat.fromJson` (not `Chat.make`)
- [ ] Wrap `AiError` into domain-specific `TaggedErrorClass`
- [ ] Use `Context.Service` with shape type parameter for service definitions

## Related Skills

- effect-ai-language-model - Using LanguageModel service for text/object/stream generation
- effect-ai-prompt - Building prompts with Prompt composition operators
- effect-ai-tool - Defining tools and toolkits for agentic loops
- effect-ai-streaming - Streaming response patterns and accumulation
- effect-layer-design - General Effect layer composition patterns

## References

- `packages/ai/anthropic/src/AnthropicLanguageModel.ts`
- `packages/ai/openai/src/OpenAiLanguageModel.ts`
- `packages/ai/openrouter/src/OpenRouterLanguageModel.ts`
- `ai-docs/src/71_ai/10_language-model.ts`
- `ai-docs/src/71_ai/30_chat.ts`
