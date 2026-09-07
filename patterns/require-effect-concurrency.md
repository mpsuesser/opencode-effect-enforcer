---
action: context
tool: (edit|write)
event: after
name: require-effect-concurrency
description: Specify concurrency explicitly for Effect collection combinators
glob: '**/*.{ts,tsx}'
detector: ast
rule:
    any:
        - all:
              - pattern:
                    context: Effect.forEach($EACH)
                    strictness: signature
              - regex: '^Effect\.forEach'
        - all:
              - pattern:
                    context: Effect.forEach($A, $OPTIONS)
                    strictness: signature
              - regex: '^Effect\.forEach'
        - all:
              - pattern:
                    context: Effect.forEach($A, $B, $OPTIONS)
                    strictness: signature
              - regex: '^Effect\.forEach'
        - all:
              - pattern:
                    context: Effect.all($ALL)
                    strictness: signature
              - regex: '^Effect\.all'
        - all:
              - pattern:
                    context: Effect.all($A, $OPTIONS)
                    strictness: signature
              - regex: '^Effect\.all'
        - all:
              - pattern:
                    context: Effect.validate($VALIDATE)
                    strictness: signature
              - regex: '^Effect\.validate'
        - all:
              - pattern:
                    context: Effect.validate($A, $OPTIONS)
                    strictness: signature
              - regex: '^Effect\.validate'
        - all:
              - pattern:
                    context: Effect.validate($A, $B, $OPTIONS)
                    strictness: signature
              - regex: '^Effect\.validate'
constraints:
    OPTIONS:
        not:
            all:
                - kind: object
                - has:
                      regex: '\bconcurrency\b'
                - not:
                      has:
                          all:
                              - kind: pair
                              - regex: '^\s*["\x27]?concurrency["\x27]?\s*:\s*["\x27]inherit["\x27]\s*$'
level: warning
suggestSkills:
    - effect-parallelization
    - effect-concurrency-testing
---

# Specify Effect Collection Concurrency

```haskell
-- Transformation
Effect.forEach xs f           -- concurrency intent implicit
Effect.forEach xs f opts      -- concurrency intent explicit
```

```typescript
// Bad
Effect.forEach(items, processItem);
Effect.all(tasks);
Effect.validate(inputs, validateInput, { discard: true });
Effect.all(tasks, { concurrency: 'inherit' }); // removed in beta.102

// Good
Effect.forEach(items, processItem, { concurrency: 1 });
Effect.all(tasks, { concurrency: 'unbounded' });
Effect.validate(inputs, validateInput, { concurrency: 4, discard: true });
```

Even sequential execution is a concurrency decision. Specify `concurrency` on `Effect.forEach`, `Effect.all`, and `Effect.validate` so throughput and ordering intent are reviewable at the call site.

Current v4 accepts a number or `'unbounded'` (`Types.Concurrency`), not `'inherit'`.
The detector also flags that removed literal in an explicit options object;
TypeScript remains authoritative for computed or indirect option values.
