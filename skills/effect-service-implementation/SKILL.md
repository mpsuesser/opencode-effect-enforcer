---
name: effect-service-implementation
description: Implement Effect services as fine-grained capabilities avoiding monolithic designs
---

# Service Implementation Skill

Design and implement Effect services as focused capabilities that compose into complete solutions.

## Effect Source Reference

The Effect v4 source is available at `~/.local/share/opencode/repos/github.com/Effect-TS/effect@main/`.
Browse and read files there directly to look up APIs, types, and implementations.

Reference this for:

- Context source: `packages/effect/src/Context.ts`
- Layer source: `packages/effect/src/Layer.ts`
- Migration guide: `MIGRATION.md`
- Effect source: `packages/effect/src/`

## Service Declaration: ES-Module Namespace Projection

First follow an existing project convention for Effect service tags and module naming. A project that has standardized another current Effect v4 tag style should keep it; do not migrate working services to `Context.Service` merely to match this guide.

When no convention exists, put the service in its own ES module with file-local role names: `Interface`, `Service`, `layer`, and, when needed, `defaultLayer`. At the bottom, the owning leaf self-exports its canonical identity with `export * as UserRepo from "./user-repo.js"`. Sibling modules import that identity directly from the owning leaf; folder and package barrels only relay it with `export { UserRepo } from "./user-repo.js"`. This gives callers a domain-specific namespace without TypeScript `namespace` declarations.

This self-referential ES-module projection is intentional, but it requires a toolchain and runtime that support it. Honor established project conventions when they use another current Effect v4 service layout or when self-projection is unsupported. With the class-style `Context.Service` shown below, the class body stays empty and construction lives in `Layer.effect`, not in `make:` or class statics.

The main payoff is a visible service graph. Prefer patterns that make dependencies obvious at `yield*` call sites and in `defaultLayer` composition over patterns that keep compatibility shims or helper modules in the foreground.

```typescript
// user-repo.ts
import { Effect, Layer, Schema, Context } from 'effect';

class UserNotFound extends Schema.TaggedError<UserNotFound>()(
	'UserNotFound',
	{
		userId: Schema.String,
		message: Schema.String
	}
) {}

export interface Interface {
	readonly findById: (id: string) => Effect.Effect<User, UserNotFound>;
	readonly create: (data: CreateUserData) => Effect.Effect<User>;
}

export class Service extends Context.Service<Service, Interface>()(
	'@app/UserRepo'
) {}

export const layer = Layer.effect(
	Service,
	Effect.gen(function* () {
		const db = yield* DatabaseClient.Service;

		const findById = Effect.fn('UserRepo.findById')(function* (id: string) {
			const row = yield* db.query<User | undefined>(
				'SELECT * FROM users WHERE id = ?',
				id
			);
			if (!row)
				return yield* new UserNotFound({
					userId: id,
					message: `User ${id} not found`
				});
			return row;
		});

		const create = Effect.fn('UserRepo.create')(function* (
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

export * as UserRepo from './user-repo.js';
```

```typescript
// services.ts (a folder barrel relays the owning leaf's identity)
export { UserRepo } from './user-repo.js';
```

Key properties:

- **ES-module encapsulation** — `Interface`, `Service`, `layer`, and `defaultLayer` are local roles in one service module; the owning leaf supplies the domain name
- **Owning-leaf projection** — the leaf self-exports `UserRepo`; consumers import it directly or through a relaying barrel and use `UserRepo.Service` or `UserRepo.defaultLayer`
- **Project tag convention first** — retain another standardized Effect v4 service-tag style and its established implementation-construction idiom
- **Empty class body** — when using class-style `Context.Service`, `Service` is purely a tag/identifier; no `make:`, no `static readonly layer`
- **`Layer.effect` external to class** — construction logic is a module-level `const`, not a class static
- **`Service.of({...})`** — with `Context.Service`, return service implementations via `Service.of()`, never a plain object literal
- **`Effect.fn("Domain.method")`** — span names use the projected domain name, not the file-local role name `Service`
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

### Alternative: Project-Established Service Style

If the project already standardizes class statics or another current Effect v4 tag declaration, preserve that style. For example, an established class-statics service remains acceptable:

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

Do not introduce this alternative into a project that has no convention. In that case prefer the ES-module projection pattern, including for small services. Provide a platform `Crypto` implementation such as `NodeCrypto.layer` at the app edge; here `defaultLayer` wires it.

Function-style keys are also current Effect v4. If a project standardizes them, a service module can retain a file-local role such as `export const Service = Context.Service<Interface>('@services/IdGenerator')`; use the resulting key exactly as the project does rather than rewriting it as a class.

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
// payment-gateway.ts
import { Effect, Layer, Schema, Context } from 'effect';
import { StripeClient } from './stripe-client.js';

class HandoffError extends Schema.TaggedError<HandoffError>()(
	'HandoffError',
	{
		message: Schema.String
	}
) {}

// Focused capability: one concern in this service module.
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
			return yield* stripe.handoff(intent);
		});

		return Service.of({ handoff });
	})
);

export const defaultLayer = layer.pipe(
	Layer.provide(StripeClient.defaultLayer)
);

export * as PaymentGateway from './payment-gateway.js';
```

```typescript
// payment-refund-gateway.ts
import { Context, Effect, Layer, Schema } from 'effect';
import { StripeClient } from './stripe-client.js';

class RefundError extends Schema.TaggedError<RefundError>()('RefundError', {
	message: Schema.String
}) {}

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
			return yield* stripe.refund(paymentId, amount);
		});

		return Service.of({ refund });
	})
);

export const defaultLayer = layer.pipe(
	Layer.provide(StripeClient.defaultLayer)
);

export * as PaymentRefundGateway from './payment-refund-gateway.js';
```

```typescript
// payment-services.ts (a folder barrel only relays canonical identities)
export { PaymentGateway } from './payment-gateway.js';
export { PaymentRefundGateway } from './payment-refund-gateway.js';
```

## Pattern: Promote Effectful Helpers into Services

If a helper is effectful, owns configuration or policy, talks to an external system, or accumulates lifecycle state, do not leave it as a static module helper.

Promote it into its own service when any of these are true:

- callers should be able to see the dependency in `R`
- the helper closes over other services or runtime config
- the helper owns caches, background fibers, subscriptions, or coordination state
- the helper models a real domain/runtime concept such as `Git`, `Provider`, `SessionRevert`, or `SessionRunState`

```typescript
// git.ts
import { ChildProcess, ChildProcessSpawner } from 'effect/unstable/process';
import { Context, Effect, Layer } from 'effect';

export interface Interface {
	readonly run: (args: ReadonlyArray<string>) => Effect.Effect<string>;
}

export class Service extends Context.Service<Service, Interface>()('@app/Git') {}

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

export * as Git from './git.js';
```

This keeps repeated platform details, policy, and formatting logic out of downstream callers.

## Pattern: Coordinator Services for Lifecycle State

When a service starts owning busy/idle state, in-flight work maps, cancellation handles, or runner orchestration, extract that concern into its own coordinator service instead of burying it inside a larger feature service.

```typescript
// session-run-state.ts
import { Context, Effect } from 'effect';

export interface Interface {
	readonly assertNotBusy: (sessionId: SessionID) => Effect.Effect<void>;
	readonly cancel: (sessionId: SessionID) => Effect.Effect<void>;
}

export class Service extends Context.Service<Service, Interface>()(
	'@app/SessionRunState'
) {}

export * as SessionRunState from './session-run-state.js';
```

This reduces cognitive load in the parent service and makes race-sensitive behavior directly testable.

## Pattern: No Requirement Leakage

Capture stable implementation dependencies at construction. Preserve intentional
call-time requirements such as `Scope`, transactions, request context, and
schema decoding/encoding services in method return types; capturing those in an
application-lifetime layer would give them the wrong lifetime or authority.

```typescript
// database.ts
import { Effect, Layer, Schema, Context } from 'effect';

class QueryError extends Schema.TaggedError<QueryError>()('QueryError', {
	message: Schema.String
}) {}

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
			// Requirements = never; dependencies are in the closure.
			const conn = yield* pool.acquire();
			return yield* conn.execute(sql);
		});

		return Service.of({ query });
	})
);

export const defaultLayer = layer.pipe(
	Layer.provide(ConnectionPool.defaultLayer)
);

export * as Database from './database.js';
```

Dependencies are handled by:

1. **`Layer.effect` closure** — services captured at construction time via `yield*`
2. **`Layer.provide`** — wires dependency layers into `defaultLayer`

Both remove stable infrastructure dependencies from method signatures. `R = never`
is appropriate only when the operation has no intentional caller-supplied context.

## Pattern: Whole-Function Transforms

Additional arguments after an `Effect.fn` body transform the whole function call. Each transform receives the previous effect followed by the original arguments. Use this for concise boundary policy that needs those arguments, such as error classification, annotations, retry, timeout, or cleanup; keep branch-local handling in the generator body.

```typescript
const get = Effect.fn('UserRepo.get')(
	function* (id: UserId) {
		return yield* database.getUser(id);
	},
	(effect, id) =>
		effect.pipe(
			Effect.annotateLogs({ userId: id }),
			Effect.mapError((cause) => new PersistenceError({ cause }))
		)
);
```

Prefer one or two readable transforms over a long wrapper pipeline. These transforms apply to every execution of the returned function.

Update Effect callers to use the project's domain projection, such as `yield* UserRepo.Service`, as early as possible once the service exists. Keep async facades only for non-Effect boundaries that still need compatibility.

## Pattern: Leaf Services with a Platform Dependency

Even a small "leaf" service often needs a platform capability such as cryptographic UUID generation. Use the platform-agnostic `Crypto` service instead of the global `crypto.randomUUID`, capture it in `Layer.effect`, and wire a concrete implementation (e.g. `NodeCrypto.layer`) in `defaultLayer`:

```typescript
// id-generator.ts
import { Context, Crypto, Effect, Layer } from 'effect';
import { NodeCrypto } from '@effect/platform-node';

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

export * as IdGenerator from './id-generator.js';
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
import { PaymentGateway } from './payment-gateway.js';
import { PaymentRefundGateway } from './payment-refund-gateway.js';

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

Interface-only service modules (no `layer` export) are appropriate when a service has **no single obvious implementation**. The contract module is projected normally, while implementations live in separate adapter modules:

```typescript
// clipboard.ts
import { Context } from 'effect';
import type { Effect } from 'effect';

// Interface-only: multiple implementations exist
export interface Interface {
	readonly read: Effect.Effect<string, ClipboardError>;
	readonly write: (text: string) => Effect.Effect<void, ClipboardError>;
}

export class Service extends Context.Service<Service, Interface>()(
	'@Clipboard/Clipboard'
) {}

// No layer here. macOS and Linux adapter modules each export their own layer.

export * as Clipboard from './clipboard.js';
```

**Rule of thumb:**

- Existing project service convention → preserve its tag style and naming
- No project convention → one service ES module whose owning leaf self-exports its canonical identity
- Has a default implementation → export `layer` and optionally `defaultLayer`
- Multiple platform implementations → contract module exports `Service`; adapter modules export layers
- No dependencies → export `layer` only; no `defaultLayer` needed
- Folder/package barrels → relay the owning leaf's identity; never recreate it

## Testing Benefits

Each capability can be tested in isolation:

```typescript
import { Effect, Layer } from 'effect';
import { PaymentWebhookGateway } from './payment-webhook-gateway.js';

const TestWebhook = Layer.succeed(
	PaymentWebhookGateway.Service,
	PaymentWebhookGateway.Service.of({
		validateWebhook: () => Effect.succeed(undefined)
	})
);

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

`Layer.mock(Service)({...})` accepts a partial implementation and supplies defecting
stubs for unimplemented members. Use a complete `Layer.succeed(Service,
Service.of({...}))` fake when every method must be implemented at compile time.

For a reusable stateful fake, expose a separate test-control service and provide the same implementation under both tags with `Layer.effectContext`. Production code sees only the production interface; tests can inspect state and trigger transitions deterministically.

```typescript
// notifier.ts
import { Context, Effect, Layer, Option, Ref } from 'effect';
import * as Arr from 'effect/Array';

export interface Interface {
	readonly send: (message: Message) => Effect.Effect<void, SendError>;
}

export class Service extends Context.Service<Service, Interface>()(
	'@app/Notifier'
) {}

export interface TestInterface extends Interface {
	readonly sentMessages: () => Effect.Effect<ReadonlyArray<Message>>;
	readonly failNextSend: (error: SendError) => Effect.Effect<void>;
}

export class TestService extends Context.Service<TestService, TestInterface>()(
	'@app/Notifier/Test'
) {}

export const testLayer = Layer.effectContext(
	Effect.gen(function* () {
		const sent = yield* Ref.make<ReadonlyArray<Message>>([]);
		const nextFailure = yield* Ref.make<Option.Option<SendError>>(
			Option.none()
		);
		const service = TestService.of({
			send: Effect.fn('Notifier.Test.send')(function* (message) {
				const failure = yield* Ref.getAndSet(nextFailure, Option.none());
				if (Option.isSome(failure)) return yield* Effect.fail(failure.value);
				yield* Ref.update(sent, Arr.append(message));
			}),
			sentMessages: Effect.fn('Notifier.Test.sentMessages')(function* () {
				return yield* Ref.get(sent);
			}),
			failNextSend: Effect.fn('Notifier.Test.failNextSend')(function* (error) {
				yield* Ref.set(nextFailure, Option.some(error));
			})
		});

		return Context.empty().pipe(
			Context.add(Service, service),
			Context.add(TestService, service)
		);
	})
);

export * as Notifier from './notifier.js';
```

## Naming Convention

Use descriptive capability names for the owning leaf's projected ES-module identity:

- `*Gateway` - External system integration
- `*Repo` / `*Repository` - Data persistence; follow project vocabulary
- `*Domain` - Business logic
- `*RunState`, `*Coordinator`, `*Registry` - explicit lifecycle or orchestration state
- General domain name preferred over generic `*Service` suffix

Tag identifiers should include the domain name according to project convention:

- `"@app/PaymentGateway"`
- `"@app/UserRepo"`
- `"@app/OrderDomain"`

`Effect.fn` span names use the projected domain prefix, not the file-local role name:

- `Effect.fn("PaymentGateway.handoff")` — not `Effect.fn("Service.handoff")`
- `Effect.fn("UserRepo.findById")` — not `Effect.fn("UserRepo.Service.findById")`

## Quality Checklist

- [ ] Existing project service-tag and module conventions are preserved; no style-only migration to `Context.Service`
- [ ] When no convention exists, each owning leaf ends with `export * as Domain from "./domain.js"`
- [ ] Siblings import canonical identities from owning leaves; folder/package barrels only relay them with `export { Domain } from "./domain.js"`
- [ ] The toolchain and runtime support intentional self-referential ES-module projection
- [ ] No TypeScript `namespace` declaration is introduced for service organization
- [ ] When using class-style `Context.Service`, the shape is its type parameter and the class body is empty
- [ ] Service methods use `Effect.fn("Domain.methodName")` with the projected domain prefix
- [ ] Service represents single capability
- [ ] Stable dependencies are captured; intentional caller-scoped requirements remain explicit in R
- [ ] Dependencies captured in `Layer.effect` closure via `yield*`; wired via `Layer.provide` on `defaultLayer`
- [ ] The project tag's implementation constructor is used; for `Context.Service`, use `Service.of({...})`
- [ ] Tagged with a descriptive, unique identifier under project convention
- [ ] `defaultLayer` only present when `layer` has unsatisfied requirements
- [ ] `defaultLayer` composes directly unless there is a real need for deferred evaluation
- [ ] Can be tested in isolation with `Layer.succeed` or `Layer.mock`
- [ ] Can be composed with other capabilities
- [ ] No use of removed v3 options: `accessors`, `effect`, `succeed`, `dependencies`

Keep services focused, composable, and free of leaked requirements.
