---
name: effect-ai-chat
description: Build stateful AI chat sessions with the Effect Chat module. Use this skill when implementing multi-turn conversations, agentic tool-calling loops, chat persistence, streaming chat responses, or structured object generation within a conversation context.
---

You are an Effect TypeScript expert specializing in the `Chat` module for stateful AI conversations.

## Effect Source Reference

The Effect v4 source is available at `~/.cache/effect-v4/`.
Browse and read files there directly to look up APIs, types, and implementations.

Reference this for:

- Chat module source: `packages/effect/src/unstable/ai/Chat.ts`
- Chat usage examples: `ai-docs/src/71_ai/30_chat.ts`
- Tool integration examples: `ai-docs/src/71_ai/20_tools.ts`
- Prompt construction: `packages/effect/src/unstable/ai/Prompt.ts`

## Core Imports

```ts
import { Effect, Layer, Ref, Schema, Context, Stream } from 'effect';
import {
	Chat,
	Prompt,
	LanguageModel,
	Tool,
	Toolkit,
	AiError
} from 'effect/unstable/ai';
```

## What Chat Provides

The `Chat` module wraps `LanguageModel` with automatic conversation history management. Each `Chat` instance:

- Maintains a `Ref<Prompt.Prompt>` of accumulated messages
- Serializes calls via an internal semaphore (one generation at a time)
- Automatically appends user prompts and model responses to history
- Supports `generateText`, `streamText`, and `generateObject`
- Provides `export` / `exportJson` for serialization and `fromExport` / `fromJson` for restoration

## Creating Sessions

### Empty session

```ts
const session = yield* Chat.empty;
```

### With a system prompt

```ts
const session =
	yield*
	Chat.fromPrompt(
		Prompt.empty.pipe(Prompt.setSystem('You are a helpful assistant.'))
	);
```

### From raw message array

```ts
const session =
	yield*
	Chat.fromPrompt([
		{ role: 'system', content: 'You are an assistant that can use tools.' },
		{ role: 'user', content: 'Hello!' }
	]);
```

### From serialized JSON (restoring a session)

```ts
const session = yield* Chat.fromJson(savedJsonString);
// Or from structured data:
const session = yield* Chat.fromExport(savedData);
```

## Generating Text (Single Turn)

Call `session.generateText` with a prompt. The prompt is concatenated with accumulated history, sent to the model, and the response is appended to history automatically.

```ts
const response =
	yield*
	session
		.generateText({
			prompt: 'What is the capital of France?'
		})
		.pipe(Effect.provide(modelLayer));

// response.text — the model's text reply
// response.content — array of response parts
// response.toolCalls — any tool calls the model made
// response.toolResults — resolved tool results
```

### Providing the model

The `generateText` method requires `LanguageModel.LanguageModel` in its context. Provide it per-call or at the layer level:

```ts
// Per-call — allows switching models between turns
const modelLayer = OpenAiLanguageModel.model('gpt-5.2');
yield*
	session.generateText({ prompt: '...' }).pipe(Effect.provide(modelLayer));
```

### Passing prompt as string vs Prompt

The `prompt` option accepts `Prompt.RawInput` — a string, an iterable of encoded messages, or a `Prompt.Prompt`. Internally, `Prompt.make(options.prompt)` is called; strings become user text messages and encoded message iterables are decoded.

```ts
// String shorthand
yield* session.generateText({ prompt: 'Hello' });

// Empty prompt (continue from history alone, useful in agentic loops)
yield* session.generateText({ prompt: [] });
```

## Streaming Text

`streamText` returns a `Stream` of `Response.StreamPart` values. History is updated when the stream finalizes. Consume the stream to completion if the full assistant response should become history; if the stream is interrupted early, only the parts emitted before finalization are recorded.

```ts
yield*
	session
		.streamText({
			prompt: 'Write a story about space'
		})
		.pipe(
			Stream.runForEach((part) =>
				part.type === 'text-delta'
					? Effect.sync(() => process.stdout.write(part.delta))
					: Effect.void
			),
			Effect.provide(modelLayer)
		);
```

## Generating Structured Objects

`generateObject` forces the model to return data conforming to a schema:

```ts
const ContactSchema = Schema.Struct({
	name: Schema.String,
	email: Schema.String,
	phone: Schema.optional(Schema.String)
});

const result =
	yield*
	session
		.generateObject({
			prompt: 'Extract: John Doe, john@example.com, 555-1234',
			schema: ContactSchema
		})
		.pipe(Effect.provide(modelLayer));

// result.value — typed as { name: string; email: string; phone?: string }
```

## Conversation History

History is stored in `session.history`, a `Ref<Prompt.Prompt>`:

```ts
// Read current history
const history = yield* Ref.get(session.history);
console.log(`${history.content.length} messages in conversation`);

// Manually inspect messages
for (const msg of history.content) {
	console.log(msg.role, msg);
}
```

Use `Prompt.fromResponseParts(response.content)` when manually folding model output back into history. It preserves text and reasoning, tool calls/results, approval requests, uses encoded tool results for tool messages, and skips preliminary tool results.

## Persistence: Export and Restore

### Export to JSON

```ts
const json = yield* session.exportJson;
// json is a string — store in database, file system, localStorage, etc.
```

### Export to structured data

```ts
const data = yield* session.export;
// data is `unknown` — the raw encoded form
```

### Restore from JSON

```ts
const restored = yield* Chat.fromJson(json);
// Continue conversation from where it left off
yield* restored.generateText({ prompt: 'What were we discussing?' });
```

### Restore from structured data

```ts
const restored = yield* Chat.fromExport(data);
```

## Chat Persistence Service

For automatic persistence (save after every generation), use `Chat.Persistence`:

```ts
import { Persistence } from 'effect/unstable/persistence';

// Create a persistence layer and provide a BackingPersistence implementation
const PersistenceLayer = Chat.layerPersisted({ storeId: 'my-chats' }).pipe(
	Layer.provide(Persistence.layerBackingMemory)
);

// Usage
const program = Effect.gen(function* () {
	const persistence = yield* Chat.Persistence;

	// Get existing chat or create new one
	const chat = yield* persistence.getOrCreate('session-123', {
		timeToLive: '1 hour' // optional TTL
	});

	// chat is a `Chat.Persisted` — same API as Chat.Service but auto-saves
	const response = yield* chat
		.generateText({
			prompt: 'Hello!'
		})
		.pipe(Effect.provide(modelLayer));

	// History is automatically saved to the backing store after generation

	// Manual save if needed
	yield* chat.save;
});
```

The `Persisted` interface extends `Chat.Service` with:

- `id: string` — the chat identifier in the store
- `save: Effect<void, AiError | PersistenceError>` — manual save trigger

Provide a `Persistence.BackingPersistence` implementation (e.g., key-value store, database adapter) to the persistence layer.

## Tool Integration (Agentic Loops)

Pass a toolkit to `generateText` to enable tool calling. The Chat module manages the full conversation context including tool call/result messages.

### Define tools and toolkit

```ts
const Tools = Toolkit.make(
	Tool.make('getCurrentTime', {
		description: 'Get the current time in ISO format',
		parameters: Schema.Struct({ id: Schema.String }),
		success: Schema.String
	})
);

const ToolsLayer = Tools.toLayer(
	Effect.gen(function* () {
		return Tools.of({
			getCurrentTime: Effect.fn('Tools.getCurrentTime')(function* (_) {
				const now = yield* DateTime.now;
				return DateTime.formatIso(now);
			})
		});
	})
);
```

### Agentic loop pattern

The model calls tools, results are added to history, and you loop until the model returns a final text answer:

```ts
const agent = Effect.fn('agent')(function* (question: string) {
	const tools = yield* Tools;
	const session = yield* Chat.fromPrompt([
		{ role: 'system', content: 'You are an assistant that can use tools.' },
		{ role: 'user', content: question }
	]);

	let nextPrompt: Prompt.RawInput = [];

	while (true) {
		const response = yield* session
			.generateText({
				prompt: nextPrompt, // Empty after the first turn unless approving tools
				toolkit: tools // Provide tools for this turn
			})
			.pipe(Effect.provide(modelLayer));

		nextPrompt = [];

		const approvalRequests = response.content.filter(
			(part) => part.type === 'tool-approval-request'
		);
		if (approvalRequests.length > 0) {
			// Append approval responses as a tool message, then call the model again.
			nextPrompt = [
				Prompt.toolMessage({
					content: approvalRequests.map((request) =>
						Prompt.toolApprovalResponsePart({
							approvalId: request.approvalId,
							approved: true // Or false with a reason from policy/user review
						})
					)
				})
			];
			continue;
		}

		if (response.toolCalls.length > 0) {
			// Tools were called — results are already in history.
			// Loop back so the model can see the results and decide next step.
			continue;
		}
		// No tool calls or approval requests — model returned a final answer.
		return response.text;
	}
});
```

Key points:

- Pass `prompt: []` (empty) after the first turn — the model already has the full conversation in history
- The `toolkit` option makes tools available to the model
- Tool calls and final tool results are automatically appended to history by `generateText`
- If a tool has `needsApproval`, the response may contain `tool-approval-request`; append `Prompt.toolApprovalResponsePart` in a tool message and call the model again
- The loop continues until the model stops calling tools and has no pending approvals

### Registry-Backed Tool Loops

In production coding-agent harnesses, a `ToolRegistry` service often sits above the raw toolkit. Let the registry decide which tools are available, how they are described, and which runtime policy applies for the current agent/session.

```typescript
const registry = yield* ToolRegistry.Service;
const toolkit = yield* registry.toolkitFor(agentName);
const promptBlock = yield* registry.descriptionBlock(agentName);

const session =
	yield* Chat.fromPrompt(Prompt.empty.pipe(Prompt.setSystem(promptBlock)));
```

Prefer overriding registry handles or test layers in tests rather than spying on tool modules directly. That keeps tests aligned with production wiring.

## Wrapping Chat in a Domain Service

Use `Context.Service` to expose a clean domain API:

```ts
class AiAssistantError extends Schema.TaggedErrorClass<AiAssistantError>()(
	'AiAssistantError',
	{
		reason: AiError.AiErrorReason
	}
) {
	static fromAiError(error: AiError.AiError) {
		return new AiAssistantError({ reason: error.reason });
	}
}

class AiAssistant extends Context.Service<
	AiAssistant,
	{
		chat(message: string): Effect.Effect<string, AiAssistantError>;
		agent(question: string): Effect.Effect<string, AiAssistantError>;
	}
>()('acme/AiAssistant') {
	static readonly layer = Layer.effect(
		AiAssistant,
		Effect.gen(function* () {
			const model = OpenAiLanguageModel.model('gpt-5.2');
			const modelLayer = yield* model.captureRequirements;

			// Session lives for the lifetime of the service
			const session = yield* Chat.fromPrompt(
				Prompt.empty.pipe(
					Prompt.setSystem('You are a helpful assistant.')
				)
			);

			const chat = Effect.fn('AiAssistant.chat')(
				function* (message: string) {
					const response = yield* session
						.generateText({
							prompt: message
						})
						.pipe(Effect.provide(modelLayer));
					return response.text;
				},
				Effect.mapError((error) => AiAssistantError.fromAiError(error))
			);

			const tools = yield* Tools;
			const agent = Effect.fn('AiAssistant.agent')(
				function* (question: string) {
					const agentSession = yield* Chat.fromPrompt([
						{
							role: 'system',
							content: 'You are an assistant that can use tools.'
						},
						{ role: 'user', content: question }
					]);
					while (true) {
						const response = yield* agentSession
							.generateText({
								prompt: [],
								toolkit: tools
							})
							.pipe(Effect.provide(modelLayer));
						if (response.toolCalls.length > 0) continue;
						return response.text;
					}
				},
				Effect.catchTag(
					'AiError',
					(error) => Effect.fail(AiAssistantError.fromAiError(error)),
					(e) => Effect.die(e)
				)
			);

			return AiAssistant.of({ chat, agent });
		})
	).pipe(Layer.provide([OpenAiClientLayer, ToolsLayer]));
}
```

## Error Handling

Chat operations produce `AiError.AiError` errors. Use `catchTag` with the three-argument form (v4 pattern):

```ts
Effect.catchTag(
	'AiError',
	(aiError) => Effect.fail(new MyDomainError({ reason: aiError.reason })),
	(unexpectedError) => Effect.die(unexpectedError)
);
```

`Chat.fromJson` and `Chat.fromExport` produce `Schema.SchemaError` if the data is malformed.

## Concurrency

Each `Chat` instance uses an internal semaphore with 1 permit, ensuring that only one generation runs at a time per session. This prevents race conditions on the shared history ref. Create separate `Chat` instances for parallel conversations.

## Critical Rules

1. **Always provide `LanguageModel.LanguageModel`** — `generateText`, `streamText`, and `generateObject` all require it in context. Provide via `Effect.provide(modelLayer)`.
2. **Use `prompt: []` in agentic loops** — After the initial prompt, pass an empty prompt to let the model respond based on accumulated history including tool results.
3. **Import from `effect/unstable/ai`** — Chat, Prompt, Tool, Toolkit, LanguageModel, and AiError all come from this path.
4. **One session = one conversation** — Create separate `Chat` instances for independent conversations. Don't share a session across unrelated threads.
5. **Export before shutdown** — Use `exportJson` to persist state. Restore with `Chat.fromJson`.
6. **Provide toolkit handlers** — When using tools, the toolkit's handler layer must be provided (e.g., `Layer.provide(ToolsLayer)`).

## Anti-Patterns

- **Don't manually manage history** — Let Chat handle prompt concatenation. Don't manually `Ref.set` the history unless you have a specific advanced use case.
- **Don't use `LanguageModel.generateText` directly for multi-turn** — Use `Chat` instead; it handles history accumulation automatically.
- **Don't forget to provide the model layer** — Every `generateText`/`streamText`/`generateObject` call requires `LanguageModel.LanguageModel` in context.
- **Don't create a Chat per request if you want continuity** — Keep the session alive across turns for multi-turn conversation.
