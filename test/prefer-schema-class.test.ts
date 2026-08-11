import { expect, it } from "vitest"
import { testPattern } from "./helpers/pattern-test-harness.ts"

import { requirePattern } from "./helpers/patterns.ts"

testPattern({
  name: "prefer-schema-class",
  tag: "ef-3-schema-class",
  shouldMatch: [
    "const User = Schema.Struct({ id: Schema.String })",
    "Schema.Struct({})",
    "export const Input = Schema.Struct ({ name: Schema.String })",
    "const payload = Schema.Struct(\n  { query: Schema.String }\n)",
    // Nested inside other constructs
    "const nested = Schema.Array(Schema.Struct({ id: Schema.String }))"
  ],
  shouldNotMatch: [
    'class User extends Schema.Class<User>("User")({ id: Schema.String }) {}',
    "Schema.String",
    "Schema.Array(Schema.String)",
    "// Schema.Struct should not be used",
    'import * as Schema from "effect/Schema"',
    // String-literal contents
    'const msg = "prefer Schema.Class over Schema.Struct("',
    "const tip = `use Schema.Struct({}) sparingly`",
    // Different call: TaggedStruct is distinct
    'Schema.TaggedStruct("tag", { id: Schema.String })'
  ]
})

it("keeps context-dependent Schema.Struct review informational", async () => {
  expect((await requirePattern("prefer-schema-class")).level).toBe("info")
})
