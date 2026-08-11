---
action: context
tool: (edit|write)
event: after
name: avoid-try-catch
description: Avoid try-catch blocks in Effect code - use Effect.try or typed errors
glob: '**/*.{ts,tsx}'
detector: ast
pattern: 'try { $$$ }'
level: warning
suggestSkills:
    - effect-error-handling
---

# Avoid `try { } catch` in Effect Code

```haskell
-- Transformation
tryCatch :: IO a → IO (Either Error a)    -- loses error types
effectTry :: (() → a) → Effect a E        -- preserves error channel

-- Error handling
catchTag  :: Tag → (E → Effect a) → Effect a E → Effect a (E - Tag)
catchTags :: {Tag₁: h₁, Tag₂: h₂} → Effect a E → Effect a (E - Tags)
```

```haskell
-- Pattern
bad :: () → { success :: Bool, data :: Maybe a, error :: Maybe String }
bad () = try
  result ← riskyOperation
  pure { success: True, data: Just result, error: Nothing }
 catch e →
  pure { success: False, data: Nothing, error: Just (show e) }

good :: Effect a DataError
good = Effect.try
  { try:   riskyOperation
  , catch: DataError <<< show
  }

-- Or with TaggedErrorClass
data DataError = DataError { message :: String }
  deriving Schema.TaggedErrorClass "DataError"
```

`try-catch` breaks the error channel—errors become opaque. Use `Effect.try` with `Schema.TaggedErrorClass` for typed, composable error handling.
