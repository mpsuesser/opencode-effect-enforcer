import { expect, it } from "vitest"
import { testPattern } from "./helpers/pattern-test-harness.ts"

import { requirePattern } from "./helpers/patterns.ts"

testPattern({
  name: "avoid-untagged-errors",
  tag: "avoid-untagged-errors",
  shouldMatch: [
    "if (err instanceof Error) { }",
    "new Error('oops')",
    "new Error()",
    "throw new Error('failed')",
    "try { x() } catch (e) { if (e instanceof Error) { return e.message } }",
    'const msg = err instanceof Error ? err.message : "unknown"'
  ],
  shouldNotMatch: [
    "class MyError extends Data.TaggedError('MyError')<{ message: string }> {}",
    "Effect.fail(new MyError({ message: 'oops' }))",
    "instanceof MyCustomError",
    "new ErrorHandler()",
    "Data.TaggedError",
    "Effect.die(new Error('broken invariant'))",
    "const errorCount = 5",
    // String-literal contents that mention the flagged constructs
    "const hint = 'prefer Schema.TaggedError over new Error'",
    'const doc = "check err instanceof Error first"',
    // Block comment
    "/* avoid new Error() here */ const x = 1"
  ]
})

it("keeps context-dependent raw Error review informational", async () => {
  expect((await requirePattern("avoid-untagged-errors")).level).toBe("info")
})
