---
name: effect-http-client
description: Make outgoing HTTP requests with Effect's HttpClient — HttpClientRequest builders, schema-decoded HttpClientResponse bodies, the HttpClientError taxonomy, retryTransient/rate limiting/cookies/redirects, streaming uploads and downloads, and FetchHttpClient/NodeHttpClient transport layers. Use when calling external REST/JSON APIs, uploading or downloading files and streams, adding retries/auth/tracing to outbound HTTP, or mocking HTTP responses in tests.
---

You are an Effect TypeScript expert specializing in outgoing HTTP with `effect/unstable/http` (`HttpClient`, `HttpClientRequest`, `HttpClientResponse`).

In v4 there is no `@effect/platform` package — the HTTP client lives in the `effect` package under `effect/unstable/http`. Only the platform transports (`NodeHttpClient`, `BunHttpClient`) live in `@effect/platform-*` packages.

## Effect Source Reference

The Effect v4 source is at `~/.cache/effect-v4/`. Read it directly when in doubt — these modules are `unstable` and change between betas.

Key files:

- `packages/effect/src/unstable/http/HttpClient.ts` — the `HttpClient` service, `make`/`makeWith`, every client combinator (`mapRequest`, `transform`, `filterStatus*`, `retry`, `retryTransient`, `withRateLimiter`, `withCookiesRef`, `withScope`, `followRedirects`, `catch*`, `tap*`), tracing references
- `packages/effect/src/unstable/http/HttpClientRequest.ts` — immutable request model, method constructors, URL/param/header/body combinators, `toWeb`/`fromWeb`
- `packages/effect/src/unstable/http/HttpClientResponse.ts` — response model, `schemaJson`/`schemaNoBody`, `matchStatus`, `filterStatus(Ok)`, `stream`
- `packages/effect/src/unstable/http/HttpIncomingMessage.ts` — shared body accessors plus `schemaBodyJson`, `schemaBodyUrlParams`, `schemaHeaders` (re-exported by HttpClientResponse)
- `packages/effect/src/unstable/http/HttpClientError.ts` — `HttpClientError` wrapper and its `reason` union
- `packages/effect/src/unstable/http/HttpBody.ts` — body variants (`Empty`, `Raw`, `Uint8Array`, `FormData`, `Stream`) and constructors (`json`, `jsonSchema`, `text`, `urlParams`, `formDataRecord`, `stream`, `file`)
- `packages/effect/src/unstable/http/FetchHttpClient.ts` — fetch transport: `layer`, `Fetch` reference, `RequestInit` service
- `packages/effect/src/unstable/http/UrlParams.ts` — ordered query-param model, coercion rules, schemas
- `packages/effect/src/unstable/http/Url.ts` — immutable helpers over the native `URL`
- `packages/effect/src/unstable/http/Cookies.ts` — cookie model, `fromSetCookie`, `toCookieHeader`, `getValue`
- `packages/effect/src/unstable/http/Headers.ts` — header model, `Input` forms, `CurrentRedactedNames`
- `packages/platform-node/src/NodeHttpClient.ts` — Node transports: undici, node:http, fetch re-export
- `packages/effect/test/unstable/http/HttpClient.test.ts` — retryTransient, withRateLimiter, abort semantics
- `ai-docs/src/50_http-client/10_basics.ts` — canonical "wrap a configured client in a service" lesson

## Core Model

```
HttpClientRequest ──► client.execute ──► Effect<HttpClientResponse, HttpClientError, R>
   (immutable value)      (HttpClient service)        (body accessors are Effects)
```

An `HttpClient.With<E, R>` is a pair of functions — `preprocess` (request → request, effectful) and `postprocess` (request effect → response effect) — plus `execute` and per-method helpers (`get`, `post`, `put`, `patch`, `del`, `head`, `options`). The default service type is `HttpClient = HttpClient.With<HttpClientError, never>`. Every combinator (`mapRequest`, `filterStatusOk`, `retryTransient`, ...) returns a **new client value**; clients are immutable and cheap to derive, so build one configured client per upstream API and share it.

```ts
import { Effect, Layer, Redacted, Ref, Schedule, Schema, Stream } from 'effect';
import {
	Cookies,
	FetchHttpClient,
	Headers,
	HttpBody,
	HttpClient,
	HttpClientError,
	HttpClientRequest,
	HttpClientResponse,
	UrlParams
} from 'effect/unstable/http';
```

For Node-specific transports:

```ts
import { NodeHttpClient } from '@effect/platform-node';
```

---

## 1. Providing an HttpClient

The service tag is `HttpClient.HttpClient` (a `Context.Service`). Provide one transport layer:

```ts
// Browser / edge / anywhere globalThis.fetch exists
const FetchLayer = FetchHttpClient.layer; // Layer<HttpClient.HttpClient>

// Node.js — pick one:
NodeHttpClient.layerUndici; // undici Agent (fast; the usual choice on Node)
NodeHttpClient.layerNodeHttp; // node:http/https with default Agents (keepAlive via layerAgentOptions)
NodeHttpClient.layerFetch; // re-export of FetchHttpClient.layer
```

`@effect/platform-bun`'s `BunHttpClient` simply re-exports `FetchHttpClient`.

### Using the client

Either grab the service and call its methods, or use the module-level accessors (which require `HttpClient.HttpClient` in `R`):

```ts
const program = Effect.gen(function* () {
	const client = yield* HttpClient.HttpClient;
	const response = yield* client.get('https://api.example.com/todos/1');
	return yield* response.json;
}).pipe(Effect.provide(FetchHttpClient.layer));

// Accessor form — same thing, R = HttpClient.HttpClient
const quick = HttpClient.get('https://api.example.com/todos/1').pipe(
	Effect.flatMap((response) => response.json)
);
```

Method helpers accept `(url: string | URL, options?: HttpClientRequest.Options.NoUrl)`:

```ts
client.get('https://api.example.com/todos', {
	urlParams: { page: 1, completed: true }, // numbers/booleans coerced
	headers: { 'x-request-id': 'abc' },
	acceptJson: true // sets Accept: application/json
});
```

Full options keys: `urlParams`, `hash`, `headers`, `body` (an `HttpBody`), `accept`, `acceptJson` (no `method`/`url` — those come from the helper). The DELETE helper on clients/accessors is `del`.

### Fetch configuration

`FetchHttpClient.Fetch` is a `Context.Reference` for the fetch function (default `globalThis.fetch`); `FetchHttpClient.RequestInit` is a service holding default fetch options. Services provided **to** the layer are visible to the transport (via `HttpClient.layerMergedContext`):

```ts
const CorsClientLayer = FetchHttpClient.layer.pipe(
	Layer.provide(
		Layer.succeed(FetchHttpClient.RequestInit, { credentials: 'include' })
	)
);
```

Note: the fetch transport strips any `content-length` header and sends `Stream` bodies with `duplex: 'half'`.

### Node transport configuration

```ts
import * as Undici from 'undici';

// Undici: custom dispatcher, or reuse the global one
NodeHttpClient.layerUndiciNoDispatcher; // requires NodeHttpClient.Dispatcher
NodeHttpClient.layerDispatcher; // scoped new Undici.Agent
NodeHttpClient.dispatcherLayerGlobal; // undici's global dispatcher
NodeHttpClient.UndiciOptions; // Context.Reference<Partial<Dispatcher.RequestOptions>>

// e.g. route every request through a proxy
const ProxyClientLayer = NodeHttpClient.layerUndiciNoDispatcher.pipe(
	Layer.provide(Layer.succeed(NodeHttpClient.Dispatcher, new Undici.ProxyAgent(proxyUrl)))
);

// node:http: custom agents (keepAlive, maxSockets, TLS options...)
const AgentClientLayer = NodeHttpClient.layerNodeHttpNoAgent.pipe(
	Layer.provide(NodeHttpClient.layerAgentOptions({ keepAlive: true, maxSockets: 64 }))
);
```

The undici transport sets `headersTimeout` to one hour and disables `bodyTimeout`, leaving timeouts to `Effect.timeout` (section 7).

---

## 2. Building Requests

`HttpClientRequest` is an immutable value: `{ method, url, urlParams, hash, headers, body }`. Nothing happens until a client executes it.

```ts
// Constructors — one per method; note `delete`, not `del`, in this module
HttpClientRequest.get('https://api.example.com/users');
HttpClientRequest.post('/users'); // relative; pair with HttpClient.mapRequest(prependUrl(...))
HttpClientRequest.put('/users/1');
HttpClientRequest.patch('/users/1');
HttpClientRequest.delete('/users/1');
HttpClientRequest.head('/users');
HttpClientRequest.options('/users');
HttpClientRequest.trace('/debug');

// All constructors accept the same options bag as the client method helpers
HttpClientRequest.get('/search', { urlParams: { q: 'effect' }, acceptJson: true });
```

These come from the generic factory `HttpClientRequest.make(method)`; `HttpClientRequest.setMethod` swaps the method on an existing request. `HttpMethod` is a closed union of these eight verbs — there is no path for custom methods like `REPORT`.

### URL combinators

```ts
request.pipe(
	HttpClientRequest.setUrl('https://api.example.com/v2'), // URL object input extracts search/hash
	HttpClientRequest.prependUrl('https://api.example.com'), // joins with exactly one '/'
	HttpClientRequest.appendUrl('/comments'),
	HttpClientRequest.updateUrl((url) => url.replace('/v1/', '/v2/')),
	HttpClientRequest.setHash('section') // no leading '#'
);
```

### Query parameters

```ts
request.pipe(
	HttpClientRequest.setUrlParam('page', '2'), // replace values for one key
	HttpClientRequest.setUrlParams({ sort: 'desc', limit: 50 }), // replace per key
	HttpClientRequest.appendUrlParam('tag', 'a'), // keep existing values
	HttpClientRequest.appendUrlParams({ tag: ['b', 'c'] })
);
```

`UrlParams.Input` accepts records, iterables of `[key, value]` tuples, or `URLSearchParams`. Values may be `string | number | bigint | boolean | null | undefined`; `undefined` entries are **skipped** (great for optional params), arrays produce repeated keys, and nested records render with bracket notation (`filter[name]=x`).

For standalone `UrlParams` values (e.g. `response.urlParamsBody`) the module mirrors these combinators: `UrlParams.getFirst`/`getAll`, `set`/`append`/`setAll`/`appendAll`, `toRecord`. In schema pipelines, `UrlParams.schemaRecord` decodes params into a record (`schemaBodyUrlParams` wraps it) and `UrlParams.schemaJsonField(name)` parses one field's value as JSON.

### Headers and auth

```ts
request.pipe(
	HttpClientRequest.setHeader('x-api-version', '2024-01-01'),
	HttpClientRequest.setHeaders({ 'x-a': '1', 'x-b': ['v1', 'v2'] }), // arrays join with ', '
	HttpClientRequest.accept('application/vnd.api+json'),
	HttpClientRequest.acceptJson,
	HttpClientRequest.bearerToken(Redacted.make('secret-token')), // string | Redacted
	HttpClientRequest.basicAuth('user', Redacted.make('pass')) // string | Redacted each
);
```

Header names are normalized to lowercase. All of these are dual (data-first and data-last).

### Web interop

`HttpClientRequest.fromWeb(webRequest)` converts a Web `Request` for pass-through proxying; `toWeb`/`toWebResult` convert back — `Stream` bodies become `ReadableStream`s using the ambient context (`toWebResult` accepts a `context` option).

---

## 3. Request Bodies

Body combinators delegate to `HttpBody` constructors and update `content-type` / `content-length` headers from the body metadata.

```ts
// Plain text / bytes — synchronous
HttpClientRequest.bodyText('hello', 'text/plain');
HttpClientRequest.bodyUint8Array(bytes, 'application/octet-stream');

// JSON — bodyJson is EFFECTFUL (JSON.stringify can fail) and returns
// Effect<HttpClientRequest, HttpBodyError>
const requestEffect = HttpClientRequest.post('/todos').pipe(
	HttpClientRequest.bodyJson({ title: 'buy milk' })
);

// bodyJsonUnsafe is synchronous but throws on unserializable input
HttpClientRequest.post('/todos').pipe(HttpClientRequest.bodyJsonUnsafe({ title: 'buy milk' }));

// Schema-encoded JSON — factory takes the schema, returns a dual combinator.
// Encoding failures surface as HttpBodyError ({ _tag: 'SchemaError', issue }).
const Todo = Schema.Struct({ title: Schema.String, completed: Schema.Boolean });
const withBody = HttpClientRequest.post('/todos').pipe(
	HttpClientRequest.schemaBodyJson(Todo)({ title: 'buy milk', completed: false })
); // Effect<HttpClientRequest, HttpBodyError, EncodingServices>

// application/x-www-form-urlencoded
HttpClientRequest.bodyUrlParams({ username: 'u', password: 'p' });

// multipart/form-data — boundary/content-type left to the runtime
HttpClientRequest.bodyFormData(existingFormData);
HttpClientRequest.bodyFormDataRecord({
	title: 'Report',
	tags: ['a', 'b'], // arrays append repeated entries
	file: new File([bytes], 'report.pdf', { type: 'application/pdf' }),
	skipped: undefined // nullish values are skipped
});

// Streaming body
HttpClientRequest.bodyStream(byteStream, {
	contentType: 'application/octet-stream',
	contentLength: knownSize // optional; omit for chunked upload
});

// File body — stats the file for content-length; requires FileSystem
// Effect<HttpClientRequest, PlatformError, FileSystem.FileSystem>
HttpClientRequest.post('/upload').pipe(
	HttpClientRequest.bodyFile('./video.mp4', { contentType: 'video/mp4' })
);
```

To execute a request built with an effectful body combinator, `flatMap` into `client.execute`:

```ts
const created = HttpClientRequest.post('/todos').pipe(
	HttpClientRequest.schemaBodyJson(Todo)(todo),
	Effect.flatMap(client.execute),
	Effect.flatMap(HttpClientResponse.schemaBodyJson(Todo))
);
```

---

## 4. Reading Responses

`HttpClientResponse` exposes `request`, `status`, `headers`, `cookies`, `remoteAddress`, and **Effect-valued body getters** (they are properties, not methods):

```ts
const program = Effect.gen(function* () {
	const response = yield* client.get('/todos/1');

	response.status; // number
	response.headers; // Headers (lowercased record)
	response.cookies; // Cookies parsed from set-cookie

	yield* response.text; // Effect<string, HttpClientError>
	yield* response.json; // Effect<Schema.Json, HttpClientError> — '' parses to null
	yield* response.arrayBuffer; // Effect<ArrayBuffer, HttpClientError>
	yield* response.formData; // Effect<FormData, HttpClientError>
	yield* response.urlParamsBody; // Effect<UrlParams, HttpClientError> (urlencoded bodies)
	response.stream; // Stream<Uint8Array, HttpClientError>
});
```

`text`, `arrayBuffer`, and `formData` are cached — reading twice is safe. `stream` is **not**: it consumes the underlying body, so do not mix `stream` with the other accessors on the same response.

### Schema-validated bodies

```ts
const Todo = Schema.Struct({
	userId: Schema.Number,
	id: Schema.Number,
	title: Schema.String,
	completed: Schema.Boolean
});

// Factory: pass the schema once, reuse the decoder.
// Effect<Todo, HttpClientError | Schema.SchemaError, DecodingServices>
const todo = client.get('/todos/1').pipe(
	Effect.flatMap(HttpClientResponse.schemaBodyJson(Todo))
);

// Other decoders:
HttpClientResponse.schemaBodyUrlParams(MyFormSchema); // urlencoded body
HttpClientResponse.schemaHeaders(Schema.Struct({ 'x-request-id': Schema.String }));
HttpClientResponse.schemaJson(Schema.Struct({ status: Schema.Literal(200), body: Todo })); // { status, headers, body }
HttpClientResponse.schemaNoBody(Schema.Struct({ status: Schema.Literal(204) })); // { status, headers } — no body read
```

### Pattern matching on status

`matchStatus` checks exact status keys first, then class keys (`'2xx'`–`'5xx'`), then `orElse`:

```ts
const result = yield* client.get(`/users/${id}`).pipe(
	Effect.flatMap(
		HttpClientResponse.matchStatus({
			200: HttpClientResponse.schemaBodyJson(User),
			404: () => Effect.succeed(null),
			'5xx': (response) => Effect.fail(new ServerDown({ status: response.status })),
			orElse: (response) => Effect.fail(new Unexpected({ status: response.status }))
		})
	)
);
```

### Response streaming

`HttpClientResponse.stream` flattens an `Effect<HttpClientResponse>` into the body stream:

```ts
const lines = HttpClientResponse.stream(client.get('/logs')).pipe(
	Stream.decodeText, // handles multi-byte chars across chunk boundaries
	Stream.splitLines
);
```

---

## 5. Status Filtering and the Error Taxonomy

Every client failure is a single tagged error, `HttpClientError`, wrapping a `reason` union:

| `reason._tag` | When | Has `response`? |
|---|---|---|
| `TransportError` | network/connection failure while sending | no |
| `EncodeError` | request body encoding failed in transit | no |
| `InvalidUrlError` | URL could not be constructed | no |
| `StatusCodeError` | rejected by `filterStatus*` | yes |
| `DecodeError` | body reading/parsing failed | yes |
| `EmptyBodyError` | body expected but missing (e.g. `.stream` on a null body) | yes |

`error.request` always works; `error.response` is the response when the reason carries one. For wire transfer there is `HttpClientError.HttpClientErrorSchema` (`fromHttpClientError`).

```ts
const handled = program.pipe(
	Effect.catchTag('HttpClientError', (error) => {
		switch (error.reason._tag) {
			case 'StatusCodeError':
				return Effect.succeed(`got status ${error.reason.response.status}`);
			case 'TransportError':
				return Effect.fail(new NetworkDown({ cause: error.reason.cause }));
			default:
				return Effect.die(error);
		}
	})
);
```

### Turning bad statuses into errors

By default any status — including 404 and 500 — is a **success** with that status code. Opt in to failure:

```ts
// Client-level (preferred): all requests through this client fail on non-2xx
const okClient = client.pipe(HttpClient.filterStatusOk);

// Custom predicate
const strict = client.pipe(HttpClient.filterStatus((status) => status === 200));

// Response-level, one-off
yield* client.get('/todos/1').pipe(Effect.flatMap(HttpClientResponse.filterStatusOk));
```

Related client-level filters: `HttpClient.filterOrElse(predicate, orElse)` and `HttpClient.filterOrFail(predicate, orFailWith)` operate on the response value.

### Client-level error recovery

These transform the *client*, so the recovery applies to every request made with it:

```ts
// Recover — pick one; after catch the error channel is never, so a following
// catchTag/tapError in the same pipe no longer typechecks
client.pipe(HttpClient.catch((error) => Effect.succeed(cachedResponse))); // all errors
client.pipe(HttpClient.catchTag('HttpClientError', (error) => fallback(error)));
client.pipe(HttpClient.catchTags({ HttpClientError: (error) => fallback(error) }));

// Observe — taps leave the error channel untouched
client.pipe(
	HttpClient.tap((response) => Effect.log(`<- ${response.status}`)),
	HttpClient.tapError((error) => Effect.logWarning(error.message)),
	HttpClient.tapRequest((request) => Effect.log(`-> ${request.method} ${request.url}`))
);
```

---

## 6. Client Transformation Combinators

```ts
// Modify every outgoing request (appended AFTER existing preprocessing)
const apiClient = client.pipe(
	HttpClient.mapRequest((request) =>
		request.pipe(
			HttpClientRequest.prependUrl('https://api.example.com'),
			HttpClientRequest.bearerToken(token),
			HttpClientRequest.acceptJson
		)
	)
);

// Effectful request transformation (e.g. fetch a fresh token)
client.pipe(
	HttpClient.mapRequestEffect((request) =>
		Effect.map(TokenService.current, (token) => HttpClientRequest.bearerToken(request, token))
	)
);

// Prepended variants run BEFORE existing preprocessing — use when a transform
// must see the caller's original request (mapRequest sees prior transforms' output)
HttpClient.mapRequestInput(f);
HttpClient.mapRequestInputEffect(f);

// Wrap the response effect itself — full power (retry, timeout, services, logging)
client.pipe(
	HttpClient.transformResponse(Effect.timeout('10 seconds')),
	HttpClient.transform((effect, request) =>
		request.method === 'GET' ? Effect.retry(effect, Schedule.recurs(2)) : effect
	)
);
```

Order matters and reads inside-out: combinators wrap the existing `postprocess`, so in `client.pipe(HttpClient.filterStatusOk, HttpClient.retryTransient({...}))` the retry sees the `StatusCodeError`s produced by the filter.

---

## 7. Resilience: Retries, Timeouts, Rate Limiting

### `HttpClient.retry`

Same option shape as `Effect.retry` — a `Schedule` or an options bag (`times`, `schedule`, `while`, `until`):

```ts
client.pipe(HttpClient.retry(Schedule.exponential('100 millis')));
client.pipe(HttpClient.retry({ times: 3 }));
```

### `HttpClient.retryTransient`

Purpose-built for HTTP. Transient = response status in {408, 429, 500, 502, 503, 504}, `TransportError`, a `StatusCodeError` wrapping a transient status, or a `TimeoutError` (so `Effect.timeout` composes with it).

```ts
client.pipe(
	HttpClient.retryTransient({
		retryOn: 'errors-and-responses', // default; or 'errors-only' | 'response-only'
		schedule: Schedule.exponential(100), // optional
		times: 3, // optional cap
		while: (error) => isAlsoTransient(error) // optional extra error predicate
	})
);

// Schedule-only shorthand (equivalent to retryOn: 'errors-and-responses').
// Data-first only — the data-last bare-schedule overload fails to infer E;
// inside .pipe use the options bag with `schedule` instead.
const retried = HttpClient.retryTransient(client, Schedule.spaced('1 second'));
```

`retryOn: 'errors-and-responses'` retries transient **successful responses** (e.g. a raw 503 with no `filterStatusOk`) as well as transient errors. `'errors-only'` ignores transient response statuses unless something (like `filterStatusOk`) has converted them to errors first. The `while` predicate is ignored in `'response-only'` mode.

### Timeouts

There is no client-specific timeout combinator — use `Effect.timeout`:

```ts
// Per request
yield* client.get('/slow').pipe(Effect.timeout('5 seconds'));

// Baked into the client
const bounded = client.pipe(HttpClient.transformResponse(Effect.timeout('10 seconds')));
```

The undici transport neutralizes undici's own timeouts (`headersTimeout` one hour, `bodyTimeout` disabled) so `Effect.timeout` is the practical source of truth. Interruption (including timeout) aborts the in-flight request via `AbortController`.

### `HttpClient.withRateLimiter`

Client-side rate limiting backed by the `RateLimiter` service from `effect/unstable/persistence`. It delays requests past the limit, **automatically retries 429s** (responses or `StatusCodeError`s) back through the limiter honoring `retry-after`, and by default updates its limit/window from `ratelimit-*` / `x-ratelimit-*` response headers.

```ts
import { RateLimiter } from 'effect/unstable/persistence';

const limited = Effect.gen(function* () {
	const limiter = yield* RateLimiter.RateLimiter;
	return (yield* HttpClient.HttpClient).pipe(
		HttpClient.withRateLimiter({
			limiter,
			key: 'github', // or (request) => string for per-endpoint limits
			limit: 100, // initial requests per window
			window: '1 minute',
			algorithm: 'fixed-window', // default; or 'token-bucket'
			tokens: 1, // default; or (request) => number
			disableResponseInspection: false // default: learn limits from headers
		})
	);
});

const RateLimiterLayer = RateLimiter.layer.pipe(Layer.provide(RateLimiter.layerStoreMemory));
// Redis-backed store for multi-process limits: RateLimiter.layerStoreRedis
```

Error channel gains `RateLimiter.RateLimiterError`.

---

## 8. Cookies, Redirects, Tracing

### Cookie jar

```ts
const withSession = Effect.gen(function* () {
	const jar = yield* Ref.make(Cookies.empty);
	const client = (yield* HttpClient.HttpClient).pipe(HttpClient.withCookiesRef(jar));

	yield* client.post('https://example.com/login', {
		body: HttpBody.urlParams(UrlParams.fromInput({ user: 'u', pass: 'p' }))
	});
	// set-cookie values from every response are merged into the jar and sent
	// as a `cookie` header on subsequent requests
	const profile = yield* client.get('https://example.com/me');

	const session = Cookies.getValue(yield* Ref.get(jar), 'session'); // Option<string>
});
```

Individual responses also expose `response.cookies` (parsed `set-cookie`); useful helpers: `Cookies.toCookieHeader`, `Cookies.fromSetCookie`, `Cookies.merge`, `Cookies.toRecord`.

### Redirects

```ts
const redirecting = client.pipe(HttpClient.followRedirects(5)); // default max 10
```

`followRedirects` re-issues the request when status is 3xx and a `location` header is present. Note: the fetch transport delegates to `fetch`, which already follows redirects by default — `followRedirects` matters mainly for `NodeHttpClient.layerUndici` / `layerNodeHttp`, which do not follow. To take manual control under fetch, provide `FetchHttpClient.RequestInit` with `{ redirect: 'manual' }`.

### Tracing

Every request runs in a client span (default name `http.client {METHOD}`) with OTel-style attributes (`http.request.method`, `url.full`, `http.response.status_code`, ...), and the trace context is propagated via headers. Span request/response header attributes are redacted per `Headers.CurrentRedactedNames` (default: `authorization`, `cookie`, `set-cookie`, `x-api-key`). Control via `Context.Reference`s on `HttpClient`:

```ts
// Stop propagating traceparent headers to a third party (real usage: OtlpExporter)
const noPropagation = client.pipe(
	HttpClient.transformResponse(Effect.provideService(HttpClient.TracerPropagationEnabled, false))
);

// Disable spans for matching requests (data-last; apply to any effect or via transformResponse)
program.pipe(
	Effect.provideService(HttpClient.TracerDisabledWhen, (request) => request.url.includes('/health'))
);

// Custom span names
program.pipe(
	Effect.provideService(HttpClient.SpanNameGenerator, (request) => `${request.method} ${request.url}`)
);

// Replace the redacted-header list (Context.Reference; accepts strings or RegExps)
program.pipe(
	Effect.provideService(Headers.CurrentRedactedNames, ['authorization', 'x-internal-token'])
);
```

---

## 9. Streaming, Aborts, and Connection Lifetime

### Streaming download to a file

```ts
import { FileSystem } from 'effect';

const download = Effect.gen(function* () {
	const fs = yield* FileSystem.FileSystem;
	const client = (yield* HttpClient.HttpClient).pipe(HttpClient.filterStatusOk);
	const response = yield* client.get('https://example.com/large.bin');
	yield* response.stream.pipe(Stream.run(fs.sink('./large.bin')));
});
```

### Streaming upload

```ts
const upload = (data: Stream.Stream<Uint8Array, unknown>) =>
	client.execute(
		HttpClientRequest.post('https://api.example.com/ingest').pipe(
			HttpClientRequest.bodyStream(data, { contentType: 'application/octet-stream' })
		)
	);
```

### Abort semantics (important)

- Interrupting the request effect (timeout, race, scope close) aborts the in-flight request.
- Reading `response.stream` aborts the connection **when the stream ends** — including early termination via `Stream.take`. This is how partial downloads release the socket.
- If a response's body is never consumed, a `FinalizationRegistry` aborts the connection when the response is garbage collected (a 5s timer fallback where `FinalizationRegistry` is unavailable). Do not rely on this for timeliness — consume or scope the response.
- `HttpClient.withScope(client)` ties each request's lifetime to a `Scope` (adds `Scope` to `R`); the connection aborts when the scope closes:

```ts
const scoped = Effect.scoped(
	Effect.gen(function* () {
		const client = HttpClient.withScope(yield* HttpClient.HttpClient);
		const response = yield* client.get('https://example.com/events');
		yield* response.stream.pipe(Stream.decodeText, Stream.runForEach(handleChunk));
	})
); // connection torn down here at the latest
```

---

## 10. Testing — Substituting the HttpClient

`HttpClient.make(f)` builds a full client from a request runner — perfect for mocks. `HttpClientResponse.fromWeb(request, new Response(...))` turns a Web `Response` into an `HttpClientResponse`:

```ts
// The runner also receives (url, signal, fiber) when you need them
const mockClient = HttpClient.make((request) =>
	Effect.succeed(
		HttpClientResponse.fromWeb(
			request,
			new Response(JSON.stringify({ id: 1, title: 'mock' }), {
				status: 200,
				headers: { 'content-type': 'application/json' }
			})
		)
	)
);

const TestHttpLayer = Layer.succeed(HttpClient.HttpClient, mockClient);

it.effect('decodes todos', () =>
	Effect.gen(function* () {
		const todo = yield* HttpClient.get('https://any/todos/1').pipe(
			Effect.flatMap(HttpClientResponse.schemaBodyJson(Todo))
		);
		expect(todo.id).toBe(1);
	}).pipe(Effect.provide(TestHttpLayer)));
```

Route by request to simulate failures and count attempts:

```ts
const makeFlaky = Effect.gen(function* () {
	const attempts = yield* Ref.make(0);
	const client = HttpClient.make((request) =>
		Effect.gen(function* () {
			const n = yield* Ref.updateAndGet(attempts, (n) => n + 1);
			return HttpClientResponse.fromWeb(
				request,
				new Response(null, { status: n < 3 ? 503 : 200 })
			);
		})
	);
	return { attempts, client } as const;
});
```

The tag requires `E = HttpClientError` exactly, so derive mocks from `HttpClient.make` (which already has that type) rather than from clients whose error channel has been widened. (`HttpClient.makeWith(postprocess, preprocess)` builds a `HttpClient.With<E, R>` with custom error/context types, but only `With<HttpClientError, never>` can back the tag.) Alternatively, keep the real fetch transport and stub the fetch function itself: `Layer.succeed(FetchHttpClient.Fetch, mockFetchFn)` provided to `FetchHttpClient.layer`.

For declarative API clients derived from an `HttpApi` definition, see the effect-http-api skill; for serving HTTP, see the effect-http-server skill.

---

## Key Patterns

### Configured API client wrapped in a service

```ts
import { Context, Effect, flow, Layer, Schedule, Schema } from 'effect';
import { FetchHttpClient, HttpClient, HttpClientRequest, HttpClientResponse } from 'effect/unstable/http';

class Todo extends Schema.Class<Todo>('Todo')({
	userId: Schema.Number,
	id: Schema.Number,
	title: Schema.String,
	completed: Schema.Boolean
}) {}

class TodosError extends Schema.TaggedErrorClass<TodosError>()('TodosError', {
	cause: Schema.Defect()
}) {}

export class Todos extends Context.Service<Todos, {
	getTodo(id: number): Effect.Effect<Todo, TodosError>;
	createTodo(todo: Omit<Todo, 'id'>): Effect.Effect<Todo, TodosError>;
}>()('app/Todos') {
	static readonly layer = Layer.effect(
		Todos,
		Effect.gen(function* () {
			const client = (yield* HttpClient.HttpClient).pipe(
				HttpClient.mapRequest(flow(
					HttpClientRequest.prependUrl('https://jsonplaceholder.typicode.com'),
					HttpClientRequest.acceptJson
				)),
				HttpClient.filterStatusOk,
				HttpClient.retryTransient({ schedule: Schedule.exponential(100), times: 3 })
			);

			const getTodo = Effect.fn('Todos.getTodo')(function* (id: number) {
				return yield* client.get(`/todos/${id}`).pipe(
					Effect.flatMap(HttpClientResponse.schemaBodyJson(Todo)),
					Effect.mapError((cause) => new TodosError({ cause }))
				);
			});

			const createTodo = Effect.fn('Todos.createTodo')(function* (todo: Omit<Todo, 'id'>) {
				return yield* HttpClientRequest.post('/todos').pipe(
					HttpClientRequest.bodyJsonUnsafe(todo),
					client.execute,
					Effect.flatMap(HttpClientResponse.schemaBodyJson(Todo)),
					Effect.mapError((cause) => new TodosError({ cause }))
				);
			});

			return Todos.of({ getTodo, createTodo });
		})
	).pipe(Layer.provide(FetchHttpClient.layer));
}
```

### Schema-encoded request, schema-decoded response

```ts
const CreateUser = Schema.Struct({ name: Schema.String, email: Schema.String });
const User = Schema.Struct({ id: Schema.Number, name: Schema.String, email: Schema.String });

const createUser = (input: typeof CreateUser.Type) =>
	HttpClientRequest.post('/users').pipe(
		HttpClientRequest.schemaBodyJson(CreateUser)(input),
		Effect.flatMap(client.execute),
		Effect.flatMap(HttpClientResponse.schemaBodyJson(User))
	);
// Effect<User, HttpBodyError | HttpClientError | SchemaError> — R is never with a
// captured client; R = HttpClient.HttpClient only via accessors like HttpClient.execute
```

### Status-driven control flow without filterStatusOk

```ts
const findUser = (id: string) =>
	client.get(`/users/${id}`).pipe(
		Effect.flatMap(
			HttpClientResponse.matchStatus({
				200: (r) => Effect.asSome(HttpClientResponse.schemaBodyJson(User)(r)),
				404: () => Effect.succeedNone,
				orElse: (r) =>
					Effect.fail(
						new HttpClientError.HttpClientError({
							reason: new HttpClientError.StatusCodeError({
								request: r.request,
								response: r,
								description: 'unexpected status'
							})
						})
					)
			})
		)
	);
```

(`orElse` manufactures the standard `StatusCodeError` so the error channel stays `HttpClientError`.)

### Rate-limited, traced, resilient third-party client

```ts
const makeGithub = Effect.gen(function* () {
	const limiter = yield* RateLimiter.RateLimiter;
	return (yield* HttpClient.HttpClient).pipe(
		HttpClient.mapRequest(flow(
			HttpClientRequest.prependUrl('https://api.github.com'),
			HttpClientRequest.bearerToken(token),
			HttpClientRequest.setHeader('x-github-api-version', '2022-11-28')
		)),
		HttpClient.filterStatusOk,
		HttpClient.withRateLimiter({ limiter, key: 'github', limit: 5000, window: '1 hour' }),
		HttpClient.retryTransient({ schedule: Schedule.exponential('250 millis'), times: 3 }),
		HttpClient.transformResponse(Effect.timeout('30 seconds'))
	);
});
```

## Common Mistakes

1. **v3 imports** — `@effect/platform/HttpClient` and friends no longer exist. Import `HttpClient`, `HttpClientRequest`, `HttpClientResponse`, `FetchHttpClient`, etc. from `effect/unstable/http`; only `NodeHttpClient` comes from `@effect/platform-node`.
2. **Calling body accessors as methods** — `response.text`, `response.json`, `response.stream` are property getters returning Effects/Streams. `yield* response.json`, not `await response.json()`.
3. **`HttpClientRequest.del` does not exist** — the request constructor is `HttpClientRequest.delete`; the client/service method and accessor are `client.del` / `HttpClient.del`.
4. **Catching v3 error tags** — there are no top-level `RequestError`/`ResponseError` tags anymore. Everything is one tag, `HttpClientError`; branch on `error.reason._tag` (`TransportError`, `StatusCodeError`, `DecodeError`, ...).
5. **Treating `bodyJson` as synchronous** — `HttpClientRequest.bodyJson(value)` returns `Effect<HttpClientRequest, HttpBodyError>`; `Effect.flatMap(client.execute)` it. Use `bodyJsonUnsafe` only when serialization cannot fail (it throws, it does not fail the Effect).
6. **Forgetting `filterStatusOk`** — a 404 or 500 is a *successful* response by default. Add `HttpClient.filterStatusOk` (or response-level `HttpClientResponse.filterStatusOk` / `matchStatus`) before decoding bodies.
7. **`retryTransient({ mode: ... })` / `retryOn: 'both'`** — the option key is `retryOn` with exactly `'errors-only' | 'response-only' | 'errors-and-responses'` (default `'errors-and-responses'`). With `'errors-only'`, a raw 503 success response is not retried unless `filterStatusOk` was applied first.
8. **Wrong combinator order** — combinators wrap the client built so far, so apply `filterStatusOk` *before* (i.e. earlier in the pipe than) `retryTransient` so it sees the `StatusCodeError`s. Reversed, the retry only sees raw responses (covered by the default `retryOn`, but invisible with `'errors-only'`). `withRateLimiter` works in either order — it inspects both raw 429 responses and 429 `StatusCodeError`s.
9. **Mixing `.stream` with `.text`/`.json` on one response** — `text`/`arrayBuffer`/`formData` are cached, but `.stream` consumes the raw body exactly once; pick one strategy per response.
10. **Schema decoder factories** — `HttpClientResponse.schemaBodyJson(S)` and `HttpClientRequest.schemaBodyJson(S)` take the schema first and return a function; do not pass the response/body in the same call as the schema.
11. **Per-chunk `TextDecoder` on `response.stream`** — corrupts multi-byte characters split across chunks; use `Stream.decodeText`.
12. **Expecting `followRedirects` to change fetch behavior** — `fetch` already follows redirects internally, so under `FetchHttpClient` the client never sees the 3xx; `followRedirects` is for the Node undici/node:http transports (which do not follow).
13. **Looking for a `timeout` option on the client or transports** — there is none, and the undici transport neutralizes undici's own timeouts on purpose (`headersTimeout` one hour, `bodyTimeout` off). Use `Effect.timeout` per request or `HttpClient.transformResponse(Effect.timeout(...))` client-wide. The resulting `TimeoutError` counts as transient for `retryTransient`.
14. **`urlParams` as a pre-built query string** — pass structured input (`{ page: 1, tags: ['a', 'b'] }`); values are coerced, `undefined` entries dropped, arrays repeated, nested records bracketed. Don't hand-encode into the URL.
15. **Assuming an empty body fails `response.json`** — an empty body decodes to `null`, not an error; `response.stream` on a bodiless response fails with reason `EmptyBodyError`.
