---
name: effect-http-api
description: Build typed HTTP APIs with Effect's HttpApi module — define endpoints with schemas, implement handlers, add security middleware, generate OpenAPI docs, and derive type-safe clients. Use this skill when building HTTP servers, REST APIs, or typed HTTP clients with Effect v4.
---

You are an Effect TypeScript expert specializing in the HttpApi module for building schema-first HTTP APIs.

## Effect Source Reference

Use `effect_ref_read` to read Effect v4 source files and `effect_ref_list` to browse directories.
These tools automatically fetch source matching your installed Effect version.

Key reference files:

- `packages/effect/HTTPAPI.md` — Full HttpApi documentation
- `ai-docs/src/51_http-server/` — Server examples with fixtures
- `ai-docs/src/50_http-client/` — HttpClient examples

## Core Imports

```ts
// HttpApi modules (definition + building + client)
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
	OpenApi
} from 'effect/unstable/httpapi';

// HTTP primitives (router, server, client)
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

// Platform server (Node.js)
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

**Critical design rule**: API definitions should ALWAYS be separate from server implementations so they can be shared between server and client without leaking server code.

## Defining Endpoints

### HTTP Methods

```ts
HttpApiEndpoint.get("name", "/path", { ... })
HttpApiEndpoint.post("name", "/path", { ... })
HttpApiEndpoint.put("name", "/path", { ... })
HttpApiEndpoint.patch("name", "/path", { ... })
HttpApiEndpoint.delete("name", "/path", { ... })
```

The first argument is the endpoint name (used as the method name in generated clients). The second is the route path. The third is an options object with schemas.

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

	// Request headers (always use lowercase keys)
	headers: {
		'x-api-key': Schema.String,
		'x-request-id': Schema.String
	},

	// Request body — default encoding is JSON
	// Can be a single schema or array of schemas for content negotiation
	payload: Schema.Struct({
		name: Schema.String
	}),

	// Success response — default is 200 OK with JSON encoding
	// Can be a single schema or array for multiple response types
	success: User,

	// Error responses — each annotated with HTTP status code
	error: [UserNotFound, Unauthorized]
});
```

### Automatic Codec Wrapping & `disableCodecs`

By default, endpoint schemas are automatically wrapped with codec transformations:

- **Params, query, headers** get `StringTree` codecs (string ↔ typed value)
- **Payload, success, error** get `Json` codecs (JSON ↔ typed value)

This means you can pass plain `Schema.Struct.Fields` objects and they "just work" — the framework handles serialization. To opt out and provide schemas that already handle their own encoding:

```ts
HttpApiEndpoint.get('raw', '/raw/:id', {
	disableCodecs: true,
	// With disableCodecs, schemas must already satisfy their transport constraints
	// (e.g., params must encode to string values, payload must encode to JSON, etc.)
	params: Schema.Struct({ id: Schema.String }),
	success: Schema.Struct({ data: Schema.String })
});
```

Use `disableCodecs: true` when you need full control over encoding/decoding or when your schemas already include codec transformations.

### Multiple Response Types

Success and payload can accept arrays for content negotiation:

```ts
HttpApiEndpoint.get('search', '/search', {
	payload: { search: Schema.String },
	success: [
		Schema.Array(User), // JSON (default)
		Schema.String.pipe(
			HttpApiSchema.asText({
				// CSV
				contentType: 'text/csv'
			})
		)
	],
	error: [SearchQueryTooShort, HttpApiError.RequestTimeoutNoContent]
});
```

### No-Content Response

Without a `success` schema, the default response is `204 No Content`:

```ts
HttpApiEndpoint.get('health', '/health', {
	success: HttpApiSchema.NoContent
});

// Or simply omit success:
HttpApiEndpoint.delete('deleteUser', '/user/:id', {
	params: { id: Schema.FiniteFromString.check(Schema.isInt()) }
});
```

### Catch-All Endpoint

Set path to `"*"` for a fallback. Must be the last endpoint in the group. Not included in OpenAPI spec.

```ts
HttpApiEndpoint.get('catchAll', '*', {
	success: Schema.String
});
```

## Groups

Groups organize related endpoints and can apply shared middleware, prefixes, and annotations.

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

Top-level groups expose endpoints at the root of the generated client instead of nesting under the group name:

```ts
export class SystemApi extends HttpApiGroup.make('system', {
	topLevel: true
}).add(
	HttpApiEndpoint.get('health', '/health', {
		success: HttpApiSchema.NoContent
	})
) {}

// Client usage: client.health() instead of client.system.health()
```

## API Definition

Combine groups into a complete API:

```ts
export class Api extends HttpApi.make('my-api')
	.add(UsersApiGroup)
	.add(SystemApi)
	.annotateMerge(
		OpenApi.annotations({
			title: 'My API',
			description: 'My API description'
		})
	) {}
```

### Prefixing

Prefixes can be applied at endpoint, group, or API level:

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
	.prefix('/apiPrefix');
```

## Building Implementations

### Handler Groups

Use `HttpApiBuilder.group` to implement all endpoints in a group:

```ts
const UsersApiHandlers = HttpApiBuilder.group(
	Api,
	'users', // group name
	Effect.fn(function* (handlers) {
		// Access services
		const users = yield* Users;

		return handlers
			.handle('list', ({ query }) =>
				users.list(query.search).pipe(Effect.orDie)
			)
			.handle('getById', ({ params }) =>
				users.getById(params.id).pipe(
					Effect.catchReasons(
						'UsersError',
						{
							UserNotFound: (e) => Effect.fail(e)
						},
						Effect.die
					)
				)
			)
			.handle('create', ({ payload }) =>
				users.create(payload).pipe(Effect.orDie)
			)
			.handle('me', () => CurrentUser.asEffect());
	})
).pipe(Layer.provide([Users.layer, AuthorizationLayer]));
```

### Handler Context

Each handler receives a context object with typed fields:

```ts
handlers.handle('updateUser', (ctx) => {
	ctx.params; // Typed path parameters
	ctx.query; // Typed query parameters
	ctx.headers; // Typed request headers
	ctx.payload; // Typed request body
	ctx.request; // Raw HttpServerRequest (method, url, cookies, etc.)
	return Effect.succeed(/* ... */);
});
```

### Building the Server Layer

```ts
const ApiRoutes = HttpApiBuilder.layer(Api, {
	openapiPath: '/openapi.json' // optional: expose raw OpenAPI JSON
}).pipe(Layer.provide([UsersApiHandlers, SystemApiHandlers]));

const DocsRoute = HttpApiScalar.layer(Api, { path: '/docs' });

const AllRoutes = Layer.mergeAll(ApiRoutes, DocsRoute);

// Option 1: Node.js HTTP server
export const HttpServerLayer = HttpRouter.serve(AllRoutes).pipe(
	Layer.provide(NodeHttpServer.layer(createServer, { port: 3000 }))
);

Layer.launch(HttpServerLayer).pipe(NodeRuntime.runMain);

// Option 2: Web handler for serverless
export const { handler, dispose } = HttpRouter.toWebHandler(
	AllRoutes.pipe(Layer.provide(HttpServer.layerServices))
);
```

## Schema Annotations

### Content Type / Encoding

```ts
HttpApiSchema.asJson(); // application/json (default)
HttpApiSchema.asText(); // text/plain
HttpApiSchema.asText({ contentType: 'text/csv' });
HttpApiSchema.asFormUrlEncoded(); // application/x-www-form-urlencoded
HttpApiSchema.asUint8Array(); // application/octet-stream (binary)
HttpApiSchema.asMultipart(schema); // multipart/form-data (file uploads)
HttpApiSchema.asMultipartStream(schema); // streaming multipart
HttpApiSchema.asNoContent({ decode }); // no body, status-only
```

### Status Codes

```ts
// On success schemas
Schema.Array(User).pipe(HttpApiSchema.status(206));

// On error schemas
Schema.Struct({ message: Schema.String }).pipe(HttpApiSchema.status(404));

// Or via annotation on error classes
class UserNotFound extends Schema.TaggedErrorClass<UserNotFound>()(
	'UserNotFound',
	{},
	{ httpApiStatus: 404 }
) {}
```

### Multipart File Uploads

```ts
HttpApiEndpoint.post('upload', '/upload', {
	payload: HttpApiSchema.asMultipart(
		Schema.Struct({
			files: Multipart.FilesSchema // files persisted to disk automatically
		})
	),
	success: Schema.String
});
```

## Error Handling

### Custom Errors

Define errors with `Schema.TaggedErrorClass` and annotate with status codes:

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
```

Or use `HttpApiSchema.status` on struct schemas:

```ts
const UserNotFound = Schema.Struct({
	_tag: Schema.tag('UserNotFound'),
	message: Schema.String
}).pipe(HttpApiSchema.status(404));
```

### Predefined Error Types

`HttpApiError` provides ready-made errors for common HTTP status codes:

```ts
import { HttpApiError } from 'effect/unstable/httpapi';

// With JSON body:
HttpApiError.BadRequest; // 400
HttpApiError.Unauthorized; // 401
HttpApiError.Forbidden; // 403
HttpApiError.NotFound; // 404
HttpApiError.MethodNotAllowed; // 405
HttpApiError.NotAcceptable; // 406
HttpApiError.RequestTimeout; // 408
HttpApiError.Conflict; // 409
HttpApiError.Gone; // 410
HttpApiError.InternalServerError; // 500
HttpApiError.NotImplemented; // 501
HttpApiError.ServiceUnavailable; // 503

// No-content variants (status code only, no body):
HttpApiError.BadRequestNoContent;
HttpApiError.UnauthorizedNoContent;
HttpApiError.ForbiddenNoContent;
HttpApiError.NotFoundNoContent;
HttpApiError.MethodNotAllowedNoContent;
HttpApiError.NotAcceptableNoContent;
HttpApiError.RequestTimeoutNoContent;
HttpApiError.ConflictNoContent;
HttpApiError.GoneNoContent;
HttpApiError.InternalServerErrorNoContent;
HttpApiError.NotImplementedNoContent;
HttpApiError.ServiceUnavailableNoContent;

// Usage in handlers:
Effect.fail(new HttpApiError.NotFound({}));
Effect.fail(new HttpApiError.BadRequest());
```

## Security

### Security Schemes

```ts
import { HttpApiSecurity } from 'effect/unstable/httpapi';

HttpApiSecurity.bearer; // Bearer token (Authorization header)
HttpApiSecurity.basic; // HTTP Basic auth
HttpApiSecurity.apiKey({
	// API key via header, query, or cookie
	in: 'header', // "header" | "query" | "cookie"
	key: 'x-api-key'
});
```

### Defining Security Middleware

```ts
import { Schema, ServiceMap } from 'effect';
import { HttpApiMiddleware, HttpApiSecurity } from 'effect/unstable/httpapi';

// Service provided by the middleware
class CurrentUser extends ServiceMap.Service<CurrentUser, User>()(
	'CurrentUser'
) {}

// Error type
class Unauthorized extends Schema.TaggedErrorClass<Unauthorized>()(
	'Unauthorized',
	{ message: Schema.String },
	{ httpApiStatus: 401 }
) {}

// Middleware definition
class Authorization extends HttpApiMiddleware.Service<
	Authorization,
	{
		provides: CurrentUser;
		requires: never;
	}
>()('Authorization', {
	requiredForClient: true, // clients must also provide an implementation
	security: {
		bearer: HttpApiSecurity.bearer
	},
	error: Unauthorized
}) {}
```

### Implementing Security Middleware (Server)

```ts
const AuthorizationLayer = Layer.effect(
	Authorization,
	Effect.gen(function* () {
		yield* Effect.logInfo('Starting Authorization middleware');

		return Authorization.of({
			bearer: Effect.fn(function* (httpEffect, { credential }) {
				const token = Redacted.value(credential);
				if (token !== 'valid-token') {
					return yield* new Unauthorized({
						message: 'Invalid token'
					});
				}
				return yield* Effect.provideService(
					httpEffect,
					CurrentUser,
					new User({
						id: UserId.makeUnsafe(1),
						name: 'Dev User',
						email: 'dev@acme.com'
					})
				);
			})
		});
	})
);
```

### Applying Middleware

```ts
// To a single endpoint
HttpApiEndpoint.get('me', '/me', { success: User }).middleware(Authorization);

// To an entire group
HttpApiGroup.make('users').add(/* ... */).middleware(Authorization);

// To the entire API
HttpApi.make('api').add(/* ... */).middleware(Authorization);
```

### Cookie-Based Security

```ts
const sessionCookie = HttpApiSecurity.apiKey({ in: 'cookie', key: 'session' });

class Auth extends HttpApiMiddleware.Service<
	Auth,
	{
		provides: CurrentUser;
	}
>()('Auth', {
	error: Schema.String.annotate({ httpApiStatus: 401 }),
	security: { session: sessionCookie }
}) {}

// Middleware error accepts a single schema or an array of schemas:
class StrictAuth extends HttpApiMiddleware.Service<StrictAuth>()('StrictAuth', {
	error: [UnauthorizedError, ForbiddenError] // array of error schemas
}) {}

// Setting security cookies in handlers:
HttpApiBuilder.securitySetCookie(security, Redacted.make('secret-value'));
```

## Client Generation

### Basic Client

```ts
import { FetchHttpClient } from 'effect/unstable/http';
import { HttpApiClient } from 'effect/unstable/httpapi';

const program = Effect.gen(function* () {
	const client = yield* HttpApiClient.make(Api, {
		baseUrl: 'http://localhost:3000'
	});
	// Methods are grouped: client.GroupName.endpointName()
	const users = yield* client.users.list();
	const user = yield* client.users.getById({ params: { id: 1 } });
	// Top-level groups: client.endpointName()
	yield* client.health();
});

program.pipe(Effect.provide(FetchHttpClient.layer), Effect.runFork);
```

### Response Mode

Client endpoint calls accept an optional `responseMode` field to control what is returned:

| Mode                       | Return type                                  | Error channel                           |
| -------------------------- | -------------------------------------------- | --------------------------------------- |
| `"decoded-only"` (default) | `Success`                                    | Includes decode + typed endpoint errors |
| `"decoded-and-response"`   | `[Success, HttpClientResponse]` tuple        | Includes decode + typed endpoint errors |
| `"response-only"`          | `HttpClientResponse` (no decoding performed) | Excludes decode + typed endpoint errors |

```ts
const program = Effect.gen(function* () {
	const client = yield* HttpApiClient.make(Api, {
		baseUrl: 'http://localhost:3000'
	});

	// Default: decoded value only
	const user = yield* client.users.getById({ params: { id: 1 } });

	// Decoded value + raw response (e.g., to inspect headers)
	const [user2, response] = yield* client.users.getById({
		params: { id: 1 },
		responseMode: 'decoded-and-response'
	});

	// Raw response only — no decoding, no typed errors
	const rawResponse = yield* client.users.getById({
		params: { id: 1 },
		responseMode: 'response-only'
	});
});
```

### URL Builder

`HttpApiClient.urlBuilder` is a synchronous utility that builds typed URLs from your API definition. It uses `Schema.encodeSync` internally to encode params and query values.

```ts
import { HttpApiClient } from 'effect/unstable/httpapi';

const buildUrl = HttpApiClient.urlBuilder(Api, {
	baseUrl: 'https://api.example.com'
});

// Methods mirror the client shape but return string URLs
buildUrl.users.getById({ params: { id: '123' } });
//=> "https://api.example.com/users/123"

buildUrl.users.list({ query: { page: 2 } });
//=> "https://api.example.com/users?page=2"
```

### Client with Middleware & Retry

```ts
import { HttpApiMiddleware, HttpApiClient } from 'effect/unstable/httpapi';
import {
	FetchHttpClient,
	HttpClient,
	HttpClientRequest
} from 'effect/unstable/http';

// Client-side middleware implementation
const AuthorizationClient = HttpApiMiddleware.layerClient(
	Authorization,
	Effect.fn(function* ({ next, request }) {
		return yield* next(HttpClientRequest.bearerToken(request, 'my-token'));
	})
);

// Wrap in a service for DI
class ApiClient extends ServiceMap.Service<
	ApiClient,
	HttpApiClient.ForApi<typeof Api>
>()('ApiClient') {
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
						schedule: Schedule.exponential(100),
						times: 3
					})
				)
		})
	).pipe(
		Layer.provide(AuthorizationClient),
		Layer.provide(FetchHttpClient.layer)
	);
}
```

## Custom Middleware (Non-Security)

```ts
class Logger extends HttpApiMiddleware.Service<Logger>()('Http/Logger', {
	error: Schema.String.pipe(HttpApiSchema.status(405), HttpApiSchema.asText())
}) {}

const LoggerLive = Layer.effect(
	Logger,
	Effect.gen(function* () {
		yield* Effect.log('creating Logger middleware');
		return (effect) =>
			Effect.gen(function* () {
				const request = yield* HttpServerRequest.HttpServerRequest;
				yield* Effect.log(`Request: ${request.method} ${request.url}`);
				return yield* effect;
			});
	})
);
```

## Response Customization

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
					{
						httpOnly: true,
						secure: true,
						path: '/'
					}
				)
			)
		);
		return 'Hello!';
	})
);
```

### Redirects

```ts
handlers.handle('oldPage', () =>
	Effect.succeed(HttpServerResponse.redirect('/new', { status: 302 }))
);
```

### Streaming Responses

```ts
const stream = Stream.make('a', 'b', 'c').pipe(
	Stream.schedule(Schedule.spaced('500 millis')),
	Stream.map((s) => new TextEncoder().encode(s))
);

handlers.handle('getStream', () =>
	Effect.succeed(HttpServerResponse.stream(stream))
);
```

## OpenAPI Documentation

### Scalar UI

```ts
import { HttpApiScalar } from 'effect/unstable/httpapi';

const DocsRoute = HttpApiScalar.layer(Api, { path: '/docs' });
```

### Swagger UI

```ts
import { HttpApiSwagger } from 'effect/unstable/httpapi';

const DocsRoute = HttpApiSwagger.layer(Api); // default path: /docs
```

### OpenAPI Annotations

```ts
// API-level
HttpApi.make('api')
	.annotate(OpenApi.Title, 'My API')
	.annotate(OpenApi.Description, 'API description')
	.annotate(OpenApi.Version, '1.0.0')
	.annotate(OpenApi.License, { name: 'MIT' })
	.annotate(OpenApi.Servers, [{ url: 'https://api.example.com' }]);

// Or using annotateMerge:
HttpApi.make('api').annotateMerge(
	OpenApi.annotations({
		title: 'My API',
		description: 'API description'
	})
);

// Group-level
HttpApiGroup.make('users')
	.annotate(OpenApi.Description, 'User endpoints')
	.annotate(OpenApi.ExternalDocs, { url: 'https://docs.example.com' })
	.annotate(OpenApi.Exclude, true); // hide from OpenAPI spec

// Endpoint-level
HttpApiEndpoint.get('get', '/', { success: Schema.String })
	.annotate(OpenApi.Description, 'Get something')
	.annotate(OpenApi.Summary, 'Short summary')
	.annotate(OpenApi.Deprecated, true)
	.annotate(OpenApi.Exclude, true);

// Schema-level
const User = Schema.Struct({
	id: Schema.Int,
	name: Schema.String
}).annotate({
	description: 'A user entity',
	identifier: 'User' // shown in docs Model section
});
```

### Programmatic OpenAPI Generation

```ts
const spec = OpenApi.fromApi(api);
console.log(JSON.stringify(spec, null, 2));
```

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
			schedule: Schedule.exponential(100),
			times: 3
		})
	);

	// GET request with schema validation
	const todos = yield* client
		.get('/todos')
		.pipe(
			Effect.flatMap(
				HttpClientResponse.schemaBodyJson(Schema.Array(Todo))
			)
		);

	// POST request
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
// --- api/errors.ts ---
import { Schema } from 'effect';

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

// --- api/auth.ts ---
import { ServiceMap } from 'effect';
import { HttpApiMiddleware, HttpApiSecurity } from 'effect/unstable/httpapi';
import type { User } from './domain.ts';

export class CurrentUser extends ServiceMap.Service<CurrentUser, User>()(
	'CurrentUser'
) {}

export class Authorization extends HttpApiMiddleware.Service<
	Authorization,
	{
		provides: CurrentUser;
	}
>()('Authorization', {
	requiredForClient: true,
	security: { bearer: HttpApiSecurity.bearer },
	error: Unauthorized
}) {}

// --- api/users.ts ---
import { Schema } from 'effect';
import { HttpApiEndpoint, HttpApiGroup } from 'effect/unstable/httpapi';
import { Authorization } from './auth.ts';

export class UsersApi extends HttpApiGroup.make('users')
	.add(
		HttpApiEndpoint.get('list', '/', { success: Schema.Array(User) }),
		HttpApiEndpoint.get('getById', '/:id', {
			params: { id: Schema.FiniteFromString.check(Schema.isInt()) },
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

// --- api/index.ts ---
import { HttpApi, OpenApi } from 'effect/unstable/httpapi';

export class Api extends HttpApi.make('my-api')
	.add(UsersApi)
	.annotateMerge(OpenApi.annotations({ title: 'My API' })) {}

// --- server/auth.ts ---
import { Effect, Layer, Redacted } from 'effect';

export const AuthorizationLayer = Layer.effect(
	Authorization,
	Effect.gen(function* () {
		return Authorization.of({
			bearer: Effect.fn(function* (httpEffect, { credential }) {
				const token = Redacted.value(credential);
				if (token !== 'valid') {
					return yield* new Unauthorized({ message: 'Bad token' });
				}
				return yield* Effect.provideService(
					httpEffect,
					CurrentUser,
					mockUser
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
			.handle('getById', ({ params }) => repo.findById(params.id))
			.handle('create', ({ payload }) =>
				repo.create(payload).pipe(Effect.orDie)
			);
	})
).pipe(Layer.provide([UsersRepository.layer, AuthorizationLayer]));

// --- server/main.ts ---
import { NodeHttpServer, NodeRuntime } from '@effect/platform-node';
import { Layer } from 'effect';
import { HttpRouter } from 'effect/unstable/http';
import { HttpApiBuilder, HttpApiScalar } from 'effect/unstable/httpapi';
import { createServer } from 'node:http';

const ApiRoutes = HttpApiBuilder.layer(Api).pipe(
	Layer.provide([UsersHandlers])
);

const ServerLayer = HttpRouter.serve(
	Layer.mergeAll(ApiRoutes, HttpApiScalar.layer(Api))
).pipe(Layer.provide(NodeHttpServer.layer(createServer, { port: 3000 })));

Layer.launch(ServerLayer).pipe(NodeRuntime.runMain);
```

## Common Anti-Patterns

1. **Mixing API definition with server implementation** — Always keep API definitions in separate files/packages from handler implementations so clients can import definitions without server code.

2. **Using `cd` method chains instead of options object** — v4 uses an options object on endpoint constructors (`{ params, query, payload, success, error }`), not `.pipe()` chains for adding schemas.

3. **Forgetting `Layer.provide` for middleware** — Security middleware must be provided as a Layer to the server setup, and client-side middleware must be provided when creating clients.

4. **Using uppercase header keys** — All headers are normalized to lowercase. Always use lowercase keys in the `headers` option.

5. **Not handling errors from services** — Use `Effect.orDie` for unexpected errors and `Effect.catchReasons` / `Effect.fail` for expected errors that map to HTTP error responses.
