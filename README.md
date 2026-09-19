# opencode-effect-enforcer

[![npm version](https://img.shields.io/npm/v/opencode-effect-enforcer.svg)](https://www.npmjs.com/package/opencode-effect-enforcer)
[![license](https://img.shields.io/npm/l/opencode-effect-enforcer.svg)](LICENSE)

**Spend less time teaching your coding agent Effect.**

If you keep reminding your agent to use typed errors, decode with Schema, or
check the current API, this plugin gives those reminders a permanent home in
OpenCode V2. It includes Effect guidance and skills the agent can consult while
working, plus checks that send common mistakes back for correction after edits.

## How it helps

**Guidance** is included before every model call. Four documents cover
Effect-first design, schema-first modeling, typed dependencies, and how to
choose the relevant skills.

**Skills** explain how to use specific Effect APIs. The agent loads the relevant
guides through OpenCode's native skill tool, with 53 to choose from across
services, streams, HTTP, SQL, React, AI, and more.

**Patterns** check the code after edits. 45 tested checks look for common
TypeScript and TSX mistakes and return correction advice and relevant skill
suggestions to the agent for its next turn.

Checks run after successful `write`, `edit`, `patch`, and `apply_patch` calls.
Edits and patches are checked only in newly added text; full-file writes and new
files are checked in full. Feedback asks the agent to fix valid findings or
explain intentional exceptions. Checks are advisory and do not block writes.

The bundled guidance and skills target **Effect `4.0.0-rc.116`**.
See the [rc.112 → rc.116 migration audit](docs/effect-4.0.0-rc.116.md)
and [complete upstream release notes](docs/effect-4.0.0-rc.116-changelog.md).

## Install

Add the plugin to `opencode.jsonc` in your project, or
`~/.config/opencode/opencode.jsonc` for all projects:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": ["opencode-effect-enforcer"],
}
```

Start a new session. OpenCode installs the package automatically.

## Explore what's included

Browse the guidance, find a skill for your next task, or see what the patterns
look for.

### Guidance (4)

- [Effect-First Development](guidance/effect-first-development.md): Defines the Effect-first operating model, laws, templates, boundaries, and review checklist.
- [Agent Rules](guidance/progressive-disclosure-guidance.md): Routes agents to the right skills and authoritative Effect v4 source references.
- [Effect, and the Near-Inexpressible Majesty of Layers](guidance/post__effect-and-the-near-inexpressible-majesty-of-layers.md): Explains services, Layers, typed dependencies, and testable implementations.
- [Parse, don't validate](guidance/post__parse-dont-validate.md): Shows how refined types preserve validation knowledge and make illegal states unrepresentable.

### Skills (53)

#### Modeling and core APIs

- [`effect-error-handling`](skills/effect-error-handling/SKILL.md): Model typed failures, inspect causes, report errors, and recover precisely.
- [`effect-schema-v4`](skills/effect-schema-v4/SKILL.md): Use current Effect Schema v4 APIs and migrate away from v3 patterns.
- [`effect-schema-composition`](skills/effect-schema-composition/SKILL.md): Compose schemas with transformations, filters, validation, and `Schema.decodeTo`.
- [`effect-domain-modeling`](skills/effect-domain-modeling/SKILL.md): Build schema-backed domain entities, ADTs, guards, orders, and matchers.
- [`effect-domain-predicates`](skills/effect-domain-predicates/SKILL.md): Derive reusable predicates and orderings for domain types.
- [`effect-pattern-matching`](skills/effect-pattern-matching/SKILL.md): Match discriminated unions and Effect results exhaustively.
- [`effect-optics`](skills/effect-optics/SKILL.md): Read and immutably update nested data with lenses, prisms, and traversals.
- [`effect-typeclass-design`](skills/effect-typeclass-design/SKILL.md): Design typeclasses with curried signatures and dual data-first/data-last APIs.
- [`effect-graph`](skills/effect-graph/SKILL.md): Construct, traverse, analyze, and render immutable graphs.

#### Services, lifecycle, and concurrency

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

#### Platform and runtime integration

- [`effect-platform-abstraction`](skills/effect-platform-abstraction/SKILL.md): Keep filesystem, process, HTTP, crypto, and terminal code portable.
- [`effect-platform-layers`](skills/effect-platform-layers/SKILL.md): Provide platform implementations cleanly at application boundaries.
- [`effect-managed-runtime`](skills/effect-managed-runtime/SKILL.md): Run Effect services inside frameworks and runtimes Effect does not own.
- [`effect-filesystem`](skills/effect-filesystem/SKILL.md): Perform platform-independent file I/O through Effect's `FileSystem`.
- [`effect-path`](skills/effect-path/SKILL.md): Join, resolve, normalize, and convert paths through Effect's `Path` service.
- [`effect-command-executor`](skills/effect-command-executor/SKILL.md): Spawn, stream, pipe, and safely manage child processes.
- [`effect-socket`](skills/effect-socket/SKILL.md): Build TCP, Unix-domain, and WebSocket clients, servers, and framed transports.
- [`effect-cli`](skills/effect-cli/SKILL.md): Build type-safe command-line interfaces with arguments, options, commands, and Layers.

#### HTTP, RPC, and persistence

- [`effect-http-api`](skills/effect-http-api/SKILL.md): Define typed HTTP APIs with schemas, security, handlers, clients, and OpenAPI.
- [`effect-http-client`](skills/effect-http-client/SKILL.md): Make typed outgoing HTTP requests with decoding, retries, streaming, and test transports.
- [`effect-http-server`](skills/effect-http-server/SKILL.md): Serve routes, middleware, uploads, static files, streams, and WebSockets.
- [`effect-rpc-api`](skills/effect-rpc-api/SKILL.md): Define shared typed RPC contracts, middleware, errors, and streaming procedures.
- [`effect-rpc-client`](skills/effect-rpc-client/SKILL.md): Consume RPC contracts over HTTP, WebSocket, TCP, workers, or in-memory transports.
- [`effect-rpc-server`](skills/effect-rpc-server/SKILL.md): Implement and serve RPC handlers with middleware, streaming, and interruption support.
- [`effect-rpc-cluster`](skills/effect-rpc-cluster/SKILL.md): Build clustered RPC entities, sharding, singletons, cron jobs, and workflows.
- [`effect-sql`](skills/effect-sql/SKILL.md): Query databases and build schemas, models, resolvers, repositories, and migrations.

#### AI and MCP

- [`effect-ai-language-model`](skills/effect-ai-language-model/SKILL.md): Generate text, structured output, streams, and tool calls through `LanguageModel`.
- [`effect-ai-prompt`](skills/effect-ai-prompt/SKILL.md): Construct and compose prompts from messages and multimodal parts.
- [`effect-ai-tool`](skills/effect-ai-tool/SKILL.md): Define type-safe AI tools, toolkits, schemas, and handlers.
- [`effect-ai-provider`](skills/effect-ai-provider/SKILL.md): Configure provider Layers, models, runtime overrides, and fallback execution plans.
- [`effect-ai-streaming`](skills/effect-ai-streaming/SKILL.md): Consume AI start/delta/end streams with safe accumulation and history updates.
- [`effect-ai-chat`](skills/effect-ai-chat/SKILL.md): Build persistent multi-turn chats and agentic tool-calling loops.
- [`effect-mcp-server`](skills/effect-mcp-server/SKILL.md): Expose MCP tools, resources, and prompts over stdio or HTTP.

#### Frontend state and composition

- [`effect-atom-state`](skills/effect-atom-state/SKILL.md): Manage reactive React state with Effect Atom.
- [`effect-atom-rpc`](skills/effect-atom-rpc/SKILL.md): Build cached, invalidating, SSR-aware RPC atoms for React clients.
- [`effect-react-composition`](skills/effect-react-composition/SKILL.md): Compose React components around explicit Effect Atom state and behavior.

#### Configuration, operations, and testing

- [`effect-config`](skills/effect-config/SKILL.md): Load, validate, compose, and test typed configuration sources.
- [`effect-observability`](skills/effect-observability/SKILL.md): Add structured logs, traces, metrics, and OTLP or Prometheus export.
- [`effect-wide-events`](skills/effect-wide-events/SKILL.md): Design information-rich canonical log events for observability.
- [`effect-testing`](skills/effect-testing/SKILL.md): Test Effect programs, services, Layers, time, errors, and properties.
- [`effect-concurrency-testing`](skills/effect-concurrency-testing/SKILL.md): Test fibers, PubSub, Deferred, Latch, SubscriptionRef, and concurrent streams.
- [`effect-incremental-migration`](skills/effect-incremental-migration/SKILL.md): Migrate Promise-based modules incrementally while preserving required compatibility.

### Patterns (45)

#### Types, modeling, and collections

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

#### Errors and Effect boundaries

- [`avoid-data-tagged-error`](patterns/avoid-data-tagged-error.md): Reviews public or serialized `Data.TaggedError` values for schema-backed errors.
- [`avoid-untagged-errors`](patterns/avoid-untagged-errors.md): Reviews raw `Error` construction and discrimination in recoverable code.
- [`avoid-try-catch`](patterns/avoid-try-catch.md): Replaces `try`/`catch` in Effect code with typed Effect constructors.
- [`throw-in-effect-gen`](patterns/throw-in-effect-gen.md): Detects thrown exceptions inside Effect generators and functions.
- [`effect-catchall-default`](patterns/effect-catchall-default.md): Reviews broad catch-and-default recovery that may hide failures.
- [`effect-promise-vs-trypromise`](patterns/effect-promise-vs-trypromise.md): Uses `Effect.tryPromise` when Promise rejection must enter the error channel.
- [`effect-run-in-body`](patterns/effect-run-in-body.md): Keeps `Effect.runSync`, `runPromise`, and `runFork` at runtime boundaries.
- [`prefer-effect-fn`](patterns/prefer-effect-fn.md): Wraps service methods with named, traced `Effect.fn` definitions.
- [`avoid-yield-ref`](patterns/avoid-yield-ref.md): Replaces direct yielding of Ref, Deferred, Fiber, and Latch with explicit operations.

#### Services, concurrency, and time

- [`context-tag-extends`](patterns/context-tag-extends.md): Replaces legacy service-tag APIs with `Context.Service`.
- [`avoid-mutable-state`](patterns/avoid-mutable-state.md): Reviews mutable `let` state inside Effect services in favor of `Ref`.
- [`yield-in-for-loop`](patterns/yield-in-for-loop.md): Replaces effectful loop bodies with Effect or STM collection combinators.
- [`require-effect-concurrency`](patterns/require-effect-concurrency.md): Requires explicit concurrency for Effect collection combinators.
- [`prefer-duration-values`](patterns/prefer-duration-values.md): Replaces numeric time literals with typed `Duration` values.
- [`use-clock-service`](patterns/use-clock-service.md): Replaces JavaScript `Date` operations with testable DateTime or Clock effects.
- [`use-random-service`](patterns/use-random-service.md): Replaces `Math.random()` with Effect's testable Random service.
- [`use-console-service`](patterns/use-console-service.md): Replaces native console calls with Effect logging or Console services.

#### Platform, I/O, and configuration

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

#### React and testing conventions

- [`avoid-react-hooks`](patterns/avoid-react-hooks.md): Reviews React state and effects for Effect Atom alternatives.
- [`avoid-expect-in-if`](patterns/avoid-expect-in-if.md): Prevents conditional assertions that allow tests to pass without checking behavior.

## License

[MIT](LICENSE)
