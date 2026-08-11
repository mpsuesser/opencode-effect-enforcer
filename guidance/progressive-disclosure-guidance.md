# Agent Rules

Load all relevant skills before writing or planning any code. Effect is a massive ecosystem — without loading skills you will write outdated v3 code or miss high-leverage libraries. Load AT LEAST 4 `effect-*` skills before any Effect work.

When skills leave any ambiguity, or when you encounter unfamiliar APIs during implementation, read from `~/.cache/effect-v4/` — the shared, user-scoped clone of the latest Effect v4 source. Treat this clone as the source of truth over `node_modules`, stale external docs, or memory.

## Start here

- `~/.cache/effect-v4/LLMS.md` — generated task-oriented guide for Effect v4, with links to examples.
- `~/.cache/effect-v4/ai-docs/src/` — source examples behind `LLMS.md`, organized by topic; use when you need the full runnable snippet.
- `~/.cache/effect-v4/packages/effect/src/` — actual Effect source code for any module; use this when docs and skills disagree.

## Major user-facing guides

- `~/.cache/effect-v4/packages/effect/SCHEMA.md` — full Schema reference.
- `~/.cache/effect-v4/packages/effect/HTTPAPI.md` — HttpApi, HttpApiClient, HttpApiBuilder, middleware, security, and OpenAPI docs.
- `~/.cache/effect-v4/packages/effect/CONFIG.md` — `Config` and `ConfigProvider` guide.
- `~/.cache/effect-v4/packages/effect/MCP.md` — MCP server resources, prompts, tools, and transports.
- `~/.cache/effect-v4/packages/effect/OPTIC.md` — `Optic` guide for lenses, prisms, optionals, traversals, and schema isos.
- `~/.cache/effect-v4/packages/vitest/README.md` — `@effect/vitest` testing guide.
- `~/.cache/effect-v4/cookbooks/schedule.md` — Schedule cookbook; read before designing retries, repeats, polling, backoff, jitter, timeouts, or recurrence limits.

Do not use migration notes, Effect-repo contributor patterns, or in-repo specs as general application guidance. Read those only when the task is explicitly about migrating old Effect code or contributing to the Effect repository itself.

Do not guess at Effect v4 APIs. If uncertain, read the reference first.
