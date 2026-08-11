import { testPattern } from "./helpers/pattern-test-harness.ts"

testPattern({
  name: "use-random-service",
  tag: "use-effect-random",
  shouldMatch: [
    "Math.random()",
    "const rand = Math.random()",
    "Math.floor(Math.random() * 100)",
    "const value = Math.random()",
    "if (Math.random() > 0.5) { doSomething() }"
  ],
  shouldNotMatch: [
    "Random.next",
    "Random.nextInt",
    "Random.nextIntBetween(0, 100)",
    "const randomService = Random",
    "yield* Random.nextRange(1, 100)",
    // String / template / comment content
    "const msg = 'avoid Math.random()'",
    'const doc = "use Random service instead of Math.random()"',
    "const tmpl = `avoid Math.random() in domain`",
    "// Math.random() is non-deterministic",
    "/* Math.random() is side-effectful */",
    // Other Math methods are not flagged
    "Math.floor(0.5)",
    "Math.max(1, 2)"
  ]
})
