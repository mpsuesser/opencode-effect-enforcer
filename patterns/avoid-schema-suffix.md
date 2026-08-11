---
action: context
tool: (edit|write)
event: after
name: avoid-schema-suffix
description: Schema constants should be named after the domain type, not suffixed with Schema
glob: '**/*.{ts,tsx}'
pattern: \b(const|let)\s+\w+Schema\s*=\s*Schema\.
level: info
---

# Name Schemas After the Domain Type

```haskell
-- Transformation
const UserSchema = Schema.String       -- redundant suffix, not the domain name
const User       = Schema.String       -- named after the domain concept

-- Pattern
bad :: Schema naming
bad = const UserSchema = Schema.Struct({ ... })
bad = const OrderIdSchema = Schema.String
bad = export const PayloadSchema = Schema.Class(...)

good :: Schema naming
good = const User = Schema.String
good = export const OrderId = Schema.String
good = class Payload extends Schema.Class<Payload>("Payload")({ ... })
```

```haskell
-- For non-class schemas, export type alias with same name
export const OrderId = Schema.String
export type OrderId = typeof OrderId.Type

-- For class schemas, the name is built-in
export class User extends Schema.Class<User>("User")({
  id: Schema.String,
  name: Schema.String
}) {}
```

Schema constants should be named after the domain type they represent, not suffixed with `Schema`. The `Schema` suffix is redundant since the value itself is already a schema — the name should communicate what it models, not what it is.

References: EF-3, Checklist #8 in effect-first-development.md
