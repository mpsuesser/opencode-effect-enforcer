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
Schema.Struct :: { fields } -> Schema { fields }     -- anonymous, no constructor
Schema.Class  :: String -> { fields } -> Class        -- named, constructable, extensible

-- Pattern
bad :: Schema
bad = Schema.Struct({
  id: Schema.String,
  name: Schema.String
})
-- anonymous type, no constructor, no instanceof

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

`Schema.Struct` produces an anonymous schema without a constructor or `instanceof` support. `Schema.Class` provides a named type, constructor, extensibility, and optional annotation support when docs or introspection benefit from it. Prefer `Schema.Class` for decoded domain/API shapes, union members, and values that need identity. `Schema.Struct` remains appropriate for local structural composition, configuration internals, and schemas where class identity adds no value, so review this informational finding in context.

References: EF-3, EF-33 in effect-first-development.md
