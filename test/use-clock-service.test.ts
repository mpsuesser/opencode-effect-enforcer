import { testPattern } from "./helpers/pattern-test-harness.ts"

testPattern({
  name: "use-clock-service",
  tag: "use-effect-clock",
  shouldMatch: [
    "new Date()",
    "Date.now()",
    "Date.parse('2024-01-01')",
    "const timestamp = Date.now()",
    "new Date('2024-01-01')"
  ],
  shouldNotMatch: [
    "Clock.currentTimeMillis",
    "DateTime.now",
    "yield* Clock.currentTimeMillis",
    "const date = '2024-01-01'",
    // String / template / comment content
    "const msg = 'Date.now() is impure'",
    'const doc = "prefer Clock over new Date()"',
    "const tmpl = `use DateTime instead of Date.now()`",
    "// avoid Date.now() in domain logic",
    "/* do not use new Date() */ const x = 1",
    // Identifier substrings that contain `Date`
    "const updatedAt = now()",
    "const dateFormatter = makeFormatter()",
    // DateTime module is fine
    "yield* DateTime.now",
    "DateTime.utc()",
    // Other classes named Date should still be distinguished? — global Date reserved
    "import { fromDate } from './helpers'"
  ]
})
