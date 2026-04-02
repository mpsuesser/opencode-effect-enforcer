---
name: effect-incremental-migration
description: Incrementally migrate existing async/Promise-based modules to Effect services while preserving backward compatibility. Use this skill when effectifying an existing module, replacing async facades with Effect services, or maintaining dual async/Effect APIs during migration.
---

# Incremental Migration Skill

This skill provides a step-by-step template for converting existing async/Promise-based modules to Effect services. The template preserves backward compatibility so callers can migrate incrementally.

## Effect Source Reference

The Effect v4 source is available at `.references/effect-v4/` in your project root.
Browse and read files there directly to look up APIs, types, and implementations.

Reference this for:

- ServiceMap source: `packages/effect/src/ServiceMap.ts`
- Layer source: `packages/effect/src/Layer.ts`
- ManagedRuntime source: `packages/effect/src/ManagedRuntime.ts`
- Migration guide: `MIGRATION.md`
- Effect source: `packages/effect/src/`

## The 7-Step Migration Template

### Step 1: Define the Service Interface

Extract a named `Interface` type with Effect-returning methods. Keep parameter and return types identical to the original module — only swap `Promise<T>` for `Effect.Effect<T, E>`.

```typescript
import type { Effect } from 'effect';

export namespace MyModule {
	export interface Interface {
		readonly get: (id: string) => Effect.Effect<Item, MyModuleError>;
		readonly list: Effect.Effect<ReadonlyArray<Item>>;
	}
}
```

### Step 2: Declare the Service Class

Empty class body — no `make:`, no `static readonly layer`. The interface and service class live in the same namespace.

```typescript
import { ServiceMap } from 'effect';
import type { Effect } from 'effect';

export namespace MyModule {
	export interface Interface {
		readonly get: (id: string) => Effect.Effect<Item, MyModuleError>;
		readonly list: Effect.Effect<ReadonlyArray<Item>>;
	}

	export class Service extends ServiceMap.Service<
		Service,
		Interface
	>()('@app/MyModule') {}
}
```

### Step 3: Build the Raw Layer

Construct the service inside `Layer.effect`, capturing dependencies via `yield*`. Use `Effect.fn` for traced methods.

```typescript
import { Effect, Layer, ServiceMap } from 'effect';

export namespace MyModule {
	export interface Interface {
		readonly get: (id: string) => Effect.Effect<Item, MyModuleError>;
		readonly list: Effect.Effect<ReadonlyArray<Item>>;
	}

	export class Service extends ServiceMap.Service<
		Service,
		Interface
	>()('@app/MyModule') {}

	export const layer = Layer.effect(
		Service,
		Effect.gen(function* () {
			const config = yield* Config.Service;
			const db = yield* Database.Service;

			const get = Effect.fn('MyModule.get')(function* (id: string) {
				const cfg = yield* config.get();
				return yield* db.findById(cfg.table, id);
			});

			const list = Effect.fn('MyModule.list')(function* () {
				const cfg = yield* config.get();
				return yield* db.listAll(cfg.table);
			});

			return Service.of({ get, list });
		})
	);
}
```

The layer's type exposes unsatisfied requirements (`Config.Service | Database.Service`). This is intentional — the raw layer declares its true dependency graph.

### Step 4: Build the Wired Default Layer

Use `Layer.unwrap(Effect.sync(...))` to defer composition until runtime, avoiding circular import issues.

```typescript
import { Effect, Layer } from 'effect';

export namespace MyModule {
	// ... Interface, Service, layer above ...

	export const defaultLayer = Layer.unwrap(
		Effect.sync(() =>
			layer.pipe(
				Layer.provide(Config.defaultLayer),
				Layer.provide(Database.defaultLayer)
			)
		)
	);
}
```

### Step 5: Create the Runtime Bridge

A shared `memoMap` ensures layers are deduplicated across all per-service runtimes. Define the bridge utility once and reuse it across migrated modules.

```typescript
import { Layer, ManagedRuntime } from 'effect';
import type { Effect, ServiceMap } from 'effect';

const memoMap = Layer.makeMemoMapUnsafe();

export function makeRuntime<I, S, E>(
	service: ServiceMap.Service<I, S>,
	layer: Layer.Layer<I, E>
) {
	let rt: ManagedRuntime.ManagedRuntime<I, E> | undefined;
	const getRuntime = () =>
		(rt ??= ManagedRuntime.make(layer, { memoMap }));
	return {
		runPromise: <A, Err>(
			fn: (svc: S) => Effect.Effect<A, Err, I>
		) => getRuntime().runPromise(service.use(fn)),
		runSync: <A, Err>(
			fn: (svc: S) => Effect.Effect<A, Err, I>
		) => getRuntime().runSync(service.use(fn))
	};
}
```

Then in the module namespace, create the bridge from the service and its default layer:

```typescript
const { runPromise } = makeRuntime(MyModule.Service, MyModule.defaultLayer);
```

### Step 6: Preserve Async Facades

Wrap each service method in a thin `async` function that delegates to `runPromise`. Existing callers continue working without changes.

```typescript
export namespace MyModule {
	// ... Interface, Service, layer, defaultLayer above ...

	export async function get(id: string): Promise<Item> {
		return runPromise((svc) => svc.get(id));
	}

	export async function list(): Promise<ReadonlyArray<Item>> {
		return runPromise((svc) => svc.list);
	}
}
```

These facades are removed once all callers migrate to Effect.

### Step 7: Update Callers

Replace `Effect.promise(() => facade())` calls with direct service yields:

```typescript
// Before: calling through async facade
const item = yield* Effect.promise(() => MyModule.get(id));

// After: yielding the service directly
const myModule = yield* MyModule.Service;
const item = yield* myModule.get(id);
```

When replacing `Effect.promise(() => facade())` with direct service yields, errors that previously flowed as defects become typed channel errors. Update any `catchDefect` handlers to `catch` or `catchTag`.

## Complete Before/After Example

### Before: Plain Async Module

```typescript
import { loadConfig } from './config';

export namespace Items {
	let cachedConfig: Config | undefined;

	async function getConfig(): Promise<Config> {
		return (cachedConfig ??= await loadConfig());
	}

	export async function get(id: string): Promise<Item> {
		const cfg = await getConfig();
		const res = await fetch(`${cfg.apiUrl}/items/${id}`);
		if (!res.ok) throw new Error(`Item ${id} not found`);
		return res.json();
	}

	export async function list(): Promise<ReadonlyArray<Item>> {
		const cfg = await getConfig();
		const res = await fetch(`${cfg.apiUrl}/items`);
		return res.json();
	}
}
```

### After: Effect Service with Backward-Compatible Facades

```typescript
import { Effect, Layer, Schema, ServiceMap } from 'effect';
import { makeRuntime } from './runtime-bridge';

class ItemsError extends Schema.TaggedErrorClass<ItemsError>()(
	'ItemsError',
	{ message: Schema.String }
) {}

export namespace Items {
	// Step 1: Interface
	export interface Interface {
		readonly get: (id: string) => Effect.Effect<Item, ItemsError>;
		readonly list: Effect.Effect<ReadonlyArray<Item>>;
	}

	// Step 2: Service class
	export class Service extends ServiceMap.Service<
		Service,
		Interface
	>()('@app/Items') {}

	// Step 3: Raw layer
	export const layer = Layer.effect(
		Service,
		Effect.gen(function* () {
			const config = yield* AppConfig.Service;

			const get = Effect.fn('Items.get')(function* (id: string) {
				const cfg = yield* config.load();
				const res = yield* Effect.tryPromise({
					try: () => fetch(`${cfg.apiUrl}/items/${id}`),
					catch: () => new ItemsError({ message: `Item ${id} not found` })
				});
				return yield* Effect.tryPromise({
					try: () => res.json() as Promise<Item>,
					catch: () => new ItemsError({ message: 'Failed to parse item' })
				});
			});

			const list = Effect.fn('Items.list')(function* () {
				const cfg = yield* config.load();
				const res = yield* Effect.tryPromise({
					try: () => fetch(`${cfg.apiUrl}/items`),
					catch: () => new ItemsError({ message: 'Failed to list items' })
				});
				return yield* Effect.tryPromise({
					try: () => res.json() as Promise<ReadonlyArray<Item>>,
					catch: () => new ItemsError({ message: 'Failed to parse items' })
				});
			});

			return Service.of({ get, list });
		})
	);

	// Step 4: Default layer
	export const defaultLayer = Layer.unwrap(
		Effect.sync(() => layer.pipe(Layer.provide(AppConfig.defaultLayer)))
	);

	// Step 5: Runtime bridge
	const { runPromise } = makeRuntime(Service, defaultLayer);

	// Step 6: Async facades (remove once all callers migrate)
	export async function get(id: string): Promise<Item> {
		return runPromise((svc) => svc.get(id));
	}

	export async function list(): Promise<ReadonlyArray<Item>> {
		return runPromise((svc) => svc.list);
	}
}

// Step 7: Callers migrate from facade to service
// const item = yield* Effect.promise(() => Items.get(id));
//   becomes:
// const items = yield* Items.Service;
// const item = yield* items.get(id);
```

## Migration Checklist

- [ ] Interface type extracted with Effect-returning methods
- [ ] Service class declared with `ServiceMap.Service`
- [ ] Layer built with `Layer.effect` capturing dependencies via `yield*`
- [ ] Default layer uses `Layer.unwrap(Effect.sync(...))` for lazy composition
- [ ] Runtime bridge created with shared `memoMap`
- [ ] Existing async facades preserved as thin wrappers
- [ ] Callers in Effect.gen blocks updated to yield service directly
- [ ] Former `catchDefect` handlers updated to `catch`/`catchTag` for now-typed errors

## Related Skills

- `effect-service-implementation` — service declaration patterns and capability design
- `effect-layer-design` — layer composition, merging, and dependency management
- `effect-managed-runtime` — ManagedRuntime lifecycle and `memoMap` usage
- `effect-error-handling` — typed errors, `catchTag`, and error channel design
