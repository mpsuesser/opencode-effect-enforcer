---
name: effect-http-api
description: Build typed HTTP APIs with Effect's HttpApi — endpoints with schemas, handlers, security middleware, OpenAPI docs, derived clients, and handler unit tests. Use when building HTTP servers, REST APIs, or typed HTTP clients with Effect v4.
---

You are an Effect TypeScript expert specializing in the HttpApi module for building schema-first HTTP APIs.

## Effect Source Reference

The Effect v4 source is available at `~/.cache/effect-v4/`. Browse and read files there directly to look up APIs, types, and implementations.

Key reference files:

- `packages/effect/HTTPAPI.md` — canonical HttpApi documentation
- `packages/effect/src/unstable/httpapi/*.ts` — module sources
- `packages/effect/typetest/unstable/httpapi/*.tst.ts` — type-level contracts
- `packages/platform-node/test/HttpApi.test.ts` — comprehensive runtime tests
- `ai-docs/src/51_http-server/` — server walkthrough with fixtures
- `ai-docs/src/50_http-client/` — HttpClient walkthrough

## Core Imports

```ts
// HttpApi modules (definition + building + client + testing)
import {
	HttpApi,
	HttpApiBuilder,
	HttpApiClient,
	HttpApiEndpoint,
	HttpApiError,
	HttpApiGroup,
	HttpApiMiddleware,
	HttpApiScalar,
	HttpApiSchema,
	HttpApiSecurity,
	HttpApiSwagger,
	HttpApiTest,
	OpenApi
} from 'effect/unstable/httpapi';

// HTTP primitives (router, server, client, multipart)
import {
	FetchHttpClient,
	HttpClient,
	HttpClientRequest,
	HttpClientResponse,
	HttpEffect,
	HttpRouter,
	HttpServer,
	HttpServerRequest,
	HttpServerResponse,
	Multipart
} from 'effect/unstable/http';

// Platform server (Node.js — Bun has @effect/platform-bun/BunHttpServer)
import { NodeHttpServer, NodeRuntime } from '@effect/platform-node';
```

## Architecture Overview

An API is built from three building blocks:

```
HttpApi
├── HttpApiGroup
│   ├── HttpApiEndpoint
│   └── HttpApiEndpoint
└── HttpApiGroup
    ├── HttpApiEndpoint
    └── HttpApiEndpoint
```

One definition powers the server, docs, and client — change it once and everything stays in sync.

**Critical design rule**: API definitions live in their own module/package, separate from server implementations, so clients can import them without pulling in server code or handler dependencies.

## Defining Endpoints

### HTTP Methods

```ts
HttpApiEndpoint.get('name', '/path', { ... });
HttpApiEndpoint.post('name', '/path', { ... });
HttpApiEndpoint.put('name', '/path', { ... });
HttpApiEndpoint.patch('name', '/path', { ... });
HttpApiEndpoint.delete('name', '/path', { ... });
HttpApiEndpoint.head('name', '/path', { ... });
HttpApiEndpoint.options('name', '/path', { ... });

// Escape hatch for arbitrary methods (PROPFIND, MOVE, etc.)
const link = HttpApiEndpoint.make('LINK');
link('name', '/path', { ... });
```

The first argument is the endpoint name (used as the method name in the generated client). The second is the route path. The third is an options object with schemas. For methods with no body (`get`, `head`, `options`, `delete`), the `payload` option is treated as a query-string-encoded record of fields.

### Endpoint Options

```ts
HttpApiEndpoint.patch('updateUser', '/user/:id', {
	// Path parameters — parsed and validated from URL segments
	params: {
		id: Schema.FiniteFromString.check(Schema.isInt())
	},

	// Query string parameters (?key=value)
	query: {
		mode: Schema.Literals(['merge', 'replace']),
		page: Schema.optionalKey(Schema.FiniteFromString.check(Schema.isInt()))
	},

	// Request headers (always use lowercase keys — see warning below)
	headers: {
		'x-api-key': Schema.String,
		'x-request-id': Schema.String
	},

	// Request body — default encoding is JSON
	// Can be a single schema or array of schemas for content negotiation
	payload: Schema.Struct({
		name: Schema.String
	}),

	// Success response — default is 204 No Content if omitted
	// Can be a single schema or array for multiple response types
	success: User,

	// Error responses — each annotated with HTTP status code
	error: [UserNotFound, Unauthorized]
});
```

> **Important**: HTTP headers are normalized to lowercase. Always use lowercase keys in the `headers` option — `"x-api-key"`, never `"X-API-Key"`.

### Automatic Codec Wrapping & `disableCodecs`

By default, endpoint schemas are automatically wrapped with codec transformations:

- **Params, query, headers** are wrapped with `Schema.toCodecStringTree` (string ↔ typed value).
- **Payload, success, error** are wrapped with `Schema.toCodecJson` (JSON ↔ typed value) when the encoding is JSON.

This means you can pass plain `Schema.Struct.Fields` records and they "just work" — the framework handles serialization. To opt out and provide schemas that already handle their own encoding:

```ts
HttpApiEndpoint.get('raw', '/raw/:id', {
	disableCodecs: true,
	// With disableCodecs, schemas must already satisfy their transport constraints:
	// - params/query/headers must encode to string | string[] | undefined
	// - payload must encode to whatever the chosen encoding requires
	params: Schema.Struct({ id: Schema.String }),
	success: Schema.Struct({ data: Schema.String })
});
```

Use `disableCodecs: true` when your schemas already include their own transport transformations or when you need full control over decode/encode.

### Multiple Payload Schemas (Content Negotiation)

`payload` accepts an array of schemas, each declaring its own content-type via `HttpApiSchema.as*`. The framework picks the schema that matches the incoming `Content-Type`.

```ts
HttpApiEndpoint.post('create', '/items', {
	payload: [
		Schema.Struct({ a: Schema.String }), // application/json (default)
		Schema.String.pipe(HttpApiSchema.asText()), // text/plain
		Schema.Uint8Array.pipe(HttpApiSchema.asUint8Array()) // application/octet-stream
	],
	success: Item
});
```

> **Constraint**: each payload schema must resolve to a **distinct** content-type. Two schemas claiming `application/json` raise `Multiple payload encodings for content-type: application/json` at construction time. Only one multipart payload per endpoint.

### Multiple Success Schemas (Content Negotiation)

`success` works the same way:

```ts
HttpApiEndpoint.get('search', '/search', {
	payload: { search: Schema.String },
	success: [
		Schema.Array(User), // JSON (default)
		Schema.String.pipe(
			HttpApiSchema.asText({ contentType: 'text/csv' })
		)
	],
	error: [SearchQueryTooShort, HttpApiError.RequestTimeoutNoContent]
});
```

### No-Content Responses

```ts
// Default — omit success entirely → 204 No Content
HttpApiEndpoint.delete('deleteUser', '/user/:id', {
	params: { id: Schema.FiniteFromString.check(Schema.isInt()) }
});

// Explicit 204
HttpApiEndpoint.get('health', '/health', {
	success: HttpApiSchema.NoContent
});

// Other empty-body status codes
HttpApiEndpoint.post('create', '/items', {
	success: HttpApiSchema.Created // 201
});
HttpApiEndpoint.post('enqueue', '/jobs', {
	success: HttpApiSchema.Accepted // 202
});
HttpApiEndpoint.get('teapot', '/coffee', {
	success: HttpApiSchema.Empty(418) // any code
});

// asNoContent: empty body wire-side, but client decodes to a meaningful value
HttpApiEndpoint.get('me', '/me', {
	error: UserNotFound.pipe(
		HttpApiSchema.asNoContent({ decode: () => new UserNotFound() })
	)
});
```

### Catch-All Endpoint

Set the path to `"*"` for a fallback. Must be the last endpoint in the group. Not included in the OpenAPI spec.

```ts
HttpApiEndpoint.get('catchAll', '*', {
	success: Schema.String
});
```

### Prefixing

```ts
HttpApiEndpoint.get('endpointA', '/a', { success: Schema.String }).prefix(
	'/endpointPrefix'
); // → /endpointPrefix/a
```

Group- and API-level prefixing are described below.

## Schema Annotations

### Status Codes

```ts
// Numeric form
Schema.Array(User).pipe(HttpApiSchema.status(206));
Schema.Struct({ message: Schema.String }).pipe(HttpApiSchema.status(404));

// Named-literal form (preferred for readability)
Schema.String.pipe(HttpApiSchema.status('PartialContent')); // 206
Schema.Void.pipe(HttpApiSchema.status('Forbidden')); // 403
SomeError.pipe(HttpApiSchema.status('UnprocessableEntity')); // 422
RateLimitError.pipe(HttpApiSchema.status('TooManyRequests')); // 429

// Or annotate an error class inline at definition
class UserNotFound extends Schema.TaggedErrorClass<UserNotFound>()(
	'UserNotFound',
	{},
	{ httpApiStatus: 404 }
) {}
```

`HttpApiSchema.StatusLiteral` is the exported keyof type for the literal form. The full set covers the standard codes (`Continue`, `OK`, `Created`, `Accepted`, `NoContent`, `MovedPermanently`, `Found`, `BadRequest`, `Unauthorized`, `Forbidden`, `NotFound`, `MethodNotAllowed`, `NotAcceptable`, `RequestTimeout`, `Conflict`, `Gone`, `UnprocessableEntity`, `TooManyRequests`, `InternalServerError`, `NotImplemented`, `BadGateway`, `ServiceUnavailable`, `GatewayTimeout`, etc.). Unannotated success schemas default to 200, and unannotated error schemas default to 500. If you omit `success`, the endpoint defaults to `HttpApiSchema.NoContent` (204). `success: Schema.Void` is an empty 200 response unless you annotate it or use `HttpApiSchema.NoContent`.

### Empty Schemas

```ts
HttpApiSchema.NoContent; // Schema.Void with status 204
HttpApiSchema.Created; // Schema.Void with status 201
HttpApiSchema.Accepted; // Schema.Void with status 202
HttpApiSchema.Empty(418); // Schema.Void with arbitrary status

// Decode an empty wire response into a meaningful value (client side)
SomeSchema.pipe(HttpApiSchema.asNoContent({ decode: () => myValue }));
```

### Encodings

```ts
HttpApiSchema.asJson(); // application/json (default)
HttpApiSchema.asJson({ contentType: 'application/scim+json' });
HttpApiSchema.asText(); // text/plain (encoded type must be string)
HttpApiSchema.asText({ contentType: 'text/csv' });
HttpApiSchema.asFormUrlEncoded(); // application/x-www-form-urlencoded (encoded type must be string record)
HttpApiSchema.asUint8Array(); // application/octet-stream (encoded type must be Uint8Array)
HttpApiSchema.asUint8Array({ contentType: 'image/png' });
HttpApiSchema.asMultipart(); // multipart/form-data, buffered (request only)
HttpApiSchema.asMultipart({ maxParts: 100, maxFileSize: 10_000_000 });
HttpApiSchema.asMultipartStream(); // multipart/form-data, streaming (request only)
HttpApiSchema.asMultipartStream({ maxFileSize: 50_000_000 });
```

The multipart limits options are typed as `Multipart.withLimits.Options`. Multipart is **payload-only**; using it on a success/error schema throws.

### Multipart File Uploads

```ts
HttpApiEndpoint.post('upload', '/upload', {
	payload: Schema.Struct({
		files: Multipart.FilesSchema, // multiple files persisted to disk
		caption: Schema.String
	}).pipe(HttpApiSchema.asMultipart()),
	success: Schema.String
});

// For exactly one file
HttpApiEndpoint.post('avatar', '/avatar', {
	payload: Schema.Struct({
		file: Multipart.SingleFileSchema
	}).pipe(HttpApiSchema.asMultipart()),
	success: Schema.String
});

// Streaming variant — handler receives a Stream<Multipart.Part>
HttpApiEndpoint.post('uploadStream', '/upload/stream', {
	payload: Schema.Struct({ file: Multipart.SingleFileSchema }).pipe(
		HttpApiSchema.asMultipartStream()
	),
	success: Schema.String
});
```

## Groups

Groups organize related endpoints and apply shared middleware, prefixes, and annotations.

```ts
export class UsersApiGroup extends HttpApiGroup.make('users')
	.add(
		HttpApiEndpoint.get('list', '/', {
			success: Schema.Array(User)
		}),
		HttpApiEndpoint.get('getById', '/:id', {
			params: {
				id: Schema.FiniteFromString.pipe(Schema.decodeTo(UserId))
			},
			success: User,
			error: UserNotFound
		}),
		HttpApiEndpoint.post('create', '/', {
			payload: Schema.Struct({
				name: Schema.String,
				email: Schema.String
			}),
			success: User
		})
	)
	.middleware(Authorization)
	.prefix('/users')
	.annotateMerge(
		OpenApi.annotations({
			title: 'Users',
			description: 'User management endpoints'
		})
	) {}
```

### Top-Level Groups

```ts
export class SystemApi extends HttpApiGroup.make('system', {
	topLevel: true
}).add(
	HttpApiEndpoint.get('health', '/health', {
		success: HttpApiSchema.NoContent
	})
) {}
```

A top-level group exposes its endpoints at the **root** of the generated client (`client.health()` instead of `client.system.health()`) and at the root of the URL builder. The OpenAPI `operationId` also drops the group prefix.

### Group-Level Annotations

```ts
HttpApiGroup.make('users')
	.annotate(OpenApi.Description, 'User endpoints')
	.annotate(OpenApi.Title, 'Users') // renames the OpenAPI tag
	.annotate(OpenApi.ExternalDocs, { url: 'https://docs.example.com' })
	.annotate(OpenApi.Exclude, true); // hide entire group from OpenAPI

// Bulk-apply an annotation to every endpoint currently in the group:
HttpApiGroup.make('users')
	.add(/* endpoints */)
	.annotateEndpoints(OpenApi.Deprecated, true)
	.annotateEndpointsMerge(OpenApi.annotations({ deprecated: true }));
```

> **Caveat**: group middleware (`.middleware(M)`) and endpoint-level annotations (`.annotateEndpoints(...)`) only apply to endpoints **already added** at the time of the call. Endpoints added after `.middleware(M)` will not have `M` attached. Order your `.add(...).middleware(M)` calls accordingly.

## API Definition

```ts
export class Api extends HttpApi.make('my-api')
	.add(UsersApiGroup)
	.add(SystemApi)
	.annotateMerge(
		OpenApi.annotations({
			title: 'My API',
			description: 'My API description',
			version: '1.0.0'
		})
	) {}
```

### Composing APIs

```ts
// Add another HttpApi's groups into this one
class V0 extends HttpApi.make('v0').add(LegacyGroup) {}

class Api extends HttpApi.make('api').add(NewGroup).addHttpApi(V0) {}
```

`addHttpApi` merges the other API's groups (and propagates the donor API's annotations into them).

### API-Level Prefixing and Middleware

```ts
const Api = HttpApi.make('MyApi')
	.add(
		HttpApiGroup.make('group')
			.add(
				HttpApiEndpoint.get('endpointA', '/a', {
					success: Schema.String
				}).prefix('/endpointPrefix') // /apiPrefix/groupPrefix/endpointPrefix/a
			)
			.prefix('/groupPrefix')
	)
	.middleware(Authorization) // applies to all groups already added
	.prefix('/apiPrefix');
```

> Same caveat as for groups: API-level middleware only applies to groups already added at the time of `.middleware(...)`.

### Reading and Reflecting on an API

```ts
HttpApi.isHttpApi(value); // type guard
HttpApiGroup.isHttpApiGroup(value);
HttpApiEndpoint.isHttpApiEndpoint(value);

// Walk the API tree (used internally by OpenApi.fromApi and HttpApiClient)
HttpApi.reflect(api, {
	onGroup({ group, mergedAnnotations }) {
		/* ... */
	},
	onEndpoint({
		group,
		endpoint,
		middleware,
		successes,
		errors,
		mergedAnnotations
	}) {
		/* ... */
	},
	predicate: ({ endpoint, group }) => true
});
```

## Building Implementations

### Handler Groups

`HttpApiBuilder.group(api, groupName, build)` returns a `Layer` that implements every endpoint in the named group. The `build` callback can be either a synchronous `handlers => ...` function or an `Effect` returning the populated `Handlers` (use `Effect.fn` so you can `yield*` services).

```ts
const UsersApiHandlers = HttpApiBuilder.group(
	Api,
	'users',
	Effect.fn(function* (handlers) {
		const users = yield* Users;

		return handlers
			.handle('list', ({ query }) =>
				users.list(query.search).pipe(Effect.orDie)
			)
			.handle('getById', ({ params }) =>
				users.getById(params.id).pipe(
					Effect.catchReasons(
						'UsersError',
						{ UserNotFound: (e) => Effect.fail(e) },
						Effect.die
					)
				)
			)
			.handle('create', ({ payload }) =>
				users.create(payload).pipe(Effect.orDie)
			)
			.handle('me', () => CurrentUser);
	})
).pipe(Layer.provide([Users.layer, AuthorizationLayer]));
```

The framework checks at the type level that every endpoint in the group is handled — `ValidateReturn` produces an `"Endpoint not handled: <name>"` string-typed error otherwise.

### Handler Context

Each handler receives a typed context object:

```ts
handlers.handle('updateUser', (ctx) => {
	ctx.params; // typed path parameters
	ctx.query; // typed query parameters
	ctx.headers; // typed request headers
	ctx.payload; // typed request body
	ctx.request; // raw HttpServerRequest (method, url, cookies, raw headers)
	ctx.endpoint; // the HttpApiEndpoint definition (rare; useful in shared helpers)
	ctx.group; // the HttpApiGroup definition
	return Effect.succeed(/* ... */);
});
```

### Returning a Raw `HttpServerResponse`

A handler may return either the typed success value (which the framework encodes per the `success` schema) **or** an `HttpServerResponse` directly. The framework checks `HttpServerResponse.isHttpServerResponse(value)` and skips success-encoding when true. Use this for redirects, manual streaming, custom status codes outside the schema, etc.

```ts
handlers.handle('legacyRedirect', () =>
	Effect.succeed(HttpServerResponse.redirect('/new', { status: 302 }))
);
```

### `handleRaw` — Skipping Payload Decoding

`handlers.handleRaw(name, handler)` opts out of automatic payload decoding. The handler receives the same typed `params/query/headers/request/endpoint/group` but no decoded `payload` — read the body directly from `ctx.request`. Useful for endpoints that need streaming, custom parsing, or pass-through proxying.

```ts
handlers.handleRaw(
	'proxy',
	Effect.fn(function* ({ params, request }) {
		const body = (yield* Effect.orDie(request.json)) as { name: string };
		return HttpServerResponse.jsonUnsafe({
			id: params.id,
			name: body.name
		});
	})
);
```

### Uninterruptible Handlers

Both `handle` and `handleRaw` accept a third options object:

```ts
handlers.handle('charge', payHandler, { uninterruptible: true });
```

Use sparingly — only when a handler must not be cancelled mid-flight (e.g., once a transaction has been initiated downstream).

### Standalone Endpoint Handler

Sometimes you want to mount a single HttpApi endpoint inside an existing `HttpRouter` without going through `HttpApiBuilder.layer`. Use `HttpApiBuilder.endpoint`:

```ts
const helloHandler = yield* HttpApiBuilder.endpoint(
	Api,
	'greetings',
	'hello',
	() => Effect.succeed('Hi!')
);
// helloHandler: Effect<HttpServerResponse, ..., HttpServerRequest | RouteContext | ParsedSearchParams | ...>

yield* router.add('GET', '/api/hello', helloHandler);
```

### Building the Server Layer

`HttpApiBuilder.layer(api, options?)` produces the routes-into-router layer. `options.openapiPath` exposes the raw OpenAPI JSON at the given path.

```ts
const ApiRoutes = HttpApiBuilder.layer(Api, {
	openapiPath: '/openapi.json'
}).pipe(Layer.provide([UsersApiHandlers, SystemApiHandlers]));

const DocsRoute = HttpApiScalar.layer(Api, { path: '/docs' });

const AllRoutes = Layer.mergeAll(ApiRoutes, DocsRoute);
```

If you forget to provide a group's handler layer you'll get a clear runtime defect:

```
HttpApiGroup "users" not found (key: "effect/httpapi/HttpApiGroup/users").
Did you forget to provide HttpApiBuilder.group(api, "users", ...)?
Available groups: <list>
```

Missing middleware layers fail with `Service not found: <middleware key>`.

### Serving the API

```ts
// Option 1: Node.js HTTP server
export const HttpServerLayer = HttpRouter.serve(AllRoutes, {
	disableLogger: false, // default; set true to skip the request logger
	disableListenLog: false // default; set true to skip the "Listening on" log
}).pipe(Layer.provide(NodeHttpServer.layer(createServer, { port: 3000 })));

Layer.launch(HttpServerLayer).pipe(NodeRuntime.runMain);

// Option 2: Web handler for serverless / edge / custom HTTP frame
export const { handler, dispose } = HttpRouter.toWebHandler(
	Layer.mergeAll(AllRoutes.pipe(Layer.provide(HttpServer.layerServices)))
);
// handler: (request: Request, ctx?: Context.Context) => Promise<Response>
// dispose: () => Promise<void>  — call on shutdown
```

`HttpServer.layerServices` is a generic/test helper that includes a no-op `FileSystem`. Use it only when your routes do not need real filesystem access, file responses, persisted multipart files, or static serving. For Node/Bun HTTP servers with real platform behavior, prefer concrete layers such as `NodeHttpServer.layer(...)` / `BunHttpServer.layer(...)` or their `layerHttpServices` variants where applicable.

`HttpRouter.serve` and `HttpRouter.toWebHandler` both also accept `routerConfig` (passed to find-my-way) and `middleware` (a wrap function applied to the entire HTTP server pipeline).

> There is no `HttpApiBuilder.toWebHandler` — always go through `HttpRouter.toWebHandler` (or `HttpRouter.serve` for a long-running server).

## Errors

### Custom Errors

Define errors with `Schema.TaggedErrorClass` and either pipe through `HttpApiSchema.status` or set `httpApiStatus` in the class options:

```ts
class UserNotFound extends Schema.TaggedErrorClass<UserNotFound>()(
	'UserNotFound',
	{ message: Schema.String },
	{ httpApiStatus: 404 }
) {}

class Unauthorized extends Schema.TaggedErrorClass<Unauthorized>()(
	'Unauthorized',
	{ message: Schema.String },
	{ httpApiStatus: 401 }
) {}

// Or use status() on a struct schema (no class):
const NotFound = Schema.Struct({
	_tag: Schema.tag('NotFound'),
	message: Schema.String
}).pipe(HttpApiSchema.status('NotFound')); // 404
```

### Predefined Error Types

`HttpApiError` provides ready-made error classes for common HTTP status codes. They are full `Schema.ErrorClass` instances and also implement `HttpServerRespondable`, so they can be returned directly from plain `HttpRouter` handlers (outside HttpApi) and produce the right status response without further configuration.

| Class                 | Status | NoContent variant              |
| --------------------- | ------ | ------------------------------ |
| `BadRequest`          | 400    | `BadRequestNoContent`          |
| `Unauthorized`        | 401    | `UnauthorizedNoContent`        |
| `Forbidden`           | 403    | `ForbiddenNoContent`           |
| `NotFound`            | 404    | `NotFoundNoContent`            |
| `MethodNotAllowed`    | 405    | `MethodNotAllowedNoContent`    |
| `NotAcceptable`       | 406    | `NotAcceptableNoContent`       |
| `RequestTimeout`      | 408    | `RequestTimeoutNoContent`      |
| `Conflict`            | 409    | `ConflictNoContent`            |
| `Gone`                | 410    | `GoneNoContent`                |
| `InternalServerError` | 500    | `InternalServerErrorNoContent` |
| `NotImplemented`      | 501    | `NotImplementedNoContent`      |
| `ServiceUnavailable`  | 503    | `ServiceUnavailableNoContent`  |

Usage:

```ts
HttpApiEndpoint.get('getUser', '/user/:id', {
	params: { id: Schema.FiniteFromString.check(Schema.isInt()) },
	success: User,
	error: [HttpApiError.NotFound, HttpApiError.UnauthorizedNoContent]
});

handlers.handle('getUser', ({ params }) =>
	params.id === 1
		? Effect.fail(new HttpApiError.NotFound({}))
		: Effect.succeed(/* user */)
);
```

### Schema Validation Errors

When a request fails decoding (bad params, invalid query, malformed body), the framework wraps the underlying `SchemaError` in `HttpApiError.HttpApiSchemaError`:

```ts
{
  _tag: "HttpApiSchemaError",
  kind: "Params" | "Headers" | "Query" | "Body" | "Payload",
  cause: SchemaError
}
```

By default these errors are treated as **defects** (per the v4 design) and respond with an empty `400 Bad Request` (`HttpApiError.BadRequestNoContent`). If you want to surface the validation details (or use a different status), install a schema-error transform middleware via `HttpApiMiddleware.layerSchemaErrorTransform`:

```ts
class ValidationError extends Schema.TaggedErrorClass<ValidationError>()(
	'ValidationError',
	{ message: Schema.String, kind: Schema.String }
) {}

class SchemaErrorHandler extends HttpApiMiddleware.Service<SchemaErrorHandler>()(
	'api/SchemaErrorHandler',
	{
		error: ValidationError.pipe(HttpApiSchema.status('UnprocessableEntity'))
	}
) {}

const SchemaErrorHandlerLive = HttpApiMiddleware.layerSchemaErrorTransform(
	SchemaErrorHandler,
	(schemaError, { endpoint }) =>
		Effect.fail(
			new ValidationError({
				kind: schemaError.kind,
				message: `Invalid ${schemaError.kind} for ${endpoint.name}: ${String(schemaError.cause)}`
			})
		)
);

// Attach to an endpoint, group, or the entire API
const Api = HttpApi.make('api')
	.add(/* ... */)
	.middleware(SchemaErrorHandler);

const Live = HttpApiBuilder.layer(Api).pipe(
	Layer.provide(GroupHandlers),
	Layer.provide(SchemaErrorHandlerLive)
);
```

You can detect this error type explicitly with `HttpApiError.HttpApiSchemaError.is(value)` and wrap a `SchemaError`-failing effect with `HttpApiError.HttpApiSchemaError.wrap(kind, effect)`.

## Security and Middleware

### Security Schemes

```ts
HttpApiSecurity.http({ scheme: 'Digest' }); // Authorization: Digest ...
HttpApiSecurity.bearer; // predefined HTTP Bearer auth
HttpApiSecurity.basic; // HTTP Basic auth
HttpApiSecurity.apiKey({
	in: 'header', // "header" | "query" | "cookie"  (default: "header")
	key: 'x-api-key'
});
```

`HttpApiSecurity.bearer` is the predefined HTTP `Bearer` scheme; use `HttpApiSecurity.http({ scheme })` for custom `Authorization: <scheme> ...` schemes such as Digest. Middleware should validate the expected `Authorization` scheme/prefix itself when it matters: `HttpApiBuilder.securityDecode` currently slices by scheme length, and security schemes declare credential shape rather than authenticating.

You can attach metadata to a security scheme:

```ts
HttpApiSecurity.bearer.pipe(
	HttpApiSecurity.annotate(OpenApi.Description, 'Project-scoped token'),
	HttpApiSecurity.annotate(OpenApi.Format, 'JWT') // becomes bearerFormat in spec
);

const digestAuth = HttpApiSecurity.http({ scheme: 'Digest' }).pipe(
	HttpApiSecurity.annotate(OpenApi.Description, 'Digest token'),
	HttpApiSecurity.annotate(OpenApi.Format, 'DigestToken')
);
```

### Defining Middleware (Service)

```ts
class CurrentUser extends Context.Service<CurrentUser, User>()('CurrentUser') {}

class Unauthorized extends Schema.TaggedErrorClass<Unauthorized>()(
	'Unauthorized',
	{ message: Schema.String },
	{ httpApiStatus: 401 }
) {}

class Authorization extends HttpApiMiddleware.Service<
	Authorization,
	{
		// Services this middleware injects into the rest of the stack
		provides: CurrentUser;
		// Services this middleware itself depends on
		requires: never;
		// Optional: typed errors the *client* implementation may produce
		clientError: never;
	}
>()('Authorization', {
	// Force clients to provide a matching client middleware (see below)
	requiredForClient: true,
	// Security schemes — keys here become the keys of the security handler record
	security: {
		bearer: HttpApiSecurity.bearer
	},
	// Errors this middleware may raise — single schema or array of schemas
	error: Unauthorized
}) {}
```

`HttpApiMiddleware.Service<Self, Config>()` returns a class. The optional second argument controls type-level facets:

| Field               | Meaning                                                                              |
| ------------------- | ------------------------------------------------------------------------------------ |
| `provides`          | Services that the middleware adds to the handler context                             |
| `requires`          | Services that the middleware depends on                                              |
| `clientError`       | Typed error that the *client-side* counterpart may fail with (when `requiredForClient: true`) |

Class options (second positional arg):

| Field                | Meaning                                                                       |
| -------------------- | ----------------------------------------------------------------------------- |
| `error`              | One schema or an array of schemas the middleware may produce as failures      |
| `security`           | A record of named `HttpApiSecurity` schemes (defines security middleware)     |
| `requiredForClient`  | If `true`, generated clients require a matching `layerClient` to be provided  |

### Implementing Server-Side Security Middleware

Implement the middleware as a `Layer`. For each entry in `security: { ... }`, return a handler `(httpEffect, options) => Effect<HttpServerResponse, ...>` that decodes the credential and provides the resulting service.

```ts
const AuthorizationLayer = Layer.effect(
	Authorization,
	Effect.gen(function* () {
		yield* Effect.logInfo('Starting Authorization middleware');

		return Authorization.of({
			bearer: Effect.fn(function* (httpEffect, options) {
				// options.credential — the decoded credential (Redacted for bearer/apiKey, Credentials for basic)
				// options.endpoint  — the endpoint being invoked
				// options.group     — the group being invoked
				const token = Redacted.value(options.credential);
				if (token !== 'valid-token') {
					return yield* new Unauthorized({
						message: 'Invalid token'
					});
				}
				return yield* Effect.provideService(
					httpEffect,
					CurrentUser,
					new User({
						id: UserId.make(1),
						name: 'Dev User',
						email: 'dev@acme.com'
					})
				);
			})
		});
	})
);
```

When the middleware declares multiple `security` entries, the framework tries each in order; the first one whose handler succeeds wins.

For one-line handlers, `Layer.succeed` is convenient:

```ts
const AuthLive = Layer.succeed(Authorization)({
	bearer: (effect, opts) =>
		Effect.provideService(effect, CurrentUser, new User(/* ... */))
});
```

### Plain (Non-Security) Middleware

When the middleware has no `security`, the layer's value is a single function:

```ts
class Logger extends HttpApiMiddleware.Service<Logger>()('Http/Logger', {
	error: Schema.String.pipe(
		HttpApiSchema.status('MethodNotAllowed'),
		HttpApiSchema.asText()
	)
}) {}

const LoggerLive = Layer.effect(
	Logger,
	Effect.gen(function* () {
		yield* Effect.logInfo('creating Logger middleware');
		return (httpEffect, { endpoint, group }) =>
			Effect.gen(function* () {
				const request = yield* HttpServerRequest.HttpServerRequest;
				yield* Effect.logInfo(
					`Request: ${request.method} ${request.url} → ${group.identifier}.${endpoint.name}`
				);
				return yield* httpEffect;
			});
	})
);
```

### Schema-Error Transform Middleware

See the "Schema Validation Errors" section above. `HttpApiMiddleware.layerSchemaErrorTransform` is the canonical primitive for replacing the default empty-400 with a typed validation error.

### Applying Middleware

```ts
// To a single endpoint
HttpApiEndpoint.get('me', '/me', { success: User }).middleware(Authorization);

// To an entire group (only endpoints already added)
HttpApiGroup.make('users').add(/* ... */).middleware(Authorization);

// To the entire API (only groups already added)
HttpApi.make('api').add(/* ... */).middleware(Authorization);
```

### Middleware Ordering (LIFO)

Multiple middlewares chained on the same endpoint run in **last-in, first-out** order. Given `.middleware(M1).middleware(M2)`, the runtime order is:

```
M2-before → M1-before → handler → M1-after → M2-after
```

The same applies to client-side middleware. Be deliberate about the order if any middleware reads or mutates request/response state from another.

### Cookie-Based Security and `securitySetCookie`

```ts
const sessionCookie = HttpApiSecurity.apiKey({ in: 'cookie', key: 'session' });

class Auth extends HttpApiMiddleware.Service<Auth, { provides: CurrentUser }>()(
	'Auth',
	{
		error: Schema.String.annotate({ httpApiStatus: 401 }),
		security: { session: sessionCookie }
	}
) {}

// Setting a security cookie in a login handler:
handlers.handle('login', () =>
	HttpApiBuilder.securitySetCookie(
		sessionCookie,
		Redacted.make('secret-session-id')
	)
);
// Defaults: HttpOnly + Secure. Override via the third options argument.
```

For testing or custom decoding outside HttpApi, `HttpApiBuilder.securityDecode(security)` returns `Effect<credential, never, HttpServerRequest | ParsedSearchParams>`.

### Reading Cookies Directly (No Validation, No OpenAPI)

```ts
handlers.handle('me', (ctx) => {
	const lang = ctx.request.cookies['lang'] ?? 'en';
	return Effect.succeed(`Language: ${lang}`);
});
```

These cookies don't appear in the OpenAPI spec and aren't validated. For typed/spec-visible cookies, use a `HttpApiSecurity.apiKey({ in: "cookie", ... })` middleware.

## Clients

### `HttpApiClient.make` — Service-Based Client

```ts
const program = Effect.gen(function* () {
	const client = yield* HttpApiClient.make(Api, {
		baseUrl: 'http://localhost:3000'
	});

	// Methods are grouped: client.GroupName.endpointName(...)
	const users = yield* client.users.list();
	const user = yield* client.users.getById({ params: { id: 1 } });

	// Top-level groups: client.endpointName(...)
	yield* client.health();
});

program.pipe(Effect.provide(FetchHttpClient.layer), Effect.runFork);
```

`make` reads `HttpClient.HttpClient` from context. Provide a platform layer such as `FetchHttpClient.layer`, `BunHttpClient.layer`, Node's `NodeHttpClient.{layerFetch, layerUndici, layerNodeHttp}`, or Browser's `BrowserHttpClient.{layerFetch, layerXMLHttpRequest}`.

`make` accepts a `transformClient` option to wrap the underlying `HttpClient` (e.g., to set a base URL, attach default headers, enable retries). It also accepts `transformResponse` and `baseUrl`.

### `HttpApiClient.makeWith` — Bring Your Own `HttpClient`

```ts
const httpClient = (yield* HttpClient.HttpClient).pipe(
	HttpClient.tapRequest(/* tracing, logging, ... */)
);
const client = yield* HttpApiClient.makeWith(Api, {
	httpClient,
	baseUrl: 'http://localhost:3000'
});
```

### `HttpApiClient.group` and `HttpApiClient.endpoint` — Narrow Clients

```ts
// One group's endpoints, flat (no `client.users.` prefix):
const usersClient = yield* HttpApiClient.group(Api, {
	group: 'users',
	httpClient: yield* HttpClient.HttpClient
});
yield* usersClient.list();

// A single endpoint as a callable function:
const getUser = yield* HttpApiClient.endpoint(Api, {
	group: 'users',
	endpoint: 'getById',
	httpClient: yield* HttpClient.HttpClient
});
yield* getUser({ params: { id: 1 } });
```

### Wrapping the Client in a Service (Recommended Pattern)

```ts
class ApiClient extends Context.Service<
	ApiClient,
	HttpApiClient.ForApi<typeof Api>
>()('app/ApiClient') {
	static readonly layer = Layer.effect(
		ApiClient,
		HttpApiClient.make(Api, {
			transformClient: (client) =>
				client.pipe(
					HttpClient.mapRequest(
						flow(
							HttpClientRequest.prependUrl(
								'http://localhost:3000'
							)
						)
					),
					HttpClient.retryTransient({
						schedule: Schedule.exponential(Duration.millis(100)),
						times: 3
					})
				)
		})
	).pipe(
		Layer.provide(AuthorizationClient), // required client middleware (see below)
		Layer.provide(FetchHttpClient.layer)
	);
}
```

### Response Modes

Each generated client method accepts an optional `responseMode`:

| Mode                       | Return type                                  | Errors include `SchemaError` + endpoint errors? |
| -------------------------- | -------------------------------------------- | ------------------------------------------------ |
| `"decoded-only"` (default) | `Success`                                    | yes                                              |
| `"decoded-and-response"`   | `[Success, HttpClientResponse]` tuple        | yes                                              |
| `"response-only"`          | `HttpClientResponse` (no decoding performed) | no — only `HttpClientError` and middleware errors |

```ts
const client = yield* HttpApiClient.make(Api, { baseUrl });

// Default: just the decoded value
const user = yield* client.users.getById({ params: { id: 1 } });

// Decoded value + raw response (e.g., to inspect headers)
const [user2, response] = yield* client.users.getById({
	params: { id: 1 },
	responseMode: 'decoded-and-response'
});

// Raw response only — no decoding, no typed endpoint errors
const raw = yield* client.users.getById({
	params: { id: 1 },
	responseMode: 'response-only'
});
```

> The old `withResponse: true` option was renamed to `responseMode: "decoded-and-response"`. Update any pre-rename code accordingly.

### Client Middleware

When a server-side `HttpApiMiddleware` is declared `requiredForClient: true`, the type system **forces** every client constructor (`make`, `makeWith`, `group`, `endpoint`) to be provided with a matching client implementation. Build it with `HttpApiMiddleware.layerClient`:

```ts
const AuthorizationClient = HttpApiMiddleware.layerClient(
	Authorization,
	Effect.fn(function* ({ next, request, endpoint, group }) {
		// next   — pass the request down the chain (and receive the response)
		// request — the outgoing HttpClientRequest
		// endpoint, group — useful for adding instrumentation tagged by endpoint
		return yield* next(HttpClientRequest.bearerToken(request, 'my-token'));
	})
);

// Optional middlewares (no `requiredForClient: true`) can also be wired this way,
// but skipping them simply means the chain skips that layer.
```

The `layerClient` second argument can also be an `Effect` returning the middleware function, for cases where the middleware needs services (e.g., a token from `Config`):

```ts
const AuthorizationClient = HttpApiMiddleware.layerClient(
	Authorization,
	Effect.gen(function* () {
		const token = yield* Config.redacted('API_TOKEN');
		return ({ next, request }) =>
			next(
				HttpClientRequest.bearerToken(request, Redacted.value(token))
			);
	})
);
```

If a client middleware is declared with a `clientError` type, that error becomes part of the generated method's error channel.

Client middleware ordering follows the same LIFO rule as server middleware.

### Client URL Builder

`HttpApiClient.urlBuilder(api, options?)` is a synchronous utility that builds typed URLs from your API definition. Methods mirror the client shape, but **inputs are encoded via the endpoint's params/query schemas** — so the input types are the *decoded* domain types, not the raw strings.

```ts
const Api = HttpApi.make('Api').add(
	HttpApiGroup.make('users').add(
		HttpApiEndpoint.get('getUser', '/users/:id', {
			params: { id: Schema.Finite }, // domain type: number
			query: { page: Schema.Finite } // domain type: number
		})
	)
);

const buildUrl = HttpApiClient.urlBuilder(Api, {
	baseUrl: 'https://api.example.com'
});

buildUrl.users.getUser({ params: { id: 123 }, query: { page: 1 } });
//=> "https://api.example.com/users/123?page=1"

// NOT this — params input is the decoded type (number), not the encoded string
// buildUrl.users.getUser({ params: { id: "123" } })   // type error
```

Top-level group endpoints are at the root: `buildUrl.health()`. With `disableCodecs: true` on the endpoint, the builder accepts the raw encoded shape directly.

## OpenAPI Documentation

### Scalar UI

```ts
HttpApiScalar.layer(Api, {
	path: '/docs', // default: "/docs"
	scalar: {
		theme: 'kepler',
		layout: 'modern',
		hideModels: false,
		hideTestRequestButton: false,
		hideSearch: false,
		darkMode: true,
		showOperationId: true,
		customCss: '/* ... */',
		favicon: '/favicon.svg',
		baseServerURL: 'https://api.example.com'
	}
});

// CDN-loaded variant (smaller bundle, requires network for the docs page)
HttpApiScalar.layerCdn(Api, {
	path: '/docs',
	version: 'latest', // CDN version of @scalar/api-reference
	scalar: {
		/* ... */
	}
});
```

The `scalar` option is fully typed; see `HttpApiScalar.ScalarConfig` for the full ~20 fields.

### Swagger UI

```ts
HttpApiSwagger.layer(Api, { path: '/docs' });
```

### Programmatic OpenAPI

```ts
const spec = OpenApi.fromApi(Api);
// spec is OpenAPI 3.1.0; cached per HttpApi instance via WeakMap
```

### Annotations

Available `OpenApi.*` annotation tags (use `.annotate(tag, value)` or `.annotateMerge(OpenApi.annotations({ ... }))`):

| Annotation     | Scope         | Purpose                                                            |
| -------------- | ------------- | ------------------------------------------------------------------ |
| `Title`        | API, Group    | API title; on a group, renames the OpenAPI tag                     |
| `Version`      | API           | API version (default `"0.0.1"`)                                    |
| `Description`  | API, Group, Endpoint, Security | Free-form description                              |
| `Summary`      | API, Endpoint | Short summary                                                      |
| `License`      | API           | `{ name, url? }`                                                   |
| `Servers`      | API           | `Array<{ url, description?, variables? }>`                         |
| `ExternalDocs` | Group, Endpoint | `{ url, description? }`                                          |
| `Format`       | Security      | For HTTP auth schemes (`bearer` and custom `http`): sets `bearerFormat` in spec (e.g., `"JWT"`) |
| `Identifier`   | Endpoint      | Override `operationId` (default: `${group}.${endpoint}`)           |
| `Deprecated`   | Endpoint      | `true` to mark deprecated                                          |
| `Override`     | API, Group, Endpoint | Shallow-merge fields into the generated object              |
| `Transform`    | API, Group, Endpoint | `(spec) => spec` final post-processing function             |
| `Exclude`      | Group, Endpoint | `true` to omit from the OpenAPI spec entirely                    |

`OpenApi.annotations({ title, version, description, license, summary, deprecated, externalDocs, servers, format, override, exclude, transform, identifier })` is the convenient shorthand for building a Context payload.

### Adding Component Schemas Without an Endpoint

Use `HttpApi.AdditionalSchemas` to inject extra schemas into `components.schemas`. Only schemas with an `identifier` annotation are included.

```ts
const Api = HttpApi.make('api')
	.add(/* ... */)
	.annotate(HttpApi.AdditionalSchemas, [
		Schema.Struct({ contentType: Schema.String, length: Schema.Int }).annotate(
			{ identifier: 'FileMeta' }
		)
	]);
```

### Schema-Level Documentation

```ts
const User = Schema.Struct({
	id: Schema.Int,
	name: Schema.String
}).annotate({
	description: 'A user entity',
	identifier: 'User' // shown in docs Models section; required for AdditionalSchemas
});

// Override the default "Success"/"Error" response description
HttpApiEndpoint.get('list', '/users', {
	success: Schema.Array(User).annotate({
		description: 'Returns an array of users'
	})
});
```

## Reading the Raw Request

Inside a handler, `ctx.request` is the raw `HttpServerRequest`:

```ts
handlers.handle('hello', (ctx) =>
	Effect.sync(() => {
		ctx.request.method; // "GET"
		ctx.request.url; // "/hello?x=1"
		ctx.request.headers; // Record<string, string> (lowercase keys)
		ctx.request.cookies; // Record<string, string>
		return 'ok';
	})
);
```

Async helpers: `ctx.request.text`, `ctx.request.json`, `ctx.request.arrayBuffer`, `ctx.request.formData`, `ctx.request.urlParamsBody`, `ctx.request.multipart`, `ctx.request.multipartStream`.

## Customizing Responses

### Custom Response Headers

```ts
handlers.handle('hello', () =>
	Effect.gen(function* () {
		yield* HttpEffect.appendPreResponseHandler((_req, response) =>
			Effect.succeed(
				HttpServerResponse.setHeader(response, 'x-custom', 'hello')
			)
		);
		return 'Hello, World!';
	})
);

// Wrapping form (alternative):
HttpEffect.withPreResponseHandler(
	myHandlerEffect,
	(req, response) => Effect.succeed(/* updated response */)
);
```

### Response Cookies

```ts
handlers.handle('hello', () =>
	Effect.gen(function* () {
		yield* HttpEffect.appendPreResponseHandler((_req, response) =>
			Effect.succeed(
				HttpServerResponse.setCookieUnsafe(
					response,
					'my-cookie',
					'value',
					{ httpOnly: true, secure: true, path: '/' }
				)
			)
		);
		return 'Hello!';
	})
);
```

For cookies tied to an `HttpApiSecurity.apiKey({ in: "cookie", ... })`, use the shortcut `HttpApiBuilder.securitySetCookie(security, value, options?)`.

### Redirects

```ts
handlers.handle('oldPage', () =>
	Effect.succeed(HttpServerResponse.redirect('/new', { status: 302 }))
);
```

### Streaming Responses

```ts
const dataStream = Stream.make('a', 'b', 'c').pipe(
	Stream.schedule(Schedule.spaced(Duration.millis(500))),
	Stream.map((s) => new TextEncoder().encode(s))
);

handlers.handle('getStream', () =>
	Effect.succeed(HttpServerResponse.stream(dataStream))
);
```

### Streaming Requests

Define the payload as `Schema.Uint8Array` with `HttpApiSchema.asUint8Array()` and the handler receives the raw bytes:

```ts
HttpApiEndpoint.post('acceptStream', '/stream', {
	payload: Schema.Uint8Array.pipe(HttpApiSchema.asUint8Array()),
	success: Schema.String
});

handlers.handle('acceptStream', (ctx) =>
	Effect.succeed(new TextDecoder().decode(ctx.payload))
);
```

For multipart streaming, see `HttpApiSchema.asMultipartStream` above.

## Testing

### `HttpApiTest.groups` — In-Memory Typed Client

`HttpApiTest.groups(api, groupNames, { baseUrl? })` builds a fully typed `HttpApiClient` that runs against your real handler layers in memory — no HTTP server, no port. List the groups whose handlers you want to exercise; all other groups are auto-stubbed with `Effect.die`. The default `baseUrl` is `http://localhost:3000`; pass `{ baseUrl }` when tests rely on URL construction.

```ts
import { HttpApiTest } from 'effect/unstable/httpapi';
import { NodeHttpServer } from '@effect/platform-node';
import { Effect, Layer } from 'effect';
import { it } from '@effect/vitest';

it.effect('users.findById returns a user', () =>
	Effect.gen(function* () {
		const client = yield* HttpApiTest.groups(Api, ['users']);
		const user = yield* client.users.getById({ params: { id: 1 } });
		expect(user.name).toBe('Admin');
	}).pipe(
		Effect.provide([
			NodeHttpServer.layerHttpServices, // FileSystem/HttpPlatform/Etag/Path
			AuthorizationLayer, // any middleware your handlers need
			HttpApiBuilder.group(Api, 'users', UsersHandlers)
		])
	)
);
```

`HttpApiTest.groups` requires a platform layer for HTTP services (`NodeHttpServer.layerHttpServices`, `BunHttpServer.layerHttpServices`, etc.).

### `NodeHttpServer.layerTest` — Real In-Memory Server

For end-to-end tests that go through the full HTTP serialization path, use `NodeHttpServer.layerTest`:

```ts
const TestLive = HttpRouter.serve(
	HttpApiBuilder.layer(Api).pipe(Layer.provide(GroupLive)),
	{ disableListenLog: true, disableLogger: true }
).pipe(Layer.provideMerge(NodeHttpServer.layerTest));

it.effect('GET /users responds 200', () =>
	Effect.gen(function* () {
		const response = yield* HttpClient.get('/users');
		expect(response.status).toBe(200);

		const client = yield* HttpApiClient.make(Api);
		yield* client.users.list();
	}).pipe(Effect.provide(TestLive))
);
```

`disableListenLog` and `disableLogger` keep the test output clean.

## Reactive Integration

For React/Atom-driven UIs, `effect/unstable/reactivity/AtomHttpApi` builds a service that exposes typed `query` and `mutation` atoms generated from an HttpApi:

```ts
class ApiAtom extends AtomHttpApi.Service<ApiAtom>()('app/ApiAtom', {
	api: Api,
	httpClient: FetchHttpClient.layer,
	baseUrl: 'http://localhost:3000'
}) {}

// In a component:
const userAtom = ApiAtom.query('users', 'getById', {
	params: { id: 1 },
	reactivityKeys: ['users', 1],
	timeToLive: Duration.minutes(5)
});

const createUser = ApiAtom.mutation('users', 'create');
```

For details, see the `effect-atom-state` skill.

## HttpClient (Direct HTTP Calls)

For calling external APIs without an HttpApi definition, use `HttpClient` directly:

```ts
import { Effect, Schema } from 'effect';
import {
	FetchHttpClient,
	HttpClient,
	HttpClientRequest,
	HttpClientResponse
} from 'effect/unstable/http';

class Todo extends Schema.Class<Todo>('Todo')({
	userId: Schema.Number,
	id: Schema.Number,
	title: Schema.String,
	completed: Schema.Boolean
}) {}

const program = Effect.gen(function* () {
	const client = (yield* HttpClient.HttpClient).pipe(
		HttpClient.mapRequest(
			flow(
				HttpClientRequest.prependUrl('https://api.example.com'),
				HttpClientRequest.acceptJson
			)
		),
		HttpClient.filterStatusOk,
		HttpClient.retryTransient({
			schedule: Schedule.exponential(Duration.millis(100)),
			times: 3
		})
	);

	// GET with schema validation
	const todos = yield* client
		.get('/todos')
		.pipe(
			Effect.flatMap(
				HttpClientResponse.schemaBodyJson(Schema.Array(Todo))
			)
		);

	// POST with body
	const created = yield* HttpClientRequest.post('/todos').pipe(
		HttpClientRequest.bodyJsonUnsafe({ title: 'New todo' }),
		client.execute,
		Effect.flatMap(HttpClientResponse.schemaBodyJson(Todo))
	);
});

program.pipe(Effect.provide(FetchHttpClient.layer), Effect.runPromise);
```

## Complete Example: Full API with Auth

```ts
// --- domain/User.ts ---
import { Schema } from 'effect';

export const UserId = Schema.Int.pipe(Schema.brand('UserId'));
export type UserId = typeof UserId.Type;

export class User extends Schema.Class<User>('User')({
	id: UserId,
	name: Schema.String,
	email: Schema.String
}) {}

// --- domain/UserErrors.ts ---
export class UserNotFound extends Schema.TaggedErrorClass<UserNotFound>()(
	'UserNotFound',
	{},
	{ httpApiStatus: 404 }
) {}

export class Unauthorized extends Schema.TaggedErrorClass<Unauthorized>()(
	'Unauthorized',
	{ message: Schema.String },
	{ httpApiStatus: 401 }
) {}

// --- api/Authorization.ts ---
import { Context, Schema } from 'effect';
import { HttpApiMiddleware, HttpApiSecurity } from 'effect/unstable/httpapi';

export class CurrentUser extends Context.Service<CurrentUser, User>()(
	'app/CurrentUser'
) {}

export class Authorization extends HttpApiMiddleware.Service<
	Authorization,
	{ provides: CurrentUser }
>()('app/Authorization', {
	requiredForClient: true,
	security: { bearer: HttpApiSecurity.bearer },
	error: Unauthorized
}) {}

// --- api/Users.ts ---
import { Schema } from 'effect';
import { HttpApiEndpoint, HttpApiGroup } from 'effect/unstable/httpapi';

export class UsersApi extends HttpApiGroup.make('users')
	.add(
		HttpApiEndpoint.get('list', '/', { success: Schema.Array(User) }),
		HttpApiEndpoint.get('getById', '/:id', {
			params: {
				id: Schema.FiniteFromString.pipe(Schema.decodeTo(UserId))
			},
			success: User,
			error: UserNotFound
		}),
		HttpApiEndpoint.post('create', '/', {
			payload: Schema.Struct({
				name: Schema.String,
				email: Schema.String
			}),
			success: User
		})
	)
	.middleware(Authorization)
	.prefix('/users') {}

// --- api/System.ts ---
export class SystemApi extends HttpApiGroup.make('system', {
	topLevel: true
}).add(
	HttpApiEndpoint.get('health', '/health', {
		success: HttpApiSchema.NoContent
	})
) {}

// --- api/Api.ts ---
import { HttpApi, OpenApi } from 'effect/unstable/httpapi';

export class Api extends HttpApi.make('app')
	.add(UsersApi)
	.add(SystemApi)
	.annotateMerge(
		OpenApi.annotations({ title: 'App API', version: '1.0.0' })
	) {}

// --- server/auth.ts ---
import { Effect, Layer, Redacted } from 'effect';

export const AuthorizationLayer = Layer.effect(
	Authorization,
	Effect.gen(function* () {
		yield* Effect.logInfo('starting Authorization middleware');
		return Authorization.of({
			bearer: Effect.fn(function* (httpEffect, { credential }) {
				const token = Redacted.value(credential);
				if (token !== 'valid') {
					return yield* new Unauthorized({
						message: 'bad token'
					});
				}
				return yield* Effect.provideService(
					httpEffect,
					CurrentUser,
					new User({
						id: UserId.make(1),
						name: 'Dev',
						email: 'dev@app'
					})
				);
			})
		});
	})
);

// --- server/users.ts ---
import { Effect, Layer } from 'effect';
import { HttpApiBuilder } from 'effect/unstable/httpapi';

export const UsersHandlers = HttpApiBuilder.group(
	Api,
	'users',
	Effect.fn(function* (handlers) {
		const repo = yield* UsersRepository;
		return handlers
			.handle('list', () => repo.findAll().pipe(Effect.orDie))
			.handle('getById', ({ params }) =>
				repo.findById(params.id).pipe(
					Effect.catchTag('UserNotFound', (e) => Effect.fail(e))
				)
			)
			.handle('create', ({ payload }) =>
				repo.create(payload).pipe(Effect.orDie)
			);
	})
).pipe(Layer.provide([UsersRepository.layer, AuthorizationLayer]));

export const SystemHandlers = HttpApiBuilder.group(
	Api,
	'system',
	(handlers) => handlers.handle('health', () => Effect.void)
);

// --- server/main.ts ---
import { NodeHttpServer, NodeRuntime } from '@effect/platform-node';
import { Layer } from 'effect';
import { HttpRouter } from 'effect/unstable/http';
import { HttpApiBuilder, HttpApiScalar } from 'effect/unstable/httpapi';
import { createServer } from 'node:http';

const ApiRoutes = HttpApiBuilder.layer(Api, {
	openapiPath: '/openapi.json'
}).pipe(Layer.provide([UsersHandlers, SystemHandlers]));

const ServerLayer = HttpRouter.serve(
	Layer.mergeAll(ApiRoutes, HttpApiScalar.layer(Api, { path: '/docs' }))
).pipe(Layer.provide(NodeHttpServer.layer(createServer, { port: 3000 })));

Layer.launch(ServerLayer).pipe(NodeRuntime.runMain);
```

## Common Anti-Patterns

1. **Mixing API definitions with server implementations.** Keep API definitions in their own module/package so clients can import them without pulling in handler dependencies.

2. **Chaining schemas onto an endpoint instead of using the options object.** v4 uses an options object on endpoint constructors (`{ params, query, payload, success, error }`); there is no `.params(...)`/`.payload(...)` builder.

3. **Forgetting `Layer.provide` for handler groups or middleware.** Each `HttpApiBuilder.group(api, "name", ...)` produces a layer that must be provided to `HttpApiBuilder.layer(api)`. Each `HttpApiMiddleware.Service` needs a corresponding `Layer.effect(...)` or `Layer.succeed(...)` implementation. Missing pieces fail at runtime with actionable errors (`HttpApiGroup "..." not found` / `Service not found: ...`).

4. **Using uppercase header keys.** All HTTP headers are normalized to lowercase. Always use lowercase keys in the `headers` option and when reading from `ctx.request.headers`.

5. **Inventing `HttpApiBuilder.toWebHandler`.** There is no such thing. Convert via `HttpRouter.toWebHandler(layer)` (returns `{ handler, dispose }`) or serve via `HttpRouter.serve(layer)`.

6. **Treating schema validation failures as recoverable errors by default.** They are defects (handled as empty 400) unless you install `HttpApiMiddleware.layerSchemaErrorTransform` for the endpoint/group/API.

7. **Adding middleware before the endpoints it should cover.** `.middleware(M)` only applies to endpoints/groups already added at the call site. Order is `.add(...).middleware(M)`, not `.middleware(M).add(...)`.

8. **Passing already-encoded values to `urlBuilder` / client methods.** Inputs are the *decoded* types. With `params: { id: Schema.FiniteFromString }`, pass `{ id: 123 }` (number), not `{ id: "123" }`. With `disableCodecs: true` you pass the raw encoded shape directly.

9. **Forgetting client middleware for a `requiredForClient: true` middleware.** The type system will refuse to construct the client. Wire up `HttpApiMiddleware.layerClient(M, ...)` and provide it to the client layer.

10. **Mixing up the schema types.** For request payloads/headers/query/params, use `Schema.optionalKey` (omit the key entirely) vs `Schema.optional` (key may be present with value `undefined`) deliberately — they encode different on-wire shapes. For domain model fields where absence is semantically `Option.None`, use `Schema.OptionFromNullishOr` / `Schema.OptionFromOptional` from EF-17.

## Quick Reference

### Endpoint constructors

`HttpApiEndpoint.{get, post, put, patch, delete, head, options}(name, path, options?)` · `HttpApiEndpoint.make(method)(name, path, options?)`

Endpoint methods: `.prefix(p)` · `.middleware(M)` · `.annotate(key, value)` · `.annotateMerge(ctx)`

### Group constructors

`HttpApiGroup.make(id, { topLevel? })` · `.add(...endpoints)` · `.prefix(p)` · `.middleware(M)` · `.annotate(key, value)` · `.annotateMerge(ctx)` · `.annotateEndpoints(key, value)` · `.annotateEndpointsMerge(ctx)`

### Api constructors

`HttpApi.make(id)` · `.add(...groups)` · `.addHttpApi(otherApi)` · `.prefix(p)` · `.middleware(M)` · `.annotate(key, value)` · `.annotateMerge(ctx)` · `HttpApi.AdditionalSchemas` (annotation tag)

### Schema annotations

- Status: `HttpApiSchema.status(code | StatusLiteral)` · `httpApiStatus` annotation on a class
- Empty: `HttpApiSchema.NoContent` · `Created` · `Accepted` · `Empty(code)` · `asNoContent({ decode })`
- Encoding: `asJson` · `asText` · `asFormUrlEncoded` · `asUint8Array` · `asMultipart` · `asMultipartStream`

### Errors

`HttpApiError.{BadRequest, Unauthorized, Forbidden, NotFound, MethodNotAllowed, NotAcceptable, RequestTimeout, Conflict, Gone, InternalServerError, NotImplemented, ServiceUnavailable}` plus `*NoContent` variants · `HttpApiError.HttpApiSchemaError` · `HttpApiMiddleware.layerSchemaErrorTransform`

### Builder

`HttpApiBuilder.layer(api, { openapiPath? })` · `HttpApiBuilder.group(api, name, build)` · `HttpApiBuilder.endpoint(api, group, endpoint, handler)` · `HttpApiBuilder.securityDecode(security)` · `HttpApiBuilder.securitySetCookie(security, value, options?)`

Handler API: `handlers.handle(name, handler, { uninterruptible? })` · `handlers.handleRaw(name, handler, { uninterruptible? })`

### Client

`HttpApiClient.make(api, options?)` · `HttpApiClient.makeWith(api, { httpClient })` · `HttpApiClient.group(api, { group, httpClient })` · `HttpApiClient.endpoint(api, { group, endpoint, httpClient })` · `HttpApiClient.urlBuilder(api, { baseUrl? })` · `HttpApiClient.ForApi<typeof Api>` (type)

Response modes: `"decoded-only"` · `"decoded-and-response"` · `"response-only"`

Client middleware: `HttpApiMiddleware.layerClient(M, fn | effect)`

### Security

`HttpApiSecurity.http({ scheme })` · `HttpApiSecurity.{bearer, basic}` · `HttpApiSecurity.apiKey({ in, key })` · `HttpApiSecurity.annotate(key, value)`

### Docs

`HttpApiScalar.layer(api, { path?, scalar? })` · `HttpApiScalar.layerCdn(api, { path?, scalar?, version? })` · `HttpApiSwagger.layer(api, { path? })` · `OpenApi.fromApi(api)` · `OpenApi.annotations({ ... })`

### Testing

`HttpApiTest.groups(api, groupNames, { baseUrl? })` · `NodeHttpServer.layerTest` · `NodeHttpServer.layerHttpServices`

### Server

`HttpRouter.serve(layer, { disableLogger?, disableListenLog?, routerConfig?, middleware? })` · `HttpRouter.toWebHandler(layer, { disableLogger?, routerConfig?, middleware? })` returning `{ handler, dispose }` · `NodeHttpServer.layer(createServer, { port })` · `BunHttpServer.layer({ port })`
