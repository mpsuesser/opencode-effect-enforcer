import { testPattern } from "./helpers/pattern-test-harness.ts"

testPattern({
  name: "avoid-schema-suffix",
  tag: "ef-3-no-schema-suffix",
  shouldMatch: [
    "const UserSchema = Schema.String",
    "const OrderIdSchema = Schema.Number",
    "export const PayloadSchema = Schema.Struct({ query: Schema.String })",
    "let InputSchema = Schema.Class"
  ],
  shouldNotMatch: [
    "const User = Schema.String",
    "export const OrderId = Schema.Number",
    'class Payload extends Schema.Class<Payload>("Payload")({})',
    "const schema = Schema.String",
    'import * as Schema from "effect/Schema"'
  ]
})
