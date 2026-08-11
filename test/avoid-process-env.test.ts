import { testPattern } from "./helpers/pattern-test-harness.ts"

testPattern({
  name: "avoid-process-env",
  shouldMatch: [
    "const home = process.env.HOME",
    "process.env.API_KEY",
    "const port = process.env.PORT || '3000'",
    "if (process.env.NODE_ENV === 'production')",
    "Option.fromNullable(process.env.HOME)"
  ],
  shouldNotMatch: [
    "Config.string('HOME')",
    "const env = getEnvironment()",
    "const processEnvelope = true",
    // String / template / comment content
    'const msg = "avoid process.env in domain"',
    "const doc = 'read process.env only at boundaries'",
    "const tmpl = `use Config.string instead of process.env`",
    "// process.env is a raw side effect",
    "/* avoid process.env */ const x = 1",
    // Similar but distinct constructs
    "ctx.env.HOME",
    "myProcess.env.PORT"
  ]
})
