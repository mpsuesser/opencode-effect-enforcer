# Effect 4.0.0-rc.116 → 4.0.0

## Provenance and release scope

- Previous dependency: `effect@4.0.0-rc.116`.
- Target: **`effect@4.0.0`, the first stable v4 release** and npm's `latest`
  dist-tag, checked on 2026-10-02. The `rc` tag remains rc.118; it is not the target.
- npm publication: 2026-10-01 at 03:11:28 UTC. The GitHub release is explicitly
  non-prerelease, published at 01:47:13 UTC. The release commit is dated September 30.
- Exact source: [`effect@4.0.0`](https://github.com/Effect-TS/effect/tree/effect%404.0.0),
  commit `67ba4e46a11ccda0b6761578bfd22c04ae00167d`.
- [Official release](https://github.com/Effect-TS/effect/releases/tag/effect%404.0.0).
- [Complete source comparison](https://github.com/Effect-TS/effect/compare/effect%404.0.0-rc.116...effect%404.0.0).
- [Full upstream release notes](effect-4.0.0-changelog.md): **93 complete release
  sections across 31 packages**, including dependency-only entries and the stable
  release overview. All rc.117, rc.118, and 4.0.0 sections are included; rc.116 is
  excluded. Only trailing whitespace is normalized.
- Previous audit: [rc.112 → rc.116](effect-4.0.0-rc.116.md).

The moving source reference was already ahead of the release. Contracts were
checked against the exact tag rather than importing subsequent main-branch fixes.
The stable release overview describes some features introduced before rc.116;
the individual entries and source comparison identify this migration's changes.

## Alignment decisions

| Area | Alignment |
| --- | --- |
| Packaging | Pin the dependency and lockfile to 4.0.0. Remove the `unstable` import segment throughout live examples, module augmentations, source references, and test fixtures. Use `effect/http-api`, root `Arbitrary`, and format-specific binary-text encoding modules. |
| Stability | Stable package publication does not stabilize every API. `@stability unstable` APIs may break in minor releases; unmarked APIs follow semver. Directly consumed Effect-family packages use the same version. |
| Schema | Rename range/string checks; document Unicode units and JSON Schema approximations, persisted check IDs, single/type-only brands, representation round trips, and current issue constructors. |
| Configuration and CLI | Document dependent configuration, whole-group defaults, fallback-result semantics, and negative-number lexing. |
| Lifetimes and concurrency | Align partition ordering, closeable scopes, cache waiter ownership, zero-TTL preloading, runtime disposal, queue terminal batches, PubSub completion, races, and bounded repetition. |
| HTTP and RPC | Isolate entrypoint routers, place routes/protocols in the served app, share stateful services at the parent boundary, expose slot-specific parsing, preserve WebSocket exits, and distinguish missed pongs from connection-open retries. |
| SQL and workflow | Review savepoint release, failed COMMIT behavior, PostgreSQL session retirement and row codecs, workflow execution-ID derivation, reset retries, and conditional reply clearing. |
| AI and MCP | Align Toolkit service/error requirements, Decision probability options, streaming deltas, provider compatibility, object-root schemas, and version-specific MCP results/errors. |
| Reactive state and telemetry | Review registry ownership, SWR refresh timing, concurrent atom calls, batching, SSR hydration, and OTLP response draining/flush lifetimes. |
| Platform examples | Correct stale byte-size, error, scoped-resource, service-wiring, and process-output examples while retaining the platform abstraction boundaries. |
| Pattern feedback | Update positive guidance and fixtures to current APIs. Correct construction, decoding, randomness, ordering, defect-handling, service-definition, and HTTP retry examples. Keep the existing detector inventory. |

## Complete audit inventory

Five independently assigned audits covered all **53 skill directories (54 Markdown
files)**. The integration review covered all **45 pattern definitions**, all
**four guidance documents**, the runtime's Effect references, dependency wiring,
and detector fixtures. The historical essays remain conceptual material; current
baseline and API policy live in the two active guidance documents.

The following table accounts for every skill directory (`effect-` prefix omitted).
Files with unchanged contracts were reviewed without cosmetic edits.

| Skill directories | Review focus |
| --- | --- |
| schema-v4, schema-composition, domain-modeling, domain-predicates, pattern-matching, optics, typeclass-design, graph | Schema contracts, brands, predicates, transformations, representations, orders, and unchanged graph/optic APIs. |
| config, cli, testing | Config source/fallback behavior, argument lexing, native Arbitrary, Vitest fixtures, and effectful TestSchema assertions. |
| http-api, http-client, http-server, rpc-api, rpc-client, rpc-server, rpc-cluster, sql, workflow, socket | Router ownership, transport/protocol contracts, parsing, network address representation, transaction/session safety, and durable state compatibility. |
| ai-chat, ai-language-model, ai-prompt, ai-provider, ai-streaming, ai-tool, mcp-server | Model/tool requirements, provider translations, response histories, streaming, and MCP protocol versions. |
| atom-rpc, atom-state, react-composition, observability, wide-events | Reactive lifecycle, React peers, registry/hydration, exporters, and wide-event guidance including its accompanying article. |
| cache, batching, layer-design, scope, service-implementation, context-witness, managed-runtime, incremental-migration | Acquisition/interruption, memoization, dependency capture, runtime ownership, and boundary integration. |
| fiber, parallelization, concurrency-testing, pubsub-event-bus, stream, scheduling, error-handling | Partition order, cancellation/cleanup, queue completion, scheduling, typed failures, and defects. |
| filesystem, path, platform-abstraction, platform-layers, command-executor | File and process services, portable paths, errors, byte sizes, test doubles, layer precedence, and output draining. |

## Compatibility considerations

- This plugin directly depends only on `effect` from the Effect family. Companion
  libraries in examples are reviewed against 4.0.0 source; they are not added as
  plugin runtime dependencies.
- TypeScript 5.9 or newer is required. The repository already satisfies that
  minimum. `@effect/vitest` and `@effect/doctest` require Vitest 5; this repository
  uses plain Vitest without those adapters, so its runner need not change.
- `@effect/atom-react` requires React 19. Deno adapters require Deno 2.8.3 or newer.
- Removed module paths are not aliases. Update module augmentations and tooling
  references along with source imports. HTTP API runtime identities and its
  reserved streaming failure event use `http-api` too.
- Schema check IDs in persisted representations changed with the check names;
  type-only brands do not survive representation serialization. Reapply nominal
  brands after rebuilding, and migrate stored check IDs where applicable.
- Workflow execution IDs now hash length-prefixed tags/idempotency keys. Existing
  persisted runs and deferred tokens need an explicit compatibility decision;
  unchanged business idempotency strings do not imply unchanged execution IDs.
- Hash values can change. Do not treat Effect hash output as a stable persisted
  identifier or wire format.

## Verification scope

The documentation test checks core Effect import entrypoints and named exports
in every TypeScript/TSX fence across skills, patterns, and guidance. It also
compiles each explicitly marked, independent example with strict TypeScript
options against the installed stable release. Illustrative fragments may rely
on surrounding declarations or intentionally show unsupported code; they are
not all standalone programs.

Release-note completeness is checked against every package changelog at the
target tag. Source-diff and removed-export scans complement the semantic audits.
The detector tests retain bidirectional pattern inventory and README catalog
coverage. Companion-package examples are source-reviewed rather than tested
against live providers, databases, or OS transports.

Final integration verification on 2026-10-02:

- `bun run check` — passed formatting, lint, and project typechecking.
- `bun run test` — **912 tests passed across 53 test files**.
- Documentation compilation — **90 marked examples and 1,096 core Effect import
  declarations** checked against installed `effect@4.0.0`.
- `git diff --check` — passed.
- Release-note comparison — all **93 section bodies across 31 packages** match
  the exact tag, after trailing-whitespace normalization.
- Live-content scans — no removed `effect/unstable/*` or `effect/httpapi` paths,
  rc.116 baseline declarations, or renamed Schema check calls remain. Historical
  audits and verbatim upstream changelogs retain their original references.
