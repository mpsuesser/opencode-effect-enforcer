---
action: context
tool: (edit|write)
event: before
name: effect-catchall-default
description: Avoid Effect.catch returning defaults - often hides bugs, use catchTag instead
glob: '**/*.{ts,tsx}'
pattern: Effect\.catch\(.*?=>\s*(Effect\.)?(succeed|sync)\(
level: warning
suggestSkills:
    - effect-error-handling
---

# Avoid `Effect.catch` with Default Values

```haskell
-- Transformation
catch :: (E -> Effect a) -> Effect a E -> Effect a _
catch _ default = \_ -> succeed default    -- swallows all errors silently

-- Instead
catchTag  :: Tag -> (E -> Effect a) -> Effect a E -> Effect a (E - Tag)
catchTags :: {Tag1: h1, ...} -> Effect a E -> Effect a (E - Tags)
```

```haskell
-- Pattern
bad :: Effect User _
bad = pipe
  fetchUser
  $ catch \_ -> succeed defaultUser    -- which error? why?

good :: Effect User (NetworkError | Timeout)
good = pipe
  fetchUser
  $ catchTag "NotFound" \_ -> do
      log "User not found, creating..."
      createDefaultUser               -- explicit, logged, traceable

-- For expected absence
better :: Effect (Option User) NetworkError
better = pipe
  fetchUser
  $ Option.some                       -- Option, not error swallowing
  $ catchTag "NotFound" \_ -> Option.none
```

`Effect.catch` with defaults hides bugs and loses context. Use `catchTag` for specific errors with logging, or `Option` for expected absence.
