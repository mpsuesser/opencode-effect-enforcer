---
name: effect-http-server
description: Build HTTP servers with effect/unstable/http — HttpRouter routes and middleware, HttpServerRequest schema decoding, HttpServerResponse constructors, multipart uploads, websocket upgrades, static files, NodeHttpServer/BunHttpServer layers, and in-memory web handlers. Use when serving raw HTTP routes, reading request bodies/cookies/uploads, writing server middleware, streaming responses, or testing handlers without a real port.
---

You are an Effect TypeScript expert specializing in HTTP servers built with `effect/unstable/http` — `HttpRouter`, `HttpServer`, `HttpServerRequest`, `HttpServerResponse`, `HttpMiddleware`, and the platform server layers.

This skill covers the imperative HTTP server primitives. For the declarative, schema-first `HttpApi`/OpenAPI layer see the `effect-http-api` skill; for HTTP clients see `effect-http-client`; for raw TCP/WebSocket sockets see `effect-socket`.

## Effect Source Reference

The Effect v4 source is at `~/.cache/effect-v4/`. Read it directly when in doubt — these modules are unstable and change between betas.

Key files:

- `packages/effect/src/unstable/http/HttpRouter.ts` — router service, `add`/`addAll`/`route`/`use`, `serve`, `toWebHandler`, schema decoders, `middleware`, `cors`, `provideRequest`, `RouterConfig`
- `packages/effect/src/unstable/http/HttpServer.ts` — `HttpServer` service, `serve`/`serveEffect`, address helpers, `layerTestClient`, `layerServices`
- `packages/effect/src/unstable/http/HttpServerRequest.ts` — request model, body accessors, `schemaBodyJson`/`schemaBodyForm`/etc., `ParsedSearchParams`, `upgrade`, `MaxBodySize`
- `packages/effect/src/unstable/http/HttpServerResponse.ts` — every response constructor and combinator, `toWeb`/`fromWeb`
- `packages/effect/src/unstable/http/HttpMiddleware.ts` — `logger`, `tracer`, `cors`, `xForwardedHeaders`, `searchParamsParser`, tracing config references
- `packages/effect/src/unstable/http/HttpEffect.ts` — `toWebHandler*`, `fromWebHandler`, `toHandled`, pre-response handlers, request scope management
- `packages/effect/src/unstable/http/HttpServerError.ts` — `HttpServerError` + reasons, `causeResponse`, `ClientAbort`
- `packages/effect/src/unstable/http/HttpServerRespondable.ts` — the error-to-response protocol
- `packages/effect/src/unstable/http/HttpBody.ts` — body variants (`Empty`/`Raw`/`Uint8Array`/`FormData`/`Stream`) and constructors
- `packages/effect/src/unstable/http/Headers.ts`, `Cookies.ts`, `Multipart.ts` — header/cookie/multipart models and limits
- `packages/effect/src/unstable/http/HttpStaticServer.ts` — static file serving
- `packages/platform-node/src/NodeHttpServer.ts` — Node server adapter, `layer`, `layerTest`, graceful shutdown
- `packages/platform-bun/src/BunHttpServer.ts` — Bun equivalent
- `packages/platform-node/test/NodeHttpServer.test.ts` — the best end-to-end reference for real route/middleware/multipart wiring

## Core Model

An HTTP handler is just an Effect:

```
Effect<HttpServerResponse, E, HttpServerRequest | Scope | ...>
```

The current request is a **service** (`HttpServerRequest.HttpServerRequest`) in the handler's context, and each request runs in its own `Scope` that closes after the response is sent. The v4 `HttpRouter` is also a **service**: routes and middleware register themselves against it from Layers, and `HttpRouter.serve(appLayer)` builds the router, wraps it with logging/tracing, and runs it on the `HttpServer` provided by a platform layer. There is no immutable `HttpRouter.empty.pipe(HttpRouter.get(...))` value-style router in v4.

```ts
import { Effect, Layer, Schema, Stream } from 'effect';
import {
	Cookies,
	Headers,
	HttpBody,
	HttpEffect,
	HttpMiddleware,
	HttpRouter,
	HttpServer,
	HttpServerError,
	HttpServerRequest,
	HttpServerRespondable,
	HttpServerResponse,
	HttpStaticServer,
	Multipart
} from 'effect/unstable/http';
import { NodeHttpServer, NodeRuntime } from '@effect/platform-node';
import { createServer } from 'node:http';
```

Minimal server:

```ts
const HelloRoute = HttpRouter.add(
	'GET',
	'/hello',
	Effect.succeed(HttpServerResponse.text('Hello, World!'))
);

const Main = HttpRouter.serve(HelloRoute).pipe(
	Layer.provide(NodeHttpServer.layer(createServer, { port: 3000 }))
);

Layer.launch(Main).pipe(NodeRuntime.runMain);
```

---

## 1. Registering Routes

### `HttpRouter.add` — one route as a Layer

```ts
HttpRouter.add(method, path, handler, options?): Layer<never, never, HttpRouter | ...>
```

- `method`: `'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'OPTIONS' | '*'` (`'*'` matches all methods; `HEAD` requests automatically fall back to the matching `GET` route with the body stripped)
- `path`: `PathInput` — must start with `/`, or be `*`. `:name` captures a path param; a trailing `/*` is a wildcard (and also matches the bare prefix: `'/files/*'` matches `/files` too)
- `options`: `{ uninterruptible?: boolean }` — handlers are interruptible by default (client disconnect interrupts the fiber); set `true` for must-complete handlers

The handler can take three forms:

```ts
// 1. A static HttpServerResponse value
HttpRouter.add('GET', '/ping', HttpServerResponse.text('pong'));

// 2. An Effect producing a response
HttpRouter.add('GET', '/me', Effect.gen(function* () {
	const request = yield* HttpServerRequest.HttpServerRequest;
	return HttpServerResponse.text(request.headers['user-agent'] ?? 'unknown');
}));

// 3. A function from the request
HttpRouter.add('GET', '/echo', (request) =>
	Effect.succeed(HttpServerResponse.text(request.url))
);
```

### `HttpRouter.route` + `HttpRouter.addAll` — many routes at once

```ts
const Routes = HttpRouter.addAll([
	HttpRouter.route('GET', '/home', HttpServerResponse.html('<html />')),
	HttpRouter.route('GET', '/health', HttpServerResponse.text('ok'))
], { prefix: '/api' }); // optional mount prefix
```

### `HttpRouter.use` — imperative access to the router service

For grouped/prefixed registration in one place:

```ts
const TodoRoutes = HttpRouter.use(Effect.fnUntraced(function* (router_) {
	const router = router_.prefixed('/todos');
	yield* router.add('GET', '/:id', Effect.flatMap(
		HttpRouter.schemaParams(IdParams),
		({ id }) => todoResponse({ id, title: 'test' })
	));
	yield* router.addAll([
		HttpRouter.route('GET', '/', Effect.succeed(HttpServerResponse.text('root')))
	]);
}));
```

`router.prefixed(prefix)` returns a prefixed view; when a prefixed route matches, the prefix is **stripped from `request.url`** seen by the handler (`request.originalUrl` keeps the full path). `HttpRouter.prefixPath` / `prefixRoute` are the underlying helpers.

### Mounting a sub-app (v3 `mountApp`)

Wildcard method + wildcard path under a prefix is the v4 replacement for v3's `HttpRouter.mountApp` — works for any HTTP effect, including `HttpEffect.fromWebHandler` adapters:

```ts
const Mounted = HttpRouter.use((router) => router.prefixed('/child').add('*', '*', childHttpEffect));
// the sub-app sees prefix-stripped request.url: /child/1 → '/1', /child?foo=bar → '?foo=bar'
```

### Path parameters

```ts
// Raw access: Effect<ReadonlyRecord<string, string | undefined>, never, RouteContext>
const params = yield* HttpRouter.params;

// Schema-decoded (preferred)
const IdParams = Schema.Struct({ id: Schema.FiniteFromString });
const { id } = yield* HttpRouter.schemaParams(IdParams); // path params + search params merged; path wins
const { id: pathOnly } = yield* HttpRouter.schemaPathParams(IdParams); // path params only
```

### Router configuration

The matcher is `find-my-way-ts`. Configure via the `RouterConfig` reference or the `routerConfig` option of `serve`/`toWebHandler`:

```ts
Layer.succeed(HttpRouter.RouterConfig)({
	ignoreTrailingSlash: true,
	ignoreDuplicateSlashes: true,
	caseSensitive: false,
	maxParamLength: 100
});
```

---

## 2. Reading the Request

`HttpServerRequest.HttpServerRequest` is the service for the in-flight request:

```ts
const request = yield* HttpServerRequest.HttpServerRequest;

request.method; // 'GET' | 'POST' | ... (uppercased)
request.url; // path (+search), prefix-stripped if route was prefixed
request.originalUrl; // as received
request.headers; // Headers — a lowercase-keyed string record
request.cookies; // ReadonlyRecord<string, string> (parsed, cached)
request.remoteAddress; // Option<string>
HttpServerRequest.toURL(request); // Option<URL> — absolute URL from request.url + the host header; use for absolute redirects

// Body accessors — each is cached, so reading twice is safe:
const text = yield* request.text; // Effect<string, HttpServerError>
const json = yield* request.json; // Effect<Schema.Json, HttpServerError>
const params = yield* request.urlParamsBody; // Effect<UrlParams, HttpServerError>
const buffer = yield* request.arrayBuffer; // Effect<ArrayBuffer, HttpServerError>
const byteStream = request.stream; // Stream<Uint8Array, HttpServerError> (single consumption)
```

Cap accepted body sizes with the `MaxBodySize` reference (re-exported from `HttpIncomingMessage`, default `undefined` = unlimited):

```ts
import { FileSystem } from 'effect';

someEffect.pipe(Effect.provideService(HttpServerRequest.MaxBodySize, FileSystem.Size(1024 * 1024)));
```

### Schema-validated decoding

From `HttpServerRequest` (no route context needed):

```ts
// JSON body
const body = yield* HttpServerRequest.schemaBodyJson(CreateTodo);
// Effect<A, HttpServerError | SchemaError, HttpServerRequest | RD>

// application/x-www-form-urlencoded body
const form = yield* HttpServerRequest.schemaBodyUrlParams(Schema.Struct({
	id: Schema.FiniteFromString,
	title: Schema.String
}));

// Works for BOTH multipart and url-encoded form posts
const data = yield* HttpServerRequest.schemaBodyForm(UploadSchema);

// Headers / cookies / search params
const auth = yield* HttpServerRequest.schemaHeaders(Schema.Struct({ authorization: Schema.String }));
const session = yield* HttpServerRequest.schemaCookies(Schema.Struct({ sid: Schema.String }));
const query = yield* HttpServerRequest.schemaSearchParams(Schema.Struct({ q: Schema.String }));

// A JSON value embedded in one form field (multipart or url-encoded)
const payload = yield* HttpServerRequest.schemaBodyFormJson(Schema.Struct({
	test: Schema.String
}))('json'); // note: curried — (schema)(fieldName)
```

From `HttpRouter` (uses route context — only inside matched routes):

```ts
// Whole-request decode WITHOUT body: { method, url, headers, cookies, pathParams, searchParams }
const meta = yield* HttpRouter.schemaNoBody(MySchema);

// Whole-request decode WITH parsed JSON body added as `body`
const all = yield* HttpRouter.schemaJson(MySchema);
```

Search params are parsed by the router and provided as the `HttpServerRequest.ParsedSearchParams` service (repeated keys become arrays). Outside the router, `HttpMiddleware.searchParamsParser` provides it — but it parses `new URL(request.originalUrl)`, which must be absolute. That holds for web-handler adapters (`HttpServerRequest.fromWeb`); on the Node adapter `originalUrl` is path-only and the middleware defects (500). On a raw Node app parse yourself: `HttpServerRequest.searchParamsFromURL(new URL(request.url, 'http://localhost'))`.

---

## 3. Multipart Uploads

```ts
const UploadRoute = HttpRouter.add('POST', '/upload', Effect.gen(function* () {
	const request = yield* HttpServerRequest.HttpServerRequest;
	// Persists file parts to temp files on disk.
	// Requires Scope | FileSystem | Path (the request scope cleans the files up).
	const persisted = yield* request.multipart;
	const files = persisted.file; // ReadonlyArray<PersistedFile> | ReadonlyArray<string> | string
	return yield* HttpServerResponse.json({ ok: 'file' in persisted });
}));
```

Schema-validated variant with the multipart file schemas:

```ts
const Upload = Schema.Struct({
	file: Multipart.FilesSchema, // ReadonlyArray<PersistedFile>
	// Multipart.SingleFileSchema — exactly one PersistedFile
	// Multipart.PersistedFileSchema — the raw file schema
	note: Schema.String // plain fields decode as strings
});
const { file, note } = yield* HttpServerRequest.schemaBodyMultipart(Upload);
// file[0].path / .name / .contentType / .key — read contents via FileSystem
```

Streaming without persisting to disk: `request.multipartStream` is a `Stream<Multipart.Part, MultipartError>` where `Part = Field | File` (`file.content` is a byte stream, `file.contentEffect` collects it).

Limits are `Context.Reference`s, not options:

```ts
serveLayerOrEffect.pipe(
	Effect.provideService(Multipart.MaxFileSize, 10 * 1024 * 1024), // default: undefined (unlimited)
	Effect.provideService(Multipart.MaxFieldSize, 1024 * 1024), // default: 10 MiB
	Effect.provideService(Multipart.MaxParts, 20) // default: undefined
);
// Or build a Context with several at once: Multipart.limitsServices({ maxFileSize, maxTotalSize, ... })
```

Limit violations surface as `MultipartError` with `error.reason._tag` of `'FileTooLarge' | 'FieldTooLarge' | 'TooManyParts' | 'BodyTooLarge' | 'Parse' | 'InternalError'` — catch and map to `413`:

```ts
handler.pipe(
	Effect.catchTag('MultipartError', (error) =>
		error.reason._tag === 'FileTooLarge'
			? Effect.succeed(HttpServerResponse.empty({ status: 413 }))
			: Effect.fail(error))
);
```

---

## 4. Building Responses

All constructors take an options object with `{ status?, statusText?, headers?, cookies?, contentType?, contentLength? }` (availability varies — body-typed constructors omit what the body determines).

```ts
HttpServerResponse.text('hi'); // 200, text/plain
HttpServerResponse.text('hi', { status: 201, headers: { 'x-request-id': 'abc' } });
HttpServerResponse.empty(); // 204 — note the default is NOT 200
HttpServerResponse.empty({ status: 404 });
HttpServerResponse.redirect('/login'); // 302 + location header
HttpServerResponse.redirect(url, { status: 301 });
HttpServerResponse.uint8Array(bytes, { contentType: 'application/octet-stream' });
HttpServerResponse.urlParams({ a: '1' }); // application/x-www-form-urlencoded
HttpServerResponse.formData(formData); // multipart response
HttpServerResponse.fromWeb(webResponse); // Web Response → response (body becomes a byte stream) — portable
HttpServerResponse.raw(webResponseOrReadableStream); // pass-through — web-handler adapters and Bun only; defects on the Node server adapter
```

### JSON

```ts
// Effectful — JSON.stringify failures become HttpBodyError
const res = yield* HttpServerResponse.json({ ok: true });
// Effect<HttpServerResponse, HttpBodyError>

// Synchronous — throws on unserializable values
HttpServerResponse.jsonUnsafe({ ok: true }, { status: 400 });

// Schema-encoded — curried: build the encoder once, reuse per request
const todoResponse = HttpServerResponse.schemaJson(Todo);
yield* todoResponse({ id: 1, title: 'buy milk' }, { status: 201 });
// Effect<HttpServerResponse, HttpBodyError, RE>
```

### HTML

```ts
HttpServerResponse.html('<html />'); // string form: plain HttpServerResponse
HttpServerResponse.html`<h1>${Effect.succeed('hi')}</h1>`; // template form: Effect (interpolations can be Effects)
HttpServerResponse.htmlStream`<ul>${Stream.make('<li>a</li>', '<li>b</li>')}</ul>`; // streaming template: Effect of a stream response
```

### Streaming

`stream` takes a byte stream — encode text first:

```ts
HttpServerResponse.stream(
	Stream.make('data: hello\n\n', 'data: world\n\n').pipe(Stream.encodeText),
	{ contentType: 'text/event-stream' }
);
```

The request scope is kept open until a streaming body finishes (see section 10), so scoped resources used by the stream stay alive while it is being sent.

### Files

```ts
// From the file system — requires HttpPlatform (provided by NodeHttpServer.layer / BunHttpServer.layer).
// Sets content-type, content-length, etag, last-modified.
const res = yield* HttpServerResponse.file('./report.pdf', {
	offset: 0,
	bytesToRead: 1024, // optional byte range
	headers: { 'cache-control': 'public, max-age=3600' }
});
// Effect<HttpServerResponse, PlatformError, HttpPlatform>

// From a Web File-like value (needs name, lastModified, size, stream, type — a plain Blob does not qualify)
const res2 = yield* HttpServerResponse.fileWeb(file);
```

### Combinators (all return new responses)

```ts
response.pipe(
	HttpServerResponse.setStatus(418),
	HttpServerResponse.setHeader('x-one', '1'),
	HttpServerResponse.setHeaders({ 'x-two': '2', 'x-three': '3' }),
	HttpServerResponse.setBody(HttpBody.text('replaced'))
);
```

### Cookies

Cookie option keys: `domain`, `path`, `expires` (Date), `maxAge` (`Duration.Input`, e.g. `'5 minutes'`), `httpOnly`, `secure`, `sameSite` (`'lax' | 'strict' | 'none'`), `partitioned`, `priority`.

```ts
// Unsafe variants are synchronous and throw on invalid cookies — fine for trusted values
HttpServerResponse.empty().pipe(
	HttpServerResponse.setCookieUnsafe('session', token, {
		httpOnly: true,
		secure: true,
		sameSite: 'lax',
		path: '/',
		maxAge: '30 days'
	})
);

// Safe variants return Effects failing with CookiesError
const res = yield* HttpServerResponse.setCookie(response, 'session', token, { path: '/' });
const cleared = yield* HttpServerResponse.expireCookie(response, 'session', { path: '/' });
const multi = yield* HttpServerResponse.setCookies(response, [
	['a', '1'],
	['b', '2', { path: '/' }]
]);
// Also: removeCookie, replaceCookies, mergeCookies, updateCookies, setCookiesUnsafe, expireCookieUnsafe
```

Cookies live on `response.cookies` (a `Cookies.Cookies` collection) and are serialized to `set-cookie` headers only when the response is sent.

---

## 5. Error Handling

Route handlers may fail with **any** error type — you do not have to reduce `E` to `never`. At the server boundary (`HttpEffect.toHandled` → `HttpServerError.causeResponse`), an unhandled cause is converted to a response:

| Cause | Response |
|---|---|
| Error implementing `HttpServerRespondable` | whatever its protocol method returns |
| `Schema.SchemaError` | empty `400` |
| `Cause.NoSuchElementError` | empty `404` |
| `HttpServerError` with `RequestParseError` | empty `400` |
| `HttpServerError` with `RouteNotFound` (no route matched) | empty `404` |
| `HttpServerError` with `InternalError` / `ResponseError` | empty `500` |
| A defect that **is** an `HttpServerResponse` | that response, verbatim |
| Interrupt annotated `ClientAbort` (client disconnected) | `499` |
| Other interrupt (server shutdown) | `503` |
| Anything else (failure or defect) | empty `500`, cause reported to the error reporter |

### Domain errors that know their own response

Implement `HttpServerRespondable.symbol` on the error class; throwing/failing with it anywhere in the handler produces the right response:

```ts
class UserNotFound extends Schema.ErrorClass<UserNotFound>('UserNotFound')({
	_tag: Schema.tag('UserNotFound'),
	id: Schema.String
}) {
	[HttpServerRespondable.symbol]() {
		return HttpServerResponse.schemaJson(UserNotFound)(this, { status: 404 });
	}
}

// Error classes are Effects in v4, so this is a valid route handler that always 404s:
HttpRouter.add('GET', '/missing', new UserNotFound({ id: 'x' }));
```

### Explicit mapping

```ts
const GetUser = HttpRouter.add('GET', '/users/:id', Effect.gen(function* () {
	const { id } = yield* HttpRouter.schemaPathParams(Schema.Struct({ id: Schema.String }));
	const user = yield* Users.findById(id);
	return yield* HttpServerResponse.json(user);
}).pipe(
	Effect.catchTag('UserNotFound', (e) =>
		Effect.succeed(HttpServerResponse.jsonUnsafe({ error: 'not_found', id: e.id }, { status: 404 })))
));
```

Typed route errors you leave unhandled appear as `HttpRouter.Request<'Error', E>` markers in the layer requirements; an error-handling middleware (section 6) can discharge them, otherwise `HttpRouter.serve` drops the markers and the table above applies at runtime.

`HttpServerError` is a single tagged error (`_tag: 'HttpServerError'`) wrapping a `reason` union — match on `error.reason._tag` (`'RequestParseError' | 'RouteNotFound' | 'InternalError' | 'ResponseError'`). `ServeError` is the separate startup failure of the platform layer (e.g. port in use).

---

## 6. Middleware

Two distinct mechanisms — pick the right one:

1. **Router middleware** (`HttpRouter.middleware`) — wraps route handlers *before* the response is sent. Can modify responses, provide services, and handle typed route errors.
2. **Server middleware** (the `middleware` option of `HttpRouter.serve`/`toWebHandler`, or `HttpServer.serve(effect, middleware)`) — wraps the entire chain *including response sending*. Response modifications here are **not** reflected in what the client receives. Use it only for observation (logging, metrics).

### Built-ins (`HttpMiddleware`)

- `HttpMiddleware.logger` — logs each sent response with `http.method`/`http.url`/`http.status` annotations. **Added automatically** by `HttpRouter.serve` and `HttpRouter.toWebHandler` unless `{ disableLogger: true }`. Disable per route with `Layer.provide(HttpRouter.disableLogger)` or per effect with `HttpMiddleware.withLoggerDisabled`.
- `HttpMiddleware.tracer` — creates a `kind: 'server'` span per request (default name `http.server ${method}`; the router adds an `http.route` attribute). **Always applied** inside the server pipeline — never add it yourself. Configure via the references `HttpMiddleware.SpanNameGenerator` and `HttpMiddleware.TracerDisabledWhen` (or `HttpMiddleware.layerTracerDisabledForUrls(['/health'])`). Request/response headers recorded as span attributes are redacted per the `Headers.CurrentRedactedNames` reference (defaults: `authorization`, `cookie`, `set-cookie`, `x-api-key`; entries are strings or RegExps) — extend it with `Layer.succeed(Headers.CurrentRedactedNames)([...])`, and use `Headers.redact(request.headers, names)` when logging headers yourself.
- `HttpMiddleware.cors(options)` — handles OPTIONS preflight and appends CORS headers via a pre-response handler. Options: `{ allowedOrigins?: ReadonlyArray<string> | Predicate<string>, allowedMethods?, allowedHeaders?, exposedHeaders?, maxAge?, credentials? }`. Shortcut: `HttpRouter.cors(options)` is a ready-made global layer (merge it with your routes) — but it only accepts the `ReadonlyArray<string>` form of `allowedOrigins`; for a predicate wrap the middleware yourself: `HttpRouter.middleware(HttpMiddleware.cors({ allowedOrigins: pred }), { global: true })`.
- `HttpMiddleware.xForwardedHeaders` — trusts `x-forwarded-host`/`x-forwarded-for`, rewriting `host` and `remoteAddress`.
- `HttpMiddleware.searchParamsParser` — provides `ParsedSearchParams` outside the router. Requires an absolute `request.originalUrl` (web-handler adapters only — it defects on the Node adapter's path-only URLs; see section 2).

### Route-scoped middleware with `HttpRouter.middleware`

A middleware is a function `(httpEffect) => httpEffect`. Type-parameterize what it `provides` (services injected into routes) and `handles` (typed route errors it absorbs):

```ts
import { Context } from 'effect';

class CurrentSession extends Context.Service<CurrentSession, {
	readonly token: string;
}>()('CurrentSession') {}

// Two-step call when configuring provides/handles: middleware<Config>()(fnOrEffect, options?)
const SessionMiddleware = HttpRouter.middleware<{ provides: CurrentSession }>()(
	Effect.gen(function* () {
		yield* Effect.log('SessionMiddleware initialized'); // runs once, at layer build
		return (httpEffect) =>
			Effect.flatMap(HttpServerRequest.HttpServerRequest, (request) =>
				Effect.provideService(httpEffect, CurrentSession, {
					token: request.headers.authorization ?? 'anonymous'
				}));
	})
);

// Error-handling middleware: may ONLY catch the errors listed in `handles`.
// Use the data-last (pipe) form — data-first Effect.catchTag drops Types.unhandled
// from the inferred error channel and trips the
// 'You must only handle the configured errors' guard.
const NotFoundHandler = HttpRouter.middleware<{ handles: UserNotFound }>()((httpEffect) =>
	httpEffect.pipe(
		Effect.catchTag('UserNotFound', (e) =>
			Effect.succeed(HttpServerResponse.jsonUnsafe({ error: 'not_found', id: e.id }, { status: 404 })))
	)
);

// Apply by providing `.layer` to the route layers it should affect:
const Routes = HttpRouter.add('GET', '/me', Effect.gen(function* () {
	const session = yield* CurrentSession;
	return HttpServerResponse.text(session.token);
})).pipe(
	Layer.provide([SessionMiddleware.layer, NotFoundHandler.layer])
);
```

Middleware can declare `requires` (services another middleware must provide); satisfy them with `combine` — in `a.combine(b)`, `b` runs outside `a` and its `provides` feed `a`:

```ts
const Composed = NeedsSessionMiddleware.combine(SessionMiddleware);
Routes.pipe(Layer.provide(Composed.layer));
```

### Global middleware

Pass `{ global: true }` to get a Layer that applies to **all** routes (it requires `HttpRouter`, so merge it into the app layer passed to `serve`). Global middleware runs inside the response pipeline, so it *can* modify responses. The first-registered global middleware is outermost.

```ts
const Timing = HttpRouter.middleware((httpEffect) =>
	Effect.gen(function* () {
		const start = yield* Effect.clockWith((clock) => clock.currentTimeMillis);
		const response = yield* httpEffect;
		const ms = (yield* Effect.clockWith((clock) => clock.currentTimeMillis)) - start;
		return HttpServerResponse.setHeader(response, 'x-response-time', `${ms}ms`);
	}), { global: true });

const AppRoutes = Layer.mergeAll(Routes, Timing, HttpRouter.cors());
```

### Providing plain services per request: `HttpRouter.provideRequest`

When routes just need services (no request/response wrapping), skip the middleware ceremony:

```ts
const Routes = UserRoutes.pipe(HttpRouter.provideRequest(Database.layer));
// Database.layer is built ONCE; its services are provided to each request of these routes
```

### Pre-response handlers

Run a transform just before the response is sent (this is how `cors` appends headers):

```ts
yield* HttpEffect.appendPreResponseHandler((request, response) =>
	Effect.succeed(HttpServerResponse.setHeader(response, 'server', 'effect')));
// also: HttpEffect.withPreResponseHandler(effect, handler)
```

---

## 7. Serving

### Node

```ts
const Main = HttpRouter.serve(AppRoutes, {
	disableLogger: false, // default: logger middleware is added
	disableListenLog: false, // default: logs `Listening on http://0.0.0.0:3000`
	routerConfig: { ignoreTrailingSlash: true }
	// middleware: (effect) => ... — observation-only; response changes are NOT sent (see section 6)
}).pipe(
	Layer.provide(NodeHttpServer.layer(createServer, {
		port: 3000,
		// any net.ListenOptions key (host, path for unix sockets, ...) plus:
		gracefulShutdownTimeout: '10 seconds', // Duration.Input; default 20 seconds
		disablePreemptiveShutdown: false // true = wait indefinitely for in-flight requests
	}))
);

Layer.launch(Main).pipe(NodeRuntime.runMain);
```

`Layer.launch` keeps the layer alive forever; `NodeRuntime.runMain` wires `SIGINT`/`SIGTERM` to fiber interruption, which closes the layer scope — the Node adapter then stops accepting connections and closes the server, bounded by `gracefulShutdownTimeout`.

Variants: `NodeHttpServer.layerServer` (server only, no platform services), `layerHttpServices` (HttpPlatform + Etag + Node services only), `layerConfig(createServer, configWrappedOptions)` (read options from `Config`), `layerTest` (section 10). `makeHandler`/`makeUpgradeHandler` return raw Node `request`/`upgrade` listeners for mounting the app on a server you manage yourself. For TLS pass `() => https.createServer(tlsOptions)` as the server factory.

### Bun

```ts
import { BunHttpServer, BunRuntime } from '@effect/platform-bun';

const Main = HttpRouter.serve(AppRoutes).pipe(
	Layer.provide(BunHttpServer.layer({ port: 3000 })) // Bun.serve options + the same shutdown options
);
Layer.launch(Main).pipe(BunRuntime.runMain);
```

### The HttpServer service

```ts
const server = yield* HttpServer.HttpServer;
server.address; // { _tag: 'TcpAddress', hostname, port } | { _tag: 'UnixAddress', path }
HttpServer.formatAddress(server.address); // 'http://0.0.0.0:3000'
yield* HttpServer.logAddress; // log it
someServerLayer.pipe(HttpServer.withLogAddress); // log on startup
```

Lower-level serving without the router — give `HttpServer.serve`/`serveEffect` any `Effect<HttpServerResponse, E, R | HttpServerRequest>`:

```ts
// Layer form (dual: also usable as serve() / serve(middleware) in pipes)
const App = HttpServer.serve(Effect.succeed(HttpServerResponse.text('ok')));
// Effect form, runs in the current scope:
yield* HttpServer.serveEffect(myHttpEffect);
```

### Escape hatch: the router as a plain effect

`HttpRouter.toHttpEffect(appLayer)` builds the app layer and returns the router as an `Effect<HttpServerResponse, ..., HttpServerRequest | Scope>` — wrap it with outer middleware that *may* modify responses, serve it with `HttpServer.serveEffect`, or hand it to `HttpEffect.toWebHandlerWith`:

```ts
const httpEffect = yield* HttpRouter.toHttpEffect(AppRoutes);
yield* HttpServer.serveEffect(httpEffect);
```

(Inside `HttpRouter.use`, the service offers the same surface imperatively: `router.asHttpEffect()` and `router.addGlobalMiddleware`.)

---

## 8. WebSocket Upgrades

`request.upgrade` yields a `Socket` (from `effect/unstable/socket`) once the connection is upgraded. Both `NodeHttpServer` and `BunHttpServer` handle the platform `upgrade` events for you — just write a normal route:

```ts
const WsRoute = HttpRouter.add('GET', '/ws', Effect.gen(function* () {
	const request = yield* HttpServerRequest.HttpServerRequest;
	const socket = yield* request.upgrade; // Effect<Socket.Socket, HttpServerError>
	const write = yield* socket.writer; // scoped — the request Scope keeps it alive

	// runs until the client disconnects; the handler receives each message
	yield* socket.runString((message) => write(`echo: ${message}`));

	return HttpServerResponse.empty(); // sent when the socket session ends
}));
```

- `socket.run(handler)` for binary (`Uint8Array`) messages, `runString` for text, `runRaw` for both.
- `HttpServerRequest.upgradeChannel()` exposes the socket as a `Channel` for pipeline-style use.
- `request.upgrade` fails with `HttpServerError` (`RequestParseError` reason) when the request is not upgradeable — e.g. in plain web-handler adapters that lack upgrade support.
- For socket combinators, close events, and client sockets see the `effect-socket` skill.

---

## 9. Static Files (`HttpStaticServer`)

```ts
const StaticFiles = HttpStaticServer.layer({
	root: './public',
	prefix: '/static', // optional mount prefix (registers GET <prefix>/*)
	index: 'index.html', // default 'index.html'; pass `index: undefined` to disable directory index
	spa: true, // serve the index for extensionless paths whose Accept includes text/html
	cacheControl: 'public, max-age=3600',
	mimeTypes: { custom: 'application/x-custom' } // merged over the built-in table
});
// Layer<never, PlatformError, HttpRouter | FileSystem | Path | HttpPlatform>

const AppRoutes = Layer.mergeAll(ApiRoutes, StaticFiles);
```

It serves files with correct MIME types, `accept-ranges: bytes` + single-range requests (`206`/`416`), conditional requests (`if-none-match`/`if-modified-since` → `304`), and is path-traversal safe. Misses fail with `RouteNotFound` (→ `404`). `HttpStaticServer.make(options)` returns the bare handler effect if you want to mount it yourself.

---

## 10. Web Handlers, Request Scope, and Testing

### Fetch-style handlers (serverless, in-memory testing)

```ts
// Single HTTP effect → (Request) => Promise<Response> — no router, no port
const handler = HttpEffect.toWebHandler(
	Effect.succeed(HttpServerResponse.text('ok'))
);
const response = await handler(new Request('http://localhost/'));

// With a base context / with a Layer for services.
// toWebHandlerWith declares R on the OUTER call with default `never` (it is not
// inferred from the effect) — supply it explicitly for handlers that use
// HttpServerRequest/Scope:
const handler2 = HttpEffect.toWebHandlerWith<never, HttpServerRequest.HttpServerRequest | Scope.Scope>(
	MyRef.context(420)
)(httpApp);
const { handler: handler3, dispose } = HttpEffect.toWebHandlerLayer(httpApp, ServicesLayer);

// Whole router app → handler (this is the serverless entrypoint)
const { handler: appHandler, dispose: disposeApp } = HttpRouter.toWebHandler(
	AppRoutes.pipe(Layer.provide(HttpServer.layerServices)),
	{ disableLogger: true } // also: middleware, memoMap, routerConfig
);
```

- A second argument passes per-request context: `handler(request, Env.context({ foo: 'baz' }))`.
- `HttpServer.layerServices` provides `HttpPlatform` + `Path` + weak `Etag` + a **noop FileSystem** — enough for routers that never touch disk. For real `HttpServerResponse.file`/multipart persistence in a web handler, provide `NodeHttpServer.layerHttpServices` (or the platform FileSystem/Path layers) instead.
- `HttpEffect.fromWebHandler(handler)` adapts an existing `(Request) => Promise<Response>` into an HTTP effect.

### Request scope semantics

Every request runs in a fresh `Scope` closed after the response is sent — `Effect.addFinalizer` in a handler runs post-response. Streaming bodies transfer the scope to the stream (`HttpEffect.scopeTransferToStream`, applied automatically by the adapters), so it closes when the body finishes streaming. If the client disconnects mid-request, the handler fiber is interrupted with the `ClientAbort` annotation (logged as `499`).

### Integration tests on an ephemeral port

`NodeHttpServer.layerTest` starts a real server on port 0 and provides an `HttpClient` whose requests are rewritten to it:

```ts
import { NodeHttpServer } from '@effect/platform-node';
import { describe, expect, it } from '@effect/vitest';
import { HttpClient, HttpClientResponse } from 'effect/unstable/http';

describe('todos', () => {
	it.effect('GET /todos/:id', () =>
		Effect.gen(function* () {
			yield* HttpRouter.add(
				'GET',
				'/todos/:id',
				Effect.flatMap(HttpRouter.schemaParams(IdParams), ({ id }) =>
					todoResponse({ id, title: 'test' }))
			).pipe(HttpRouter.serve, Layer.build); // build into the test scope

			const todo = yield* HttpClient.get('/todos/1').pipe(
				Effect.flatMap(HttpClientResponse.schemaBodyJson(Todo))
			);
			expect(todo).toEqual({ id: 1, title: 'test' });
		}).pipe(Effect.provide(NodeHttpServer.layerTest)));
});
```

(`BunHttpServer.layerTest` is the Bun equivalent. The pieces behind it: `HttpServer.makeTestClient` / `layerTestClient` build a client targeting the current server's address.)

---

## Key Patterns

### Full JSON API with middleware, domain errors, static files

```ts
import { Context, Effect, Layer, Schema } from 'effect';
import {
	HttpRouter,
	HttpServerRequest,
	HttpServerRespondable,
	HttpServerResponse,
	HttpStaticServer
} from 'effect/unstable/http';
import { NodeHttpServer, NodeRuntime } from '@effect/platform-node';
import { createServer } from 'node:http';

class Todo extends Schema.Class<Todo>('Todo')({
	id: Schema.Number,
	title: Schema.String
}) {}

class TodoNotFound extends Schema.ErrorClass<TodoNotFound>('TodoNotFound')({
	_tag: Schema.tag('TodoNotFound'),
	id: Schema.Number
}) {
	[HttpServerRespondable.symbol]() {
		return HttpServerResponse.schemaJson(TodoNotFound)(this, { status: 404 });
	}
}

class Todos extends Context.Service<Todos, {
	readonly find: (id: number) => Effect.Effect<Todo, TodoNotFound>;
	readonly create: (title: string) => Effect.Effect<Todo>;
}>()('app/Todos') {
	static readonly layer = Layer.sync(Todos)(() => {
		const todos = new Map<number, Todo>();
		let nextId = 1;
		return {
			find: (id) =>
				todos.has(id)
					? Effect.succeed(todos.get(id)!)
					: Effect.fail(new TodoNotFound({ id })),
			create: (title) =>
				Effect.sync(() => {
					const todo = new Todo({ id: nextId++, title });
					todos.set(todo.id, todo);
					return todo;
				})
		};
	});
}

const todoResponse = HttpServerResponse.schemaJson(Todo);
const IdParams = Schema.Struct({ id: Schema.FiniteFromString });
const CreateTodo = Schema.Struct({ title: Schema.String });

const TodoRoutes = HttpRouter.use(Effect.fnUntraced(function* (router_) {
	const router = router_.prefixed('/todos');

	yield* router.add('GET', '/:id', Effect.gen(function* () {
		const { id } = yield* HttpRouter.schemaParams(IdParams);
		const todos = yield* Todos;
		const todo = yield* todos.find(id); // TodoNotFound renders itself as 404 JSON
		return yield* todoResponse(todo);
	}));

	yield* router.add('POST', '/', Effect.gen(function* () {
		const { title } = yield* HttpServerRequest.schemaBodyJson(CreateTodo); // SchemaError → 400
		const todos = yield* Todos;
		const todo = yield* todos.create(title);
		return yield* todoResponse(todo, { status: 201 });
	}));
})).pipe(
	HttpRouter.provideRequest(Todos.layer) // request-level service provision
);

const AppRoutes = Layer.mergeAll(
	TodoRoutes,
	HttpRouter.cors({ allowedOrigins: ['https://example.com'], credentials: true }),
	HttpStaticServer.layer({ root: './public', spa: true })
);

const Main = HttpRouter.serve(AppRoutes).pipe(
	Layer.provide(NodeHttpServer.layer(createServer, { port: 3000 }))
);

Layer.launch(Main).pipe(NodeRuntime.runMain);
```

### File upload with limits and cleanup-free persistence

```ts
import { FileSystem } from 'effect';

const UploadRoute = HttpRouter.add('POST', '/upload', Effect.gen(function* () {
	const { file } = yield* HttpServerRequest.schemaBodyMultipart(Schema.Struct({
		file: Multipart.SingleFileSchema
	}));
	const fs = yield* FileSystem.FileSystem;
	const contents = yield* fs.readFileString(file.path); // temp file; removed when the request scope closes
	return yield* HttpServerResponse.json({ name: file.name, bytes: contents.length });
}).pipe(
	Effect.catchTag('MultipartError', () =>
		Effect.succeed(HttpServerResponse.empty({ status: 413 })))
));

const Main = HttpRouter.serve(UploadRoute).pipe(
	Layer.provide(NodeHttpServer.layer(createServer, { port: 3000 })),
	Layer.provide(Layer.succeed(Multipart.MaxFileSize)(5 * 1024 * 1024))
);
```

### Serverless entrypoint

```ts
// e.g. Cloudflare Workers / Deno / a Next.js route handler
export const { handler, dispose } = HttpRouter.toWebHandler(
	AppRoutes.pipe(Layer.provide(HttpServer.layerServices))
);
// export default { fetch: handler }
```

### Handler unit test without a port

```ts
import { describe, expect, it } from '@effect/vitest';

describe('health', () => {
	it('responds', async () => {
		const handler = HttpEffect.toWebHandler(
			Effect.succeed(HttpServerResponse.jsonUnsafe({ ok: true }))
		);
		const response = await handler(new Request('http://localhost/health'));
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ ok: true });
	});
});
```

---

## Common Mistakes

1. **Using the v3 value-style router** — `HttpRouter.empty.pipe(HttpRouter.get('/x', app))` no longer exists. The v4 router is a service: register routes with `HttpRouter.add(...)` Layers (or `router.add` inside `HttpRouter.use`) and run with `HttpRouter.serve(appLayer)`.
2. **Importing from `@effect/platform`** — gone in v4. Everything is `effect/unstable/http`; only the platform adapters live in `@effect/platform-node` / `@effect/platform-bun`.
3. **Treating `HttpServerResponse.json` as synchronous** — it returns `Effect<HttpServerResponse, HttpBodyError>`. `yield*` it, or use `jsonUnsafe` for known-serializable values. Same for `schemaJson` (which is also curried: `schemaJson(schema)(value, options)`).
4. **Expecting `HttpServerResponse.empty()` to be 200** — the default status is `204`. Pass `{ status: 200 }` if you need it.
5. **Modifying the response in `HttpRouter.serve`'s `middleware` option** — that middleware wraps the chain *after* response sending; changes are silently dropped. Use `HttpRouter.middleware(..., { global: true })` or route-scoped `HttpRouter.middleware` instead.
6. **Adding `HttpMiddleware.tracer` or `HttpMiddleware.logger` manually to `HttpRouter.serve`** — the tracer is always applied by the pipeline and the logger is added by default. Configure with `SpanNameGenerator`/`TracerDisabledWhen` references and the `disableLogger` option / `HttpRouter.disableLogger` layer.
7. **Passing multipart limits as options** — `Multipart.MaxFileSize`, `MaxFieldSize` (default 10 MiB), `MaxParts`, and `HttpServerRequest.MaxBodySize` are `Context.Reference`s. Set them with `Layer.succeed(Multipart.MaxFileSize)(n)` or `Effect.provideService`.
8. **Calling `request.multipart` without `FileSystem`/`Path`** — it persists parts to temp files and requires `Scope | FileSystem | Path`. The Node/Bun server layers provide them; `HttpServer.layerServices` only has a **noop** FileSystem (fine for routing tests, broken for real uploads and `HttpServerResponse.file`).
9. **Using `HttpRouter.params`/`schemaParams`/`schemaPathParams` outside a matched route** — they need `RouteContext`, which only the router provides. In plain `HttpEffect` handlers read `request.url` yourself; `HttpMiddleware.searchParamsParser` provides `ParsedSearchParams` but only where `originalUrl` is absolute (web-handler adapters) — on Node use `HttpServerRequest.searchParamsFromURL(new URL(request.url, 'http://localhost'))`.
10. **Forgetting cookie setters are effectful** — `setCookie`/`setCookies`/`expireCookie` return `Effect<_, CookiesError>`; the synchronous variants are `setCookieUnsafe`/`setCookiesUnsafe`/`expireCookieUnsafe` (and they throw on invalid input).
11. **Hand-rolling 404/500 mapping for schema and missing-value errors** — `SchemaError` already becomes `400` and `NoSuchElementError` becomes `404` at the boundary; implement `HttpServerRespondable.symbol` on domain errors instead of try/catch pyramids.
12. **Assuming handlers run to completion** — routes are interruptible; a client disconnect interrupts the fiber (`499`). Pass `{ uninterruptible: true }` to `HttpRouter.add` for side effects that must finish, and remember a plain server-shutdown interrupt maps to `503`.
13. **Route paths without a leading `/`** — `PathInput` is `` `/${string}` `` or `'*'`; `'users/:id'` is a type error. Wildcards are a trailing `/*` (which also matches the bare prefix); `'*'` as the whole path matches everything.
14. **Expecting `request.url` to keep the mount prefix** — prefixed routes (`router.prefixed`, `addAll({ prefix })`, `HttpStaticServer.layer({ prefix })`) strip the prefix from `request.url`; use `request.originalUrl` for the full path.
15. **Reading the body twice via `request.stream`** — `text`/`json`/`arrayBuffer`/`urlParamsBody`/`multipart` are cached and re-readable, but `stream` consumes the raw body once. Pick one style per request.
16. **Returning a Web `Response` directly** — wrap it. `HttpServerResponse.fromWeb(webResponse)` is the portable default (converts the body to a byte stream). `HttpServerResponse.raw(webResponse)` is a fast path for web-handler adapters and Bun only (there the Effect response's headers are merged into the Web `Response`); the Node server adapter passes non-Node-stream raw bodies straight to `nodeResponse.end()`, so a Web `Response`/`ReadableStream` is a runtime defect (500).
17. **`Effect.die(response)` confusion** — a defect that is an `HttpServerResponse` is intentionally used as the response (an escape-hatch early return supported by `causeResponse`); do not be surprised when you see it in causes, and prefer plain success returns in your own code.
