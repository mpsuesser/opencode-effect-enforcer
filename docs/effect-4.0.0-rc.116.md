# Effect 4.0.0-rc.112 → 4.0.0-rc.116

## Provenance and release scope

- Previous dependency: `effect@4.0.0-rc.112`.
- Target: `effect@4.0.0-rc.116`, npm's `rc` dist-tag checked on 2026-09-18.
- npm's `latest` tag is the separate v3 line (`3.22.2`).
- Exact source: [`effect@4.0.0-rc.116`](https://github.com/Effect-TS/effect/tree/effect%404.0.0-rc.116), commit `d62dd0d65252e5d3635538f0e41adc7c08aa9beb`.
- [Complete source comparison](https://github.com/Effect-TS/effect/compare/effect%404.0.0-rc.112...effect%404.0.0-rc.116).
- [Full upstream release notes](effect-4.0.0-rc.116-changelog.md): 121 complete release sections across 31 packages, including dependency-only entries.

The interval includes rc.113, rc.114, rc.115, and rc.116. The changelog collection
was checked section-by-section against every package `CHANGELOG.md` at the target
tag. No upstream entry in that interval was omitted. Later releases supersede
earlier changes; notably PostgreSQL timestamp decoding and unknown-OID behavior
are documented using the final rc.116 contract.

## Changes applied

| Area | Alignment |
| --- | --- |
| Dependency and baseline | Pin Effect and lockfile to rc.116; update README and privileged baseline references. |
| Config and CLI | PascalCase scalar constructors, explicit Boolean defaults, typed arrays/records and ByteSize configuration. Update secret-config detector and fixtures. |
| Schema | Effectful transformations, standalone Getter combinators, native Arbitrary, parse options, class identity, revivers, AST contracts, template literals, JSON Schema and compilation. |
| Socket | Scoped pull readers, batched values, Writer objects, typed closure, backpressure, TLS/STARTTLS, addresses, framing, and reconnect ownership. |
| RPC and cluster | Replace MessagePack recommendations with SchemaBinary; preserve transport framing rules and codec selection; use cluster option `serialization: 'binary'`. |
| Filesystem and HTTP | ByteSize counts versus numeric buffer lengths and bigint seek offsets; HTTP schemas in Schema; NetAddress, eager web-handler construction, file/range responses, upgrades, parsing and SSE options. |
| PostgreSQL | Native PgConnection/PgPool, explicit JSON binding, preparation, registry codecs, final row representations, scoped notification queues, startup and TLS behavior. |
| AI and MCP | Branded service interfaces, opaque/encoded parameter modes, failure-result codecs/origins, DecisionModel, protocol adapters, strict tools, instructions, prompt titles, and stderr logging. |
| Streams and atoms | Lazy scan seeds, partition ordering/capacity, mapBoth names, targeted error handling, middleware errors, zero TTL, reactivity branding and dehydration. |
| Lifetimes and scheduling | Cache TTL by Exit, LayerMap acquisition errors, observer error types, process cleanup, timeout fallback lifetime, repeat metadata, rate-limiter store contract, durable queue policy. |
| Testing | Native Arbitrary sampling/property checks; adapter peer/runtime requirements; compiler-checked migration examples. |
| Writing | Remove release-qualified behavior from live skills, patterns, and guidance; retain version history here and in upstream release notes. |

## Content audit inventory

The audit covered all 53 bundled skill directories (54 Markdown files), all 45
pattern definitions, all four guidance documents, and the runtime source.
Removed public exports were compared between the exact old and new tags and
searched across the complete live content tree. Targeted scans also covered
lowercase Config/CLI constructors, callback sockets, MessagePack, fast-check,
service interface names, Stream scans, and filesystem sizes.

The following grouping records every skill directory; unchanged skills were
included in the compatibility scans rather than edited merely to mark an audit.

| Skill directories (`effect-` prefix omitted) | Review focus |
| --- | --- |
| schema-v4, schema-composition, domain-modeling, domain-predicates, pattern-matching, optics | Schema syntax, transformations, predicates, tagged unions and issue contracts. |
| config, cli | Constructor renames, defaults, prompts, collection configuration and secrets. |
| socket, filesystem, path, platform-abstraction, platform-layers, command-executor | Platform boundaries, scoped I/O, byte counts, address types and process lifetime. |
| http-api, http-client, http-server | HTTP schemas, parsing, server construction, transport errors, files, SSE and WebSocket upgrades. |
| rpc-api, rpc-client, rpc-server, rpc-cluster | Schema-aware serialization, framing, cluster defaults, storage and peer compatibility. |
| ai-chat, ai-language-model, ai-prompt, ai-provider, ai-streaming, ai-tool, mcp-server | Service types, provider responses, tool failures, decisions and MCP contracts. |
| atom-rpc, atom-state, react-composition | RPC/HTTP error channels, TTL, stream scan, React peer and reactive service contracts. |
| cache, batching, layer-design, scope, service-implementation, context-witness, managed-runtime, incremental-migration | Cached acquisition, service/layer patterns, resource ownership and runtime boundaries. |
| fiber, parallelization, concurrency-testing, pubsub-event-bus, stream, scheduling | Structured concurrency, stream operators, timing, retry and test synchronization. |
| testing, error-handling, observability, wide-events | Native property generation, error surfaces, logger configuration and instrumentation. |
| sql, workflow, graph, typeclass-design | Native database adapters, durable processing, graph and dual-helper compatibility. |

Patterns requiring content changes were `avoid-process-env`,
`prefer-redacted-config`, `avoid-direct-tag-checks`, `context-tag-extends`, and
`require-effect-concurrency`. The secret-config detector recognizes
`Config.String` and `Config.NonEmptyString`; its examples and regression cases
use the supported constructors. Bidirectional pattern/test inventory and README
catalog coverage remain required checks.

The active guidance baseline and examples were updated. Historical essays and
the earlier rc.112 audit retain their historical context.

## Compatibility decisions

- Keep directly consumed Effect-family packages on compatible release versions.
  This package directly depends only on `effect`; companion adapters are teaching
  material, not additional runtime dependencies.
- `@effect/vitest` requires Vitest `>=5.0.0 <6.0.0` and Node
  `^22.12.0 || ^24.0.0 || >=26.0.0`. This repository uses plain Vitest 3 and does
  not install that adapter; its own runner therefore remains unchanged.
- SchemaBinary is a wire/persistence format change, not a transparent replacement
  for existing MessagePack bytes. Coordinate peers and stored-data migration.
- Native PostgreSQL is a driver change. Validate row decoding, custom OIDs,
  preparation/pooler settings and notification recovery at consuming boundaries.
- The source reference's moving main branch is not the baseline. The exact tag
  takes precedence when source and prose disagree.

## Verification

- Changelog completeness: all 121 selected upstream sections matched the collected
  text across 31 package changelogs.
- Removed-export scan: no old-only qualified public Effect symbols remain in
  skills, patterns, guidance or runtime source.
- `bun run check`: passed formatting, lint (zero warnings/errors) and TypeScript
  compilation.
- `bun run test`: passed all 912 tests in 53 files, including detector cases,
  inventory/catalog coverage, runtime tests and marked Markdown example
  compilation against installed rc.116.
- `git diff --check`: passed.

The documentation compiler checks explicitly marked, independent TypeScript
fences. It does not execute every illustrative fragment or verify integrations
against live databases/providers. Companion-package examples were reviewed
against tagged source rather than adding all companion dependencies here.
