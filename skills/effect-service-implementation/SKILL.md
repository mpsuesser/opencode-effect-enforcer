---
name: effect-service-implementation
description: Implement Effect services as fine-grained capabilities avoiding monolithic designs
---

# Service Implementation Skill

Design and implement Effect services as focused capabilities that compose into complete solutions.

## Effect Source Reference

The Effect v4 source is available at `.references/effect-v4/` in your project root.
Browse and read files there directly to look up APIs, types, and implementations.

Reference this for:

- ServiceMap source: `packages/effect/src/ServiceMap.ts`
- Layer source: `packages/effect/src/Layer.ts`
- Migration guide: `MIGRATION.md`
- Effect source: `packages/effect/src/`

## Service Declaration: `ServiceMap.Service`

All business services use `ServiceMap.Service`. The service shape is the **second type parameter**, not a runtime argument. Methods use `Effect.fn` for automatic tracing.

```typescript
import { Effect, Layer, Schema, ServiceMap } from 'effect';

class UserNotFound extends Schema.TaggedErrorClass<UserNotFound>()(
	'UserNotFound',
	{
		userId: Schema.String,
		message: Schema.String
	}
) {}

export class UserRepository extends ServiceMap.Service<
	UserRepository,
	{
		readonly findById: (id: string) => Effect.Effect<User, UserNotFound>;
	}
>()('@services/user/UserRepository', {
	make: Effect.gen(function* () {
		const db = yield* DatabaseClient;

		const findById = Effect.fn('UserRepository.findById')(function* (
			id: string
		) {
			const row = yield* db.query('SELECT * FROM users WHERE id = ?', id);
			if (!row)
				return yield* new UserNotFound({
					userId: id,
					message: `User ${id} not found`
				});
			return row as User;
		});

		return { findById };
	})
}) {
	static readonly layer = Layer.effect(this, this.make).pipe(
		Layer.provide(DatabaseClient.layer)
	);
}
```

Key properties:

- Service shape is the **second type parameter** `ServiceMap.Service<Self, Shape>()`
- `make:` block — an Effect that constructs the service; stored on the class but does NOT auto-generate a layer
- `static readonly layer` — build the layer explicitly with `Layer.effect(this, this.make)`, wire dependencies with `Layer.provide`
- `Effect.fn("Service.method")` — creates a traced span for every call
- Access the service with `yield*` in generators, or `Service.use(s => ...)` / `Service.useSync(s => ...)` for one-liners

### What does NOT exist in v4:

- `accessors: true` — REMOVED. Use `yield*` or `.use()` / `.useSync()` instead
- `effect:` option — does NOT exist. Use `make:` instead
- `succeed:` option — does NOT exist. Use `Layer.succeed` externally or `{ make: Effect.succeed({...}) }`
- `dependencies: [...]` option — REMOVED. Use `Layer.provide` on the layer

## Anti-Pattern: Monolithic Services

```typescript
import { Effect, Layer, ServiceMap } from 'effect';

// WRONG - Mixed concerns in one service
export class PaymentService extends ServiceMap.Service<
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
import { Effect, Layer, Schema, ServiceMap } from 'effect';

class HandoffError extends Schema.TaggedErrorClass<HandoffError>()(
	'HandoffError',
	{
		message: Schema.String
	}
) {}

class WebhookValidationError extends Schema.TaggedErrorClass<WebhookValidationError>()(
	'WebhookValidationError',
	{ message: Schema.String }
) {}

class RefundError extends Schema.TaggedErrorClass<RefundError>()(
	'RefundError',
	{
		message: Schema.String
	}
) {}

// Focused capabilities — one concern per service

export class PaymentGateway extends ServiceMap.Service<
	PaymentGateway,
	{
		readonly handoff: (
			intent: PaymentIntent
		) => Effect.Effect<HandoffResult, HandoffError>;
	}
>()('@services/payment/PaymentGateway', {
	make: Effect.gen(function* () {
		const stripe = yield* StripeClient;

		const handoff = Effect.fn('PaymentGateway.handoff')(function* (
			intent: PaymentIntent
		) {
			// implementation using stripe client
			return { status: 'completed' } as HandoffResult;
		});

		return { handoff };
	})
}) {
	static readonly layer = Layer.effect(this, this.make).pipe(
		Layer.provide(StripeClient.layer)
	);
}

export class PaymentWebhookGateway extends ServiceMap.Service<
	PaymentWebhookGateway,
	{
		readonly validateWebhook: (
			payload: WebhookPayload
		) => Effect.Effect<void, WebhookValidationError>;
	}
>()('@services/payment/PaymentWebhookGateway', {
	make: Effect.gen(function* () {
		const stripe = yield* StripeClient;

		const validateWebhook = Effect.fn(
			'PaymentWebhookGateway.validateWebhook'
		)(function* (payload: WebhookPayload) {
			// implementation
		});

		return { validateWebhook };
	})
}) {
	static readonly layer = Layer.effect(this, this.make).pipe(
		Layer.provide(StripeClient.layer)
	);
}

export class PaymentRefundGateway extends ServiceMap.Service<
	PaymentRefundGateway,
	{
		readonly refund: (
			paymentId: PaymentId,
			amount: Cents
		) => Effect.Effect<RefundResult, RefundError>;
	}
>()('@services/payment/PaymentRefundGateway', {
	make: Effect.gen(function* () {
		const stripe = yield* StripeClient;

		const refund = Effect.fn('PaymentRefundGateway.refund')(function* (
			paymentId: PaymentId,
			amount: Cents
		) {
			return { status: 'refunded' } as RefundResult;
		});

		return { refund };
	})
}) {
	static readonly layer = Layer.effect(this, this.make).pipe(
		Layer.provide(StripeClient.layer)
	);
}
```

## Pattern: No Requirement Leakage

Service methods should **never** have requirements in their return type:

```typescript
import { Effect, Layer, Schema, ServiceMap } from 'effect';

class QueryError extends Schema.TaggedErrorClass<QueryError>()('QueryError', {
	message: Schema.String
}) {}

export class Database extends ServiceMap.Service<
	Database,
	{
		readonly query: (sql: string) => Effect.Effect<QueryResult, QueryError>;
	}
>()('@services/Database', {
	make: Effect.gen(function* () {
		const pool = yield* ConnectionPool; // Dependency captured in closure

		const query = Effect.fn('Database.query')(function* (sql: string) {
			//  Requirements = never (no R param)
			//  Dependencies are in the closure, not the return type
			const conn = yield* pool.acquire();
			return yield* conn.execute(sql);
		});

		return { query };
	})
}) {
	static readonly layer = Layer.effect(this, this.make).pipe(
		Layer.provide(ConnectionPool.layer)
	);
}
```

Dependencies are handled by:

1. **`make:` closure** — services captured at construction time via `yield*`
2. **`Layer.provide`** — wires dependency layers into the static layer

Both keep the method signatures clean (`R = never`).

## Pattern: Simple Services Without Dependencies

For services with no external dependencies, use `make: Effect.succeed(...)` or define the layer with `Layer.succeed`:

```typescript
import { Effect, Layer, ServiceMap } from 'effect';

export class IdGenerator extends ServiceMap.Service<
	IdGenerator,
	{
		readonly generate: Effect.Effect<string>;
	}
>()('@services/IdGenerator', {
	make: Effect.succeed({
		generate: Effect.sync(() => crypto.randomUUID())
	})
}) {
	static readonly layer = Layer.effect(this, this.make);
}
```

Or equivalently using `Layer.succeed` directly:

```typescript
export class IdGenerator extends ServiceMap.Service<
	IdGenerator,
	{
		readonly generate: Effect.Effect<string>;
	}
>()('@services/IdGenerator') {
	static readonly layer = Layer.succeed(this, {
		generate: Effect.sync(() => crypto.randomUUID())
	});
}
```

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
	const gateway = yield* PaymentGateway;
	const result = yield* gateway.handoff(order.paymentIntent);

	// Optional capability — check if available
	const refundGateway = yield* Effect.serviceOption(PaymentRefundGateway);

	if (Option.isSome(refundGateway)) {
		yield* setupRefundPolicy(refundGateway.value, order);
	}

	return result;
});
```

## When to Use Interface-Style `ServiceMap.Service`

Interface-style `ServiceMap.Service` (shape as type parameter only, no `make`) is appropriate in two cases:

### 1. Config / Infrastructure Injection

Config values, database connections, runtime environment — things injected by the runtime:

```typescript
import { Config, Effect, Layer, Redacted, ServiceMap } from 'effect';

export class StripeConfig extends ServiceMap.Service<
	StripeConfig,
	{
		readonly API_KEY: Redacted.Redacted<string>;
		readonly endpoint: string;
	}
>()('@services/payment/StripeConfig', {
	make: Effect.gen(function* () {
		return {
			API_KEY: yield* Config.redacted('STRIPE_API_KEY'),
			endpoint: yield* Config.string('STRIPE_ENDPOINT').pipe(
				Config.withDefault('https://api.stripe.com')
			)
		};
	})
}) {
	static readonly layer = Layer.effect(this, this.make);
}
```

### 2. Interface-Style Services (No Default Implementation)

When a service has **no single obvious implementation** — the interface is defined separately from its implementations. Examples: a `Clipboard` service with macOS/Linux/browser implementations, a `PromptUserForInput` service with TUI/web/voice implementations.

```typescript
import { Layer, ServiceMap } from 'effect';
import type { Effect } from 'effect';

// Interface-style: multiple implementations exist
export class Clipboard extends ServiceMap.Service<
	Clipboard,
	{
		readonly read: Effect.Effect<string, ClipboardError>;
		readonly write: (text: string) => Effect.Effect<void, ClipboardError>;
	}
>()('@Clipboard/Clipboard') {}

// Each platform provides its own Layer
// layer-macos/: Layer.succeed(Clipboard, { read: ..., write: ... })
// layer-linux/: Layer.succeed(Clipboard, { read: ..., write: ... })
```

**Rule of thumb:**

- Single obvious implementation → `ServiceMap.Service<Self, Shape>()` with `make` and `static readonly layer`
- Multiple implementations / interface-style → `ServiceMap.Service<Self, Shape>()` with no `make`, layers defined externally
- Config / infrastructure injection → `ServiceMap.Service<Self, Shape>()` with `make`

## Testing Benefits

Each capability can be tested in isolation:

```typescript
import { Effect, Layer } from 'effect';

const TestWebhook = Layer.succeed(PaymentWebhookGateway, {
	validateWebhook: () => Effect.succeed(undefined)
});

// Test only webhook validation, no other payment concerns
const testProgram = Effect.gen(function* () {
	const gateway = yield* PaymentWebhookGateway;
	yield* gateway.validateWebhook(payload);
}).pipe(Effect.provide(TestWebhook));
```

## Naming Convention

Use descriptive capability names:

- `*Gateway` - External system integration
- `*Repository` - Data persistence
- `*Domain` - Business logic
- `*Service` - General capability (use sparingly)

Tag identifiers should include namespace:

- `"@services/payment/PaymentGateway"`
- `"@repositories/user/UserRepository"`
- `"@domain/order/OrderDomain"`

## Quality Checklist

- [ ] Service uses `ServiceMap.Service<Self, Shape>()("identifier")` with shape as type parameter
- [ ] Service methods use `Effect.fn("ServiceName.methodName")`
- [ ] Service represents single capability
- [ ] All operations have Requirements = never (no R parameter)
- [ ] Dependencies captured in `make:` closure and wired via `Layer.provide` on `static readonly layer`
- [ ] Tagged with descriptive namespace
- [ ] Can be tested in isolation
- [ ] Can be composed with other capabilities
- [ ] No use of removed v3 options: `accessors`, `effect`, `succeed`, `dependencies`

Keep services focused, composable, and free of leaked requirements.
