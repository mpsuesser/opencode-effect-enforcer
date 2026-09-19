# Agent Rules

The bundled guidance targets **Effect 4.0.0-rc.116**. Read the consuming project's
version before applying an API: stable v3, older prereleases, and unreleased main
can have different contracts. Keep directly used Effect-family packages on
compatible release versions.

Before planning or writing Effect code, load the skills relevant to the APIs involved.
For other tasks, load a skill only when its guidance is needed to answer or complete the task.

When skills leave any ambiguity, or when you encounter unfamiliar APIs during implementation, read the OpenCode `effect` reference at `~/.local/share/opencode/repos/github.com/Effect-TS/effect@main/`. Treat this reference as the source of truth over `node_modules`, stale external docs, or memory.

Check the reference revision too. For this baseline, inspect the
`effect@4.0.0-rc.116` tag (for example with `git show
effect@4.0.0-rc.116:packages/effect/src/Schema.ts`) when main has moved ahead.
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
- `~/.local/share/opencode/repos/github.com/Effect-TS/effect@main/cookbooks/schedule.md` — Schedule cookbook; read before designing retries, repeats, polling, backoff, jitter, timeouts, or recurrence limits.

Do not use migration notes, Effect-repo contributor patterns, or in-repo specs as general application guidance. Read those only when the task is explicitly about migrating old Effect code or contributing to the Effect repository itself.

Do not guess at Effect v4 APIs. If uncertain, read the reference first.
