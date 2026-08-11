---
action: context
tool: (edit|write)
event: after
name: use-filesystem-service
description: Use FileSystem service instead of direct Node.js fs / fs/promises imports
glob: '**/*.{ts,tsx}'
detector: ast
rule:
    any:
        - all:
              - kind: import_statement
              - regex: '["''](?:node:)?fs(?:/promises)?["'']'
        - pattern: require($SPEC)
        - pattern: import($SPEC)
constraints:
    SPEC:
        regex: '^["''](?:node:)?fs(?:/promises)?["'']$'
level: high
suggestSkills:
    - effect-filesystem
---

# Use FileSystem Service Instead of `fs` / `fs/promises`

```haskell
-- Transformation
import "node:fs"           :: Node → IO a            -- platform-coupled, untestable
import "fs"                :: Node → IO a            -- same problem
import "node:fs/promises"  :: Node → Promise a       -- Promise-based, not Effect
import "fs/promises"       :: Node → Promise a       -- same problem

-- Instead
FileSystem                 :: Effect a FileSystem    -- platform-agnostic, Effect-native
```

```haskell
-- Pattern
bad :: FilePath → IO String
bad path = fs.readFileSync path "utf-8"   -- R = Node, untestable, blocks event loop

bad₂ :: FilePath → Promise String
bad₂ path = fsPromises.readFile path "utf-8"   -- Promise, not Effect

good :: FilePath → Effect String FileSystem
good path = do
  fs ← FileSystem.FileSystem
  fs.readFileString path                  -- R ⊃ FileSystem, portable, typed errors

-- Platform provision at entry point
main :: Effect () (FileSystem | Console | ...)
main = program
  & provide BunContext.layer    -- or NodeContext.layer
  & runMain
```

Direct `fs` / `fs/promises` imports couple code to Node.js and bypass the Effect error channel. Use `@effect/platform` FileSystem for portability across Node, Bun, and browser, with typed errors and composable I/O.

This pattern subsumes the legacy `avoid-fs-promises` pattern — both `fs` and `fs/promises` are covered here.
