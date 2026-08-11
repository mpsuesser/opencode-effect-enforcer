---
action: context
tool: (edit|write)
event: after
name: prefer-schema-class
description: Use Schema.Class instead of Schema.Struct for object/domain schemas
glob: '**/*.{ts,tsx}'
detector: ast
pattern: Schema.Struct($$$)
level: warning
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

`Schema.Struct` produces an anonymous schema without a constructor or `instanceof` support. `Schema.Class` provides a named type, constructor, extensibility, and optional annotation support when docs or introspection actually benefit from it. Prefer `Schema.Class` for all domain/object schemas.

References: EF-3, EF-33 in effect-first-development.md
