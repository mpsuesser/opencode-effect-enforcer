---
name: effect-socket
description: Build pull-based TCP, Unix, TLS, and WebSocket transports with Effect Socket readers and writers. Use for bidirectional connections, framing, reconnects, socket servers, or RPC socket transports.
---

# Effect Socket

## Source reference

Read `packages/effect/src/unstable/socket/{Socket,SocketServer}.ts` at
`effect@4.0.0-rc.116` in the Effect reference. Platform adapters live in
`packages/platform/node-shared/src/{NodeSocket,NodeSocketServer}.ts`; Node and
Bun expose these as `NodeSocket` / `BunSocket` and their server counterparts.
Load `effect-scope` and `effect-fiber` for lifecycle ownership,
`effect-stream` for framing, and `effect-scheduling` for reconnect policy.

## Connection ownership

`Socket.Socket` is both the service tag and the interface. A client socket is
a connection recipe. Acquiring `socket.reader` establishes a connection and
returns a `Reader` with `pull` and `upgrade`. Its acquisition scope owns the
connection. A pull yields a non-empty batch of `string | Uint8Array` frames.
Every termination, including clean close, fails with `SocketError`.

`socket.writer` is an infallible scoped acquisition of a `Writer` object:

- `writer.write(frameOrCloseEvent)` sends one frame or a close request.
- `writer.writeAll(nonEmptyBatch)` batches outgoing frames with native backpressure.
- Both write operations may fail with `SocketError`.
- Writes while disconnected wait for a reader to establish the connection.
- Releasing the writer scope half-closes transports that support it.

One owner acquires the reader. Process each batch sequentially by default;
bounded concurrency is a deliberate application decision. Place a handshake
after reader acquisition and before the first pull so it runs per connection.
There are no callback-driven `run`, `runString`, or `runRaw` methods on a socket.

<!-- typecheck -->
```ts
import { Effect } from 'effect';
import { Socket } from 'effect/unstable/socket';

const echo = Effect.fn('Socket.echo')(function* (socket: Socket.Socket) {
	const { pull } = yield* socket.reader;
	const writer = yield* socket.writer;
	yield* pull.pipe(Effect.flatMap(writer.writeAll), Effect.forever);
}, Effect.scoped);
```

`Socket.readerBytes(socket)` and `Socket.readerString(socket, encoding?)`
acquire a converted pull directly, rather than returning a Reader object.
The string adapter decodes each frame independently. For TCP, use a byte stream
and streaming `Stream.decodeText` to preserve split UTF-8 characters.

## WebSocket clients

<!-- typecheck -->
```ts
import { Duration, Effect } from 'effect';
import { Socket } from 'effect/unstable/socket';

const receive = Effect.gen(function* () {
	const socket = yield* Socket.makeWebSocket('wss://example.com/feed', {
		openTimeout: Duration.seconds(5),
		highWaterMark: 64 * 1024,
		protocols: ['v1']
	});
	const pull = yield* Socket.readerString(socket);
	const writer = yield* socket.writer;
	yield* writer.write('subscribe');
	yield* pull.pipe(
		Effect.flatMap((batch) => Effect.forEach(batch, Effect.logInfo)),
		Effect.forever
	);
}).pipe(Effect.scoped, Effect.provide(Socket.layerWebSocketConstructorGlobal));
```

Use `NodeSocket.layerWebSocketConstructor` or
`NodeSocket.layerWebSocketConstructorWS` on Node and
`BunSocket.layerWebSocketConstructor` on Bun. Platform `layerWebSocket(url, options)`
conveniences supply the constructor. Core `Socket.layerWebSocket` requires it.
Constructors accept compatible browser, Bun, and Node implementations without
casts; opening-handshake headers are available where the platform supports them.

An effectful URL is reevaluated on each connection. `fromWebSocket(acquire, options)`
wraps a scoped transport acquisition. Pausable transports pause at `highWaterMark`
(default 64 KiB) and resume when drained. Browser WebSockets cannot pause and
fail with `SocketReadError` when the configured bound is exceeded. Text-frame
buffering counts UTF-8 bytes, not string length.

## TCP, Unix, and TLS

```ts
import { NodeSocket } from '@effect/platform-node';

const tcp = NodeSocket.makeNet({ host: 'localhost', port: 9000, openTimeout: '3 seconds' });
const unix = NodeSocket.makeNet({ path: '/tmp/app.sock' });
const tls = NodeSocket.makeTls({ host: 'example.com', port: 443, servername: 'example.com' });
```

`makeNet` / `makeTls` return recipes; connection failures occur during reader
acquisition. `layerNet`, `layerTls`, `makeNetChannel`, and `makeTlsChannel` provide
service/channel equivalents. Prefer `makeTls` over hand-wrapping `tls.connect`.
`fromDuplex` remains the adapter for an existing scoped Node duplex source.
Omitted TCP `openTimeout` is unbounded; zero means an immediate timeout.

For STARTTLS acquire the reader, complete the protocol handshake, then call
`reader.upgrade(options)`. TLS keys and passphrases are redacted. Server-role
upgrades require both key and certificate; unsupported transports and invalid
credentials fail with `SocketUpgradeError` inside `SocketError`.

## Errors, close, and reconnect

`SocketError.reason` is one of `SocketOpenError`, `SocketReadError`,
`SocketWriteError`, `SocketCloseError`, or `SocketUpgradeError`. Narrow with
`Effect.catchReason`, schema matching, or the supplied guards. Open failures
distinguish `Unknown` and `Timeout`; close reasons carry `code` and `closeReason`.
Handle a normal close at the owning protocol boundary when completion is intended.
Close-code predicate options and `SocketCloseError.filterClean` are removed.

Reconnect by retrying the **scoped reader acquisition and consumption**, not just
the already-acquired pull. This releases each connection before the next attempt.
Retry only connection failures classified as transient for the protocol; replayed
handshakes and commands must be idempotent. Accepted server connections cannot
reconnect. Use a new socket value for an independent concurrent client connection.

<!-- typecheck -->
```ts
import { Duration, Effect, Schedule } from 'effect';
import { Socket } from 'effect/unstable/socket';

const consume = Effect.fn('Socket.consume')(function* (socket: Socket.Socket) {
	const pull = yield* Socket.readerString(socket);
	const writer = yield* socket.writer;
	yield* writer.write('subscribe'); // protocol-specific idempotent handshake
	yield* pull.pipe(
		Effect.flatMap((batch) => Effect.forEach(batch, Effect.logInfo)),
		Effect.forever
	);
}, Effect.scoped);

const reconnect = (socket: Socket.Socket) => consume(socket).pipe(
	Effect.retry({
		schedule: Schedule.exponential(Duration.millis(500)).pipe(Schedule.upTo({ times: 5 })),
		while: (error) => error.reason._tag === 'SocketCloseError' && error.reason.code !== 1000
	})
);
```

`new Socket.CloseEvent(1000, 'done')` requests a close through `writer.write`.
WebSocket close codes are protocol data; TCP does not transmit them. Prefer
writer-scope release for a graceful TCP half-close rather than a close event.

## Streams, channels, and framing

`Socket.toStream(socket)` provides read-only byte consumption.
`Socket.toChannel(socket)` connects outgoing upstream frames to incoming byte
batches; `toChannelString` converts incoming frames to strings. These adapters
fail on close. A finite input alone does not imply successful completion of a
bidirectional protocol: bound expected responses or explicitly handle closure.

For TCP message boundaries use `Ndjson.duplexSchema(Socket.toChannel(socket),
{ inputSchema, outputSchema })`, or `SchemaBinary.duplex` with compatible schemas.
WebSocket text frames may use `Ndjson.duplexSchemaString` when NDJSON is the
agreed protocol. Decode unknown frames with schemas before domain processing.
MessagePack adapters are removed; SchemaBinary is a different wire format and
requires coordinated peer and persisted-data migration.

`Socket.make({ reader, writer })` is the custom-adapter boundary. Its reader must
fail suspended pulls when the acquisition scope closes; otherwise downstream
channel shutdown hangs. Prefer built-in adapters for platform transports.

## Servers and bound addresses

`NodeSocketServer.make({ port: 0 })` / `.layer(...)` bind TCP or Unix listeners.
Use `makeTls` / `layerTls` for TLS and `makeWebSocket` / `layerWebSocket` for
WebSockets. Bun exposes the shared API under `BunSocketServer`.

Fork `server.run(handler)` into the server scope; it does not complete normally.
Each accepted socket pauses until its reader takes ownership. Scope each handler's
reader/writer with `Effect.scoped`. Handler errors are reported by the server
rather than becoming accept-loop failures; add application-level supervision
where they must stop the service. HTTP upgrades yield the same Socket interface;
see `effect-http-server`.

Server addresses are `NetAddress.SocketAddress` from `effect/unstable/net`.
Narrow to `InetAddress` before reading `port`; format its IP with `formatIp`,
or use `formatHost` when passing a host and port separately (preserves IPv6 scopes).
Unix path addresses expose `path`. Use `inetAddressFromHostString` to parse numeric
hosts and `scopeIdsFromInterfaces` with supplied interface data for named zones.
URL helpers bracket IPv6 and reject scoped IPv6; do not assemble URLs by casting
an address to the removed `TcpAddress` type.

## Higher-level transports and tests

- RPC: `RpcClient.layerProtocolSocket` and `RpcServer.layerProtocolSocketServer`;
  provide matching `RpcSerialization` layers and the socket/server layer.
- Cluster: `NodeClusterSocket` / `BunClusterSocket`; SchemaBinary is the default,
  NDJSON is explicitly selectable.
- In-memory tests: `Socket.fromTransformStream` wraps a readable/writable pair;
  end-of-input is still a close failure. Bound the read or handle the close reason.
- Integration tests: use a loopback listener on port 0, scope both sides, assert
  message order, close/error propagation, and interruption cleanup.

Completion: every connection has one reader owner, writes have an active reader,
frames are decoded, retries reacquire resources, and shutdown releases both sides.
