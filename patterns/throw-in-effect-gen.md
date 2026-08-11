---
action: context
tool: (edit|write)
event: after
name: throw-in-effect-gen
description: Do not throw inside Effect.gen / Effect.fn / Effect.fnUntraced — use yield* Effect.fail() instead. The `try:` callback of Effect.try / Effect.tryPromise is exempt.
glob: '**/*.{ts,tsx}'
detector: ast
rule:
    pattern: throw $ERR
    inside:
        any:
            - pattern: Effect.gen($$$ARGS)
            - pattern: Effect.fn($$$ARGS)
            - pattern: Effect.fn($$$ARGS)($$$BODY)
            - pattern: Effect.fnUntraced($$$ARGS)
        stopBy: end
    not:
        inside:
            any:
                - pattern: 'Effect.try({ try: $$$ })'
                - pattern: 'Effect.tryPromise({ try: $$$ })'
            stopBy: end
level: critical
suggestSkills:
    - effect-error-handling
---

# Do Not `throw` Inside `Effect.gen`

```haskell
-- Transformation
throw :: Error -> ⊥                        -- untyped, uncatchable by Effect
yield* Effect.fail :: TaggedError -> E ⊥ E  -- typed, catchable via catchTag
```

```haskell
-- Pattern
bad :: Effect.gen
bad = Effect.gen \_ -> do
  throw new Error("not found")            -- bypasses Effect error channel

good :: Effect.gen
good = Effect.gen \_ -> do
  yield* Effect.fail(new UserNotFoundError({ message: "not found" }))
  -- typed error, catchable with catchTag("UserNotFoundError", ...)
```

`throw` inside `Effect.gen` / `Effect.fn` / `Effect.fnUntraced` creates a defect (untyped), not a typed error. Use `yield* Effect.fail(new SchemaTaggedError(...))` to keep errors in the typed channel.

## Exemption: the `try:` callback of `Effect.try` / `Effect.tryPromise`

Throwing inside the `try:` callback of `Effect.try({ try, catch })` or `Effect.tryPromise({ try, catch })` is the *intended* shape — the paired `catch:` handler captures the throwable back into the typed error channel:

```typescript
Effect.tryPromise({
	try: () => fetch(url), // ✓ throws here are caught by `catch` below
	catch: (cause) => new FetchError({ url, message: String(cause) })
});
```

The rule's `not.inside` clause carves out exactly that shape so legitimate `Effect.try` / `Effect.tryPromise` callbacks don't fire the diagnostic. Throws anywhere else inside an `Effect.gen` / `Effect.fn` / `Effect.fnUntraced` body remain flagged.
