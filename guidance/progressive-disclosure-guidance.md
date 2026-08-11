# Agent Rules

Load all relevant skills before writing or planning any code. Effect is a massive ecosystem — without loading skills you will write outdated v3 code or miss high-leverage libraries. Load AT LEAST 4 `effect-*` skills before any Effect work.

When skills leave any ambiguity, or when you encounter unfamiliar APIs during implementation, read the OpenCode `effect` reference at `~/.local/share/opencode/repos/github.com/Effect-TS/effect@main/`. Treat this reference as the source of truth over `node_modules`, stale external docs, or memory.

## Skill routing

Load every branch that the task crosses:

- Schemas, brands, variants, optionality, or decoding: `effect-schema-v4`, `effect-schema-composition`, and `effect-domain-modeling`.
- Services, layers, runtime wiring, or scoped lifetimes: `effect-service-implementation`, `effect-layer-design`, `effect-scope`, and `effect-fiber`.
- Configuration or secrets: `effect-config`.
- Retry, repeat, polling, backoff, pacing, or recurrence: `effect-scheduling` plus the relevant error, HTTP, or testing skill.
- Memoization, keyed caches, or request batching: `effect-cache` and `effect-batching`.
- Streams, queues, pubsubs, pagination, or backpressure: `effect-stream` and the relevant concurrency skill.
- Outgoing HTTP: `effect-http-client` plus the relevant platform-layer skill.
- Effect tests, virtual time, or concurrent synchronization: `effect-testing` and `effect-concurrency-testing`.

## Start here

- `~/.local/share/opencode/repos/github.com/Effect-TS/effect@main/LLMS.md` — generated task-oriented guide for Effect v4, with links to examples.
- `~/.local/share/opencode/repos/github.com/Effect-TS/effect@main/ai-docs/src/` — source examples behind `LLMS.md`, organized by topic; use when you need the full runnable snippet.
- `~/.local/share/opencode/repos/github.com/Effect-TS/effect@main/packages/effect/src/` — actual Effect source code for any module; use this when docs and skills disagree.

## Major user-facing guides

- `~/.local/share/opencode/repos/github.com/Effect-TS/effect@main/packages/effect/SCHEMA.md` — full Schema reference.
- `~/.local/share/opencode/repos/github.com/Effect-TS/effect@main/packages/effect/HTTPAPI.md` — HttpApi, HttpApiClient, HttpApiBuilder, middleware, security, and OpenAPI docs.
- `~/.local/share/opencode/repos/github.com/Effect-TS/effect@main/packages/effect/CONFIG.md` — `Config` and `ConfigProvider` guide.
- `~/.local/share/opencode/repos/github.com/Effect-TS/effect@main/packages/effect/MCP.md` — MCP server resources, prompts, tools, and transports.
- `~/.local/share/opencode/repos/github.com/Effect-TS/effect@main/packages/effect/OPTIC.md` — `Optic` guide for lenses, prisms, optionals, traversals, and schema isos.
- `~/.local/share/opencode/repos/github.com/Effect-TS/effect@main/packages/vitest/README.md` — `@effect/vitest` testing guide.
- `~/.local/share/opencode/repos/github.com/Effect-TS/effect@main/cookbooks/schedule.md` — Schedule cookbook; read before designing retries, repeats, polling, backoff, jitter, timeouts, or recurrence limits.

Do not use migration notes, Effect-repo contributor patterns, or in-repo specs as general application guidance. Read those only when the task is explicitly about migrating old Effect code or contributing to the Effect repository itself.

Do not guess at Effect v4 APIs. If uncertain, read the reference first.
