# opencode-effect-enforcer

[![npm version](https://img.shields.io/npm/v/opencode-effect-enforcer.svg)](https://www.npmjs.com/package/opencode-effect-enforcer)
[![license](https://img.shields.io/npm/l/opencode-effect-enforcer.svg)](LICENSE)

An opinionated OpenCode V2 plugin that gives coding agents current Effect v4
guidance and reviews their TypeScript edits for common Effect anti-patterns.

## Install

Add the npm package to your global or project `opencode.jsonc`:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": ["opencode-effect-enforcer"],
}
```

That is the complete installation. OpenCode resolves published package entries
for you; there is no separate `npm install` step. Use the global config at
`~/.config/opencode/opencode.jsonc` to enable it everywhere, or a project config
to enable it only for that project. You can also pin a release, for example
`"opencode-effect-enforcer@0.2.2"`.

Start a new OpenCode session, then verify the plugin if needed:

```sh
opencode2 api get /api/plugin
```

## What You Get

- **54 focused skills** registered in OpenCode's native skill catalog, covering
  Effect's core, platform, AI, RPC, SQL, frontend, and testing APIs.
- **4 guidance documents** injected into model context so Effect-first
  boundaries, domain modeling, dependency design, and skill routing stay
  visible while the agent works.
- **46 tested patterns** run after successful `write`, `edit`, `patch`, and
  `apply_patch` calls, reporting only violations in newly added text.
- **Advisory remediation** appended to the completed tool result so the model
  reviews and fixes valid findings without a detector blocking the underlying
  write.

## Source Catalog

Every bundled skill, pattern, and guidance document is linked below. Open only
the area relevant to your task, or expand a catalog to browse everything
available.

### Guidance (4)

- [Effect-First Development](guidance/effect-first-development.md): Defines the Effect-first operating model, laws, templates, boundaries, and review checklist.
- [Agent Rules](guidance/progressive-disclosure-guidance.md): Routes agents to the right skills and authoritative Effect v4 source references.
- [Effect, and the Near-Inexpressible Majesty of Layers](guidance/post__effect-and-the-near-inexpressible-majesty-of-layers.md): Explains services, Layers, typed dependencies, and testable implementations.
- [Parse, don't validate](guidance/post__parse-dont-validate.md): Shows how refined types preserve validation knowledge and make illegal states unrepresentable.

### Skills (54)

#### Modeling And Core APIs

- [`effect-error-handling`](skills/effect-error-handling/SKILL.md): Model typed failures, inspect causes, report errors, and recover precisely.
- [`effect-schema-v4`](skills/effect-schema-v4/SKILL.md): Use current Effect Schema v4 APIs and migrate away from v3 patterns.
- [`effect-schema-composition`](skills/effect-schema-composition/SKILL.md): Compose schemas with transformations, filters, validation, and `Schema.decodeTo`.
- [`effect-domain-modeling`](skills/effect-domain-modeling/SKILL.md): Build schema-backed domain entities, ADTs, guards, orders, and matchers.
- [`effect-domain-predicates`](skills/effect-domain-predicates/SKILL.md): Derive reusable predicates and orderings for domain types.
- [`effect-pattern-matching`](skills/effect-pattern-matching/SKILL.md): Match discriminated unions and Effect results exhaustively.
- [`effect-optics`](skills/effect-optics/SKILL.md): Read and immutably update nested data with lenses, prisms, and traversals.
- [`effect-typeclass-design`](skills/effect-typeclass-design/SKILL.md): Design typeclasses with curried signatures and dual data-first/data-last APIs.
- [`effect-graph`](skills/effect-graph/SKILL.md): Construct, traverse, analyze, and render immutable graphs.

#### Services, Lifecycle, And Concurrency

- [`effect-context-witness`](skills/effect-context-witness/SKILL.md): Choose between service witnesses and capability-based dependency injection.
- [`effect-service-implementation`](skills/effect-service-implementation/SKILL.md): Implement focused Effect services without monolithic interfaces.
- [`effect-layer-design`](skills/effect-layer-design/SKILL.md): Design and compose Layers with explicit dependency wiring.
- [`effect-scope`](skills/effect-scope/SKILL.md): Manage resource acquisition, finalization, and scope ownership safely.
- [`effect-fiber`](skills/effect-fiber/SKILL.md): Fork, supervise, interrupt, and coordinate fibers and keyed fiber collections.
- [`effect-parallelization`](skills/effect-parallelization/SKILL.md): Run, race, gate, and concurrency-limit Effect computations.
- [`effect-scheduling`](skills/effect-scheduling/SKILL.md): Define retries, repeats, polling, backoff, pacing, and timeouts with `Schedule`.
- [`effect-cache`](skills/effect-cache/SKILL.md): Cache effectful lookups with TTL, invalidation, deduplication, and scoped entries.
- [`effect-batching`](skills/effect-batching/SKILL.md): Batch and deduplicate requests with `Request`, `RequestResolver`, and `SqlResolver`.
- [`effect-stream`](skills/effect-stream/SKILL.md): Build resource-safe streaming pipelines with transformations, concurrency, and codecs.
- [`effect-pubsub-event-bus`](skills/effect-pubsub-event-bus/SKILL.md): Implement typed publish/subscribe event buses with PubSub and Stream.
- [`effect-workflow`](skills/effect-workflow/SKILL.md): Build durable workflows, activities, queues, clocks, and compensating transactions.

#### Platform And Runtime Integration

- [`effect-platform-abstraction`](skills/effect-platform-abstraction/SKILL.md): Keep filesystem, process, HTTP, crypto, and terminal code portable.
- [`effect-platform-layers`](skills/effect-platform-layers/SKILL.md): Provide platform implementations cleanly at application boundaries.
- [`effect-managed-runtime`](skills/effect-managed-runtime/SKILL.md): Run Effect services inside frameworks and runtimes Effect does not own.
- [`effect-filesystem`](skills/effect-filesystem/SKILL.md): Perform platform-independent file I/O through Effect's `FileSystem`.
- [`effect-path`](skills/effect-path/SKILL.md): Join, resolve, normalize, and convert paths through Effect's `Path` service.
- [`effect-command-executor`](skills/effect-command-executor/SKILL.md): Spawn, stream, pipe, and safely manage child processes.
- [`effect-socket`](skills/effect-socket/SKILL.md): Build TCP, Unix-domain, and WebSocket clients, servers, and framed transports.
- [`effect-cli`](skills/effect-cli/SKILL.md): Build type-safe command-line interfaces with arguments, options, commands, and Layers.

#### HTTP, RPC, And Persistence

- [`effect-http-api`](skills/effect-http-api/SKILL.md): Define typed HTTP APIs with schemas, security, handlers, clients, and OpenAPI.
- [`effect-http-client`](skills/effect-http-client/SKILL.md): Make typed outgoing HTTP requests with decoding, retries, streaming, and test transports.
- [`effect-http-server`](skills/effect-http-server/SKILL.md): Serve routes, middleware, uploads, static files, streams, and WebSockets.
- [`effect-rpc-api`](skills/effect-rpc-api/SKILL.md): Define shared typed RPC contracts, middleware, errors, and streaming procedures.
- [`effect-rpc-client`](skills/effect-rpc-client/SKILL.md): Consume RPC contracts over HTTP, WebSocket, TCP, workers, or in-memory transports.
- [`effect-rpc-server`](skills/effect-rpc-server/SKILL.md): Implement and serve RPC handlers with middleware, streaming, and interruption support.
- [`effect-rpc-cluster`](skills/effect-rpc-cluster/SKILL.md): Build clustered RPC entities, sharding, singletons, cron jobs, and workflows.
- [`effect-sql`](skills/effect-sql/SKILL.md): Query databases and build schemas, models, resolvers, repositories, and migrations.

#### AI And MCP

- [`effect-ai-language-model`](skills/effect-ai-language-model/SKILL.md): Generate text, structured output, streams, and tool calls through `LanguageModel`.
- [`effect-ai-prompt`](skills/effect-ai-prompt/SKILL.md): Construct and compose prompts from messages and multimodal parts.
- [`effect-ai-tool`](skills/effect-ai-tool/SKILL.md): Define type-safe AI tools, toolkits, schemas, and handlers.
- [`effect-ai-provider`](skills/effect-ai-provider/SKILL.md): Configure provider Layers, models, runtime overrides, and fallback execution plans.
- [`effect-ai-streaming`](skills/effect-ai-streaming/SKILL.md): Consume AI start/delta/end streams with safe accumulation and history updates.
- [`effect-ai-chat`](skills/effect-ai-chat/SKILL.md): Build persistent multi-turn chats and agentic tool-calling loops.
- [`effect-mcp-server`](skills/effect-mcp-server/SKILL.md): Expose MCP tools, resources, and prompts over stdio or HTTP.

#### Frontend State And Composition

- [`effect-atom-state`](skills/effect-atom-state/SKILL.md): Manage reactive React state with Effect Atom.
- [`effect-atom-rpc`](skills/effect-atom-rpc/SKILL.md): Build cached, invalidating, SSR-aware RPC atoms for React clients.
- [`effect-react-composition`](skills/effect-react-composition/SKILL.md): Compose React components around explicit Effect Atom state and behavior.
- [`effect-react-vm`](skills/effect-react-vm/SKILL.md): Implement testable View Models that bridge Effect services and React views.

#### Configuration, Operations, And Testing

- [`effect-config`](skills/effect-config/SKILL.md): Load, validate, compose, and test typed configuration sources.
- [`effect-observability`](skills/effect-observability/SKILL.md): Add structured logs, traces, metrics, and OTLP or Prometheus export.
- [`effect-wide-events`](skills/effect-wide-events/SKILL.md): Design information-rich canonical log events for observability.
- [`effect-testing`](skills/effect-testing/SKILL.md): Test Effect programs, services, Layers, time, errors, and properties.
- [`effect-concurrency-testing`](skills/effect-concurrency-testing/SKILL.md): Test fibers, PubSub, Deferred, Latch, SubscriptionRef, and concurrent streams.
- [`effect-incremental-migration`](skills/effect-incremental-migration/SKILL.md): Migrate Promise-based modules incrementally while preserving required compatibility.

### Patterns (46)

#### Types, Modeling, And Collections

- [`avoid-any`](patterns/avoid-any.md): Flags assertions to `any` or `unknown` that erase type safety.
- [`casting-awareness`](patterns/casting-awareness.md): Reviews type assertions and suggests decoding, guards, or `satisfies`.
- [`avoid-ts-ignore`](patterns/avoid-ts-ignore.md): Detects `@ts-ignore` and `@ts-expect-error` suppressions.
- [`avoid-non-null-assertion`](patterns/avoid-non-null-assertion.md): Detects TypeScript non-null assertions.
- [`avoid-object-type`](patterns/avoid-object-type.md): Rejects imprecise `Object` and `{}` type annotations.
- [`prefer-option-over-null`](patterns/prefer-option-over-null.md): Reviews nullable unions that may be better represented by `Option`.
- [`avoid-option-getorthrow`](patterns/avoid-option-getorthrow.md): Replaces unsafe `Option.getOrThrow` calls with explicit handling.
- [`avoid-schema-suffix`](patterns/avoid-schema-suffix.md): Encourages schema constants named after their domain concepts.
- [`prefer-schema-class`](patterns/prefer-schema-class.md): Reviews `Schema.Struct` where decoded values need class identity.
- [`avoid-direct-json`](patterns/avoid-direct-json.md): Reviews direct JSON methods in favor of schema JSON codecs.
- [`prefer-match-over-switch`](patterns/prefer-match-over-switch.md): Replaces native `switch` statements with exhaustive Effect matching.
- [`avoid-direct-tag-checks`](patterns/avoid-direct-tag-checks.md): Replaces direct `_tag` comparisons with exported refinements or predicates.
- [`imperative-loops`](patterns/imperative-loops.md): Replaces imperative loops with functional collection transformations.
- [`prefer-arr-sort`](patterns/prefer-arr-sort.md): Replaces native array sorting with `Arr.sort` and explicit `Order`.

#### Errors And Effect Boundaries

- [`avoid-data-tagged-error`](patterns/avoid-data-tagged-error.md): Reviews public or serialized `Data.TaggedError` values for schema-backed errors.
- [`avoid-untagged-errors`](patterns/avoid-untagged-errors.md): Reviews raw `Error` construction and discrimination in recoverable code.
- [`avoid-try-catch`](patterns/avoid-try-catch.md): Replaces `try`/`catch` in Effect code with typed Effect constructors.
- [`throw-in-effect-gen`](patterns/throw-in-effect-gen.md): Detects thrown exceptions inside Effect generators and functions.
- [`effect-catchall-default`](patterns/effect-catchall-default.md): Reviews broad catch-and-default recovery that may hide failures.
- [`effect-promise-vs-trypromise`](patterns/effect-promise-vs-trypromise.md): Uses `Effect.tryPromise` when Promise rejection must enter the error channel.
- [`effect-run-in-body`](patterns/effect-run-in-body.md): Keeps `Effect.runSync`, `runPromise`, and `runFork` at runtime boundaries.
- [`prefer-effect-fn`](patterns/prefer-effect-fn.md): Wraps service methods with named, traced `Effect.fn` definitions.
- [`avoid-yield-ref`](patterns/avoid-yield-ref.md): Replaces direct yielding of Ref, Deferred, Fiber, and Latch with explicit operations.

#### Services, Concurrency, And Time

- [`context-tag-extends`](patterns/context-tag-extends.md): Replaces legacy service-tag APIs with `Context.Service`.
- [`avoid-mutable-state`](patterns/avoid-mutable-state.md): Reviews mutable `let` state inside Effect services in favor of `Ref`.
- [`yield-in-for-loop`](patterns/yield-in-for-loop.md): Replaces effectful loop bodies with Effect or STM collection combinators.
- [`require-effect-concurrency`](patterns/require-effect-concurrency.md): Requires explicit concurrency for Effect collection combinators.
- [`prefer-duration-values`](patterns/prefer-duration-values.md): Replaces numeric time literals with typed `Duration` values.
- [`use-clock-service`](patterns/use-clock-service.md): Replaces JavaScript `Date` operations with testable DateTime or Clock effects.
- [`use-random-service`](patterns/use-random-service.md): Replaces `Math.random()` with Effect's testable Random service.
- [`use-console-service`](patterns/use-console-service.md): Replaces native console calls with Effect logging or Console services.

#### Platform, I/O, And Configuration

- [`avoid-native-fetch`](patterns/avoid-native-fetch.md): Replaces native `fetch` with Effect HTTP client modules.
- [`use-http-client-service`](patterns/use-http-client-service.md): Replaces `node:http` and `node:https` with Effect `HttpClient`.
- [`use-filesystem-service`](patterns/use-filesystem-service.md): Replaces Node filesystem imports with Effect `FileSystem`.
- [`avoid-sync-fs`](patterns/avoid-sync-fs.md): Detects synchronous filesystem operations.
- [`stream-large-files`](patterns/stream-large-files.md): Reviews whole-file reads of likely large or unbounded inputs.
- [`use-path-service`](patterns/use-path-service.md): Replaces Node path imports with Effect's `Path` service.
- [`use-temp-file-scoped`](patterns/use-temp-file-scoped.md): Requires scoped temporary files and directories with automatic cleanup.
- [`use-command-executor-service`](patterns/use-command-executor-service.md): Replaces `node:child_process` with Effect process services.
- [`avoid-node-imports`](patterns/avoid-node-imports.md): Catches Node imports not covered by a more specific platform rule.
- [`avoid-platform-coupling`](patterns/avoid-platform-coupling.md): Prevents binding packages from hardwiring Bun or Node platform Layers.
- [`avoid-process-env`](patterns/avoid-process-env.md): Replaces direct environment access with Effect Config.
- [`prefer-redacted-config`](patterns/prefer-redacted-config.md): Requires secret-like configuration values to remain redacted.

#### React And Testing Conventions

- [`avoid-react-hooks`](patterns/avoid-react-hooks.md): Directs React state and effects into Effect Atom View Models.
- [`vm-in-wrong-file`](patterns/vm-in-wrong-file.md): Enforces dedicated `.vm.ts` files for View Model definitions.
- [`avoid-expect-in-if`](patterns/avoid-expect-in-if.md): Prevents conditional assertions that allow tests to pass without checking behavior.

## Per-Agent Opt-Out

Set `opencode-effect-enforcer: false` in an agent's `request.body` when that
agent does not write Effect code. The plugin consumes the setting before the
request reaches the model provider.

```jsonc
{
  "agents": {
    "researcher": {
      "description": "Handles non-code research",
      "mode": "subagent",
      "request": {
        "body": {
          "opencode-effect-enforcer": false,
        },
      },
    },
  },
}
```

For opted-out agents, the plugin does not inject guidance, advertise or allow
its `effect-*` skills, or run post-write pattern enforcement.

To disable the plugin entirely without removing its package entry, add a later
selector using the exported plugin ID:

```jsonc
{
  "plugins": ["opencode-effect-enforcer", "-opencode.effect-enforcer"],
}
```

## Enforcement Semantics

Patterns run only after successful writes. For edits and patches, the plugin
captures the original files and computes changed spans from the final output,
so it does not report a pre-existing violation outside newly added text.
Full-file writes and new files treat the complete result as changed.

The matcher supports TypeScript and TSX ast-grep rules, regex detectors with
comment filtering, include and ignore globs, severity ordering, and targeted
skill suggestions. Inspection failures remain advisory and never convert a
successful write into a failed tool call.

## Development

```sh
bun install
bun run check
bun run test
```

The tests enforce a bidirectional pattern/test inventory and require every
skill, pattern, and guidance source to remain linked from this README.

GitHub releases are automatically verified and published to npm with provenance.
The release tag must exactly match the package version, such as `v0.2.0` for
`"version": "0.2.0"`.

There is no generated `dist` tree. OpenCode imports the TypeScript entrypoint,
and npm publishes the authoritative `src/`, `skills/`, `guidance/`, and
`patterns/` directories directly.

## Credits

This project is the OpenCode V2 port of
[`pi-effect-harness`](https://github.com/mpsuesser/pi-effect-harness). It keeps
the source guidance and pattern policy while using OpenCode's native skills,
context hooks, and package loading.

## License

[MIT](LICENSE)
