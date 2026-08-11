import { testPattern } from "./helpers/pattern-test-harness.ts"

testPattern({
  name: "prefer-match-over-switch",
  tag: "ef-7-match-over-switch",
  shouldMatch: [
    "switch (phase) { case 1: break }",
    'switch (event.type) { case "click": handleClick(); break }',
    "switch(value){ case 1: break }",
    'switch (action) {\n  case "create":\n    break;\n}',
    // Nested switch
    "function f() { switch (x) { case 1: break; default: break } }"
  ],
  shouldNotMatch: [
    'Match.value(phase).pipe(Match.when("a", () => 1))',
    "// switch statements should not be used",
    "const switchEnabled = true",
    'import { Match } from "effect"',
    // String-literal contents mentioning `switch`
    'const code = "switch (x) { case 1: break }"',
    "const tip = `prefer Match.value over switch (x)`",
    // Block comment
    "/* use switch (x) sparingly */ const y = 1"
  ]
})
