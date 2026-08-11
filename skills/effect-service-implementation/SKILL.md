---
name: effect-service-implementation
description: Implement Effect services as fine-grained capabilities avoiding monolithic designs
---

# Service Implementation Skill

Design and implement Effect services as focused capabilities that compose into complete solutions.

## Effect Source Reference

The Effect v4 source is available at `~/.cache/effect-v4/`.
Browse and read files there directly to look up APIs, types, and implementations.

Reference this for:

- Context source: `packages/effect/src/Context.ts`
- Layer source: `packages/effect/src/Layer.ts`
- Migration guide: `MIGRATION.md`
- Effect source: `packages/effect/src/`

## Service Declaration: Namespace-Module Pattern

The recommended pattern organizes each service as a TypeScript namespace containing: an `Interface` type, a `Service` class (pure tag/identifier), and `layer` / `defaultLayer` exports. The class body is always empty — construction logic lives in `Layer.effect`, not in `make:` or class statics.

The main payoff is a visible service graph. Prefer patterns that make dependencies obvious at `yield*` call sites and in `defaultLayer` composition over patterns that keep compatibility shims or helper modules in the foreground.

```typescript
import { Effect, Layer, Schema, Context } from 'effect';

class UserNotFound extends Schema.TaggedError<UserNotFound>()(
	'UserNotFound',
	{
		userId: Schema.String,
		message: Schema.String
	}
) {}

export namespace UserRepository {
	export interface Interface {
		readonly findById: (id: string) => Effect.Effect<User, UserNotFound>;
		readonly create: (data: CreateUserData) => Effect.Effect<User>;
	}

	export class Service extends Context.Service<Service, Interface>()(
		'@app/UserRepository'
	) {}

	export const layer = Layer.effect(
		Service,
		Effect.gen(function* () {
			const db = yield* DatabaseClient.Service;

			const findById = Effect.fn('UserRepository.findById')(function* (
				id: string
			) {
				const row = yield* db.query(
					'SELECT * FROM users WHERE id = ?',
					id
				);
				if (!row)
					return yield* new UserNotFound({
						userId: id,
						message: `User ${id} not found`
					});
				return row as User;
			});

			const create = Effect.fn('UserRepository.create')(function* (
				data: CreateUserData
			) {
				return yield* db.insert('users', data);
			});

			return Service.of({ findById, create });
		})
	);

	export const defaultLayer = layer.pipe(
		Layer.provide(DatabaseClient.defaultLayer)
	);
}
```

Key properties:

- **Namespace encapsulation** — `Interface`, `Service`, `layer`, and `defaultLayer` live in one namespace
- **Empty class body** — the `Service` class is purely a tag/identifier; no `make:`, no `static readonly layer`
- **`Layer.effect` external to class** — construction logic is a namespace-level `const`, not a class static
- **`Service.of({...})`** — always return service implementations via `Service.of()`, never a plain object literal
- **`Effect.fn("Namespace.method")`** — span names use the enclosing namespace as prefix (not the class name, since the class is always `Service`)
- **`layer` / `defaultLayer`** — `layer` exposes the true dependency graph in its type; `defaultLayer` is the fully-wired production composition (only needed when `layer` has unsatisfied requirements)
- Access the service with `yield*` in generators, or `Service.use(s => ...)` / `Service.useSync(s => ...)` for one-liners

### Default Layer Composition

Compose `defaultLayer` directly in the normal case:

```typescript
export const defaultLayer = layer.pipe(
	Layer.provide(DepA.defaultLayer),
	Layer.provide(DepB.defaultLayer)
);
```

Use `Layer.suspend(() => ...)` only when module evaluation order or a real import cycle requires deferral:

```typescript
export const defaultLayer = Layer.suspend(() =>
	layer.pipe(Layer.provide(Dep.defaultLayer))
);
```

Do not wrap every `defaultLayer` in `Layer.unwrap(Effect.sync(...))` by default.

### What does NOT exist in v4:

- `accessors: true` — REMOVED. Use `yield*` or `.use()` / `.useSync()` instead
- `effect:` option — does NOT exist. Use `Layer.effect` externally
- `succeed:` option — does NOT exist. Use `Layer.succeed` externally
- `dependencies: [...]` option — REMOVED. Use `Layer.provide` on the layer

### Alternative: Class-Statics Pattern

For simple services or when namespace encapsulation is not needed, the class-statics pattern is acceptable:

```typescript
import { Context, Crypto, Effect, Layer } from 'effect';
import { NodeCrypto } from '@effect/platform-node';

export class IdGenerator extends Context.Service<
	IdGenerator,
	{
		readonly generate: Effect.Effect<string>;
	}
>()('@services/IdGenerator', {
	make: Effect.gen(function* () {
		const crypto = yield* Crypto.Crypto;
		// `randomUUIDv4` fails with PlatformError; UUID generation is
		// unrecoverable here, so collapse it into a defect with `Effect.orDie`.
		return { generate: crypto.randomUUIDv4.pipe(Effect.orDie) };
	})
}) {
	static readonly layer = Layer.effect(this, this.make);
	static readonly defaultLayer = this.layer.pipe(
		Layer.provide(NodeCrypto.layer)
	);
}
```

Use the class-statics pattern for small services with at most a single, simple dependency. For richer dependency graphs, prefer the namespace-module pattern. Provide a platform `Crypto` implementation such as `NodeCrypto.layer` at the app edge — here `defaultLayer` wires it.

## Anti-Pattern: Monolithic Services

```typescript
import { Effect, Layer, Context } from 'effect';

// WRONG - Mixed concerns in one service
export class PaymentService extends Context.Service<
	PaymentService,
	{
		readonly processPayment: Effect.Effect<void>;
		readonly validateWebhook: Effect.Effect<void>;
		readonly refund: Effect.Effect<void>;
		readonly sendReceipt: Effect.Effect<void>; // Notification concern
		readonly generateReport: Effect.Effect<void>; // Reporting concern
	}
>()('PaymentService') {}
```

## Pattern: Capability-Based Services

Each service represents ONE cohesive capability:

```typescript
import { Effect, Layer, Schema, Context } from 'effect';

class HandoffError extends Schema.TaggedError<HandoffError>()(
	'HandoffError',
	{
		message: Schema.String
	}
) {}

class RefundError extends Schema.TaggedError<RefundError>()(
	'RefundError',
	{
		message: Schema.String
	}
) {}

// Focused capabilities — one concern per service

export namespace PaymentGateway {
	export interface Interface {
		readonly handoff: (
			intent: PaymentIntent
		) => Effect.Effect<HandoffResult, HandoffError>;
	}

	export class Service extends Context.Service<Service, Interface>()(
		'@services/payment/PaymentGateway'
	) {}

	export const layer = Layer.effect(
		Service,
		Effect.gen(function* () {
			const stripe = yield* StripeClient.Service;

			const handoff = Effect.fn('PaymentGateway.handoff')(function* (
				intent: PaymentIntent
			) {
				return { status: 'completed' } as HandoffResult;
			});

			return Service.of({ handoff });
		})
	);

	export const defaultLayer = layer.pipe(
		Layer.provide(StripeClient.defaultLayer)
	);
}

export namespace PaymentRefundGateway {
	export interface Interface {
		readonly refund: (
			paymentId: PaymentId,
			amount: Cents
		) => Effect.Effect<RefundResult, RefundError>;
	}

	export class Service extends Context.Service<Service, Interface>()(
		'@services/payment/PaymentRefundGateway'
	) {}

	export const layer = Layer.effect(
		Service,
		Effect.gen(function* () {
			const stripe = yield* StripeClient.Service;

			const refund = Effect.fn('PaymentRefundGateway.refund')(function* (
				paymentId: PaymentId,
				amount: Cents
			) {
				return { status: 'refunded' } as RefundResult;
			});

			return Service.of({ refund });
		})
	);

	export const defaultLayer = layer.pipe(
		Layer.provide(StripeClient.defaultLayer)
	);
}
```

## Pattern: Promote Effectful Helpers into Services

If a helper is effectful, owns configuration or policy, talks to an external system, or accumulates lifecycle state, do not leave it as a static module helper.

Promote it into its own service when any of these are true:

- callers should be able to see the dependency in `R`
- the helper closes over other services or runtime config
- the helper owns caches, background fibers, subscriptions, or coordination state
- the helper models a real domain/runtime concept such as `Git`, `Provider`, `SessionRevert`, or `SessionRunState`

```typescript
import { ChildProcess, ChildProcessSpawner } from 'effect/unstable/process';
import { Context, Effect, Layer } from 'effect';

export namespace Git {
	export interface Interface {
		readonly run: (args: ReadonlyArray<string>) => Effect.Effect<string>;
	}

	export class Service extends Context.Service<Service, Interface>()(
		'@app/Git'
	) {}

	export const layer = Layer.effect(
		Service,
		Effect.gen(function* () {
			const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;

			const run = Effect.fn('Git.run')(function* (
				args: ReadonlyArray<string>
			) {
				return yield* spawner.string(ChildProcess.make('git', args));
			});

			return Service.of({ run });
		})
	);
}
```

This keeps repeated platform details, policy, and formatting logic out of downstream callers.

## Pattern: Coordinator Services for Lifecycle State

When a service starts owning busy/idle state, in-flight work maps, cancellation handles, or runner orchestration, extract that concern into its own coordinator service instead of burying it inside a larger feature service.

```typescript
export namespace SessionRunState {
	export interface Interface {
		readonly assertNotBusy: (sessionId: SessionID) => Effect.Effect<void>;
		readonly cancel: (sessionId: SessionID) => Effect.Effect<void>;
	}

	export class Service extends Context.Service<Service, Interface>()(
		'@app/SessionRunState'
	) {}
}
```

This reduces cognitive load in the parent service and makes race-sensitive behavior directly testable.

## Pattern: No Requirement Leakage

Service methods should **never** have requirements in their return type:

```typescript
import { Effect, Layer, Schema, Context } from 'effect';

class QueryError extends Schema.TaggedError<QueryError>()('QueryError', {
	message: Schema.String
}) {}

export namespace Database {
	export interface Interface {
		readonly query: (sql: string) => Effect.Effect<QueryResult, QueryError>;
	}

	export class Service extends Context.Service<Service, Interface>()(
		'@services/Database'
	) {}

	export const layer = Layer.effect(
		Service,
		Effect.gen(function* () {
			const pool = yield* ConnectionPool.Service; // Captured in closure

			const query = Effect.fn('Database.query')(function* (sql: string) {
				//  Requirements = never (no R param)
				//  Dependencies are in the closure, not the return type
				const conn = yield* pool.acquire();
				return yield* conn.execute(sql);
			});

			return Service.of({ query });
		})
	);

	export const defaultLayer = layer.pipe(
		Layer.provide(ConnectionPool.defaultLayer)
	);
}
```

Dependencies are handled by:

1. **`Layer.effect` closure** — services captured at construction time via `yield*`
2. **`Layer.provide`** — wires dependency layers into `defaultLayer`

Both keep the method signatures clean (`R = never`).

Update Effect callers to `yield* SomeService.Service` as early as possible once the service exists. Keep async facades only for non-Effect boundaries that still need compatibility.

## Pattern: Leaf Services with a Platform Dependency

Even a small "leaf" service often needs a platform capability such as cryptographic UUID generation. Use the platform-agnostic `Crypto` service instead of the global `crypto.randomUUID`, capture it in `Layer.effect`, and wire a concrete implementation (e.g. `NodeCrypto.layer`) in `defaultLayer`:

```typescript
import { Context, Crypto, Effect, Layer } from 'effect';
import { NodeCrypto } from '@effect/platform-node';

export namespace IdGenerator {
	export interface Interface {
		readonly generate: Effect.Effect<string>;
	}

	export class Service extends Context.Service<Service, Interface>()(
		'@services/IdGenerator'
	) {}

	export const layer = Layer.effect(
		Service,
		Effect.gen(function* () {
			const crypto = yield* Crypto.Crypto;
			// UUID generation failure is unrecoverable here, so collapse the
			// PlatformError into a defect at this boundary with `Effect.orDie`.
			return Service.of({
				generate: crypto.randomUUIDv4.pipe(Effect.orDie)
			});
		})
	);

	export const defaultLayer = layer.pipe(Layer.provide(NodeCrypto.layer));
}
```

A genuinely dependency-free service can still keep `layer` self-contained with `Layer.succeed` and skip `defaultLayer` (see the rule of thumb below).

## Pattern: Composing Capabilities

Different implementations support different capabilities:

```typescript
import { Layer } from 'effect';

// Cash payments: Basic handoff only
export const CashGatewayLive = Layer.mergeAll(
	CashHandoffLive // Implements PaymentGateway
);

// Stripe: Full capability suite
export const StripeGatewayLive = Layer.mergeAll(
	StripeHandoffLive, // Implements PaymentGateway
	StripeWebhookLive, // Implements PaymentWebhookGateway
	StripeRefundLive // Implements PaymentRefundGateway
);
```

## Pattern: Optional Capabilities

Use `Effect.serviceOption` for capabilities that may not be available:

```typescript
import { Effect, Option } from 'effect';

const processPayment = Effect.gen(function* () {
	const gateway = yield* PaymentGateway.Service;
	const result = yield* gateway.handoff(order.paymentIntent);

	// Optional capability — check if available
	const refundGateway = yield* Effect.serviceOption(
		PaymentRefundGateway.Service
	);

	if (Option.isSome(refundGateway)) {
		yield* setupRefundPolicy(refundGateway.value, order);
	}

	return result;
});
```

## When to Use Interface-Only Services

Interface-only services (no `layer` in the namespace) are appropriate when a service has **no single obvious implementation** — the interface is defined separately from its implementations:

```typescript
import { Context } from 'effect';
import type { Effect } from 'effect';

// Interface-only: multiple implementations exist
export namespace Clipboard {
	export interface Interface {
		readonly read: Effect.Effect<string, ClipboardError>;
		readonly write: (text: string) => Effect.Effect<void, ClipboardError>;
	}

	export class Service extends Context.Service<Service, Interface>()(
		'@Clipboard/Clipboard'
	) {}

	// No layer here — each platform provides its own:
	// layer-macos/: Layer.succeed(Service, Service.of({ read: ..., write: ... }))
	// layer-linux/: Layer.succeed(Service, Service.of({ read: ..., write: ... }))
}
```

**Rule of thumb:**

- Has a default implementation → namespace with `layer` and optionally `defaultLayer`
- Multiple platform implementations → namespace with `Service` only, layers defined externally
- No dependencies → namespace with `layer` only (no `defaultLayer` needed)

## Testing Benefits

Each capability can be tested in isolation:

```typescript
import { Effect, Layer } from 'effect';

const TestWebhook = Layer.succeed(PaymentWebhookGateway.Service, {
	validateWebhook: () => Effect.succeed(undefined)
});

// Test only webhook validation, no other payment concerns
const testProgram = Effect.gen(function* () {
	const gateway = yield* PaymentWebhookGateway.Service;
	yield* gateway.validateWebhook(payload);
}).pipe(Effect.provide(TestWebhook));
```

```typescript
// Concise alternative using Layer.mock (v4)
const TestWebhook = Layer.mock(PaymentWebhookGateway.Service)({
	validateWebhook: () => Effect.succeed(undefined)
});
```

`Layer.mock(Service)({...})` is shorthand for `Layer.succeed(Service, Service.of({...}))` — use whichever reads more clearly in context.

## Naming Convention

Use descriptive capability names for the namespace:

- `*Gateway` - External system integration
- `*Repository` - Data persistence
- `*Domain` - Business logic
- `*RunState`, `*Coordinator`, `*Registry` - explicit lifecycle or orchestration state
- General domain name preferred over generic `*Service` suffix

Tag identifiers should include namespace:

- `"@app/PaymentGateway"`
- `"@app/UserRepository"`
- `"@app/OrderDomain"`

`Effect.fn` span names use the namespace prefix, not the class name:

- `Effect.fn("PaymentGateway.handoff")` — not `Effect.fn("Service.handoff")`
- `Effect.fn("UserRepository.findById")` — not `Effect.fn("UserRepository.Service.findById")`

## Quality Checklist

- [ ] Service uses `Context.Service<Self, Shape>()("identifier")` with shape as type parameter
- [ ] Service class body is empty (no `make:`, no statics) when using namespace-module pattern
- [ ] Service methods use `Effect.fn("Namespace.methodName")` with namespace prefix
- [ ] Service represents single capability
- [ ] All operations have Requirements = never (no R parameter)
- [ ] Dependencies captured in `Layer.effect` closure via `yield*`; wired via `Layer.provide` on `defaultLayer`
- [ ] `Service.of({...})` used when returning from `Layer.effect`, never a plain object literal
- [ ] Tagged with descriptive namespace identifier
- [ ] `defaultLayer` only present when `layer` has unsatisfied requirements
- [ ] `defaultLayer` composes directly unless there is a real need for deferred evaluation
- [ ] Can be tested in isolation with `Layer.succeed` or `Layer.mock`
- [ ] Can be composed with other capabilities
- [ ] No use of removed v3 options: `accessors`, `effect`, `succeed`, `dependencies`

Keep services focused, composable, and free of leaked requirements.
