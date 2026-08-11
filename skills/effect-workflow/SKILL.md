---
name: effect-workflow
description: Build durable workflows with Effect using Workflow, Activity, DurableClock, DurableDeferred, and DurableQueue for execution that survives restarts, supports compensation (saga pattern), and integrates with Effect Cluster for distribution.
---

You are an Effect TypeScript expert specializing in durable workflow execution using the `effect/unstable/workflow` module.

## Effect Source Reference

The Effect v4 source is available at `~/.cache/effect-v4/`.
Browse and read files there directly to look up APIs, types, and implementations.

Key source files:

- `packages/effect/src/unstable/workflow/Workflow.ts` — Workflow definition, compensation, annotations
- `packages/effect/src/unstable/workflow/Activity.ts` — Activity definition, retry, idempotency
- `packages/effect/src/unstable/workflow/WorkflowEngine.ts` — Engine service, in-memory layer, encoded interface
- `packages/effect/src/unstable/workflow/DurableClock.ts` — Durable sleep/timers
- `packages/effect/src/unstable/workflow/DurableDeferred.ts` — Durable signal/wait, tokens, done/succeed/fail
- `packages/effect/src/unstable/workflow/DurableQueue.ts` — Durable queue handing work to persisted background workers

## IMPORTANT: Unstable API

The workflow module lives under `effect/unstable/workflow`. APIs may change between versions. All imports use this path:

```ts
import {
	Workflow,
	Activity,
	WorkflowEngine,
	DurableClock,
	DurableDeferred,
	DurableQueue
} from 'effect/unstable/workflow';
```

## Core Concepts

Effect Workflow provides **durable execution** — workflows that survive process restarts through event sourcing. The key idea: activities are the units of side-effectful work whose results get persisted. On replay, persisted results are returned without re-executing the activity.

### Architecture

```
Workflow  →  defines the overall process (name, payload, success/error schemas)
Activity  →  a discrete unit of work inside a workflow (results are persisted)
WorkflowEngine  →  orchestrates execution, replay, suspension, resumption
DurableClock  →  sleep/timer that persists across restarts
DurableDeferred  →  wait-for-external-signal that persists across restarts
DurableQueue  →  hand work to a persisted background worker and await its result
```

## Workflow Definition

Use `Workflow.make` to define a workflow. Every workflow has:

- A unique `name`
- A `payload` schema (struct fields or Schema)
- An `idempotencyKey` function that produces a deterministic execution ID from the payload
- Optional `success` and `error` schemas (default `Schema.Void` / `Schema.Never`)

```ts
import { Workflow } from 'effect/unstable/workflow';
import { Schema } from 'effect';

const SendEmail = Workflow.make({
	name: 'SendEmail',
	payload: {
		to: Schema.String,
		subject: Schema.String,
		body: Schema.String
	},
	idempotencyKey: (payload) => `${payload.to}:${payload.subject}`,
	success: Schema.Void,
	error: Schema.String
});
```

### Registering a Workflow Handler

Use `workflow.toLayer(handler)` to register the execution logic. The handler receives the decoded payload and execution ID:

```ts
const SendEmailLive = SendEmail.toLayer((payload, executionId) =>
	Effect.gen(function* () {
		// Activities go here — their results are persisted
		yield* validateRecipient; // an Activity
		yield* sendViaProvider; // an Activity
	})
);
```

### Executing a Workflow

```ts
// Execute and wait for result
const result =
	yield*
	SendEmail.execute({
		to: 'user@example.com',
		subject: 'Hello',
		body: 'World'
	});

// Fire-and-forget — returns the execution ID
const executionId =
	yield*
	SendEmail.execute(
		{ to: 'user@example.com', subject: 'Hello', body: 'World' },
		{ discard: true }
	);

// Poll for result
const maybeResult = yield* SendEmail.poll(executionId);
// returns Effect<Option<Result<A, E>>>
//   Option.None  → workflow not yet started or no record
//   Option.Some(Workflow.Complete<A, E>)   → finished; .exit holds the Exit
//   Option.Some(Workflow.Suspended)        → suspended waiting on something

// Interrupt a running workflow
yield* SendEmail.interrupt(executionId);

// Resume a suspended workflow
yield* SendEmail.resume(executionId);
```

### Deterministic Execution ID

The execution ID is computed as a hash of `"${name}-${idempotencyKey(payload)}"`. This means executing the same workflow with the same payload is idempotent — it returns the existing execution rather than starting a new one.

```ts
const id =
	yield*
	SendEmail.executionId({
		to: 'user@example.com',
		subject: 'Hello',
		body: 'World'
	});
```

## Activities

Activities are the **atomic units of work** inside a workflow. Their results are persisted by the engine, so on replay they return the cached result without re-executing.

```ts
import { Activity } from 'effect/unstable/workflow';

const validateRecipient = Activity.make({
	name: 'ValidateRecipient',
	success: Schema.Struct({ valid: Schema.Boolean }),
	error: Schema.String,
	execute: Effect.gen(function* () {
		// This code runs at most once per workflow execution
		// (unless the activity itself fails and is retried)
		const result = yield* checkEmailService(payload.to);
		return { valid: result.isValid };
	})
});
```

### Activity is an Effect

An `Activity` extends `Effect.Effect` (it is implemented via `Effectable.Prototype`), so you can yield it directly inside a workflow handler:

```ts
const handler = SendEmail.toLayer((payload, executionId) =>
	Effect.gen(function* () {
		const validation = yield* validateRecipient; // yields the Activity directly
	})
);
```

### Activity Retry

Use `Activity.retry` to retry an effect within an activity. The engine tracks the attempt count automatically and exposes it via `Activity.CurrentAttempt`:

```ts
import { Activity } from 'effect/unstable/workflow';

const sendWithRetry = Activity.make({
	name: 'SendWithRetry',
	success: Schema.Void,
	error: Schema.String,
	execute: pipe(sendEmailEffect, Activity.retry({ times: 3 }))
});
```

`Activity.retry` accepts the same options as `Effect.retry` *minus* `schedule` — the activity owns the attempt counter, so retries are attempt-based (`times`, `until`, `while`, `catch`, etc.) rather than schedule-based.

Because an `Activity` *is* an `Effect`, pipe it directly through compensation/retry combinators — there is no `.asEffect()` method (`Effect.Yieldable` was removed in beta.66):

```ts
yield* SomeActivity.pipe(
	workflow.withCompensation((value, cause) => rollback(value)),
	Activity.retry({ times: 5 })
);
```

You can also access `Activity.CurrentAttempt` directly inside an activity's `execute` to branch by attempt:

```ts
Activity.make({
	name: 'SendEmail',
	execute: Effect.gen(function*() {
		const attempt = yield* Activity.CurrentAttempt;
		if (attempt < 5) return yield* Effect.fail(new TransientError());
		return yield* sendEmail();
	})
});
```

Activities also expose `.execute` and `.executeEncoded` properties — the latter returns the JSON-encoded form of success/error, useful for generic activity wrappers and logging.

### Interrupt Retry Policy

Activities have a built-in `interruptRetryPolicy` — if an activity is interrupted (e.g., by process shutdown), it automatically retries with exponential backoff up to 10 times. You can override this:

```ts
Activity.make({
	name: 'LongRunning',
	execute: longRunningEffect,
	interruptRetryPolicy: Schedule.recurs(5)
});
```

### Idempotency Keys

Generate deterministic idempotency keys for external API calls within activities:

```ts
const key = yield* Activity.idempotencyKey('stripe-charge');
// Incorporates the execution ID + activity name

// Include the attempt number for retry-aware keys
const keyWithAttempt =
	yield*
	Activity.idempotencyKey('stripe-charge', {
		includeAttempt: true
	});
```

### Racing Activities

Race multiple activities — the first to complete wins, and the result is durably stored:

```ts
const result =
	yield*
	Activity.raceAll('fastest-provider', [
		sendViaProviderA,
		sendViaProviderB,
		sendViaProviderC
	]);
```

## DurableClock — Durable Sleep

`DurableClock.sleep` creates a timer that survives process restarts. Short sleeps (<=60s by default) run in-memory as regular activities. Longer sleeps are scheduled through the engine.

```ts
import { DurableClock } from 'effect/unstable/workflow';

// Inside a workflow handler:
yield*
	DurableClock.sleep({
		name: 'wait-before-retry',
		duration: '30 minutes'
	});

// Customize the in-memory threshold (default 60 seconds)
yield*
	DurableClock.sleep({
		name: 'cooldown',
		duration: '5 minutes',
		inMemoryThreshold: '2 minutes' // sleeps <= 2min run in-memory
	});
```

Under the hood, a DurableClock creates a `DurableDeferred` and the engine schedules a wake-up after the duration elapses.

## DurableDeferred — Wait for External Signals

`DurableDeferred` lets a workflow pause and wait for an external event (e.g., a webhook, user approval, payment confirmation). The state is persisted, so the workflow can resume after restart.

### Creating and Awaiting

```ts
import { DurableDeferred } from 'effect/unstable/workflow';
import { Schema, Exit } from 'effect';

// Define the deferred with typed schemas
const PaymentConfirmation = DurableDeferred.make('payment-confirmation', {
	success: Schema.Struct({ transactionId: Schema.String }),
	error: Schema.String
});

// Inside a workflow: wait for the signal
const confirmation = yield* DurableDeferred.await(PaymentConfirmation);
```

### Completing from Outside

External code (e.g., a webhook handler) completes the deferred using a **token**:

```ts
// Inside the workflow: generate a token to give to external systems
const token = yield* DurableDeferred.token(PaymentConfirmation);
// token is a branded string encoding workflow + execution + deferred name

// --- Later, from outside the workflow (e.g., webhook handler): ---

// Succeed
yield*
	DurableDeferred.succeed(PaymentConfirmation, {
		token,
		value: { transactionId: 'tx_123' }
	});

// Or fail
yield*
	DurableDeferred.fail(PaymentConfirmation, {
		token,
		error: 'Payment declined'
	});

// Or use done() with a full Exit
yield*
	DurableDeferred.done(PaymentConfirmation, {
		token,
		exit: Exit.succeed({ transactionId: 'tx_123' })
	});
```

### Token Generation Without Being Inside a Workflow

You can generate tokens from outside a workflow if you know the workflow and payload:

```ts
// From execution ID
const token = DurableDeferred.tokenFromExecutionId(PaymentConfirmation, {
	workflow: SendEmail,
	executionId: 'abc123'
});

// From payload (computes the execution ID)
const token =
	yield*
	DurableDeferred.tokenFromPayload(PaymentConfirmation, {
		workflow: SendEmail,
		payload: { to: 'user@example.com', subject: 'Hello', body: 'World' }
	});
```

### Token Parsing

Tokens are base64url-encoded and can be parsed:

```ts
const parsed = DurableDeferred.TokenParsed.fromString(token);
// { workflowName: "SendEmail", executionId: "abc123", deferredName: "payment-confirmation" }
```

### Piping an Effect into a DurableDeferred

`DurableDeferred.into` runs an effect and stores its result in the deferred on completion:

```ts
yield* pipe(someEffect, DurableDeferred.into(PaymentConfirmation));
```

### Racing with DurableDeferred

`DurableDeferred.raceAll` races multiple effects and durably stores the first result:

```ts
const result =
	yield*
	DurableDeferred.raceAll({
		name: 'first-response',
		success: Schema.String,
		error: Schema.Never,
		effects: [fetchFromA, fetchFromB]
	});
```

## DurableQueue — Hand Work to Background Workers

`DurableQueue` lets a workflow delegate a unit of work to a **persisted background worker** and suspend until the worker records a result. The workflow calls `process` to enqueue an item and wait; a separate worker created with `worker` / `makeWorker` takes the item, runs the handler, and completes the waiting workflow through a `DurableDeferred` token.

```ts
import { DurableQueue, Workflow, WorkflowEngine } from 'effect/unstable/workflow';
import { PersistedQueue } from 'effect/unstable/persistence';
import { Effect, Layer, Schema } from 'effect';
```

### Defining a queue — `DurableQueue.make`

```ts
const ApiQueue = DurableQueue.make({
	name: 'ApiQueue',
	payload: { id: Schema.String },
	success: Schema.Void, // default Schema.Void
	error: Schema.Never, // default Schema.Never
	idempotencyKey: (payload) => payload.id
});
```

The `name`, the payload/success/error schemas, and the `idempotencyKey` are **persisted coordination state**. Keep them deterministic and stable across deployments — changing them is a persistence migration. The `idempotencyKey` becomes the persisted queue item id.

### Producing — `DurableQueue.process`

Call `process` from inside a workflow handler. It encodes the payload, offers it to the persisted queue with a deferred token, suspends the workflow, and resumes with the worker's typed success or error:

```ts
const MyWorkflowLayer = MyWorkflow.toLayer((payload) =>
	Effect.gen(function* () {
		yield* DurableQueue.process(ApiQueue, { id: 'api-call-1' });
		// resumes here once a worker records the result
	})
);
```

`process(queue, payload, { retrySchedule? })` requires **`WorkflowEngine | WorkflowInstance | PersistedQueue.PersistedQueueFactory`** in context — it runs as activity-style work *inside* a running workflow. `retrySchedule` only governs retries of transient `PersistedQueueError`s while offering the item, not the handler.

### Consuming — `DurableQueue.worker` / `makeWorker`

`worker` returns a `Layer` that forks background workers; `makeWorker` returns the underlying `Effect<never>` if you want to fork it yourself:

```ts
const ApiWorker = DurableQueue.worker(
	ApiQueue,
	(payload) => Effect.log(`processing ${payload.id}`),
	{ concurrency: 5 } // process up to 5 items concurrently; default 1
);
```

`worker` / `makeWorker` require **`WorkflowEngine | PersistedQueue.PersistedQueueFactory`** (plus the handler's own `R`). Note they do **not** require `WorkflowInstance`, unlike `process` — workers run outside any single workflow instance.

### Service requirements & idempotency

Provide a `PersistedQueueFactory`. Tests wire the in-memory store:

```ts
const PersistedQueueLayer = PersistedQueue.layer.pipe(
	Layer.provideMerge(PersistedQueue.layerStoreMemory)
);

const AppLayer = Layer.mergeAll(MyWorkflowLayer, ApiWorker).pipe(
	Layer.provideMerge(WorkflowEngine.layerMemory),
	Layer.provideMerge(PersistedQueueLayer)
);
```

Delivery is **at least once** per the backing `PersistedQueue`, so worker handlers must be **idempotent** and tolerate retries, duplicate observations, and worker restarts.

## Compensation (Saga Pattern)

`Workflow.withCompensation` registers rollback logic that runs if the **entire workflow** fails. This enables the saga pattern for distributed transactions.

```ts
const handler = OrderWorkflow.toLayer((payload, executionId) =>
	Effect.gen(function* () {
		// Reserve inventory — if workflow fails later, compensate
		const reservation = yield* pipe(
			reserveInventory,
			OrderWorkflow.withCompensation((reservationId, cause) =>
				cancelReservation(reservationId)
			)
		);

		// Charge payment — if workflow fails later, compensate
		const charge = yield* pipe(
			chargePayment,
			OrderWorkflow.withCompensation((chargeId, cause) =>
				refundPayment(chargeId)
			)
		);

		// Ship order — no compensation needed for the last step
		yield* shipOrder(reservation, charge);
	})
);
```

The compensation function receives:

1. The **success value** of the compensated effect (so you can use it for rollback)
2. The **Cause** of the workflow failure

**Important**: Compensation only works for top-level effects in the workflow, not for nested activities.

## Workflow Annotations

### CaptureDefects

Controls whether defects (unexpected errors) are captured in the workflow result. Default: `true`.

```ts
const MyWorkflow = Workflow.make({ ... }).annotate(Workflow.CaptureDefects, false)
```

### SuspendOnFailure

When `true`, the workflow suspends on any error instead of failing. You can then manually resume it:

```ts
const MyWorkflow = Workflow.make({ ... }).annotate(Workflow.SuspendOnFailure, true)

// Later, after fixing the issue:
yield* MyWorkflow.resume(executionId)
```

## Workflow Scope

Access the workflow's scope, which lives for the entire execution (across replays):

```ts
// Get the scope
const workflowScope = yield* Workflow.scope;

// Provide scope to a scoped effect
yield* Workflow.provideScope(myScopedEffect);

// Add a finalizer to the workflow scope
yield*
	Workflow.addFinalizer((exit) =>
		Effect.log(`Workflow completed with: ${exit}`)
	);
```

## WorkflowEngine

The `WorkflowEngine` is a service that orchestrates workflow execution. It handles registration, execution, replay, suspension, and resumption.

### In-Memory Engine (Testing/Development)

For testing and local development, use the in-memory engine:

```ts
import { WorkflowEngine } from 'effect/unstable/workflow';

const TestLayer = Layer.mergeAll(
	SendEmailLive
	// ... other workflow registrations
).pipe(Layer.provideMerge(WorkflowEngine.layerMemory));
```

**Warning**: The in-memory engine does NOT provide durability guarantees. Use it only for testing.

### Production Engine — `ClusterWorkflowEngine.layer`

For production, use `ClusterWorkflowEngine.layer` from `effect/unstable/cluster`. It wires the workflow engine into `Sharding` + `MessageStorage` so executions, activities, and durable signals survive restarts and can be distributed across runners:

```ts
import { Layer } from 'effect';
import { ClusterWorkflowEngine } from 'effect/unstable/cluster';

const WorkflowsLayer = Layer.mergeAll(
	SendEmailLive,
	ProcessOrderLive
).pipe(Layer.provideMerge(ClusterWorkflowEngine.layer));

// then provide the cluster bundle (NodeClusterSocket.layer / SingleRunner.layer / TestRunner.layer)
```

The `ClusterWorkflowEngine` requires `Sharding | MessageStorage` in context; both come from any of the cluster runtime bundles. See the `effect-rpc-cluster` skill for cluster setup.

#### Workflow shard-group routing

A workflow can be annotated with `ClusterSchema.ShardGroup` (from `effect/unstable/cluster`), exactly like an entity:

```ts
import { ClusterSchema } from 'effect/unstable/cluster';

const OrderWorkflow = Workflow.make({ /* ... */ })
	.annotate(ClusterSchema.ShardGroup, () => 'workflow');
```

`ClusterWorkflowEngine` reads that annotation when computing the workflow entity's address, so the workflow's entity messages, durable clock wake-ups, and registered durable-deferred completions all route through the owning workflow's shard group. If you use any group other than `'default'`, you must include it on the appropriate runners via `ShardingConfig.availableShardGroups` / `assignedShardGroups` (e.g. `['default', 'workflow']`) — otherwise those messages have nowhere to land. See the `effect-rpc-cluster` skill for `ShardingConfig` details.

### Custom Engine Implementation

For production, implement the `WorkflowEngine.Encoded` interface and use `WorkflowEngine.makeUnsafe`:

```ts
const engine = WorkflowEngine.makeUnsafe({
  register: (workflow, execute) => ...,
  // execute receives { executionId, payload, discard, parent? }. The engine
  // passes `parent` even for discard executions, so child interruption links
  // back to the parent workflow before the deterministic execution id returns.
  execute: (workflow, { executionId, payload, discard, parent }) => ...,
  poll: (workflow, executionId) => ...,
  interrupt: (workflow, executionId) => ...,
  // Required by beta.74 WorkflowEngine.Encoded. interruptUnsafe is a more
  // direct stop that CAN bypass compensation and parent/child cleanup
  // guarantees that `interrupt` upholds — prefer `interrupt` unless you
  // explicitly need the harder stop.
  interruptUnsafe: (workflow, executionId) => ...,
  resume: (workflow, executionId) => ...,
  activityExecute: (activity, attempt) => ...,
  deferredResult: (deferred) => ...,
  deferredDone: (options) => ...,
  scheduleClock: (workflow, options) => ...
})
```

The `Encoded` interface works with raw/encoded values (JSON-safe), while the `WorkflowEngine` service handles schema encoding/decoding automatically.

### Suspended Retry Schedule

When a workflow suspends (waiting for an activity or deferred), the engine retries with a default schedule of `Schedule.exponential(200, 1.5)` (200ms base, 1.5x factor) combined with `Schedule.either(Schedule.spaced(30000))` (capped at 30s). Override per-workflow:

```ts
const MyWorkflow = Workflow.make({
	name: 'MyWorkflow',
	payload: { id: Schema.String },
	idempotencyKey: (p) => p.id,
	suspendedRetrySchedule: Schedule.spaced('5 seconds')
});
```

## Complete Example: Order Processing Workflow

```ts
import { Effect, Exit, Layer, Schema, pipe } from 'effect';
import {
	Activity,
	DurableClock,
	DurableDeferred,
	Workflow,
	WorkflowEngine
} from 'effect/unstable/workflow';

// --- Schemas ---

class OrderError extends Schema.TaggedClass<OrderError>()('OrderError', {
	message: Schema.String
}) {}

// --- Deferred for external payment confirmation ---

const PaymentApproval = DurableDeferred.make('payment-approval', {
	success: Schema.Struct({ transactionId: Schema.String }),
	error: OrderError
});

// --- Activities ---

const validateOrder = Activity.make({
	name: 'ValidateOrder',
	success: Schema.Struct({ valid: Schema.Boolean }),
	error: OrderError,
	execute: Effect.gen(function* () {
		// validate order details
		return { valid: true };
	})
});

const reserveInventory = Activity.make({
	name: 'ReserveInventory',
	success: Schema.Struct({ reservationId: Schema.String }),
	error: OrderError,
	execute: Effect.gen(function* () {
		const key = yield* Activity.idempotencyKey('reserve');
		// call inventory service with idempotency key
		return { reservationId: 'res_001' };
	})
});

const shipOrder = Activity.make({
	name: 'ShipOrder',
	success: Schema.Void,
	error: OrderError,
	execute: Effect.gen(function* () {
		// call shipping service
	})
});

// --- Workflow ---

const ProcessOrder = Workflow.make({
	name: 'ProcessOrder',
	payload: {
		orderId: Schema.String,
		items: Schema.Array(Schema.String)
	},
	idempotencyKey: (payload) => payload.orderId,
	success: Schema.Struct({ transactionId: Schema.String }),
	error: OrderError
});

const ProcessOrderLive = ProcessOrder.toLayer((payload, executionId) =>
	Effect.gen(function* () {
		// Step 1: Validate
		yield* validateOrder;

		// Step 2: Reserve inventory with compensation
		const reservation = yield* pipe(
			reserveInventory,
			ProcessOrder.withCompensation(({ reservationId }, _cause) =>
				Effect.log(`Cancelling reservation ${reservationId}`)
			)
		);

		// Step 3: Wait for payment (external signal)
		const payment = yield* DurableDeferred.await(PaymentApproval);

		// Step 4: Wait before shipping
		yield* DurableClock.sleep({
			name: 'pre-ship-delay',
			duration: '5 minutes'
		});

		// Step 5: Ship
		yield* shipOrder;

		return payment;
	})
);

// --- Running ---

const MainLive = ProcessOrderLive.pipe(
	Layer.provideMerge(WorkflowEngine.layerMemory)
);

// Execute the workflow
const program = Effect.gen(function* () {
	const executionId = yield* ProcessOrder.execute(
		{ orderId: 'order_123', items: ['item_a'] },
		{ discard: true }
	);

	// Later, from a webhook: complete the payment deferred
	const token = DurableDeferred.tokenFromExecutionId(PaymentApproval, {
		workflow: ProcessOrder,
		executionId
	});
	yield* DurableDeferred.succeed(PaymentApproval, {
		token,
		value: { transactionId: 'tx_abc' }
	});
});
```

## Anti-Patterns

### DON'T put side effects outside activities

Non-activity code re-executes on every replay. Only put deterministic logic outside activities.

```ts
// BAD — this HTTP call runs on every replay
const result = yield* httpClient.get('/api/data');

// GOOD — wrap in an activity
const fetchData = Activity.make({
	name: 'FetchData',
	success: Schema.String,
	execute: httpClient.get('/api/data')
});
const result = yield* fetchData;
```

### DON'T use non-deterministic logic outside activities

Random numbers, current time, UUIDs — these all produce different values on replay.

```ts
// BAD
const id = yield* Effect.sync(() => crypto.randomUUID());

// GOOD
const generateId = Activity.make({
	name: 'GenerateId',
	success: Schema.String,
	execute: Effect.sync(() => crypto.randomUUID())
});
```

### DON'T nest compensations inside activities

Compensation finalizers are only registered for top-level effects in the workflow.

## Integration with Effect Cluster

For production durability and distribution, swap `WorkflowEngine.layerMemory` for `ClusterWorkflowEngine.layer` (from `effect/unstable/cluster`):

```ts
import { ClusterWorkflowEngine } from 'effect/unstable/cluster';
import { NodeClusterSocket } from '@effect/platform-node';

const MainLive = Layer.mergeAll(SendEmailLive, ProcessOrderLive).pipe(
	Layer.provideMerge(ClusterWorkflowEngine.layer),
	Layer.provide(
		NodeClusterSocket.layer({ storage: 'sql' }).pipe(Layer.provide(SqlClientLayer))
	)
);
```

`ClusterWorkflowEngine.layer` builds an `Entity` per workflow under the hood — durable execution state lives in `MessageStorage`, runner-to-runner routing comes from `Sharding`, and replays are driven by the entity's mailbox. The `Workflow.Execution<Name>` type in the context represents the execution identity within the cluster.

To expose workflows over RPC or HTTP without writing dispatch glue, use `WorkflowProxy.toRpcGroup` / `WorkflowProxy.toHttpApiGroup` and the matching `WorkflowProxyServer.layerRpcHandlers` / `layerHttpApi`. See the `effect-rpc-cluster` skill for the bridge patterns.
