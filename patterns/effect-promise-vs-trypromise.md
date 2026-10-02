---
action: context
tool: (edit|write)
event: after
name: effect-promise-vs-trypromise
description: Use Effect.tryPromise instead of Effect.promise for error handling
glob: '**/*.{ts,tsx}'
detector: ast
pattern: Effect.promise
level: warning
suggestSkills:
    - effect-error-handling
---

# Use Effect.tryPromise Instead of Effect.promise

```haskell
-- Transformation
promise    :: IO (Promise a) → Effect a ∅        -- rejection = defect, outside typed E
tryPromise :: IO (Promise a) → Effect a E        -- rejection = typed error (catchable)
```

```haskell
-- Pattern
bad :: Effect User ∅
bad = Effect.promise \_ → fetchUser id
  -- rejection becomes a defect: catchTag does not handle it

good :: Effect User FetchError
good = Effect.tryPromise
  { try:   \_ → fetchUser id
  , catch: \e → FetchError (show e)
  }
  -- rejection becomes typed error: catchable, testable

-- Error handling
handle :: Effect User FetchError → Effect User ∅
handle = catchTag "FetchError" \e → defaultUser

-- Defects require explicit cause/defect handling, not ordinary typed recovery
inspectDefect = Effect.catchDefect
```

`Effect.promise` converts rejections to defects outside the typed error channel. `Effect.catchDefect` and cause-level handlers can observe them, but expected rejection belongs in `Effect.tryPromise` with a typed error.

Any reference to `Effect.promise` is flagged — not just `yield* Effect.promise(...)`. Review callbacks, returned helpers, and direct calls alike. An explicit boundary whose rejection genuinely represents a defect may intentionally use `Effect.promise`; explain that contract rather than relabeling expected failures as defects.
