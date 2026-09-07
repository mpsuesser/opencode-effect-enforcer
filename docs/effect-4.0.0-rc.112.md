# Effect 4.0.0-rc.111 → 4.0.0-rc.112

## Version and provenance

- Previous direct dependency: `effect@4.0.0-rc.111`.
- Target: `effect@4.0.0-rc.112`, the npm `rc` dist-tag checked on 2026-09-06.
- Rechecked on 2026-09-07: `rc` remains rc.112; `latest` is the separate v3 line (`3.22.1`).
- Exact source: [`effect@4.0.0-rc.112`](https://github.com/Effect-TS/effect/tree/effect%404.0.0-rc.112), release commit `2600f62f`.
- [Complete source comparison](https://github.com/Effect-TS/effect/compare/effect%404.0.0-rc.111...effect%404.0.0-rc.112).
- [Upstream Effect changelog](https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.112/packages/effect/CHANGELOG.md).

The interval is **exclusive of rc.111 and inclusive of rc.112**: one release.
The notes below retain every upstream Effect release entry and every additional
companion-package change. Dependency-only companion releases are recorded in the
package table. Earlier beta/RC corrections found during this repository's audit
are separate from the upstream release notes.

## Full upstream Effect release notes

### Minor Changes

- [#7390](https://github.com/Effect-TS/effect/pull/7390) [`a5f78d3`](https://github.com/Effect-TS/effect/commit/a5f78d3fcbaa792d49e80d103ab438e0b50812fd) Thanks @tim-smart! - Make RPC serialization schema-aware.

  Add `codecFor` to RPC serialization and client/server protocols so RPC and cluster
  network payloads use the transport's schema codec. Framing, cluster storage, and
  existing built-in wire formats remain unchanged.

### Patch Changes

- [#7411](https://github.com/Effect-TS/effect/pull/7411) [`20cb4f2`](https://github.com/Effect-TS/effect/commit/20cb4f260e45d37fa417c292c57be015314efe16) Thanks @altendky! - Add `RcMap.getOption` and `LayerMap.contextEffectOption` for atomically retaining
  entries only when they are already cached.

- [#7437](https://github.com/Effect-TS/effect/pull/7437) [`44675cb`](https://github.com/Effect-TS/effect/commit/44675cbce3dabfb85c68a3703b5de525768336fb) Thanks @wmaurer! - Add an optional `description` to `AiError.AuthenticationError`, rendered after the kind-based suggestion, and pass the provider's own error text through it on HTTP 401 and 403, so authentication failures report what actually went wrong instead of only a category.

- [#7393](https://github.com/Effect-TS/effect/pull/7393) [`b6bf5e1`](https://github.com/Effect-TS/effect/commit/b6bf5e14492643076454131148f97cde24ad5306) Thanks @wmaurer! - Fix `Prompt.autoComplete` swallowing `j` and `k` while typing a filter query.

- [#7401](https://github.com/Effect-TS/effect/pull/7401) [`0b9f780`](https://github.com/Effect-TS/effect/commit/0b9f780ff28b71042241791a9e8bcb5b631be2bd) Thanks @gjermundgaraba! - Retry transient EventLog remote write failures so pending local entries are synchronized after recovery.

- [#7384](https://github.com/Effect-TS/effect/pull/7384) [`150e92c`](https://github.com/Effect-TS/effect/commit/150e92c4169c245e701da02575eef0b69c3ecd64) Thanks @tim-smart! - Improve synchronous Schema decode and encode performance by preserving completed parser exits and using a direct loop for common struct parsers.

- [#7386](https://github.com/Effect-TS/effect/pull/7386) [`6740db2`](https://github.com/Effect-TS/effect/commit/6740db247ed20cb85da43c9f48ade8fecfd8c1ae) Thanks @tim-smart! - Add `Schema.TaggedUnion.matchOrElse` for partial case matching with a typed fallback.

- [#7389](https://github.com/Effect-TS/effect/pull/7389) [`d57bba1`](https://github.com/Effect-TS/effect/commit/d57bba1486fa60971b6e0bf7459a329cfd5acdc4) Thanks @tim-smart! - Improve `SchemaError` construction performance by skipping stack frame capture.

- [#7402](https://github.com/Effect-TS/effect/pull/7402) [`be75d5e`](https://github.com/Effect-TS/effect/commit/be75d5ea6e516c25e3affec25806d31c2b203bc4) Thanks @tim-smart! - Improve Pool acquisition and release performance. Pool now tracks usage
  incrementally, stores available items in an intrusive FIFO, and skips work for
  fixed and empty pools. This changes the public `Pool.State` and `Pool.PoolItem`
  interfaces.

- [#7402](https://github.com/Effect-TS/effect/pull/7402) [`be75d5e`](https://github.com/Effect-TS/effect/commit/be75d5ea6e516c25e3affec25806d31c2b203bc4) Thanks @tim-smart! - Add `Pool.use`, which borrows an item while an effect runs and returns it on any
  exit. Unlike `Effect.scoped(Pool.get(pool))`, it does not require a `Scope`.

- [#7402](https://github.com/Effect-TS/effect/pull/7402) [`be75d5e`](https://github.com/Effect-TS/effect/commit/be75d5ea6e516c25e3affec25806d31c2b203bc4) Thanks @tim-smart! - Reduce scoped resource acquisition allocations by storing the first Scope
  finalizer inline and allocating a Map only when a second is added. This changes
  the public `Scope.State.Open` interface.

- [#7424](https://github.com/Effect-TS/effect/pull/7424) [`02a5146`](https://github.com/Effect-TS/effect/commit/02a5146d6933c7f6052553550bce5658225e4100) Thanks @tim-smart! - Skip remote event journal write callbacks when there are no uncommitted entries and return an `Option` indicating
  whether the callback ran.

- [#7312](https://github.com/Effect-TS/effect/pull/7312) [`15272a6`](https://github.com/Effect-TS/effect/commit/15272a66adf02501e7747761e2a3c41bff67bb46) Thanks @godu! - Fix shell completion for choice values containing quotes, spaces, word-break characters, Unicode, and shell metacharacters.

  Bash now quotes candidates for readline, keeps choice values intact when reconstructing words, and supports Bash 3.2 without associative arrays. Fish and Zsh escape choices across both parsing rounds, and Fish hides value-taking flags after use without suppressing their value completions.

- [#7395](https://github.com/Effect-TS/effect/pull/7395) [`436f10d`](https://github.com/Effect-TS/effect/commit/436f10d1efccec308426532ff3f88df9a96434f3) Thanks @wmaurer! - Fix `Prompt.file` swallowing `j` and `k` while typing a filter query.

- [#7406](https://github.com/Effect-TS/effect/pull/7406) [`058fb15`](https://github.com/Effect-TS/effect/commit/058fb15647fa01ad771277bd368783fcf5f262e8) Thanks @gcanti! - Preserve finite string and unique symbol key unions in the return types of `Array.groupBy` and `Iterable.groupBy`.

  Previously, grouping widened finite keys to `string` or `symbol`, which lost known-key autocomplete and allowed access to keys that the selector could never produce. The new `Record.ReadonlyRecord.GroupByResult` keeps finite keys and marks their properties optional because any group may be absent at runtime, while open `string` and `symbol` selectors retain their existing record index signatures.

- [#7415](https://github.com/Effect-TS/effect/pull/7415) [`4d89bb8`](https://github.com/Effect-TS/effect/commit/4d89bb8ffb4cf567a1d11072246b6161ce638712) Thanks @gcanti! - Reject unsupported JSON Schema references instead of resolving them by their final path segment, closes [#7409](https://github.com/Effect-TS/effect/issues/7409).

- [#7420](https://github.com/Effect-TS/effect/pull/7420) [`480fb15`](https://github.com/Effect-TS/effect/commit/480fb156590785cf98f67bdec4fc282a608e2d87) Thanks @gcanti! - Make JSON Schema dialect conversions preserve custom keywords, translate conditionals, contains, dependencies, identifiers, and tuples where representable, relocate local references after structural changes, and throw instead of silently changing unsupported constraints.

- [#7417](https://github.com/Effect-TS/effect/pull/7417) [`f77ec19`](https://github.com/Effect-TS/effect/commit/f77ec19cff1cbbeeae928e3bd0ece00a7d22bab8) Thanks @Makisuo! - Defer built-in OpenAPI response generation until the documentation route is first requested, retrying after generation defects.

- [#7388](https://github.com/Effect-TS/effect/pull/7388) [`925b82a`](https://github.com/Effect-TS/effect/commit/925b82a81f59a4d459b488621030f24ba99d6a27) Thanks @ebramanti! - Fix MCP initialize rejected over the protocol version header

  `McpServer.layerHttp` validated the `MCP-Protocol-Version` header on every POST, including
  the `initialize` request. That header reports the version negotiated by an earlier
  `initialize`, so on a fresh connection a client can only send its own default. Whenever
  that default was not among the server's registered protocols the `initialize` returned
  `400` and never reached version negotiation, even when the body offered a version the
  server supports.

  The header check now applies only to requests after initialization, where the
  specification requires it. An `initialize` negotiates from the version offered in its
  body, through the protocol registry, and reports the selected version in the response.

- [#7403](https://github.com/Effect-TS/effect/pull/7403) [`7455246`](https://github.com/Effect-TS/effect/commit/7455246f352385f5cbbdd8299555265ee289490e) Thanks @hsyntax! - Add support for explicit cache breakpoints on the OpenAI responses API for GPT-5.6-or-later.

- [#7442](https://github.com/Effect-TS/effect/pull/7442) [`118124d`](https://github.com/Effect-TS/effect/commit/118124d913d0a02ac5c1f7799a39bd90031769d9) Thanks @tim-smart! - Redact password prompt values from CLI wizard command output.

- [#7366](https://github.com/Effect-TS/effect/pull/7366) [`0dd7825`](https://github.com/Effect-TS/effect/commit/0dd7825e4da4d3a00fa9bd410a1d55f3d4874d07) Thanks @tim-smart! - Add `SchemaBinary`, a compact schema-derived codec with streaming, optional fingerprints and dictionaries, and RPC support.

- [#7404](https://github.com/Effect-TS/effect/pull/7404) [`b722eca`](https://github.com/Effect-TS/effect/commit/b722eca6d283a88970ad0efba0b4e921915eca78) Thanks @gcanti! - Add a public `StandardSchema` module containing the vendored Standard Schema V1 specification and remove the direct dependency on `@standard-schema/spec`.

- [#7436](https://github.com/Effect-TS/effect/pull/7436) [`811d579`](https://github.com/Effect-TS/effect/commit/811d579c432856a9e3fc05b517fd8e924cbf991a) Thanks @gcanti! - Fix JSON Schema imports:

  - Type-specific keywords no longer imply a type. For example, `minLength` validates strings without rejecting
    non-string values.
  - Constraints next to `const`, `enum`, and `$ref` are now applied instead of being ignored.
  - Disjoint and linear union intersections are imported without a Cartesian expansion. Other overlapping union
    intersections fail with an explicit error.
  - References to definitions without unions no longer make otherwise linear intersections fail.
  - Imported `oneOf` schemas remain `oneOf` when exported again.
  - `minItems` is preserved when `prefixItems` does not fully enforce it.

- [#7382](https://github.com/Effect-TS/effect/pull/7382) [`043b587`](https://github.com/Effect-TS/effect/commit/043b587e6e93f6624bf974bcd7ed976eaa17f0e1) Thanks @tim-smart! - Replace per-prompt prefix options with a context-based theme for CLI prompt symbols and colors.

- [#7373](https://github.com/Effect-TS/effect/pull/7373) [`8583727`](https://github.com/Effect-TS/effect/commit/85837274fa929a921985464585513a68c261e365) Thanks @ChubbyDuck! - Drop unreachable concurrency guard in iteratorEagerImpl

- [#7429](https://github.com/Effect-TS/effect/pull/7429) [`d9d2cfc`](https://github.com/Effect-TS/effect/commit/d9d2cfcb732754001b7323cf8afaccc48539bb74) Thanks @gcanti! - Reject unsupported JSON Schema validation keywords and object or array `const` / `enum` values during import instead of
  silently weakening validation.

- [#7428](https://github.com/Effect-TS/effect/pull/7428) [`5c4b7a0`](https://github.com/Effect-TS/effect/commit/5c4b7a0b17931cd1538c6595a54b21ffe9c1e906) Thanks @ebramanti! - Return workflow execution IDs from generated RPC and HTTP discard endpoints.

## Additional companion-package release notes

The four AI provider packages repeat #7437 above; `@effect/ai-openai` also
repeats #7403. The remaining non-dependency entries are reproduced here:

- **`@effect/atom-react`** — [#7435](https://github.com/Effect-TS/effect/pull/7435) [`4148e21`](https://github.com/Effect-TS/effect/commit/4148e21eb5f86ef37e07086ec9f3cc7e55d24e90) Thanks @mattrobrob! - Relax react peer dependency range
- **`@effect/platform-bun`** — [#7408](https://github.com/Effect-TS/effect/pull/7408) [`e1fb57f`](https://github.com/Effect-TS/effect/commit/e1fb57ffbf3cef2dd3016bacd26a4166a52618b7) Thanks @phibr0! - Compress outgoing Bun WebSocket messages when per-message deflate is configured and negotiated. Messages
  smaller than 1 KiB are left uncompressed, matching the default threshold used by Node's `ws` server.
  The threshold is configurable via the new `websocket.compressionThreshold` server option.
- **`@effect/platform-node`** — [#7440](https://github.com/Effect-TS/effect/pull/7440) [`7d8535a`](https://github.com/Effect-TS/effect/commit/7d8535af823a0186f771a78a02fa07dbee706df9) Thanks @tim-smart! - Return `Option.none()` when reading an incoming message's remote address after Node clears its socket.
- **`@effect/sql-d1`, `@effect/sql-mysql2`, `@effect/sql-pglite`, `@effect/doctest`** — [#7421](https://github.com/Effect-TS/effect/pull/7421) [`1f686d9`](https://github.com/Effect-TS/effect/commit/1f686d99a79e36ef144bd9ad6f4141a5a43d2599) Thanks @tim-smart! - Update production dependencies to their latest releases.
- **`@effect/sql-pg`** — [#7391](https://github.com/Effect-TS/effect/pull/7391) [`1144032`](https://github.com/Effect-TS/effect/commit/1144032cedda7b5eacc1ebf980d06957c7a59ddf) Thanks @tim-smart! - Add low-level PostgreSQL protocol, binary type, and authentication codecs to `@effect/sql-pg`.

  `PgProtocol` encodes protocol 3.0 messages and incrementally parses backend frames. Its stateful parser throws terminal errors. `PgTypes` handles binary scalar and one-dimensional array OIDs; its public codecs return typed `Result` failures, while parser field readers use an internal throwing fast path. `PgAuth` implements MD5 and SCRAM-SHA-256 with typed `Result` failures.

  Encoded frames and decoded byte fields are stable views over internal buffers. Copy data that must outlive its message. `PgClient` remains unchanged and still uses `pg` at runtime.

### Complete companion release inventory

All packages below move from `4.0.0-rc.111` to `4.0.0-rc.112` and update their
Effect dependency to rc.112. Paths link to the exact-tag changelogs, including
their full repeated dependency commit lists. “Dependency only” means no separate
feature/fix release note; it does not assert that every source file is identical.

| Package | Additional notes | Other Effect-family dependency updates |
| --- | --- | --- |
| [@effect/ai-anthropic](https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.112/packages/ai/anthropic/CHANGELOG.md) | #7437 | — |
| [@effect/ai-openai](https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.112/packages/ai/openai/CHANGELOG.md) | #7437, #7403 | — |
| [@effect/ai-openai-compat](https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.112/packages/ai/openai-compat/CHANGELOG.md) | #7437 | — |
| [@effect/ai-openrouter](https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.112/packages/ai/openrouter/CHANGELOG.md) | #7437 | — |
| [@effect/atom-react](https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.112/packages/atom/react/CHANGELOG.md) | #7435 | — |
| [@effect/atom-solid](https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.112/packages/atom/solid/CHANGELOG.md) | Dependency only | — |
| [@effect/atom-vue](https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.112/packages/atom/vue/CHANGELOG.md) | Dependency only | — |
| [@effect/opentelemetry](https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.112/packages/opentelemetry/CHANGELOG.md) | Dependency only | — |
| [@effect/platform-browser](https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.112/packages/platform/browser/CHANGELOG.md) | Dependency only | — |
| [@effect/platform-bun](https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.112/packages/platform/bun/CHANGELOG.md) | #7408 | platform-node-shared |
| [@effect/platform-deno](https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.112/packages/platform/deno/CHANGELOG.md) | Dependency only | platform-node-shared |
| [@effect/platform-node](https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.112/packages/platform/node/CHANGELOG.md) | #7440 | platform-node-shared |
| [@effect/platform-node-shared](https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.112/packages/platform/node-shared/CHANGELOG.md) | Dependency only | — |
| [@effect/sql-clickhouse](https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.112/packages/sql/clickhouse/CHANGELOG.md) | Dependency only | platform-node |
| [@effect/sql-d1](https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.112/packages/sql/d1/CHANGELOG.md) | #7421 | — |
| [@effect/sql-libsql](https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.112/packages/sql/libsql/CHANGELOG.md) | Dependency only | — |
| [@effect/sql-mssql](https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.112/packages/sql/mssql/CHANGELOG.md) | Dependency only | — |
| [@effect/sql-mysql2](https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.112/packages/sql/mysql2/CHANGELOG.md) | #7421 | — |
| [@effect/sql-pg](https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.112/packages/sql/pg/CHANGELOG.md) | #7391 | — |
| [@effect/sql-pglite](https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.112/packages/sql/pglite/CHANGELOG.md) | #7421 | — |
| [@effect/sql-sqlite-bun](https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.112/packages/sql/sqlite-bun/CHANGELOG.md) | Dependency only | — |
| [@effect/sql-sqlite-do](https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.112/packages/sql/sqlite-do/CHANGELOG.md) | Dependency only | — |
| [@effect/sql-sqlite-node](https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.112/packages/sql/sqlite-node/CHANGELOG.md) | Dependency only | — |
| [@effect/sql-sqlite-react-native](https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.112/packages/sql/sqlite-react-native/CHANGELOG.md) | Dependency only | — |
| [@effect/sql-sqlite-wasm](https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.112/packages/sql/sqlite-wasm/CHANGELOG.md) | Dependency only | — |
| [@effect/docgen](https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.112/packages/tools/docgen/CHANGELOG.md) | Dependency only | platform-node |
| [@effect/doctest](https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.112/packages/tools/doctest/CHANGELOG.md) | #7421 | — |
| [@effect/openapi-generator](https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.112/packages/tools/openapi-generator/CHANGELOG.md) | Dependency only | platform-node |
| [@effect/vitest](https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.112/packages/vitest/CHANGELOG.md) | Dependency only | — |

## Migration map for this repository

The release was audited from the exact tag, including public signatures and
implementation semantics. Moving `main` was already ahead of the release and was
not used to infer rc.112 availability. The local runtime typechecks with rc.112
without source changes; the dependency/lockfile update is the runtime migration.

| Surface | Required action / guidance | Owning skills |
| --- | --- | --- |
| Schema-aware RPC | Forward required `codecFor` on custom client/server protocols; preserve schema services. Existing built-in formats retain their encoding; cluster storage stays JSON. | `effect-rpc-api`, `effect-rpc-client`, `effect-rpc-server`, `effect-rpc-cluster`, `effect-atom-rpc` |
| Binary schemas | Public `SchemaBinary.toCodec`, streaming channels, incremental parsing, fingerprints, dictionary lifetime, frame limits, and buffer ownership; avoid exported `@internal` fast paths. | `effect-schema-composition`, `effect-schema-v4`, `effect-stream` |
| Schema semantics | `matchOrElse` overloads and fallback narrowing, strict JSON Schema imports/conversions, vendored Standard Schema types, stack-free SchemaError. | `effect-schema-v4`, `effect-pattern-matching`, `effect-domain-modeling` |
| Resource ownership | Atomic cached-only retention with `RcMap.getOption` / `LayerMap.contextEffectOption`, `Pool.use`, and changed public Pool/Scope state interfaces. | `effect-cache`, `effect-layer-design`, `effect-scope`, `effect-service-implementation` |
| CLI | Replace `prefix` with `theme`, context/local precedence, filter navigation, password wizard redaction, and shell completion escaping. | `effect-cli` |
| AI | Authentication descriptions preserve provider text; OpenAI Responses GPT-5.6+ explicit cache configuration and prompt breakpoints. | `effect-ai-provider`, `effect-ai-prompt` |
| Event replication | Empty remote batches skip callbacks and return `None`; non-empty callbacks return `Some`; transient remote writes retry and synchronize pending entries. | `effect-rpc-cluster` |
| Workflow proxies | Generated RPC/HTTP discard endpoints return string execution IDs; distinguish these endpoints from client-side response-discard options. | `effect-workflow`, `effect-rpc-cluster`, `effect-atom-rpc` |
| HTTP / MCP | Lazy OpenAPI generation retries after defects; MCP initialize negotiates from body before header validation; Bun WebSocket compression threshold and missing Node remote addresses. | `effect-http-api`, `effect-mcp-server`, `effect-http-server` |
| Collections | Finite `groupBy` keys remain finite and optional; consumers handle absent groups. | `effect-domain-modeling` |
| PostgreSQL | Public `PgProtocol`, `PgTypes`, `PgAuth`; synchronous parser vs typed Result failures and buffer ownership. `PgClient` still uses `pg`. | `effect-sql` |
| Companion peers | React peer range is `>=19.0.0 <20.0.0`; the rc.112 Vitest adapter requires `>=4.1.0 <5.0.0`. | `effect-atom-state`, `effect-testing` |

## Earlier documentation drift corrected during the audit

These are **not new rc.112 breaking changes**:

- Correct `Schema.Schema<T>` versus `Schema.Codec<T, E, RD, RE>` signatures.
  Constructor defaults, including tags, are not automatically decoding defaults;
  `.makeEffect` belongs to the schema instance and fails with `SchemaIssue.Issue`.
- Replace the repetitive domain-modeling templates with a coherent, compiler-
  checked class-based lifecycle: branded identity, legal transitions, class-
  preserving construction, schema equivalence, orders, optional fields, and
  recursive encoded types. Remove the invalid “change only `_tag`” transition.
- Correct `Stream.mapArrayEffect`, `Effect.andThen`, `Effect.catch`,
  `Effect.catchCause`, `Effect.mapError` + `orDie`, `Effect.die`, and `runFold`'s
  initial-value thunk. AI streaming examples now scope accumulators per run and
  release semaphore permits even if history setup fails.
- Yield a Toolkit and provide its handler Layer; use `Tool.HandlerServices` and
  error schemas rather than instance-only JSON checks. The complete tool example
  uses a typed service implementation instead of unchecked database casts.
- Replace the incomplete Deferred/fiber deduplication example with `Effect.cached`;
  explain that caches and restartable worker coordinators have different contracts.
- Distinguish complete `Layer.succeed` fakes from partial, defect-stubbing
  `Layer.mock`; preserve deliberate caller-scoped service requirements.
- Correct RPC abort inspection (`onExit`, interrupt-reason annotations) and HTTP
  streaming semantics: bounded framed response queues backpressure producers even
  without RPC acks. Discarded responses do not erase transport failures.
- Correct v4 test utilities (`Result`, `TxRef` / `Effect.tx`, `Logger.layer`,
  `Fiber.await`), lexical scope in the event-publisher test, and interruption
  assertions. Keep this repository's existing Vitest runner for compiler/inventory
  tests; installing `@effect/vitest` would require a separate peer-version migration.
- Apply Effect.fn result transformations in its constructor call and use a
  Duration-input `Metric.timer` with `Effect.trackDuration`; correct the
  `timeoutOrElse` option to `orElse`.
- Repair flattened upstream platform paths and remove tool-specific/stale
  line-number references from core guidance.

## Coverage and intentionally retained material

The changed-surface and qualified-symbol scan covered **all 53 remaining bundled
skills, 45 patterns, four guidance documents, and runtime source**. Findings were checked
against exact-tag exports/signatures before edits; aliases, re-exports, custom
application services, and explicitly obsolete examples are not missing APIs.

**35 skills changed.** In addition to the migration-map owners, corrective edits
cover `effect-ai-language-model`, `effect-ai-streaming`, `effect-ai-tool`,
`effect-concurrency-testing`, `effect-domain-predicates`, `effect-error-handling`,
`effect-http-client`, `effect-platform-abstraction`, `effect-platform-layers`,
`effect-scheduling`, and `effect-socket`.

The other **18 skills** had no migration requirement identified by this release
surface/symbol audit: `effect-ai-chat`, `effect-batching`,
`effect-command-executor`, `effect-config`, `effect-context-witness`,
`effect-fiber`, `effect-filesystem`, `effect-graph`, `effect-incremental-migration`,
`effect-managed-runtime`, `effect-observability`, `effect-optics`,
`effect-parallelization`, `effect-path`, `effect-pubsub-event-bus`,
`effect-react-composition`, `effect-typeclass-design`, and
`effect-wide-events`. Their relevant new cross-cutting semantics live in the
owning skills above rather than duplicated release notes in every file.

**Five retained patterns changed:**

- `require-effect-concurrency`: detect the removed literal `concurrency: 'inherit'`
  in addition to missing explicit concurrency. Regression cases cover data-first,
  curried, quoted-key, and unrelated-string cases.
- `avoid-direct-tag-checks`: correct the false claim that TypeScript cannot narrow
  tags; recommend schema match/guards and explain `matchOrElse`.
- `effect-run-in-body`: use the platform `BunRuntime.runMain` boundary.
- `use-console-service`: correct TestConsole capture APIs and distinguish console
  capture from structured log capture.
- `avoid-react-hooks`: direct shared state/effect guidance to Effect Atom in
  ordinary state modules, with React-specific hook use reviewed contextually.

The other 40 detector definitions require no rc.112 API migration. All 45 retain
their one-to-one detector tests and README catalog entries.

**Two guidance documents changed:** core Effect-first conventions and
version-aware progressive disclosure/routing. Both bundled essays retain their
original text.

At the user's request, the `effect-react-vm` skill, `vm-in-wrong-file` pattern,
and its detector test were removed. Atom RPC cross-links now point directly to
`effect-atom-state`. The catalog contains **53 skills, 45 patterns, and four
guidance documents**.

## Verification

`test/documentation-types.test.ts` compiles the **14 self-contained TypeScript
blocks** marked `<!-- typecheck -->` directly from their Markdown source. It
uses the installed pinned Effect release with strict types, exact optional
properties, and unchecked-index checking. Virtual modules keep normal package
resolution; no generated source/distribution files are committed. A malformed
marker/fence fails the test instead of silently dropping coverage.

The checked blocks cover binary codec/channel round trips, pool borrowing,
cached-only retention, task construction/transitions/recursion, tagged matching,
cache layer composition, RPC abort inspection, tool handler wiring, streaming
history ownership, and workflow logging/metrics. Partial snippets, intentionally
bad examples, conceptual pseudocode, and examples needing optional companion
packages are reviewed guidance, not part of this compiler gate. The gate does
not claim to execute every documentation example or replace upstream integration
tests.

Repository completion commands:

```sh
bun run check
bun run lint
bun run test
```

Verified on 2026-09-07 after the VM-related removals:

- `bun run check` passed formatting, lint, and TypeScript checks.
- `bun run lint` passed with zero warnings and errors.
- `bun run test` passed **912 tests across 53 test files**, including all 14
  marked documentation examples and the 53-skill / 45-pattern / four-guidance
  inventory checks.
- `git diff --check` passed.

The full test suite includes the bidirectional pattern inventory, README/skill
inventory, runtime adapter tests, detector regressions, and documentation compiler
gate. Published files remain authoritative; `docs/` is included in the package
so this release record ships alongside the skills and guidance.
