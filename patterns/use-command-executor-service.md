---
action: context
tool: (edit|write)
event: after
name: use-command-executor-service
description: Use Effect's Command / CommandExecutor / ChildProcessSpawner instead of node:child_process
glob: '**/*.{ts,tsx}'
detector: ast
rule:
    any:
        - all:
              - kind: import_statement
              - regex: '["''](?:node:)?child_process["'']'
        - pattern: require($SPEC)
        - pattern: import($SPEC)
constraints:
    SPEC:
        regex: '^["''](?:node:)?child_process["'']$'
level: warning
suggestSkills:
    - effect-command-executor
    - effect-platform-abstraction
---

# Use Effect Process Services Instead of `child_process`

```haskell
-- Transformation
import "node:child_process" :: Node → IO Process    -- callback-spaghetti, untyped
spawn / exec / execFile     :: Args → Promise / Stream  -- ad-hoc lifecycle

-- Instead
ChildProcess        :: Args → ChildProcess           -- pure value, declarative
ChildProcessSpawner :: Effect a ChildProcessSpawner  -- typed I/O, scoped lifetime
Command             :: Args → Command                -- Effect platform API
CommandExecutor     :: Effect a CommandExecutor      -- typed errors, layered
```

```haskell
-- Pattern (Effect v4 — effect/unstable/process)
bad :: () → IO String
bad = exec "git" ["status"] (cb)              -- callback, untyped, no cancellation

good :: Effect String ChildProcessSpawner
good = do
  spawner ← ChildProcessSpawner.ChildProcessSpawner
  spawner.string (ChildProcess.make "git" ["status"])
  -- typed output, error channel, scoped lifetime
```

```haskell
-- Pattern (@effect/platform — older Command API, still supported)
good₂ :: Effect String (CommandExecutor | Scope)
good₂ = do
  executor ← CommandExecutor.CommandExecutor
  let cmd = Command.make "git" "status"
  executor.string cmd
```

Direct `child_process` imports give you callback APIs, manual lifecycle, and no error channel. Use Effect's `ChildProcessSpawner` (or `CommandExecutor`) for typed errors, scoped resource lifetime, and platform-agnostic process spawning.

**Exceptions:**

- Build scripts and tooling config that legitimately couple to Node
- Platform-specific layers that implement `ChildProcessSpawner` / `CommandExecutor`
