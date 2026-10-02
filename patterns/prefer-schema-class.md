---
action: context
tool: (edit|write)
event: after
name: prefer-schema-class
description: Review Schema.Struct used for decoded or domain objects; prefer Schema.Class when identity matters
glob: '**/*.{ts,tsx}'
detector: ast
pattern: Schema.Struct($$$)
level: info
suggestSkills:
    - effect-domain-modeling
---

# Use `Schema.Class` Instead of `Schema.Struct`

```haskell
-- Transformation
Schema.Struct :: { fields } -> Schema { fields }     -- structural value with make helpers
Schema.Class  :: String -> { fields } -> Class        -- named, constructable, extensible

-- Pattern
bad :: Schema
bad = Schema.Struct({
  id: Schema.String,
  name: Schema.String
})
-- structural type, make helpers, no class identity / instanceof

good :: Schema
good = class User extends Schema.Class<User>("User")({
  id: Schema.String,
  name: Schema.String
}) {}
-- named type, constructor, instanceof, optional annotations when useful
```

```haskell
-- Benefits of Schema.Class
construct :: User
construct = new User({ id: "1", name: "Alice" })

check :: unknown -> Bool
check = (x) => x instanceof User

extend :: Schema
extend = class Admin extends User.extend<Admin>("Admin")({
  role: Schema.Literal("admin")
}) {}
```

Every schema, including `Schema.Struct`, has `make`, `makeOption`, and `makeEffect` construction helpers. `Schema.Class` additionally provides a named class, `new` / `instanceof` identity, and class extension. Prefer it for decoded domain/API shapes, union members, and values that need identity. `Schema.Struct` remains appropriate for local structural composition, configuration internals, and schemas where class identity adds no value, so review this informational finding in context.

References: EF-3 in effect-first-development.md
