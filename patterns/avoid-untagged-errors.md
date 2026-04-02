---
action: context
tool: (edit|write)
event: before
name: avoid-untagged-errors
description: Avoid instanceof Error and new Error - use Schema.TaggedErrorClass for typed errors
glob: '**/*.{ts,tsx}'
pattern: (instanceof\s+Error|new\s+Error\s*\()
level: warning
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
  deriving Schema.TaggedErrorClass "MyError"

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

`Schema.TaggedErrorClass` enables exhaustive pattern matching via `_tag`, serialization, and RPC compatibility. Use `catchTag` for type-safe error discrimination.
