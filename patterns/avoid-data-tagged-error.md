---
action: context
tool: (edit|write)
event: after
name: avoid-data-tagged-error
description: Review Data.TaggedError usage; public or serialized errors should use Schema.TaggedError
glob: '**/*.{ts,tsx}'
detector: ast
pattern: Data.TaggedError($$$)
level: info
suggestSkills:
    - effect-error-handling
---

# Prefer `Schema.TaggedError` for Public Errors

```haskell
-- Transformation
Data.TaggedError   :: String -> { fields } -> Error   -- lightweight, not schema-backed
Schema.TaggedError :: String -> { schemas } -> Error  -- serializable, RPC-ready
```

```haskell
-- Pattern
bad :: Error
bad = class MyError extends Data.TaggedError("MyError")<{ message: string }>

good :: Error
good = class MyError extends Schema.TaggedError<MyError>()("MyError", {
  message: Schema.String
})
```

`Schema.TaggedError` provides serialization, RPC compatibility, and runtime validation. Prefer it for public, cross-module, persisted, or wire-visible failures. `Data.TaggedError` remains valid for lightweight module-internal errors that do not need schema encoding, so treat this finding as a design review rather than an automatic rewrite.
