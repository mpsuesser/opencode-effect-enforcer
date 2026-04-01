---
name: effect-rpc-cluster
description: Build RPC endpoints, cluster routing, and workflow patterns with Effect RPC and Cluster modules.
---

# RPC, Cluster & Workflow Patterns

All RPC and cluster modules live under `effect/unstable/*` — no separate `@effect/rpc` or `@effect/cluster` packages.

## Imports

```typescript
import {
	Rpc,
	RpcGroup,
	RpcClient,
	RpcServer,
	RpcMiddleware,
	RpcTest
} from 'effect/unstable/rpc';
import {
	Entity,
	ClusterCron,
	TestRunner,
	ClusterSchema
} from 'effect/unstable/cluster';
import { Workflow, Activity } from 'effect/unstable/workflow';
```

## Defining RPCs

`Rpc.make` returns an Rpc value directly — NOT a class to extend:

```typescript
import { Rpc } from 'effect/unstable/rpc';
import { Schema } from 'effect';

// Minimal — no payload, no error
export const Ping = Rpc.make('Ping', {
	success: Schema.String
});

// With payload (struct fields), error, and success
export const GetUser = Rpc.make('GetUser', {
	payload: { id: Schema.String },
	success: User,
	error: UserNotFoundError
});

// Multiple error types via Schema.Union
export const TransferFunds = Rpc.make('TransferFunds', {
	payload: { from: Schema.String, to: Schema.String, amount: Schema.Number },
	success: TransferReceipt,
	error: Schema.Union(InsufficientFundsError, AccountNotFoundError)
});

// Streaming RPC — set stream: true
export const Subscribe = Rpc.make('Subscribe', {
	payload: { topic: Schema.String },
	success: EventMessage,
	error: SubscriptionError,
	stream: true
});
```

### Rpc chaining

Rpcs are pipeable. Use `.annotate()`, `.middleware()`, `.prefix()`:

```typescript
import { ClusterSchema } from 'effect/unstable/cluster';

export const GetCount = Rpc.make('GetCount', {
	success: Schema.Number
}).annotate(ClusterSchema.Persisted, true);
```

## RpcGroup

Groups collect related Rpcs. Create with `RpcGroup.make(...)` (variadic — pass Rpcs directly, no name):

```typescript
import { RpcGroup } from 'effect/unstable/rpc';

const UsersGroup = RpcGroup.make(GetUser, CreateUser, DeleteUser);
```

### Adding Rpcs to existing groups

```typescript
const ExtendedGroup = UsersGroup.add(ListUsers, UpdateUser);
```

### Merging groups

```typescript
const ApiGroup = UsersGroup.merge(OrdersGroup, PaymentsGroup);
```

### Implementing handlers

Use `.toLayer()` for a Layer, or `.toHandlers()` for an Effect producing handler services:

```typescript
const UsersHandlersLayer = UsersGroup.toLayer(
	Effect.gen(function* () {
		const db = yield* Database;
		return UsersGroup.of({
			GetUser: (payload) => db.findUser(payload.id),
			CreateUser: (payload) => db.createUser(payload.input),
			DeleteUser: (payload) => db.deleteUser(payload.id)
		});
	})
);
```

Use `.of()` for type-safe handler construction. Each handler receives the decoded payload as its first argument. Handlers can also receive `options: { clientId, requestId, headers, rpc }` as a second argument.

### Single handler layers

Implement one handler at a time with `.toLayerHandler()`:

```typescript
const GetUserHandler = UsersGroup.toLayerHandler(
	'GetUser',
	Effect.gen(function* () {
		const db = yield* Database;
		return (payload) => db.findUser(payload.id);
	})
);
```

## RpcServer

Run a group as a server. `RpcServer.layer` takes a group and starts processing. `RpcServer.layerHttp` adds HTTP transport:

```typescript
import { RpcServer } from 'effect/unstable/rpc';
import { RpcSerialization } from 'effect/unstable/rpc';

// WebSocket (default) or HTTP transport
const ServerLayer = RpcServer.layerHttp({
	group: UsersGroup,
	path: '/api/rpc',
	protocol: 'websocket' // or "http"
});
```

Available protocol layers:

- `RpcServer.layerProtocolHttp(options)` — HTTP POST request/response
- `RpcServer.layerProtocolWebsocket(options)` — WebSocket (default for `layerHttp`)
- `RpcServer.layerProtocolSocketServer` — raw socket server
- `RpcServer.layerProtocolStdio` — stdio transport
- `RpcServer.layerProtocolWorkerRunner` — web worker transport

## RpcClient

Create type-safe RPC clients:

```typescript
import { RpcClient } from 'effect/unstable/rpc';

// Make a client from a group + protocol
const client = yield * RpcClient.make(UsersGroup);
const user = yield * client.GetUser({ id: '123' });
```

Client protocol layers:

- `RpcClient.layerProtocolHttp({ url: "..." })` — HTTP transport
- `RpcClient.makeProtocolSocket()` — WebSocket transport

### Testing with RpcTest

`RpcTest.makeClient` wires server+client together in-process (no network):

```typescript
import { RpcTest } from 'effect/unstable/rpc';

const client = yield * RpcTest.makeClient(UsersGroup);
const user = yield * client.GetUser({ id: '123' });
```

The test client requires the handler services (from `group.toLayer(...)`) in the context.

## RpcMiddleware

Use `RpcMiddleware.Service` (not `RpcMiddleware.Tag`) for cross-cutting concerns:

```typescript
import { RpcMiddleware } from 'effect/unstable/rpc';

class AuthMiddleware extends RpcMiddleware.Service<
	AuthMiddleware,
	{ provides: CurrentUser }
>()('AuthMiddleware', {
	error: UnauthorizedError
}) {}
```

The type parameter config `{ provides, requires, clientError }` specifies what the middleware provides/requires. Apply to a group:

```typescript
const AuthedGroup = UsersGroup.middleware(AuthMiddleware);
```

Implement the server-side middleware as a Layer providing the `AuthMiddleware` service. The middleware function receives `(effect, options)` where `options` has `{ clientId, requestId, rpc, payload, headers }`.

For client-side middleware behavior, use `RpcMiddleware.layerClient`:

```typescript
const AuthClientLayer = RpcMiddleware.layerClient(
	AuthMiddleware,
	({ rpc, request, next }) =>
		next({
			...request,
			headers: Headers.set(
				request.headers,
				'authorization',
				`Bearer ${token}`
			)
		})
);
```

## Entity (Cluster)

Entity is the primary cluster API. Combines an entity name with an array of Rpcs to define a distributed, addressable actor:

```typescript
import { Entity, ClusterSchema } from 'effect/unstable/cluster';
import { Rpc } from 'effect/unstable/rpc';

export const Increment = Rpc.make('Increment', {
	payload: { amount: Schema.Number },
	success: Schema.Number
});

export const GetCount = Rpc.make('GetCount', {
	success: Schema.Number
}).annotate(ClusterSchema.Persisted, true);

// Entity.make takes a name and array of Rpcs
export const Counter = Entity.make('Counter', [Increment, GetCount]);
```

### Implementing entity handlers

Use `entity.toLayer(...)`. Handlers can hold in-memory state — each entity instance is a separate lifecycle:

```typescript
export const CounterEntityLayer = Counter.toLayer(
	Effect.gen(function* () {
		const count = yield* Ref.make(0);

		return Counter.of({
			Increment: ({ payload }) =>
				Ref.updateAndGet(count, (n) => n + payload.amount),
			GetCount: () => Ref.get(count).pipe(Rpc.fork) // Rpc.fork for concurrent read
		});
	}),
	{ maxIdleTime: '5 minutes' }
);
```

Entity handler options:

- `maxIdleTime` — passivation timeout; entity is stopped after idle, recreated on demand
- `concurrency` — default is sequential (1); set to `"unbounded"` for concurrent handlers
- `mailboxCapacity` — backpressure on incoming messages
- `disableFatalDefects` — prevent fatal defects from crashing the entity
- `defectRetryPolicy` — retry schedule for defects

Use `Rpc.fork` to opt a handler out of sequential processing (e.g., for read-only queries).

### Entity client

Access an entity client to send messages to a specific entity instance by ID:

```typescript
const useCounter = Effect.gen(function* () {
	const clientFor = yield* Counter.client;
	const counter = clientFor('counter-123');

	const afterIncrement = yield* counter.Increment({ amount: 1 });
	const currentCount = yield* counter.GetCount();
});
```

The client requires `Sharding` in context.

### Entity annotations

```typescript
// ClusterSchema.Persisted — persist messages (durable delivery)
Rpc.make("Run", { ... }).annotate(ClusterSchema.Persisted, true)

// ClusterSchema.Uninterruptible — handler cannot be interrupted
Rpc.make("Run", { ... }).annotate(ClusterSchema.Uninterruptible, true)

// ClusterSchema.ShardGroup — control shard routing
Counter.annotate(ClusterSchema.ShardGroup, () => "my-shard-group")
```

### Queue-based entity handlers

For full control, use `entity.toLayerQueue()` which gives you a mailbox + replier:

```typescript
const QueueLayer = Counter.toLayerQueue(
	Effect.gen(function* () {
		return (queue, replier) =>
			Effect.gen(function* () {
				let count = 0;
				while (true) {
					const request = yield* Queue.take(queue);
					if (request.rpc._tag === 'Increment') {
						count += request.payload.amount;
						yield* replier.succeed(request, count);
					} else {
						yield* replier.succeed(request, count);
					}
				}
			});
	})
);
```

### Cluster layer setup

```typescript
import { NodeClusterSocket, NodeRuntime } from '@effect/platform-node';
import { TestRunner } from 'effect/unstable/cluster';

// Production: real cluster with network + SQL persistence
declare const SqlClientLayer: Layer.Layer<SqlClient>;
const ClusterLayer = NodeClusterSocket.layer().pipe(
	Layer.provide(SqlClientLayer)
);

// Testing: in-memory single-process cluster
const ClusterLayerTest = TestRunner.layer;

// Merge entity layers, provide cluster
const EntitiesLayer = Layer.mergeAll(CounterEntityLayer);

// Production
const ProductionLayer = EntitiesLayer.pipe(Layer.provide(ClusterLayer));

// Test — use provideMerge so tests can access cluster services
const TestLayer = EntitiesLayer.pipe(Layer.provideMerge(ClusterLayerTest));

// Launch
Layer.launch(ProductionLayer).pipe(NodeRuntime.runMain);
```

### Entity testing

Use `Entity.makeTestClient` for direct in-process entity testing:

```typescript
const makeClient = yield * Entity.makeTestClient(Counter, CounterEntityLayer);
const counter = makeClient('test-entity-1');
const result = yield * counter.Increment({ amount: 5 });
```

## Workflow

Durable, long-running processes with deterministic execution IDs. `Workflow.make` is a const constructor (not a class):

```typescript
import { Workflow, Activity } from 'effect/unstable/workflow';

export const ProcessOrder = Workflow.make({
	name: 'ProcessOrder',
	payload: { orderId: Schema.String, amount: Schema.Number },
	success: OrderResult,
	error: OrderError,
	idempotencyKey: (payload) => `process-order-${payload.orderId}`
});
```

### Activity

An Activity is a single unit of work inside a workflow. It is yieldable — you yield it directly:

```typescript
const SendEmail = Activity.make({
	name: 'SendEmail',
	success: Schema.Void,
	error: EmailError,
	execute: EmailService.pipe(
		Effect.flatMap((svc) => svc.send(to, subject, body))
	)
});

// Inside a workflow handler, yield the activity directly
const result = yield * SendEmail;
```

Activity features:

- Automatically retried on interruption (configurable via `interruptRetryPolicy`)
- `Activity.retry(options)` — retry with configurable policy (excludes schedule — retry is attempt-based)
- `Activity.CurrentAttempt` — a Reference holding the current attempt number
- `Activity.idempotencyKey(name)` — generate deterministic idempotency keys
- `Activity.raceAll(name, [activity1, activity2])` — race multiple activities

### Registering workflows

```typescript
const ProcessOrderLayer = ProcessOrder.toLayer((payload, executionId) =>
	Effect.gen(function* () {
		yield* validateOrder(payload);
		yield* chargePayment(payload);
		yield* sendConfirmation(payload);
		return OrderResult.make({
			orderId: payload.orderId,
			status: 'completed'
		});
	})
);
```

### Executing workflows

```typescript
// Fire and get result
const result = yield * ProcessOrder.execute({ orderId: '123', amount: 99 });

// Fire and forget — returns executionId
const execId =
	yield *
	ProcessOrder.execute({ orderId: '123', amount: 99 }, { discard: true });

// Poll for result
const status = yield * ProcessOrder.poll(execId);

// Interrupt
yield * ProcessOrder.interrupt(execId);

// Resume suspended workflow
yield * ProcessOrder.resume(execId);
```

### Compensation (saga pattern)

```typescript
const result =
	yield *
	ProcessOrder.withCompensation((chargeResult, cause) =>
		refundPayment(chargeResult)
	)(chargePayment(payload));
```

Compensation finalizers run if the overall workflow fails, allowing cleanup based on the step's success value and the workflow's failure cause. Only works for top-level effects — not nested activities.

## ClusterCron

Cluster-singleton scheduled jobs using cron expressions:

```typescript
import { ClusterCron } from 'effect/unstable/cluster';
import { Cron } from 'effect';

const DailyReport = ClusterCron.make({
	name: 'DailyReport',
	cron: Cron.parse('0 8 * * *').pipe(Effect.runSync), // daily at 8am
	execute: generateAndSendReport,
	shardGroup: 'default', // optional shard group
	skipIfOlderThan: '1 day', // skip stale executions
	calculateNextRunFromPrevious: false // default — next run from current time
});
```

`ClusterCron.make` returns a `Layer`. It internally uses an Entity + Singleton to ensure exactly-once execution across the cluster.

## Rules

- Group related RPCs by domain, create separate groups per bounded context
- Use `Rpc.make` (const) — never `class X extends Rpc.make(...)`. Same for `Workflow.make`, `Activity.make`
- Use `Schema.TaggedErrorClass` for all RPC/workflow errors with meaningful domain names
- Always provide `idempotencyKey` on workflows — deterministic execution prevents duplicates
- Activities are the retry/persistence boundary — keep them small and focused
- Use `Rpc.fork` for read-only entity handlers that should run concurrently
- `ClusterSchema.Persisted` for durable message delivery; default is volatile (network only)
- Use `TestRunner.layer` or `Entity.makeTestClient` for testing — no network needed
- `RpcMiddleware.Service` (not `RpcMiddleware.Tag`) for middleware definitions
