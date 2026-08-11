import { testPattern } from "./helpers/pattern-test-harness.ts"

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
    "const errorCount = 5",
    // String-literal contents that mention the flagged constructs
    "const hint = 'prefer Schema.TaggedErrorClass over new Error'",
    'const doc = "check err instanceof Error first"',
    // Block comment
    "/* avoid new Error() here */ const x = 1"
  ]
})
