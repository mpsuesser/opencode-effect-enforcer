import { testPattern } from "./helpers/pattern-test-harness.ts"

testPattern({
  name: "avoid-option-getorthrow",

  shouldMatch: [
    "Option.getOrThrow(maybeUser)",
    "pipe(option, Option.getOrThrow)",
    "const value = option.getOrThrow()",
    "result.pipe(Option.getOrThrow)"
  ],
  shouldNotMatch: [
    "Option.match(maybeUser, { onNone, onSome })",
    "Option.getOrElse(() => fallback)",
    // String / template / comment content
    "const hint = 'avoid Option.getOrThrow'",
    'const doc = "prefer Option.match over Option.getOrThrow"',
    "const tmpl = `never call Option.getOrThrow`",
    "// avoid Option.getOrThrow",
    "/* never use Option.getOrThrow */ const x = 1"
  ]
})
