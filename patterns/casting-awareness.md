---
action: context
tool: (edit|write)
event: after
name: casting-awareness
description: Type assertions bypass the compiler — use type-safe alternatives
glob: '**/*.{ts,tsx}'
detector: ast
pattern: $A as $B
level: info
suggestSkills:
    - effect-domain-modeling
    - effect-domain-predicates
---

# Stop — do you actually need `as`?

Most `as` casts can be replaced. Try these in order:

1. **Remove it.** Check the actual type with LSP (`hover`/`Go to Definition`). If it's already correct or the cast just papers over a fixable upstream type, delete the assertion entirely.

2. **`satisfies`** — validates a value matches a type at compile time without changing the inferred type. No runtime cost, no lying to the compiler:

    ```ts
    const config = { port: 3000 } satisfies ServerConfig;
    ```

3. **`Schema.is(MySchema)`** — runtime type guard that narrows correctly. Replaces `as` when you need to check unknown/union data:

    ```ts
    if (Schema.is(User)(value)) {
    	/* value: User */
    }
    ```

4. **`Schema.decodeUnknownSync(MySchema)`** — validates unknown data with full error reporting instead of blindly trusting it:

    ```ts
    const user = Schema.decodeUnknownSync(User)(data);
    ```

5. **`Predicate.isString` / `isNumber` / `isRecord` / etc.** — Effect's built-in type guards for primitives and structures.

6. **`MyEnum.$is("Tag")`** or **`Schema.is(VariantSchema)`** — type guard for discriminated union variants. See `effect-domain-modeling` skill for the full pattern.

`as const` is fine — it narrows to literal types. Every other `as` is the compiler waving a white flag. Fix the types instead.
