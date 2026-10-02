# Agent Rules

The bundled guidance targets **Effect 4.0.0 (stable)**. Read the consuming project's
version before applying an API: v3, v4 prereleases, and unreleased main can have
different contracts. Use the same version of `effect` and every directly used
`@effect/*` package; Effect packages are versioned and released together.

Import area modules from `effect/<area>`: for example `effect/http`,
`effect/http-api`, `effect/rpc`, `effect/ai`, and `effect/process`. Import
`Arbitrary` from `effect/Arbitrary`, and binary-text codecs from
`effect/encoding/{Base64,Base64Url,Hex,EncodingError}`. Check source stability
annotations: `@stability unstable` APIs can break in minor releases even though
their import paths have no `unstable` segment. APIs without that annotation
follow semver. TypeScript 5.9 or newer is required.

Before planning or writing Effect code, load the skills relevant to the APIs involved.
For other tasks, load a skill only when its guidance is needed to answer or complete the task.

When skills leave any ambiguity, or when you encounter unfamiliar APIs during implementation, read the OpenCode `effect` reference at `~/.local/share/opencode/repos/github.com/Effect-TS/effect@main/`. Treat this reference as the source of truth over `node_modules`, stale external docs, or memory.

Check the reference revision too. For this baseline, inspect the
`effect@4.0.0` tag (for example with `git show
effect@4.0.0:packages/effect/src/Schema.ts`) when main has moved ahead.
Source symbols and signatures at that tag take precedence over stale prose or
line-number links. Public exports marked `@internal` in source are not application APIs.

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
- `~/.local/share/opencode/repos/github.com/Effect-TS/effect@main/ai-docs/src/06_schedule/10_schedules.ts` — runnable Schedule guide at the stable tag; read alongside `Schedule.ts` before designing retries, repeats, polling, backoff, jitter, timeouts, or recurrence limits. The stable tag has no `cookbooks/schedule.md`.

Do not use migration notes, Effect-repo contributor patterns, or in-repo specs as general application guidance. Read those only when the task is explicitly about migrating old Effect code or contributing to the Effect repository itself.

Do not guess at Effect v4 APIs. If uncertain, read the reference first.
