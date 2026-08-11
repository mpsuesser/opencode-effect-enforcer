---
name: effect-ai-language-model
description: Master the Effect AI LanguageModel service for text generation, structured output, streaming, and tool calling. Use when working with LLM interactions, schema-validated responses, or building conversational AI systems.
---

# Effect AI Language Model

Pattern guide for working with the LanguageModel service from Effect AI for type-safe LLM interactions with Effect's functional patterns.

## Import Patterns

**CRITICAL**: Always use namespace imports:

```typescript
import * as LanguageModel from 'effect/unstable/ai/LanguageModel';
import * as Prompt from 'effect/unstable/ai/Prompt';
import * as Response from 'effect/unstable/ai/Response';
import * as Toolkit from 'effect/unstable/ai/Toolkit';
import * as Tool from 'effect/unstable/ai/Tool';
import * as Effect from 'effect/Effect';
import * as Stream from 'effect/Stream';
import * as Schema from 'effect/Schema';
```

## When to Use This Skill

- Generating text completions from language models
- Extracting structured data with schema validation
- Real-time streaming responses for chat interfaces
- Tool calling and function execution
- Multi-turn conversations with history
- Switching between different AI providers

## Service Interface

```haskell
LanguageModel :: Service

-- Core operations
generateText   :: Options → Effect GenerateTextResponse E R
generateObject :: Options → Schema A → Effect (GenerateObjectResponse A) E R
streamText     :: Options → Stream StreamPart E R

-- Service as dependency (LanguageModel is both a namespace and a service tag)
LanguageModel ∈ R → Effect.gen(function*() {
  -- Option A: use static accessors (adds LanguageModel to R automatically)
  const response = yield* LanguageModel.generateText(options)
  -- Option B: yield the tag explicitly
  const model = yield* LanguageModel.LanguageModel
  const response = yield* model.generateText(options)
})
```

## generateText Pattern

Basic text generation with optional tool calling:

```typescript
import * as LanguageModel from 'effect/unstable/ai/LanguageModel';
import * as Effect from 'effect/Effect';

// Simple text generation
const simple = LanguageModel.generateText({
	prompt: 'Explain quantum computing'
});

// With system prompt and conversation history
const withHistory = LanguageModel.generateText({
	prompt: [
		{ role: 'system', content: 'You are a helpful assistant' },
		{ role: 'user', content: [{ type: 'text', text: 'Hello!' }] }
	]
});

// With toolkit for tool calling
const withTools = LanguageModel.generateText({
	prompt: "What's the weather in SF?",
	toolkit: weatherToolkit,
	toolChoice: 'auto' // "none" | "required" | { tool: "name" } | { oneOf: [...] }
});

// Parallel tool call execution
const withConcurrency = LanguageModel.generateText({
	prompt: 'Search multiple sources',
	toolkit: searchToolkit,
	concurrency: 'unbounded' // or number for limited parallelism
});

// Disable automatic tool call resolution
const manualTools = LanguageModel.generateText({
	prompt: 'Search for X',
	toolkit: searchToolkit,
	disableToolCallResolution: true // Get tool calls without executing
});
```

### Response Accessors

```typescript
const response = yield* LanguageModel.generateText({ prompt: '...' });

response.text; // string - concatenated text content
response.toolCalls; // Array<ToolCallParts> - tool invocations
response.toolResults; // Array<ToolResultParts> - tool outputs
response.finishReason; // "stop" | "length" | "content-filter" | "tool-calls" | "error" | "pause" | "unknown" | "other"
response.usage; // Usage object with nested structure, e.g. response.usage.outputTokens.total
response.reasoning; // Array<ReasoningPart> - reasoning steps (when model provides extended thinking)
response.reasoningText; // string | undefined - concatenated reasoning content
```

`response.text` concatenates text parts only. Inspect `response.content` when you need reasoning, files/sources, metadata, finish/usage, provider errors, tool calls/results, or `tool-approval-request` parts.

With toolkit auto-resolution enabled, normal framework tool calls run and return `tool-result` parts. Tools with `needsApproval` return `tool-approval-request` until the next prompt supplies a matching `Prompt.toolApprovalResponsePart`; approved calls execute, and denied calls become `execution-denied` tool results.

## generateObject Pattern (Structured Output)

Force schema-validated output from the model:

```typescript
import * as LanguageModel from 'effect/unstable/ai/LanguageModel';
import * as Schema from 'effect/Schema';
import * as Effect from 'effect/Effect';

// Define output schema
const ContactSchema = Schema.Struct({
	name: Schema.String,
	email: Schema.String,
	phone: Schema.optional(Schema.String)
});

// Generate structured output
const extractContact = LanguageModel.generateObject({
	prompt: 'Extract: John Doe, john@example.com, 555-1234',
	schema: ContactSchema,
	objectName: 'contact' // Optional, aids model understanding
});

// Usage
const program = Effect.gen(function* () {
	const response = yield* extractContact;

	response.value; // { name: "John Doe", email: "john@example.com", phone: "555-1234" }
	response.text; // Raw generated text (JSON)
	response.usage; // Token usage stats

	return response.value;
});
```

### Schema-driven ADT extraction

```typescript
const EventType = Schema.TaggedStruct('EventType', {
	_tag: Schema.Literals(['meeting', 'deadline', 'reminder']),
	title: Schema.String,
	date: Schema.String
});

const extractEvent = LanguageModel.generateObject({
	prompt: 'Parse: Team meeting on March 15th',
	schema: EventType
});
```

## streamText Pattern

Real-time streaming text generation:

```typescript
import * as LanguageModel from 'effect/unstable/ai/LanguageModel';
import * as Stream from 'effect/Stream';
import * as Effect from 'effect/Effect';
import * as Console from 'effect/Console';

// Basic streaming
const streamStory = LanguageModel.streamText({
	prompt: 'Write a story about space exploration'
});

// Process stream parts
const program = streamStory.pipe(
	Stream.runForEach((part) => {
		if (part.type === 'text-delta') {
			return Console.log(part.delta);
		}
		if (part.type === 'tool-params-delta') {
			return Console.log('Tool params:', part.paramsDelta);
		}
		return Effect.void;
	})
);
```

### Common StreamPart Types

```haskell
Common StreamPart shapes include (non-exhaustive):
  | { type: "text-start", id }
  | { type: "text-delta", id, delta }
  | { type: "text-end", id }
  | { type: "reasoning-start", id }
  | { type: "reasoning-delta", id, delta }
  | { type: "reasoning-end", id }
  | { type: "tool-params-start", id, name }
  | { type: "tool-params-delta", id, paramsDelta }
  | { type: "tool-params-end", id }
  | { type: "tool-call", id, name, params }
  | { type: "tool-result", id, name, result, isFailure, preliminary? }
  | { type: "tool-approval-request", approvalId, toolCallId }
  | { type: "finish", reason: FinishReason, usage: Usage }
  | { type: "error", error: AiError }
```

Streaming text, reasoning, and tool parameters use matching `id` values across start/delta/end. Providers must not emit standalone `text-delta` parts without a preceding `text-start` and following `text-end`. The full upstream union also includes `file`, document and URL `source`, and `response-metadata` parts.

### Stream Processing Patterns

```typescript
// Collect all text deltas
const collectText = streamText.pipe(
	Stream.filter((part) => part.type === 'text-delta'),
	Stream.map((part) => part.delta),
	Stream.runFold('', (acc, delta) => acc + delta)
);

// Process chunks efficiently
const processChunks = streamText.pipe(
	Stream.mapChunksEffect((chunk) =>
		Effect.gen(function* () {
			const parts = Array.from(chunk);
			// Process batch of parts
			yield* handleBatch(parts);
			return chunk;
		})
	)
);

// Aggregate response with side effects
let combined: Array<StreamPart> = [];
const aggregated = streamText.pipe(
	Stream.mapChunks((chunk) => {
		combined = [...combined, ...chunk];
		return chunk;
	}),
	Stream.ensuring(
		Effect.sync(() => {
			// Finalization logic with full response
			console.log('Total parts:', combined.length);
		})
	)
);
```

## toolChoice Options

Control when and which tools the model can use:

```typescript
// Auto-decide (default)
toolChoice: "auto"  // Model decides whether to call tools

// Never use tools
toolChoice: "none"  // Force text-only response

// Must use a tool
toolChoice: "required"  // Model must call at least one tool

// Specific tool required
toolChoice: { tool: "search" }  // Must call "search" tool

// Restricted subset - auto mode
toolChoice: {
  oneOf: ["search", "calculate"]  // Can use these tools or respond with text
}

// Restricted subset - required mode
toolChoice: {
  mode: "required",
  oneOf: ["search", "calculate"]  // Must call one of these tools
}
```

## Error Handling

```typescript
import * as AiError from 'effect/unstable/ai/AiError';

const robust = LanguageModel.generateText({
	prompt: 'Analyze this...'
}).pipe(
	Effect.catchTag('AiError', (error) => {
		// Handle all AI errors — match on error.reason._tag for specific cases:
		// "RateLimitError", "InvalidOutputError", "StructuredOutputError",
		// "AuthenticationError", "ContentPolicyError", etc.
		return Effect.succeed(fallbackResponse);
	})
);
```

## Type Extraction Utilities

```typescript
import type * as LanguageModel from 'effect/unstable/ai/LanguageModel';

// Extract error types from options
type MyError = LanguageModel.ExtractError<typeof options>;

// Extract service requirements from options
type MyRequirements = LanguageModel.ExtractServices<typeof options>;

// Inferred based on:
// - toolkit: Toolkit.WithHandler<Tools> → Tool.HandlerError<Tools> ∈ E
// - toolkit: Effect<Toolkit, E, R> → E | Tool.HandlerError<Tools> ∈ E, R ∈ R
// - disableToolCallResolution: true → no Tool.HandlerError in E
```

## Provider Implementation Pattern

Create custom LanguageModel providers using `LanguageModel.make`:

```haskell
make :: ConstructorParams → Effect Service
```

When implementing a custom LanguageModel provider, return encoded parts: `Array<Response.PartEncoded>` for `generateText` and `Stream<Response.StreamPartEncoded>` for `streamText`. If you emit `response-metadata`, encode timestamps as ISO strings. Providers that support provider-side conversations should honor `ProviderOptions.previousResponseId` and `ProviderOptions.incrementalPrompt`; providers that cannot should intentionally ignore them.

```typescript
import * as LanguageModel from 'effect/unstable/ai/LanguageModel';
import * as Response from 'effect/unstable/ai/Response';

const makeCustomProvider = Effect.gen(function* () {
	const service = yield* LanguageModel.make({
		generateText: (options: LanguageModel.ProviderOptions) =>
			Effect.gen(function* () {
				// options.prompt: Prompt.Prompt
				// options.tools: ReadonlyArray<Tool.Any>
				// options.toolChoice: ToolChoice<any>
				// options.responseFormat: { type: "text" } | { type: "json", schema, objectName }
				// options.span: Span (for telemetry)
				// options.previousResponseId: string | undefined
				// options.incrementalPrompt: Prompt.Prompt | undefined

				const result = yield* callProviderAPI(options);

				// Return Response.PartEncoded[]
				return [
					Response.makePart('text', { text: result.content }),
					Response.makePart('finish', {
						reason: 'stop',
						usage: new Response.Usage({
							inputTokens: {
								total: result.usage.input,
								uncached: undefined,
								cacheRead: undefined,
								cacheWrite: undefined
							},
							outputTokens: {
								total: result.usage.output,
								text: undefined,
								reasoning: undefined
							}
						}),
						response: undefined
					})
				];
			}),

		streamText: (_options: LanguageModel.ProviderOptions) => {
			const textId = 'custom-text-1';
			return Stream.fromIterable<Response.StreamPartEncoded>([
				{ type: 'text-start', id: textId },
				{ type: 'text-delta', id: textId, delta: 'Hello' },
				{ type: 'text-delta', id: textId, delta: ' world' },
				{ type: 'text-end', id: textId },
				Response.makePart('finish', {
					reason: 'stop',
					usage: new Response.Usage({
						inputTokens: {
							total: undefined,
							uncached: undefined,
							cacheRead: undefined,
							cacheWrite: undefined
						},
						outputTokens: {
							total: undefined,
							text: undefined,
							reasoning: undefined
						}
					}),
					response: undefined
				})
			]);
		}
	});

	return service;
});
```

## Common Patterns

### Multi-turn with context

```typescript
const conversation = Effect.gen(function* () {
	let history: Prompt.Prompt = Prompt.empty;

	const ask = (message: string) =>
		Effect.gen(function* () {
			const prompt = Prompt.concat(history, Prompt.make(message));
			const response = yield* LanguageModel.generateText({ prompt });
			history = Prompt.concat(
				prompt,
				Prompt.fromResponseParts(response.content)
			);
			return response.text;
		});

	const answer1 = yield* ask('What is TypeScript?');
	const answer2 = yield* ask('How does it differ from JavaScript?');

	return { answer1, answer2 };
});
```

### Parallel requests

```typescript
const parallel = Effect.all(
	[
		LanguageModel.generateText({ prompt: 'Summarize A' }),
		LanguageModel.generateText({ prompt: 'Summarize B' }),
		LanguageModel.generateText({ prompt: 'Summarize C' })
	],
	{ concurrency: 'unbounded' }
);
```

### Retry with backoff

```typescript
const resilient = LanguageModel.generateText({ prompt: '...' }).pipe(
	Effect.retry({
		times: 3,
		schedule: Schedule.exponential('100 millis')
	})
);
```

## Common Pitfall: LanguageModel Inside Services

`LanguageModel` is both a **namespace** (module with static functions) and a **service tag**. The static functions like `LanguageModel.generateText(...)` are accessors that add `LanguageModel` to the `R` context of the returned effect.

When calling `LanguageModel.generateText(...)` inside a service's layer construction, `LanguageModel` will leak into the service method's return type as a requirement, causing circular type issues.

```typescript
// ❌ WRONG — LanguageModel leaks into service method signatures
export class MyService extends Context.Service<
	MyService,
	{
		readonly doSomething: (text: string) => Effect.Effect<string, AiError>;
	}
>()('MyService') {
	// Using LanguageModel.generateText accessor adds LanguageModel to R
	static readonly layer = Layer.effect(
		this,
		Effect.gen(function* () {
			const doSomething = Effect.fn('MyService.doSomething')(
				(text: string): Effect.Effect<string, AiError> =>
					// This adds LanguageModel to R, making the method signature wrong
					LanguageModel.generateText({ prompt: text }).pipe(
						Effect.map((r) => r.text)
					)
			);
			return { doSomething };
		})
	);
}

// ✅ CORRECT — Capture LanguageModel in the closure, expose clean signatures
export class MyService extends Context.Service<
	MyService,
	{
		readonly doSomething: (text: string) => Effect.Effect<string, AiError>;
	}
>()('MyService') {
	static readonly layer = Layer.effect(
		this,
		Effect.gen(function* () {
			// Yield the service tag at construction time — captured in closure
			const lm = yield* LanguageModel.LanguageModel;

			const doSomething = Effect.fn('MyService.doSomething')(
				(text: string): Effect.Effect<string, AiError> =>
					lm
						.generateText({ prompt: text })
						.pipe(Effect.map((r) => r.text))
			);
			return { doSomething };
		})
	);
}
```

**Alternative**: If the service method SHOULD require `LanguageModel` in its context (caller provides it), that's fine — just be explicit about it in the return type:

```typescript
const doSomething = Effect.fn('MyService.doSomething')(
	(
		text: string
	): Effect.Effect<string, AiError, LanguageModel.LanguageModel> =>
		LanguageModel.generateText({ prompt: text }).pipe(
			Effect.map((r) => r.text)
		)
);
```

## Anti-patterns

```typescript
// ❌ yield* LanguageModel (namespace, not the tag)
const model = yield* LanguageModel  // ERROR: LanguageModel is a namespace

// ✅ yield* LanguageModel.LanguageModel (the actual service tag)
const model = yield* LanguageModel.LanguageModel

// ❌ Nested callbacks
LanguageModel.generateText({ prompt: "A" }).pipe(
  Effect.flatMap((r1) =>
    LanguageModel.generateText({ prompt: "B" }).pipe(
      Effect.flatMap((r2) => ...)
    )
  )
)

// ✅ Effect.gen
Effect.gen(function* () {
  const r1 = yield* LanguageModel.generateText({ prompt: "A" })
  const r2 = yield* LanguageModel.generateText({ prompt: "B" })
  return combine(r1, r2)
})

// ❌ Manual error construction
Effect.fail(new Error("Failed"))

// ✅ Tagged errors
Effect.fail(AiError.make({
  module: "MyService",
  method: "generate",
  reason: new AiError.UnknownError({ description: "Failed" })
}))

// ❌ Promise-based streaming
streamText.pipe(Stream.runCollect, Effect.map(toPromise))

// ✅ Effect-based consumption
streamText.pipe(Stream.runForEach(processPart))

// ❌ Ignoring finishReason
const text = response.text  // May be truncated

// ✅ Check finish reason
if (response.finishReason === "length") {
  // Handle truncation
}
```

## Quality Checklist

- [ ] Use `generateText` for single-turn completions
- [ ] Use `generateObject` with Schema for structured output
- [ ] Use `streamText` for real-time streaming responses
- [ ] Check `finishReason` to detect truncation
- [ ] Handle errors with `catchTag("AiError", ...)`
- [ ] Use `Effect.gen` over flatMap chains
- [ ] Access service via `yield* LanguageModel.LanguageModel` (tag) or use static accessors like `LanguageModel.generateText`
- [ ] Provide toolkit for tool calling
- [ ] Set appropriate `toolChoice` mode
- [ ] Use `concurrency` for parallel tool execution

## v4 Features

### ExecutionPlan (Multi-Provider Fallback)

Use `ExecutionPlan` from `effect/ExecutionPlan` to define multi-provider fallback strategies:

```typescript
import * as ExecutionPlan from 'effect/ExecutionPlan';

const plan = ExecutionPlan.make(
	{ provide: AnthropicLayer, attempts: 3 },
	{ provide: OpenAILayer, attempts: 2 }
);
```

This allows automatic failover between providers with configurable retry attempts per provider.

### Model.ProviderName

Inside an effect that runs with a language model provider, you can retrieve the current provider name:

```typescript
import * as Model from 'effect/unstable/ai/Model';

const program = Effect.gen(function* () {
	const providerName = yield* Model.ProviderName;
	yield* Effect.log(`Using provider: ${providerName}`);
});
```

## Related Skills

- effect-ai-prompt - Constructing and composing prompts
- effect-ai-tool - Creating tools and toolkits
- effect-ai-streaming - Processing stream responses
- effect-ai-provider - Configuring provider layers

## References

- Source: `packages/effect/src/unstable/ai/LanguageModel.ts`
- Chat integration: `packages/effect/src/unstable/ai/Chat.ts`
- Response types: `effect/unstable/ai/Response`
- Tool system: `effect/unstable/ai/Tool`, `effect/unstable/ai/Toolkit`
