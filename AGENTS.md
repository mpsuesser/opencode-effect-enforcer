# opencode-effect-enforcer

This is a single-package Bun repository for an OpenCode V2 plugin. It ports the
source context and pattern policy from `pi-effect-harness` without Pi's Effect
Mode or persistence architecture.

## Source Of Truth

- `skills/`: bundled OpenCode skills
- `guidance/`: privileged model guidance
- `patterns/`: pattern definitions
- `test/<pattern>.test.ts`: one-to-one detector cases
- `src/index.ts`: OpenCode V2 composition root
- `src/enforcer.ts`: runtime tool-hook adapter

Do not introduce a generated distribution tree or another workspace package.
Published files are the authoritative files in this repository.

## Verification

```sh
bun run check
bun run test
```

Run both before considering a change complete. Pattern changes must preserve the
bidirectional inventory enforced by `test/all-patterns-covered.test.ts`.
