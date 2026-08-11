import { testPattern } from "./helpers/pattern-test-harness.ts"

testPattern({
  name: "avoid-direct-tag-checks",
  tag: "use-type-predicates",
  shouldMatch: [
    "if (event._tag === 'FactRecorded')",
    'event._tag === "QuestionAsked"',
    "return obj._tag === 'Success'",
    "const isMatch = result._tag === 'Error'",
    "if (event._tag !== 'FactRecorded')",
    'switch (event._tag) { case "Created": return 1 }'
  ],
  shouldNotMatch: [
    "const _tag = 'FactRecorded'",
    "const tag = obj._tag",
    "console.log(event._tag)",
    "if ($is('FactRecorded')(event))",
    // String / template / comment content
    'const hint = "use Match instead of ._tag === checks"',
    "const doc = 'if (x._tag === \"A\") is fragile'",
    "const tmpl = `use $is instead of x._tag ===`",
    "// avoid event._tag === checks",
    '/* x._tag === "A" is a smell */ const y = 1',
    'event.kind !== "A"',
    'switch (event.kind) { case "Created": return 1 }',
    'Match.tag("Created", handler)'
  ]
})
