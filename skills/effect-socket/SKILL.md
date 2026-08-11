---
name: effect-socket
description: Build bidirectional socket transports with effect/unstable/socket — the Socket run/writer surface, WebSocket-backed sockets, TCP/Unix-domain clients via NodeSocket, SocketServer accept loops, channel adapters, the SocketError taxonomy, and reconnect patterns. Use when connecting to or serving raw TCP, Unix-domain, or WebSocket endpoints, framing socket bytes with Stream/Channel (NDJSON), building reconnecting socket clients, or providing socket transports to RPC/devtools layers.
---

You are an Effect TypeScript expert specializing in bidirectional socket programming with `effect/unstable/socket` and the Node/Bun platform socket adapters.

These modules live under `effect/unstable/socket` — there is no `@effect/platform/Socket` in v4. Platform implementations ship from `@effect/platform-node` (`NodeSocket`, `NodeSocketServer`) and `@effect/platform-bun` (`BunSocket`, `BunSocketServer`), both re-exporting the same shared implementation from `@effect/platform-node-shared`.

## Effect Source Reference

The Effect v4 source is at `~/.cache/effect-v4/`. Read it directly when in doubt — these unstable modules change between betas.

Key files:

- `packages/effect/src/unstable/socket/Socket.ts` — `Socket` interface and service tag, `make`, `CloseEvent`, the `SocketError` taxonomy, channel adapters (`toChannel`, `toChannelString`, `toChannelMap`, `makeChannel`), WebSocket constructors (`makeWebSocket`, `fromWebSocket`, `layerWebSocket`, `WebSocketConstructor`), `fromTransformStream`
- `packages/effect/src/unstable/socket/SocketServer.ts` — `SocketServer` service contract, `Address` (`TcpAddress` / `UnixAddress`), `SocketServerError`
- `packages/platform-node-shared/src/NodeSocket.ts` — `makeNet`, `fromDuplex`, `makeNetChannel`, `layerNet`, `NetSocket` service, `NodeWS` (`ws` re-export)
- `packages/platform-node-shared/src/NodeSocketServer.ts` — TCP/Unix server `make`/`layer`, WebSocket server `makeWebSocket`/`layerWebSocket`, `IncomingMessage` service
- `packages/platform-node/src/NodeSocket.ts` — re-exports shared module; adds `layerWebSocketConstructor`, `layerWebSocketConstructorWS`, `layerWebSocket`
- `packages/platform-bun/src/BunSocket.ts` — same shared re-export; Bun-global WebSocket constructor layers
- `packages/platform-node/test/NodeSocket.test.ts` — loopback echo server, WebSocket client semantics, transform-stream sockets
- `packages/effect/src/unstable/devtools/DevToolsClient.ts` — production example of NDJSON-framed request/response over a `Socket`
- `packages/effect/src/unstable/rpc/RpcClient.ts` (`makeProtocolSocket`) — production example of socket reconnect with retry schedules

## Core Model

A `Socket` is a **recipe for one bidirectional connection**, not a live handle. The underlying transport (TCP socket, WebSocket, duplex stream) is acquired each time you execute `run`/`runString`/`runRaw` and released when that run ends — so retrying the run loop reconnects. Run loops must not be executed concurrently on the same `Socket` value — this is not enforced: concurrent runs each open their own transport and clobber the single internal writer slot, so writes silently target the last-opened connection.

```ts
interface Socket {
	// Read loop + connection driver. Completes/fails when the connection ends.
	readonly run: <_, E = never, R = never>(
		handler: (data: Uint8Array) => Effect.Effect<_, E, R> | void,
		options?: { readonly onOpen?: Effect.Effect<void> | undefined }
	) => Effect.Effect<void, Socket.SocketError | E, R>;
	readonly runString: (handler: (data: string) => ..., options?) => ...;
	readonly runRaw: (handler: (data: string | Uint8Array) => ..., options?) => ...;

	// Scoped writer: a function you call per outgoing chunk.
	readonly writer: Effect.Effect<
		(chunk: Uint8Array | string | Socket.CloseEvent) => Effect.Effect<void, Socket.SocketError>,
		never,
		Scope.Scope
	>;
}
```

How to think about it:

- **`run*` drives everything.** It opens the connection, registers the handler for incoming frames, and only returns when the connection closes (or the open/read fails). Writes made through `writer` suspend on an internal latch until a `run` is active and the connection is open — calling `write` with no concurrent `run` waits forever.
- **The handler can return `void` or an Effect.** Returning `void` is the synchronous fast path (e.g. `Queue.offerUnsafe`). Returning an Effect forks it into a per-run `FiberSet` — handler effects run **concurrently and unordered**, and a failed handler effect fails the whole run loop with `E`.
- **`writer` is scoped.** Closing the writer's scope ends the writable side: Node TCP calls `socket.end()` (half-close), transform-stream sockets close the writable stream, WebSocket writers do nothing on release (the WS itself closes when the run ends).
- **`Socket` is a `Context.Service`** (`Socket.Socket` tag), so layers like `NodeSocket.layerNet` or `Socket.layerWebSocket` provide it to programs that just `yield* Socket.Socket`.

Imports used throughout:

```ts
import { Effect, Layer, Queue, Schedule, Schema, Scope, Stream } from 'effect';
import { Socket, SocketServer } from 'effect/unstable/socket';
import { Ndjson } from 'effect/unstable/encoding';
import { NodeSocket, NodeSocketServer } from '@effect/platform-node';
// Bun equivalents (same API, shared implementation):
// import { BunSocket, BunSocketServer } from '@effect/platform-bun';
```

---

## 1. The Socket Surface: run, runString, runRaw, writer

### Reading

```ts
const program = Effect.gen(function*() {
	const socket = yield* Socket.Socket;

	// Binary frames (strings arriving on the wire are UTF-8 encoded for you)
	yield* socket.run((data: Uint8Array) => Effect.log(`got ${data.length} bytes`));

	// Text frames (binary frames are decoded per-frame with TextDecoder)
	yield* socket.runString((text) => Effect.log(text));

	// Raw frames — exactly what the transport delivered (string | Uint8Array)
	yield* socket.runRaw((data) => {
		// returning void = synchronous handling, preserves frame order
	});
});
```

The `onOpen` option runs an effect once the connection is open, before the run loop settles — the idiomatic place for subscribe/hello messages, since it re-runs on every reconnect. `onOpen` must be infallible (`Effect<void>`, error channel `never`), so wrap fallible writes with `Effect.orDie` (or `Effect.ignore` if a failed hello should not kill the run):

```ts
yield* socket.run(handleFrame, {
	onOpen: Effect.orDie(write(JSON.stringify({ type: 'subscribe', channel: 'trades' })))
});
```

### Ordered processing of incoming frames

Effectful handlers are forked concurrently. When ordering matters, push synchronously into a `Queue` and consume it in your own fiber (this is exactly what `Socket.toChannelMap` does internally):

```ts
const queue = yield* Queue.unbounded<Uint8Array>();
yield* Effect.forkChild(
	socket.run((data) => {
		Queue.offerUnsafe(queue, data); // sync — no Effect returned
	})
);
```

### Writing

`writer` yields a write function; each call returns an Effect that completes when the chunk is flushed (Node: the `write` callback) and fails with `SocketError` on write failure:

```ts
yield* Effect.gen(function*() {
	const write = yield* socket.writer;
	yield* write(new TextEncoder().encode('Hello'));
	yield* write('strings are fine too');
	yield* write(new Socket.CloseEvent(1000, 'done')); // request close
}).pipe(Effect.scoped);
```

`Socket.CloseEvent` is `new Socket.CloseEvent(code = 1000, reason?)`. On a WebSocket it calls `ws.close(code, reason)`; on TCP it destroys the connection — codes above 1000 destroy with a local `Error`, failing the *local* run loop with `SocketReadError`. Close codes are a WebSocket concept and are never transmitted over raw TCP: the peer just observes an ordinary EOF or ECONNRESET.

Write effects suspend on the internal latch until the connection is open, so it is safe to start writing fibers before (or while) `run` connects — but a `run` must eventually be active or the writes suspend forever.

### Building a Socket by hand

`Socket.make({ runRaw, run?, runString?, writer })` derives the missing read loops from `runRaw` (UTF-8 encoding/decoding per frame). A custom `writer` receives `Uint8Array | string | Socket.CloseEvent` and must branch with `Socket.isCloseEvent(chunk)` to separate close requests from data (every built-in writer does). You rarely need it directly — prefer `fromWebSocket`, `NodeSocket.fromDuplex`, or `Socket.fromTransformStream`.

---

## 2. The SocketError Taxonomy

All socket failures surface as a single tagged error `SocketError` (`_tag: 'SocketError'`) wrapping a `reason` union:

| `reason._tag` | When | Extra fields |
|---|---|---|
| `SocketOpenError` | connect/handshake failed | `kind: 'Unknown' \| 'Timeout'`, `cause` |
| `SocketReadError` | transport error while reading | `cause` |
| `SocketWriteError` | write callback failed | `cause` |
| `SocketCloseError` | connection closed | `code: number`, `closeReason?: string` |

```ts
program.pipe(
	Effect.catchTag('SocketError', (error) => {
		switch (error.reason._tag) {
			case 'SocketOpenError':
				return error.reason.kind === 'Timeout' ? retryLater : giveUp;
			case 'SocketCloseError':
				return error.reason.code === 1000 ? Effect.void : reconnect;
			case 'SocketReadError':
			case 'SocketWriteError':
				return reconnect;
		}
	})
);
```

Useful helpers:

- `Socket.isSocketError(u)` / `Socket.SocketError.is(u)` — runtime guards
- `Socket.SocketErrorReason` — `Schema.Union` of the four reasons (reusable in your own schemas)
- `Socket.SocketCloseError.filterClean(isClean)` — a `Filter` for `Effect.catchFilter` that succeeds only for close errors whose code passes `isClean`:

```ts
// Treat a clean close (1000) as normal completion, keep everything else as failure
socket.run(handler).pipe(
	Effect.catchFilter(
		Socket.SocketCloseError.filterClean((code) => code === 1000),
		() => Effect.void
	)
);
```

Close-code semantics per transport:

- **WebSocket** (`fromWebSocket`/`makeWebSocket`): *every* close — including a clean 1000 — fails the run with `SocketCloseError` by default (`Socket.defaultCloseCodeIsError` returns `true` for all codes). Pass `closeCodeIsError: (code) => code !== 1000` to make clean closes complete the run with `void`.
- **TCP** (`NodeSocket.makeNet`/`fromDuplex`): a graceful peer FIN (`'end'` event) completes the run **successfully** with `void`; transport errors fail with `SocketReadError`; a close without a prior `'end'`/`'error'` (e.g. a local destroy via `write(CloseEvent)`) fails with `SocketCloseError` code `1000` (`1006` if errored — in practice preempted by `SocketReadError`, since `'error'` fires first and the run keeps the first settlement). There is no `closeCodeIsError` option here.

---

## 3. WebSocket Clients

### Constructor service

WebSocket creation is abstracted behind the `Socket.WebSocketConstructor` service so the same code runs in browsers, Node, and Bun:

```ts
// Browser / any runtime with a global WebSocket
Socket.layerWebSocketConstructorGlobal;

// Node: global WebSocket when available, otherwise the `ws` package
NodeSocket.layerWebSocketConstructor;
// Node: always the `ws` package
NodeSocket.layerWebSocketConstructorWS;

// Bun: global WebSocket
BunSocket.layerWebSocketConstructor;
```

### Creating the socket

```ts
const socket = yield* Socket.makeWebSocket('wss://example.com/feed', {
	closeCodeIsError: (code) => code !== 1000, // default: every close is an error
	openTimeout: '5 seconds', // default 10000 ms; SocketOpenError kind 'Timeout' on expiry
	protocols: ['v1.protocol'] // optional subprotocols
});
// Effect<Socket, never, WebSocketConstructor> — connection NOT opened yet
```

The URL can be `string | Effect<string>`. An effectful URL is re-evaluated on **every** (re)connect — use it to refresh auth tokens in query strings between retries.

`Socket.fromWebSocket(acquire, options?)` is the lower-level form taking a scoped `Effect<globalThis.WebSocket, SocketError, R>` — `NodeSocketServer.makeWebSocket` uses it to wrap server-accepted sockets.

### Layers

```ts
// Core: requires WebSocketConstructor in context
Socket.layerWebSocket(url, options?); // Layer<Socket, never, WebSocketConstructor>

// Platform conveniences: constructor already provided
NodeSocket.layerWebSocket(url, options?); // Layer<Socket, never, never>
BunSocket.layerWebSocket(url, options?); // Layer<Socket, never, never>
```

### Behavior details (verified in source/tests)

- The run loop waits for the `open` event before settling; incoming `Blob` frames are converted to `Uint8Array` automatically; text frames arrive as strings (use `run` to get bytes, `runString` to get text).
- When the run ends, the WebSocket is closed with code 1000 (the acquire's release in `makeWebSocket`).
- Handler effects can access the live `globalThis.WebSocket` via the `Socket.WebSocket` service (`yield* Socket.WebSocket`).
- An `error` event before open fails the run with `SocketOpenError`; after open, with `SocketReadError`.

```ts
// Full client wiring
const program = Effect.gen(function*() {
	const socket = yield* Socket.makeWebSocket('wss://example.com/feed', {
		closeCodeIsError: (code) => code !== 1000
	});
	const messages = yield* Queue.unbounded<Uint8Array>();
	yield* Effect.forkChild(
		socket.run((data) => {
			Queue.offerUnsafe(messages, data); // sync — preserves frame order
		})
	);
	yield* Effect.gen(function*() {
		const write = yield* socket.writer;
		yield* write('hello');
	}).pipe(Effect.scoped);
	return yield* Queue.take(messages);
}).pipe(Effect.provide(NodeSocket.layerWebSocketConstructor));
```

---

## 4. TCP and Unix-Domain Clients (NodeSocket)

`NodeSocket.makeNet(options)` opens a `net.createConnection` as a `Socket`. Options are Node's `NetConnectOpts` plus `openTimeout`:

```ts
// TCP
const tcp = yield* NodeSocket.makeNet({
	host: 'localhost', // Net.TcpNetConnectOpts
	port: 9000,
	openTimeout: '3 seconds' // optional — no default; without it, connects wait forever
});

// Unix-domain socket
const unix = yield* NodeSocket.makeNet({ path: '/tmp/app.sock' });
```

`makeNet` returns `Effect<Socket>` — infallible, because connection happens per `run`. Connect failures surface from the run loop as `SocketOpenError`.

```ts
// As a layer
NodeSocket.layerNet({ port: 9000 }); // Layer<Socket, SocketError>

// As a Channel directly (see section 5)
NodeSocket.makeNetChannel<IE>({ port: 9000 });
```

`NodeSocket.fromDuplex(open, options?)` adapts any Node `Duplex` (child process stdio, TLS sockets via `tls.connect`, PTYs):

```ts
import * as Tls from 'node:tls';

const tlsSocket = yield* NodeSocket.fromDuplex(
	Effect.sync(() => Tls.connect({ host: 'example.com', port: 443 })),
	{ openTimeout: '5 seconds' }
);
```

The `open` effect is scoped — it re-runs per `run` call, and its scope closes when the run ends. Inside handler effects, the raw `net.Socket` is available as the `NodeSocket.NetSocket` service (e.g. to read `remoteAddress` or call `setKeepAlive`).

These constructors work identically from `BunSocket` (same shared implementation over `node:net`).

---

## 5. Sockets as Channels and Streams

A `Socket` converts to a bidirectional `Channel` — output is incoming frames, input is outgoing frames:

```ts
// Binary: incoming string frames are UTF-8 encoded to bytes
Socket.toChannel(socket);
// Channel<NonEmptyReadonlyArray<Uint8Array>, SocketError | IE, void,
//         NonEmptyReadonlyArray<Uint8Array | string | CloseEvent>, IE>

// Text: incoming binary frames decoded per-frame (optional encoding arg; dual)
Socket.toChannelString(socket);
Socket.toChannelString(socket, 'utf-8');

// Fix the upstream error type explicitly (channels are invariant in IE)
Socket.toChannelWith<MyError>()(socket);

// Custom frame mapping
Socket.toChannelMap(socket, (data) => decodeFrame(data));

// From the Socket service in context
Socket.makeChannel<IE>(); // Channel<..., ..., ..., ..., ..., unknown, Socket>

// Node shortcut: TCP channel without an intermediate Socket value
NodeSocket.makeNetChannel<IE>({ port: 9000 });

// WebSocket shortcut (requires WebSocketConstructor)
Socket.makeWebSocketChannel<IE>(url, { closeCodeIsError });
```

`Stream.pipeThroughChannel` turns request/response over a socket into a stream pipeline — the loopback test does exactly this against an echo server:

```ts
const channel = NodeSocket.makeNetChannel({ port });

const output = yield* Stream.make('Hello', 'World').pipe(
	Stream.encodeText, // Stream<string> → Stream<Uint8Array>
	Stream.pipeThroughChannel(channel), // write upstream, read downstream
	Stream.decodeText(), // streaming UTF-8 decode (safe across chunk splits)
	Stream.mkString
);
// 'HelloWorld'
```

When the upstream stream ends, the channel's write side completes (Node: `.end()` half-close), and the channel keeps emitting until the peer closes. Prefer `Stream.decodeText` over `runString`/`toChannelString` for TCP byte streams — only `decodeText` reassembles multi-byte UTF-8 characters split across chunks (see Common Mistakes).

See the effect-stream skill for the full Stream/Channel surface.

---

## 6. Framing: NDJSON over a Socket

TCP delivers a byte stream, not messages — you must frame. `Ndjson.duplex*` from `effect/unstable/encoding` wraps a socket channel so you write/read typed values:

```ts
import { Ndjson } from 'effect/unstable/encoding';

const Request = Schema.Struct({ id: Schema.Number, op: Schema.String });
const Response = Schema.Struct({ id: Schema.Number, result: Schema.String });

const program = Effect.gen(function*() {
	const socket = yield* NodeSocket.makeNet({ port: 9000 });
	const requests = yield* Queue.unbounded<typeof Request.Type>();

	yield* Stream.fromQueue(requests).pipe(
		Stream.pipeThroughChannel(
			Ndjson.duplexSchema(Socket.toChannel(socket), {
				inputSchema: Request, // encodes outgoing values
				outputSchema: Response // decodes incoming lines
			})
		),
		Stream.runForEach((response) => Effect.log('response', response)),
		Effect.forkScoped
	);

	yield* Queue.offer(requests, { id: 1, op: 'ping' });
});
```

Variants (all dual, options `{ ignoreEmptyLines?: boolean }`):

- `Ndjson.duplex(channel)` — untyped `unknown` values over a byte channel
- `Ndjson.duplexSchema(channel, { inputSchema, outputSchema })` — typed, byte channel (use for TCP)
- `Ndjson.duplexString` / `Ndjson.duplexSchemaString` — string-channel versions (fine for WebSocket text frames; `DevToolsClient` composes `Ndjson.duplexSchemaString(Socket.toChannelString(socket), ...)`)

Error channel gains `NdjsonError` (and `Schema.SchemaError` for the schema variants). `Msgpack.duplex`/`duplexSchema` provide analogous binary framing, but require `Uint8Array<ArrayBuffer>` channels — `Socket.toChannel`'s plain `Uint8Array` output does not directly satisfy them (a cast or mapping is needed) — and `Msgpack.duplex` is not dual. One-way encoding/decoding (`Ndjson.encode()`, `Ndjson.decode()`) composes with `Stream.pipeThroughChannel` as shown in the effect-stream skill.

---

## 7. Accepting Connections: SocketServer

`SocketServer.SocketServer` is a `Context.Service` with two members:

```ts
interface SocketServerService {
	readonly address: SocketServer.Address; // TcpAddress | UnixAddress, known at construction
	readonly run: <R, E, _>(
		handler: (socket: Socket.Socket) => Effect.Effect<_, E, R>
	) => Effect.Effect<never, SocketServer.SocketServerError, R>;
}
```

### TCP / Unix-domain (Node and Bun)

```ts
// Scoped construction — listening starts immediately; closes with the scope
const server = yield* NodeSocketServer.make({ port: 0 }); // port 0 = ephemeral
const unixServer = yield* NodeSocketServer.make({ path: '/tmp/app.sock' });

// Or as a layer
NodeSocketServer.layer({ port: 9000, host: '127.0.0.1' });
// Layer<SocketServer, SocketServerError>
```

Options are Node's `Net.ServerOpts & Net.ListenOptions`. Read the bound port from the address:

```ts
const port = (server.address as SocketServer.TcpAddress).port;
```

### The accept loop

`run(handler)` returns `Effect<never, ...>` — it never completes, so fork it. The handler is forked per connection; an errored handler is **logged** (via the `UnhandledLogLevel` reference: "Unhandled error in SocketServer"), never propagated to the accept loop. Connections accepted between `make` and `run` are queued and handled once `run` starts.

```ts
const EchoServer = Effect.gen(function*() {
	const server = yield* NodeSocketServer.make({ port: 0 });

	yield* server.run(
		Effect.fnUntraced(function*(socket) {
			const write = yield* socket.writer; // needs Scope —
			yield* socket.run(write); // echo: write fn doubles as read handler
		}, Effect.scoped) // — eliminate it per connection
	).pipe(Effect.forkScoped);

	return server;
});
```

Wrap handlers that use `socket.writer` (or any scoped resource) in `Effect.scoped`: the server captures the handler's context at `run` time **minus `Scope`**, so a handler still requiring `Scope` dies at runtime. Inside TCP handlers the raw `net.Socket` is provided as `NodeSocket.NetSocket`.

### WebSocket servers (`ws`-backed)

```ts
NodeSocketServer.makeWebSocket({ port: 8080 }); // ws.ServerOptions
NodeSocketServer.layerWebSocket({ port: 8080 });
```

Handlers receive the same `Socket.Socket` interface, plus two extra services in context: `NodeSocketServer.IncomingMessage` (the Node `http.IncomingMessage` — URL, headers, auth) and `Socket.WebSocket` (the raw `ws` socket). To attach WebSockets to an existing Effect HTTP server route instead, use `HttpServerRequest.upgrade` — see the effect-http-server skill.

`BunSocketServer` re-exports the identical API (Bun runs it over `node:net` compatibility).

`SocketServerError` wraps a `reason` of `SocketServerOpenError` (bind/listen failures) or `SocketServerUnknownError`, each carrying `cause`.

---

## 8. Transform-Stream Sockets and In-Memory Testing

`Socket.fromTransformStream` adapts a web `ReadableStream`/`WritableStream` pair — the basis for in-memory sockets in tests, WebTransport-style APIs, or piping through `CompressionStream`:

```ts
const socket = yield* Socket.fromTransformStream(
	Effect.succeed({
		readable: someReadableStream, // ReadableStream<Uint8Array | string>
		writable: someWritableStream // WritableStream<Uint8Array>
	}),
	{ closeCodeIsError: (code) => code !== 1000 }
);
```

In-memory test socket from the test suite — feed the read side from a `Stream`, capture writes in an array:

```ts
const readable = Stream.make('A', 'B', 'C').pipe(
	Stream.toReadableStream()
);
const chunks: Array<string> = [];
const decoder = new TextDecoder();
const writable = new WritableStream<Uint8Array>({
	write(chunk) {
		chunks.push(decoder.decode(chunk));
	}
});

const socket = yield* Socket.fromTransformStream(
	Effect.succeed({ readable, writable }),
	{ closeCodeIsError: () => false }
);
```

When the readable ends, the run fails with `SocketCloseError` code 1000 — which `closeCodeIsError: () => false` converts to successful completion. Writing a `Socket.CloseEvent` ends the run with `SocketCloseError` carrying that code (subject to `closeCodeIsError`), without closing the writable stream. String writes are UTF-8 encoded before reaching the writable. Releasing the writer scope closes the writable stream.

For integration-level tests, prefer a real loopback server: `NodeSocketServer.make({ port: 0 })` + `NodeSocket.makeNet({ port: address.port })` (the pattern in `NodeSocket.test.ts`) — it exercises actual framing and close semantics.

---

## 9. Reconnect and Retry Patterns

Because each `run` acquires a fresh connection, **reconnect = retry the run loop**. This is exactly how `RpcClient.makeProtocolSocket` works in production: acquire the writer once (writes latch while disconnected), wrap the run in `Effect.suspend` to reset per-attempt state, and `Effect.retry` with a capped backoff:

```ts
const feed = Effect.gen(function*() {
	const socket = yield* Socket.Socket;
	const write = yield* socket.writer; // once — survives reconnects

	yield* Effect.suspend(() => {
		// reset per-connection state here (parsers, sequence numbers, ...)
		return socket.run(handleFrame, {
			onOpen: Effect.orDie(write(JSON.stringify({ type: 'subscribe', channel: 'trades' })))
		});
	}).pipe(
		// a clean run completion is also a disconnect — fail so retry kicks in
		Effect.flatMap(() =>
			Effect.fail(
				new Socket.SocketError({
					reason: new Socket.SocketCloseError({ code: 1000 })
				})
			)
		),
		Effect.tapError((error) => Effect.logWarning('socket disconnected', error)),
		Effect.retry(
			// RpcClient's defaultRetryPolicy: exponential from 500ms, capped at 5s
			Schedule.exponential(500, 1.5).pipe(Schedule.either(Schedule.spaced(5000)))
		)
	);
}).pipe(Effect.provide(NodeSocket.layerWebSocket('wss://example.com/feed')));
```

Notes:

- `onOpen` re-runs on every reconnect — put (re)subscription handshakes there, not before the retry loop.
- To retry only transient failures, filter: `Effect.retry({ schedule, while: (e) => e.reason._tag !== 'SocketOpenError' || e.reason.kind === 'Timeout' })` — or match whatever taxonomy subset is transient for your protocol.
- For liveness detection on quiet connections, race the run loop against an application-level ping timeout and fail with a synthetic `SocketOpenError({ kind: 'Timeout' })` — see `makePinger` in `RpcClient.ts`.
- An effectful URL passed to `makeWebSocket` is re-evaluated per attempt — refresh tokens there.

---

## 10. Sockets as Transports for Higher Layers

Sockets are the transport substrate for several Effect subsystems — wire them with one layer each:

```ts
// RPC over raw TCP: server side (see effect-rpc-server skill)
RpcServer.layerProtocolSocketServer; // requires SocketServer + RpcSerialization
// e.g. Layer.provide(NodeSocketServer.layer({ port: 9000 }))

// RPC client over any Socket (see effect-rpc-client skill)
RpcClient.layerProtocolSocket({ retryTransientErrors: true });
// e.g. Layer.provide(NodeSocket.layerNet({ port: 9000 })) or NodeSocket.layerWebSocket(url)
```

- WebSocket upgrades inside an HTTP server (`HttpServerRequest.upgrade` returns a `Socket`) — see the effect-http-server skill.
- Cluster runners communicate over sockets via `NodeClusterSocket`/`BunClusterSocket` — see the effect-rpc-cluster skill.
- DevTools telemetry runs NDJSON over a `Socket` (`effect/unstable/devtools`), provided by e.g. `NodeSocket.layerWebSocket('ws://localhost:34437')`.

---

## Key Patterns

### Loopback echo server + stream client (the canonical test)

```ts
import { Effect, Stream } from 'effect';
import { Socket, SocketServer } from 'effect/unstable/socket';
import { NodeSocket, NodeSocketServer } from '@effect/platform-node';

const program = Effect.gen(function*() {
	// Server: echo every frame back
	const server = yield* NodeSocketServer.make({ port: 0 });
	yield* server.run(
		Effect.fnUntraced(function*(socket) {
			const write = yield* socket.writer;
			yield* socket.run(write);
		}, Effect.scoped)
	).pipe(Effect.forkScoped);

	// Client: pipe a stream through the connection
	const port = (server.address as SocketServer.TcpAddress).port;
	const channel = NodeSocket.makeNetChannel({ port });

	return yield* Stream.make('Hello', 'World').pipe(
		Stream.encodeText,
		Stream.pipeThroughChannel(channel),
		Stream.decodeText(),
		Stream.mkString
	);
}).pipe(Effect.scoped);
```

### Typed NDJSON request/response client (DevToolsClient pattern)

```ts
import { Effect, Queue, Schedule, Schema, Stream } from 'effect';
import { Ndjson } from 'effect/unstable/encoding';
import { Socket } from 'effect/unstable/socket';
import { NodeSocket } from '@effect/platform-node';

const Request = Schema.Struct({ id: Schema.Number, op: Schema.String });
const Response = Schema.Struct({ id: Schema.Number, result: Schema.String });

const makeClient = Effect.gen(function*() {
	const socket = yield* NodeSocket.makeNet({ port: 9000, openTimeout: '3 seconds' });
	const requests = yield* Queue.unbounded<typeof Request.Type>();

	// One fiber owns the connection: writes from the queue, reads responses
	yield* Stream.fromQueue(requests).pipe(
		Stream.pipeThroughChannel(
			Ndjson.duplexSchema(Socket.toChannel(socket), {
				inputSchema: Request,
				outputSchema: Response
			})
		),
		Stream.runForEach((response) => Effect.log('response', response)),
		Effect.retry(Schedule.exponential(500, 1.5).pipe(Schedule.either(Schedule.spaced(5000)))),
		Effect.forkScoped
	);

	return {
		send: (request: typeof Request.Type) => Queue.offer(requests, request)
	};
});
```

### Per-connection NDJSON server

```ts
const NdjsonServer = Effect.gen(function*() {
	const server = yield* NodeSocketServer.make({ port: 9000 });

	yield* server.run(
		Effect.fnUntraced(function*(socket) {
			const responses = yield* Queue.unbounded<typeof Response.Type>();
			yield* Stream.fromQueue(responses).pipe(
				Stream.pipeThroughChannel(
					Ndjson.duplexSchema(Socket.toChannel(socket), {
						inputSchema: Response, // we write responses
						outputSchema: Request // we read requests
					})
				),
				Stream.runForEach((request) =>
					Queue.offer(responses, { id: request.id, result: request.op.toUpperCase() })
				)
			);
		}, Effect.scoped)
	).pipe(Effect.forkScoped);
});
```

### Reconnecting WebSocket consumer

```ts
const tradeFeed = Effect.gen(function*() {
	const socket = yield* Socket.makeWebSocket(
		Effect.gen(function*() {
			const token = yield* freshAuthToken; // re-evaluated per reconnect
			return `wss://example.com/feed?token=${token}`;
		}),
		{ closeCodeIsError: (code) => code !== 1000, openTimeout: '5 seconds' }
	);
	const write = yield* socket.writer;

	yield* socket.runString((text) => handleTrade(JSON.parse(text)), {
		onOpen: Effect.orDie(write(JSON.stringify({ type: 'subscribe', channel: 'trades' })))
	}).pipe(
		Effect.retry({
			schedule: Schedule.exponential('1 second').pipe(Schedule.either(Schedule.spaced('30 seconds')))
		})
	);
}).pipe(
	Effect.scoped,
	Effect.provide(NodeSocket.layerWebSocketConstructor)
);
```

## Common Mistakes

1. **Importing from `@effect/platform/Socket`** — gone in v4. Use `import { Socket, SocketServer } from 'effect/unstable/socket'`; platform pieces come from `@effect/platform-node` (`NodeSocket`, `NodeSocketServer`) or `@effect/platform-bun`.
2. **Assuming a clean WebSocket close (code 1000) completes `run` successfully** — by default *every* close code fails the run with `SocketError`/`SocketCloseError` (`defaultCloseCodeIsError` is `() => true`). Pass `closeCodeIsError: (code) => code !== 1000`, or catch with `SocketCloseError.filterClean`.
3. **Calling `write` without a concurrent `run`** — writes latch until a run loop has opened the connection. A lone `socket.writer` + `write(...)` suspends forever; fork `socket.run(...)` first (or alongside).
4. **Expecting effectful handlers to run in frame order** — handler effects are forked into a `FiberSet` and run concurrently. For ordered processing return `void` and `Queue.offerUnsafe` synchronously, or use the channel/stream adapters which do this for you.
5. **Forgetting `Effect.scoped` around `socket.writer`** — `writer` requires `Scope`. In `SocketServer.run` handlers this is fatal at runtime, because the server strips `Scope` from the captured handler context: wrap the handler with `Effect.fnUntraced(function*(socket) {...}, Effect.scoped)`.
6. **Closing the writer scope too early on TCP** — releasing the writer's scope calls `socket.end()` (half-close, peer sees EOF). Keep the writer scope open for the connection's lifetime unless you intend to signal end-of-output.
7. **Not forking `server.run(handler)`** — it returns `Effect<never, SocketServerError, R>` and never completes. `yield*`-ing it inline blocks the rest of your setup; use `Effect.forkScoped`.
8. **Expecting connection-handler failures to fail the server** — `SocketServer` handler errors are logged ("Unhandled error in SocketServer") and dropped. Handle/report errors inside the handler if you need them.
9. **Decoding TCP bytes per-frame with `runString`/`toChannelString`** — these `TextDecoder.decode` each chunk independently, corrupting multi-byte UTF-8 characters split across packets. For byte streams use `Socket.toChannel` + `Stream.decodeText` (streaming decode), and `Ndjson.duplexSchema` rather than `duplexSchemaString`. String variants are fine for WebSocket text frames, which arrive whole.
10. **Treating a `Socket` as a live connection** — it's a recipe. Each `run` opens a fresh transport; the connection closes when the run ends. Never run two run loops concurrently on one `Socket` value (unenforced — each opens its own transport and writes silently target the last-opened one). Reconnecting = `Effect.retry` on the run loop, not on the constructor.
11. **Forgetting the `WebSocketConstructor` layer** — `Socket.makeWebSocket`/`layerWebSocket`/`makeWebSocketChannel` require it. Provide `Socket.layerWebSocketConstructorGlobal` (browser), `NodeSocket.layerWebSocketConstructor` (Node), or `BunSocket.layerWebSocketConstructor` — or use the platform `layerWebSocket` convenience which bundles it.
12. **Relying on `openTimeout` for TCP without setting it** — `makeNet`/`fromDuplex` have *no* default open timeout (only WebSockets default to 10s). Pass `openTimeout` or a hung connect waits forever.
13. **Writing a `Socket.CloseEvent` to a TCP socket expecting a graceful close** — *any* CloseEvent destroys the connection (discarding queued writes) and fails the *local* run: `SocketCloseError` code 1000 for code 1000, `SocketReadError` for codes above 1000. The peer sees an ordinary EOF or ECONNRESET — close codes never cross the wire on raw TCP. Releasing the writer scope (`socket.end()`, half-close FIN) is the only graceful close.
14. **Reading `server.address` before the server exists** — the address is captured when `NodeSocketServer.make` completes (after `listen`). With `{ port: 0 }`, read the real port from `server.address as SocketServer.TcpAddress`; there is no separate "address ready" event to await.
