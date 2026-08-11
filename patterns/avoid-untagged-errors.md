---
action: context
tool: (edit|write)
event: after
name: avoid-untagged-errors
description: Review raw Error usage; recoverable domain failures should use Schema.TaggedError
glob: '**/*.{ts,tsx}'
detector: ast
rule:
    any:
        - all:
              - pattern: 'new Error($$$)'
              - not:
                    inside:
                        pattern: Effect.die($$$)
                        stopBy: end
        - pattern: '$A instanceof Error'
level: info
suggestSkills:
    - effect-error-handling
---

# Avoid `instanceof Error` and `new Error`

```haskell
-- Transformation
instanceofError :: Error → Bool           -- opaque, no discrimination
newError        :: String → Error         -- untagged, untrackable

-- Instead
data MyError = MyError { message :: Schema.String }
  deriving Schema.TaggedError "MyError"

taggedFail :: MyError → Effect a MyError
catchTag   :: "MyError" → (MyError → Effect a) → Effect a E → Effect a (E - MyError)
```

```haskell
-- Pattern
bad :: Error → Effect ()
bad e
  | e `instanceof` Error = log (message e)    -- which error type?
  | otherwise            = pure ()

good :: Effect () MyError
good = pipe
  myEffect
  $ catchTag "MyError" \e → log (message e)

-- Exhaustive handling
handle :: Effect a (E₁ | E₂ | E₃) → Effect a ∅
handle = catchTags
  { E₁: handler₁
  , E₂: handler₂
  , E₃: handler₃
  }
```

`Schema.TaggedError` enables exhaustive pattern matching via `_tag`, serialization, and RPC compatibility. Use `catchTag` for type-safe error discrimination.

Exceptions:

- `new Error(...)` inside `Effect.die(...)` for impossible states or programmer bugs
- invariant branches inside runtime adapters where the failure should remain a defect
- interop callbacks that must produce a raw throwable before being re-captured at the boundary

Do not use those exceptions for user-facing or recoverable domain failures. Because syntax alone cannot establish whether a raw error is a defect, interop value, or recoverable failure, this diagnostic is informational and requires contextual review.
