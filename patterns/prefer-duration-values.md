---
action: context
tool: (edit|write)
event: after
name: prefer-duration-values
description: Use Duration helpers instead of numeric duration literals
glob: '**/*.{ts,tsx}'
detector: ast
rule:
    any:
        - pattern: 'Effect.sleep($DURATION)'
        - pattern: 'Effect.delay($EFFECT, $DURATION)'
        - pattern: 'Effect.delay($DURATION)'
        - pattern: 'Effect.timeout($EFFECT, $DURATION)'
        - pattern: 'Effect.timeout($DURATION)'
        - pattern: 'Effect.timeoutOption($EFFECT, $DURATION)'
        - pattern: 'Effect.timeoutOption($DURATION)'
        - pattern: 'Effect.timeoutOrElse($EFFECT, { duration: $DURATION, $$$REST })'
        - pattern: 'Effect.timeoutOrElse({ duration: $DURATION, $$$REST })'
        - pattern: 'Schedule.duration($DURATION)'
        - pattern: 'Schedule.fixed($DURATION)'
        - pattern: 'Schedule.spaced($DURATION)'
        - pattern: 'Schedule.windowed($DURATION)'
constraints:
    DURATION:
        kind: number
level: warning
suggestSkills:
    - effect-testing
---

# Prefer `Duration` Values

```haskell
-- Transformation
number   :: milliseconds? seconds? unclear
Duration :: explicit time unit
```

```typescript
// Bad
Effect.sleep(1000);
program.pipe(Effect.timeout(5000));
Schedule.spaced(250);

// Good
Effect.sleep(Duration.seconds(1));
program.pipe(Effect.timeout(Duration.seconds(5)));
Schedule.spaced(Duration.millis(250));
```

Numeric duration literals obscure units and make timeout/retry policies harder to review. Use `Duration.millis`, `Duration.seconds`, or another `effect/Duration` constructor so time windows are explicit.
