---
name: effect-observability
description: Implement structured logging, distributed tracing, and metrics in Effect applications. Use this skill when configuring loggers, adding spans/tracing, collecting metrics, or setting up OTLP/Prometheus export.
---

You are an Effect TypeScript expert specializing in observability — structured logging, distributed tracing, and metrics collection.

## Effect Source Reference

The Effect v4 source is available at `~/.cache/effect-v4/`.
Browse and read files there directly to look up APIs, types, and implementations.

Reference this for:

- `Logger` module: `packages/effect/src/Logger.ts`
- `Tracer` module: `packages/effect/src/Tracer.ts`
- `Metric` module: `packages/effect/src/Metric.ts`
- OTLP export: `packages/effect/src/unstable/observability/`
- Observability examples: `ai-docs/src/08_observability/`

---

## 1. Structured Logging

### Log Functions

Effect provides log functions at every level. Each is variadic and accepts one or more message values:

```ts
import { Effect } from 'effect';

const program = Effect.gen(function* () {
	yield* Effect.log('general log message');
	yield* Effect.logDebug('debug-level detail');
	yield* Effect.logInfo('informational message');
	yield* Effect.logWarning('something concerning');
	yield* Effect.logError('something failed');
});
```

Pass additional message values after the first. These extra values become part of the log message/body — they are **not** automatically indexed as queryable annotations:

```ts
yield* Effect.log('User action', { userId: 123, action: 'login' });
yield* Effect.logInfo('Request processed', { duration: 150, statusCode: 200 });
```

For **queryable dimensions** (fields you want to filter or group on in your logging/tracing backend), prefer `Effect.annotateLogs` or span annotations (`Effect.annotateCurrentSpan` / `Effect.annotateSpans`) rather than passing objects as message values.

### Log Annotations

Attach key-value metadata to all log lines within a scope:

```ts
const checkout = Effect.gen(function* () {
	yield* Effect.logInfo('validating cart');
	yield* Effect.logWarning('inventory low for one line item');
	yield* Effect.logError('payment provider timeout');
}).pipe(
	Effect.annotateLogs({
		service: 'checkout-api',
		route: 'POST /checkout'
	})
);
```

Single annotation shorthand:

```ts
Effect.annotateLogs('requestId', 'req-abc-123');
```

### Log Spans

Add duration metadata to log lines — each log will include `label=<elapsed>ms`:

```ts
const withTiming = myEffect.pipe(Effect.withLogSpan('checkout'));
// Log output includes: checkout=42ms
```

---

## 2. Logger Configuration

### Built-in Loggers

Effect v4 provides several logger implementations:

| Logger                     | Output                            | Use Case                       |
| -------------------------- | --------------------------------- | ------------------------------ |
| `Logger.defaultLogger`     | Default runtime format            | General use                    |
| `Logger.consolePretty()`   | Colorized, human-readable         | Development                    |
| `Logger.consoleJson`       | Single-line JSON to console       | Production / log aggregation   |
| `Logger.consoleLogFmt`     | logfmt key=value to console       | Production / structured search |
| `Logger.consoleStructured` | JS object to console              | Development debugging          |
| `Logger.formatSimple`      | String (no console output)        | Composition / piping           |
| `Logger.formatJson`        | JSON string (no console output)   | Composition / piping           |
| `Logger.formatLogFmt`      | logfmt string (no console output) | Composition / piping           |
| `Logger.formatStructured`  | Structured JS object              | Composition / piping           |
| `Logger.tracerLogger`      | Emits logs as tracer span events  | Included by default            |

### Installing Loggers via `Logger.layer`

`Logger.layer` **replaces** the current loggers by default:

```ts
import { Effect, Logger } from 'effect';

// JSON logging for production
const JsonLoggerLayer = Logger.layer([Logger.consoleJson]);

// Pretty logging for development
const PrettyLoggerLayer = Logger.layer([Logger.consolePretty()]);

// Multiple loggers — both receive every log entry
const MultiLoggerLayer = Logger.layer([
	Logger.consoleJson,
	Logger.consolePretty()
]);

// Merge with existing loggers instead of replacing
const AdditionalLoggerLayer = Logger.layer([Logger.consoleJson], {
	mergeWithExisting: true
});
```

### Log Level Filtering

Control the minimum log level via `References.MinimumLogLevel`:

```ts
import { Layer, References } from 'effect';

// Only emit Warn and above (skip Debug, Info)
const WarnAndAbove = Layer.succeed(References.MinimumLogLevel, 'Warn');

// Combine with logger
const ProductionLoggerLayer = Logger.layer([Logger.consoleJson]).pipe(
	Layer.provideMerge(WarnAndAbove)
);
```

Valid levels: `"All"`, `"Trace"`, `"Debug"`, `"Info"`, `"Warn"`, `"Error"`, `"Fatal"`, `"None"`.

### Custom Loggers

Create loggers with `Logger.make`:

```ts
import { Logger } from 'effect';

const customLogger = Logger.make((options) => {
	console.log(`[${options.logLevel}] ${options.message}`);
});

// options fields: message, logLevel, cause, fiber, date
```

### Batched Logging

Aggregate log entries over a time window before flushing:

```ts
import { Effect, Logger } from 'effect';

const batchedLogger = Logger.batched(Logger.formatStructured, {
	window: '1 second',
	flush: Effect.fn(function* (batch) {
		// Send batch to external service
		console.log(`Flushing ${batch.length} log entries`);
	})
});

// batchedLogger is an Effect — use it inside Logger.layer
const BatchedLoggerLayer = Logger.layer([batchedLogger]);
```

### File Logging

Write logs directly to a file (requires `FileSystem` from `@effect/platform`):

```ts
import { NodeFileSystem } from '@effect/platform-node';
import { Layer, Logger } from 'effect';

const FileLoggerLayer = Logger.layer([
	Logger.toFile(Logger.formatSimple, 'app.log')
]).pipe(Layer.provide(NodeFileSystem.layer));
```

Pipe syntax with options:

```ts
const fileLogger = Logger.formatJson.pipe(
	Logger.toFile('/var/log/myapp.log', {
		flag: 'a',
		batchWindow: '5 seconds'
	})
);
```

### Environment-based Logger Selection

```ts
import { Config, Effect, Layer, Logger } from 'effect';

const LoggerLayer = Layer.unwrap(
	Effect.gen(function* () {
		const env = yield* Config.string('NODE_ENV').pipe(
			Config.withDefault('development')
		);
		if (env === 'production') {
			return Logger.layer([Logger.consoleJson]);
		}
		return Logger.layer([Logger.consolePretty()]);
	})
);
```

---

## 3. Spans and Tracing

### `Effect.withSpan`

Create a tracing span around any effect:

```ts
const processOrder = Effect.gen(function* () {
	yield* chargeCard(orderId);
	yield* persistOrder(orderId);
}).pipe(Effect.withSpan('processOrder'));
```

Spans nest automatically — child effects that also use `withSpan` become child spans.

### `Effect.fn` with Auto-Spans

When you pass a string name to `Effect.fn`, it automatically wraps the function body in a span:

```ts
import { Effect } from 'effect';

const processCheckout = Effect.fn('Checkout.processCheckout')(function* (
	orderId: string
) {
	yield* Effect.logInfo('starting checkout', { orderId });
	yield* chargeCard(orderId).pipe(Effect.withSpan('checkout.charge-card'));
	yield* persistOrder(orderId).pipe(
		Effect.withSpan('checkout.persist-order')
	);
	yield* Effect.logInfo('checkout completed', { orderId });
});
// Creates a span named "Checkout.processCheckout" wrapping the entire body
```

### Span Attributes

Annotate the current span with key-value attributes:

```ts
// Annotate the current span from inside the effect
yield* Effect.annotateCurrentSpan('order.id', orderId);
yield* Effect.annotateCurrentSpan('order.total', 99.95);

// Annotate from outside using pipe
const withAttributes = myEffect.pipe(
	Effect.annotateSpans({
		'checkout.order_id': orderId,
		'checkout.provider': 'acme-pay'
	})
);
```

### Layer Spans

Attach spans to layer construction:

```ts
const MyLayer = Layer.effectDiscard(setupEffect).pipe(
	Layer.withSpan('my-layer-setup')
);
```

---

## 4. Metrics

Effect provides five metric types. All metrics are concurrent-safe and integrated into the runtime.

### Counter

Tracks cumulative values that only increase:

```ts
import { Effect, Metric } from 'effect';

const requestCount = Metric.counter('http_requests_total', {
	description: 'Total number of HTTP requests'
});

yield* Metric.update(requestCount, 1);
```

### Gauge

A single numerical value that can go up or down:

```ts
const activeConnections = Metric.gauge('active_connections', {
	description: 'Current active connections'
});

yield* Metric.update(activeConnections, 42);
```

### Histogram

Records observations in configurable buckets:

```ts
const responseTime = Metric.histogram('http_response_time_ms', {
	description: 'HTTP response time in milliseconds',
	boundaries: Metric.linearBoundaries({ start: 0, width: 50, count: 20 })
});

yield* Metric.update(responseTime, 127);
```

### Summary

Calculates quantiles over a sliding time window:

```ts
const dbQueryTime = Metric.summary('db_query_duration', {
	maxAge: '5 minutes',
	maxSize: 1000,
	quantiles: [0.5, 0.9, 0.95, 0.99]
});

yield* Metric.update(dbQueryTime, durationMs);
```

### Frequency

Counts occurrences of discrete string values:

```ts
const statusCodes = Metric.frequency('http_status_codes', {
	description: 'HTTP status code distribution'
});

yield* Metric.update(statusCodes, '200');
yield* Metric.update(statusCodes, '404');
```

### Metric Attributes

Tag metrics with key-value attributes for filtering/grouping:

```ts
const taggedCounter = Metric.withAttributes(requestCount, {
	endpoint: '/api/users',
	method: 'GET'
});

yield* Metric.update(taggedCounter, 1);

// Or inline
yield*
	Metric.update(
		Metric.withAttributes(requestCount, {
			endpoint: '/api/posts',
			method: 'POST'
		}),
		1
	);
```

### Reading Metric Values

```ts
// Get current value of a single metric
const value = yield* Metric.value(requestCount);

// Snapshot all metrics
const snapshots = yield* Metric.snapshot;
for (const metric of snapshots) {
	console.log(`${metric.id}: ${JSON.stringify(metric.state)}`);
}
```

---

## 5. OTLP Export

Effect v4 includes built-in OTLP exporters in `effect/unstable/observability`. No external OpenTelemetry SDK needed.

### All-in-One: `Otlp.layerJson`

The simplest setup — exports traces, logs, and metrics to a single OTLP endpoint:

```ts
import { Layer } from 'effect';
import { FetchHttpClient } from 'effect/unstable/http';
import { Otlp } from 'effect/unstable/observability';

const ObservabilityLayer = Otlp.layerJson({
	baseUrl: 'http://localhost:4318',
	resource: {
		serviceName: 'my-api',
		serviceVersion: '1.0.0',
		attributes: {
			'deployment.environment': 'staging'
		}
	}
}).pipe(Layer.provide(FetchHttpClient.layer));
```

This creates layers for all three signals with standard OTLP paths (`/v1/traces`, `/v1/logs`, `/v1/metrics`).

Variants:

- `Otlp.layerJson` — JSON serialization (simplest, no extra deps)
- `Otlp.layerProtobuf` — Protobuf serialization (more efficient)
- `Otlp.layer` — requires you to provide `OtlpSerialization` separately

### Individual OTLP Exporters

For fine-grained control, configure each exporter independently:

```ts
import { Layer } from 'effect';
import { FetchHttpClient } from 'effect/unstable/http';
import {
	OtlpLogger,
	OtlpMetrics,
	OtlpSerialization,
	OtlpTracer
} from 'effect/unstable/observability';

const OtlpTracingLayer = OtlpTracer.layer({
	url: 'http://localhost:4318/v1/traces',
	resource: {
		serviceName: 'checkout-api',
		serviceVersion: '1.0.0',
		attributes: { 'deployment.environment': 'staging' }
	}
});

const OtlpLoggingLayer = OtlpLogger.layer({
	url: 'http://localhost:4318/v1/logs',
	resource: {
		serviceName: 'checkout-api',
		serviceVersion: '1.0.0'
	}
});

const OtlpMetricsLayer = OtlpMetrics.layer({
	url: 'http://localhost:4318/v1/metrics',
	resource: {
		serviceName: 'checkout-api',
		serviceVersion: '1.0.0'
	},
	temporality: 'delta' // or "cumulative" (default)
});

const ObservabilityLayer = Layer.mergeAll(
	OtlpTracingLayer,
	OtlpLoggingLayer,
	OtlpMetricsLayer
).pipe(
	Layer.provide(OtlpSerialization.layerJson),
	Layer.provide(FetchHttpClient.layer)
);
```

### OTLP Layer Options

Common options for the individual OTLP exporters (`OtlpLogger.layer`, `OtlpTracer.layer`, `OtlpMetrics.layer`):

| Option                    | Default          | Description                              |
| ------------------------- | ---------------- | ---------------------------------------- |
| `url`                     | required         | OTLP endpoint URL                        |
| `resource.serviceName`    | —                | Service name in exported telemetry       |
| `resource.serviceVersion` | —                | Service version                          |
| `resource.attributes`     | —                | Additional resource attributes           |
| `headers`                 | —                | HTTP headers for auth etc.               |
| `exportInterval`          | signal-specific  | How often to flush batches (see below)   |
| `maxBatchSize`            | signal-specific  | Max items per export batch (see below)   |
| `shutdownTimeout`         | `3 seconds`      | Timeout for final flush on shutdown      |

Batch/flush defaults differ by signal:

| Exporter            | `exportInterval` | `maxBatchSize`                 | `shutdownTimeout` |
| ------------------- | ---------------- | ------------------------------ | ----------------- |
| `OtlpLogger.layer`  | `1 second`       | `1000`                         | `3 seconds`       |
| `OtlpTracer.layer`  | `5 seconds`      | `1000`                         | `3 seconds`       |
| `OtlpMetrics.layer` | `10 seconds`     | disabled (pull-style snapshot) | `3 seconds`       |

The all-in-one `Otlp.layerJson` / `Otlp.layerProtobuf` use **signal-specific** interval option names instead of a single `exportInterval`: `loggerExportInterval`, `metricsExportInterval`, and `tracerExportInterval` (plus a shared `maxBatchSize`, `shutdownTimeout`, and `metricsTemporality`).

`OtlpMetrics.layer` additionally accepts:

- `temporality`: `"cumulative"` (default) or `"delta"` — determines how metric values relate to their time interval

`OtlpLogger.layer` additionally accepts:

- `mergeWithExisting`: `true` (default) — merge with existing loggers instead of replacing
- `excludeLogSpans`: omit log span annotations from exported logs

### Wiring Into Your App

Provide the observability layer at the outermost level so all spans and logs are captured:

```ts
import { NodeRuntime } from '@effect/platform-node';
import { Layer } from 'effect';

const Main = AppLayer.pipe(Layer.provide(ObservabilityLayer));

Layer.launch(Main).pipe(NodeRuntime.runMain);
```

---

## 6. Prometheus Metrics

Export Effect metrics in Prometheus exposition format:

```ts
import { Effect, Metric } from 'effect';
import * as PrometheusMetrics from 'effect/unstable/observability/PrometheusMetrics';

const program = Effect.gen(function* () {
	const counter = Metric.counter('http_requests_total', {
		description: 'Total HTTP requests'
	});
	yield* Metric.update(counter, 42);

	// Format metrics as Prometheus text
	const output = yield* PrometheusMetrics.format();
	// # HELP http_requests_total Total HTTP requests
	// # TYPE http_requests_total counter
	// http_requests_total 42

	// With prefix
	const prefixed = yield* PrometheusMetrics.format({ prefix: 'myapp' });
	// myapp_http_requests_total 42
});
```

### Prometheus HTTP Endpoint

Automatically register a `/metrics` endpoint on your HTTP router:

```ts
import * as PrometheusMetrics from 'effect/unstable/observability/PrometheusMetrics';

// Default: GET /metrics
const PrometheusLayer = PrometheusMetrics.layerHttp();

// Custom path and prefix
const CustomPrometheusLayer = PrometheusMetrics.layerHttp({
	path: '/prometheus/metrics',
	prefix: 'myapp'
});
```

`layerHttp` requires `HttpRouter.HttpRouter` in the context — it adds a route to your existing router.

---

## 7. Testing Observability

### Testing Logged Output

Use `TestConsole` from `@effect/vitest` to capture and assert on console output:

```ts
import { Effect } from 'effect';
import { it } from '@effect/vitest';

it.effect('logs checkout flow', () =>
	Effect.gen(function* () {
		yield* myLoggingEffect;
		// TestConsole captures log output for assertion
	})
);
```

### Testing Metrics

Read metric values directly:

```ts
it.effect('increments request counter', () =>
	Effect.gen(function* () {
		const counter = Metric.counter('test_requests');
		yield* Metric.update(counter, 5);
		const state = yield* Metric.value(counter);
		expect(state.count).toBe(5);
	})
);
```

### Testing Spans

Use a test tracer or assert on span attributes captured via `Effect.withSpan`.

---

## 8. Common Patterns

### Full Observability Stack (Dev + Prod)

```ts
import { Config, Effect, Layer, Logger, References } from 'effect';
import { FetchHttpClient } from 'effect/unstable/http';
import { Otlp } from 'effect/unstable/observability';

const DevObservability = Logger.layer([Logger.consolePretty()]);

const ProdObservability = Layer.mergeAll(
	Logger.layer([Logger.consoleJson]),
	Layer.succeed(References.MinimumLogLevel, 'Info'),
	Otlp.layerJson({
		baseUrl: 'http://otel-collector:4318',
		resource: {
			serviceName: 'my-api',
			serviceVersion: '1.0.0'
		}
	}).pipe(Layer.provide(FetchHttpClient.layer))
);

const ObservabilityLayer = Layer.unwrap(
	Effect.gen(function* () {
		const env = yield* Config.string('NODE_ENV').pipe(
			Config.withDefault('development')
		);
		return env === 'production' ? ProdObservability : DevObservability;
	})
);
```

### Service with Instrumented Methods

```ts
import { Effect, Layer, Metric, Context } from 'effect';

const requestLatency = Metric.histogram('checkout_latency_ms', {
	boundaries: Metric.linearBoundaries({ start: 0, width: 25, count: 40 })
});

class Checkout extends Context.Service<
	Checkout,
	{
		processCheckout(orderId: string): Effect.Effect<void>;
	}
>()('app/Checkout') {
	static readonly layer = Layer.effect(
		Checkout,
		Effect.gen(function* () {
			return Checkout.of({
				processCheckout: Effect.fn('Checkout.processCheckout')(
					function* (orderId: string) {
						yield* Effect.logInfo('starting checkout', { orderId });
						yield* Effect.annotateCurrentSpan('order.id', orderId);

						yield* chargeCard(orderId).pipe(
							Effect.withSpan('checkout.charge-card')
						);
						yield* persistOrder(orderId).pipe(
							Effect.withSpan('checkout.persist-order')
						);

						yield* Effect.logInfo('checkout completed', {
							orderId
						});
					}
				)
			});
		})
	);
}
```

---

## Critical Rules

1. **Use `Logger.layer` to install loggers** — it replaces the default set. Use `{ mergeWithExisting: true }` to add without replacing.
2. **`Logger.tracerLogger` is included by default** — log messages automatically become span events. If you override loggers, include it explicitly if you want this behavior.
3. **`Effect.fn("name")` creates auto-spans** — prefer this over manual `Effect.withSpan` for service methods.
4. **Provide observability layers outermost** — so all application spans and logs are captured for export.
5. **OTLP exporters require `HttpClient` and `OtlpSerialization`** — `Otlp.layerJson` (and `layerProtobuf`) wires `OtlpSerialization` for you but still requires an `HttpClient`, so provide a client layer such as `FetchHttpClient.layer`. With `Otlp.layer` or the individual exporters, provide both `OtlpSerialization.layerJson` and `FetchHttpClient.layer` manually.
6. **`References.MinimumLogLevel`** controls filtering — not a logger concern, set it via `Layer.succeed`.
7. **Metric names should follow conventions** — snake_case with units suffix (e.g., `http_request_duration_ms`).
8. **`Metric.withAttributes` creates a tagged variant** — it does not mutate the original metric.
9. **`OtlpMetrics` temporality** — use `"delta"` for backends like Datadog/Dynatrace, `"cumulative"` (default) for Prometheus-style backends.
10. **All OTLP modules are under `effect/unstable/observability`** — the API may evolve but the patterns are stable.
