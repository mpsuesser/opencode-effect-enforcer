# Agent Rules

Load all relevant skills before writing or planning any code. Effect is a massive ecosystem — without loading skills you will write outdated v3 code or miss high-leverage libraries. Load AT LEAST 7 `effect-*` skills before any Effect work.

When skills leave any ambiguity, or when you encounter unfamiliar APIs during implementation, use `effect_ref_read` to read Effect v4 source files and `effect_ref_list` to browse directories. These tools automatically fetch source matching your installed Effect version. Key reference files:

- `LLMS.md` — Effect v4 overview for LLMs (via effect_ref_read)
- `MIGRATION.md` — v3 → v4 migration guide (via effect_ref_read)
- `packages/effect/SCHEMA.md` — full Schema documentation (via effect_ref_read)
- `packages/effect/HTTPAPI.md` — HttpApi, HttpApiClient, HttpApiBuilder (via effect_ref_read)
- `packages/effect/src/` — actual Effect source code for any module (via effect_ref_list)

Do not guess at Effect v4 APIs. If uncertain, read the reference first.
