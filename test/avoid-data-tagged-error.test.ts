import { expect, it } from "vitest"
import { testPattern } from "./helpers/pattern-test-harness.ts"

import { requirePattern } from "./helpers/patterns.ts"

testPattern({
  name: "avoid-data-tagged-error",

  shouldMatch: [
    "class MyError extends Data.TaggedError('MyError')<{ message: string }> {}",
    "export class FooError extends Data.TaggedError('FooError')<{}>() {}",
    "Data.TaggedError('NotFound')"
  ],
  shouldNotMatch: [
    "Schema.TaggedError<MyError>()('MyError', { message: Schema.String })",
    "const tagged = Data.tagged('Foo')",
    "Data.TaggedEnum",
    // String / template / comment content mentioning Data.TaggedError
    "const msg = 'Data.TaggedError was removed in v4'",
    'const doc = "prefer Schema.TaggedError over Data.TaggedError"',
    "const tmpl = `migrate Data.TaggedError`",
    "// Data.TaggedError is legacy",
    "/* Data.TaggedError is deprecated */ const x = 1"
  ]
})

it("keeps internal Data.TaggedError review informational", async () => {
  expect((await requirePattern("avoid-data-tagged-error")).level).toBe("info")
})
