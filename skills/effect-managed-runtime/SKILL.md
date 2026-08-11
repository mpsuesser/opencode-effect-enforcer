---
name: effect-managed-runtime
description: Bridge Effect services into non-Effect frameworks (Hono, Express, Fastify, Lambda, Workers) using ManagedRuntime. Use this skill when you need to run Effects outside of runMain — in HTTP handlers, serverless functions, or any embedded context where Effect doesn't own the process lifecycle.
---

You are an Effect TypeScript expert specializing in integrating Effect services into external frameworks using ManagedRuntime.

## Effect Source Reference

The Effect v4 source is available at `~/.cache/effect-v4/`.
Browse and read files there directly to look up APIs, types, and implementations.

Reference this for:

- `packages/effect/src/ManagedRuntime.ts` — full API surface
- `ai-docs/src/03_integration/10_managed-runtime.ts` — Hono integration example

## When to Use ManagedRuntime

Use ManagedRuntime when Effect does **not** own the process lifecycle. This is the bridge pattern — your domain logic lives in Effect services and layers, but the outer framework (Hono, Express, Fastify, Koa, AWS Lambda, Cloudflare Workers, etc.) controls the HTTP server, routing, and process lifecycle.

Typical scenarios:

- **Web frameworks**: Hono, Express, Fastify, Koa handlers that call Effect services
- **Serverless functions**: AWS Lambda, Cloudflare Workers, Vercel Edge Functions
- **Embedded contexts**: Running Effect inside a larger non-Effect application
- **Tests**: Creating a runtime with test layers for integration testing

Do NOT use ManagedRuntime when:

- Effect owns the entire process → use `NodeRuntime.runMain` / `BunRuntime.runMain`
- You have a long-running Effect service that IS the application → use `Layer.launch`

## Core API

### Creating a ManagedRuntime

```ts
import { ManagedRuntime, Layer } from 'effect';

// ManagedRuntime.make takes a Layer and returns a ManagedRuntime
// The layer's requirements must be fully satisfied (no remaining R)
const runtime = ManagedRuntime.make(MyService.layer);
```

**Signature:**

```ts
ManagedRuntime.make<R, ER>(
  layer: Layer.Layer<R, ER, never>,
  options?: { readonly memoMap?: Layer.MemoMap | undefined }
): ManagedRuntime<R, ER>
```

The `ManagedRuntime<R, ER>` type parameters:

- `R` — the services provided by the runtime (available to effects you run)
- `ER` — errors that can occur during layer construction

### Shared MemoMap

When using multiple ManagedRuntime instances in the same application, share a MemoMap so that memoized layers (the default) are built only once:

```ts
import { Layer, ManagedRuntime } from 'effect';

// Create a global memo map shared across all runtimes
const appMemoMap = Layer.makeMemoMapUnsafe();

const runtime1 = ManagedRuntime.make(ServiceA.layer, { memoMap: appMemoMap });
const runtime2 = ManagedRuntime.make(ServiceB.layer, { memoMap: appMemoMap });
```

If you only have a single ManagedRuntime, you can omit the `memoMap` option — one is created automatically.

## Running Effects

A ManagedRuntime provides all the standard run methods. The runtime automatically provides the services from its layer to every effect you run.

### `runtime.runPromise(effect)` — Async execution (most common)

```ts
const result = await runtime.runPromise(
	MyService.use((svc) => svc.doSomething(input))
);
```

Returns a `Promise<A>`. Rejects with the first error or exception. Use this in async HTTP handlers, Lambda handlers, etc.

### `runtime.runSync(effect)` — Synchronous execution

```ts
const result = runtime.runSync(MyService.use((svc) => svc.computeSync(input)));
```

Throws if the effect is async or fails. Use sparingly — only when you are certain the effect is synchronous.

### `runtime.runFork(effect)` — Fire and forget

```ts
const fiber = runtime.runFork(MyService.use((svc) => svc.backgroundTask()));
```

Returns a `Fiber<A, E | ER>`. The effect runs in the background. Use for fire-and-forget work.

### `runtime.runCallback(effect)` — Callback-style execution

```ts
const cancel = runtime.runCallback(effect, {
	onExit: (exit) => {
		// handle exit
	}
});
// cancel() to interrupt
```

Use for callback-only APIs (e.g., some Node.js patterns).

### `runtime.runPromiseExit(effect)` / `runtime.runSyncExit(effect)`

Return `Exit<A, E | ER>` instead of throwing — useful when you want to inspect failures structurally.

## Lifecycle Management

ManagedRuntime **owns the scope** of the layers it builds. When you dispose the runtime, all resources acquired during layer construction (database pools, HTTP clients, file handles, etc.) are released.

### Disposing the runtime

```ts
// Async dispose (returns Promise<void>)
await runtime.dispose();

// Effect-based dispose (composable)
yield* runtime.disposeEffect;
```

### Shutdown hook pattern

```ts
const shutdown = () => {
	void runtime.dispose();
};
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
```

**Critical**: Always dispose ManagedRuntime on shutdown. Unlike `runMain` which handles this automatically, ManagedRuntime requires explicit lifecycle management.

## Integration Patterns

### Hono

```ts
import { Effect, Layer, ManagedRuntime, Ref, Schema, Context } from 'effect';
import { Hono } from 'hono';

class Todo extends Schema.Class<Todo>('Todo')({
	id: Schema.Number,
	title: Schema.String,
	completed: Schema.Boolean
}) {}

class CreateTodoPayload extends Schema.Class<CreateTodoPayload>(
	'CreateTodoPayload'
)({
	title: Schema.String
}) {}

class TodoNotFound extends Schema.TaggedErrorClass<TodoNotFound>()(
	'TodoNotFound',
	{
		id: Schema.Number
	}
) {}

class TodoRepo extends Context.Service<
	TodoRepo,
	{
		readonly getAll: Effect.Effect<ReadonlyArray<Todo>>;
		getById(id: number): Effect.Effect<Todo, TodoNotFound>;
		create(payload: CreateTodoPayload): Effect.Effect<Todo>;
	}
>()('app/TodoRepo') {
	static readonly layer = Layer.effect(
		TodoRepo,
		Effect.gen(function* () {
			const store = new Map<number, Todo>();
			const nextId = yield* Ref.make(1);

			const getAll = Effect.gen(function* () {
				return Array.from(store.values());
			}).pipe(Effect.withSpan('TodoRepo.getAll'));

			const getById = Effect.fn('TodoRepo.getById')(function* (
				id: number
			) {
				const todo = store.get(id);
				if (todo === undefined) {
					return yield* new TodoNotFound({ id });
				}
				return todo;
			});

			const create = Effect.fn('TodoRepo.create')(function* (
				payload: CreateTodoPayload
			) {
				const id = yield* Ref.getAndUpdate(
					nextId,
					(current) => current + 1
				);
				const todo = new Todo({
					id,
					title: payload.title,
					completed: false
				});
				store.set(id, todo);
				return todo;
			});

			return TodoRepo.of({ getAll, getById, create });
		})
	);
}

// Shared memo map + ManagedRuntime
const appMemoMap = Layer.makeMemoMapUnsafe();
const runtime = ManagedRuntime.make(TodoRepo.layer, { memoMap: appMemoMap });

const app = new Hono();

app.get('/todos', async (c) => {
	const todos = await runtime.runPromise(TodoRepo.use((repo) => repo.getAll));
	return c.json(todos);
});

app.get('/todos/:id', async (c) => {
	const id = Number(c.req.param('id'));
	if (!Number.isFinite(id)) {
		return c.json({ message: 'Todo id must be a number' }, 400);
	}
	const todo = await runtime.runPromise(
		TodoRepo.use((repo) => repo.getById(id)).pipe(
			Effect.catchTag('TodoNotFound', () => Effect.succeed(null))
		)
	);
	if (todo === null) {
		return c.json({ message: 'Todo not found' }, 404);
	}
	return c.json(todo);
});

app.post('/todos', async (c) => {
	const body = await c.req.json();
	const payload = Schema.decodeUnknownSync(CreateTodoPayload)(body);
	const todo = await runtime.runPromise(
		TodoRepo.use((repo) => repo.create(payload))
	);
	return c.json(todo, 201);
});

// Shutdown
const shutdown = () => {
	void runtime.dispose();
};
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
```

### Express

```ts
import express from 'express';

const app = express();
app.use(express.json());

const runtime = ManagedRuntime.make(AppLayer);

app.get('/users/:id', async (req, res) => {
	try {
		const user = await runtime.runPromise(
			UserService.use((svc) => svc.getById(req.params.id))
		);
		res.json(user);
	} catch (error) {
		res.status(500).json({ message: 'Internal error' });
	}
});

// Graceful shutdown
const server = app.listen(3000);
process.once('SIGTERM', () => {
	server.close(() => {
		void runtime.dispose();
	});
});
```

### AWS Lambda

```ts
import { ManagedRuntime } from 'effect';

// Runtime created at module scope — reused across warm invocations
const runtime = ManagedRuntime.make(AppLayer);

export const handler = async (event: APIGatewayEvent) => {
	const result = await runtime.runPromise(
		MyService.use((svc) => svc.handleRequest(event))
	);
	return {
		statusCode: 200,
		body: JSON.stringify(result)
	};
};

// Keep the module-scoped runtime alive for warm reuse.
// Do not dispose after every invocation; dispose only when the runtime is
// no longer needed or if your host exposes a real shutdown/lifecycle hook.
```

### Cloudflare Workers

```ts
import { ManagedRuntime } from 'effect';

// Module-level runtime for warm reuse while the Worker isolate stays alive
const runtime = ManagedRuntime.make(AppLayer);

export default {
	async fetch(request: Request): Promise<Response> {
		const result = await runtime.runPromise(
			MyService.use((svc) => svc.handle(request))
		);
		return new Response(JSON.stringify(result), {
			headers: { 'content-type': 'application/json' }
		});
	}
};
```

## ManagedRuntime vs Layer.launch

|                           | ManagedRuntime                         | Layer.launch                                 |
| ------------------------- | -------------------------------------- | -------------------------------------------- |
| **Who owns the process?** | External framework                     | Effect                                       |
| **Use case**              | Bridge to Hono/Express/Lambda/etc.     | Effect IS the application                    |
| **How to run effects**    | `runtime.runPromise(effect)`           | Effects run inside the layer graph           |
| **Lifecycle**             | Manual dispose on shutdown             | Automatic — runs until interrupted           |
| **Typical shape**         | Web handler calls `runtime.runPromise` | `Layer.launch(pipe(...layers))` in `runMain` |

Use `Layer.launch` when Effect is the entire application — it builds the layer, runs it, and tears it down when the process exits. Use `ManagedRuntime` when you need to call into Effect from non-Effect code.

## ManagedRuntime vs runMain

|                           | ManagedRuntime                        | runMain                 |
| ------------------------- | ------------------------------------- | ----------------------- |
| **Context**               | Embedded in another framework         | Effect owns the process |
| **Signal handling**       | Manual (you wire SIGINT/SIGTERM)      | Automatic               |
| **Scope management**      | Manual dispose                        | Automatic               |
| **Multiple entry points** | Yes — many handlers share one runtime | Single entry point      |

`runMain` is for CLI apps and standalone Effect services. ManagedRuntime is for when your Effect code lives inside a larger system.

## Type-Level Utilities

Extract service and error types from a ManagedRuntime:

```ts
type Services = ManagedRuntime.ManagedRuntime.Services<typeof runtime>;
type Error = ManagedRuntime.ManagedRuntime.Error<typeof runtime>;
```

## Guard

```ts
import { ManagedRuntime } from 'effect';

ManagedRuntime.isManagedRuntime(value); // type guard
```

## Common Mistakes

1. **Forgetting to dispose** — Leaks resources. Wire up shutdown hooks for long-running hosts; in serverless, keep warm runtimes alive and dispose only when the runtime is no longer needed or the host exposes a real shutdown/lifecycle hook.
2. **Creating a runtime per request** — Expensive. Create once at module/app scope, share across handlers.
3. **Not sharing MemoMap** — If you have multiple runtimes, layers won't be deduplicated without a shared MemoMap.
4. **Using runSync for async effects** — Will throw. Use `runPromise` for anything that might be async.
5. **Catching errors outside Effect** — Prefer `Effect.catchTag` / `Effect.catchTags` inside the effect pipeline before calling `runPromise`, so errors are handled structurally rather than as untyped promise rejections.
