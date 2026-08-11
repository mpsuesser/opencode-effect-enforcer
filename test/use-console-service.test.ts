import { testPattern } from "./helpers/pattern-test-harness.ts"

testPattern({
  name: "use-console-service",
  tag: "use-effect-console",
  shouldMatch: [
    "console.log('hello')",
    "console.error(err)",
    "console.warn('warning')",
    "console.info('info')",
    "console.debug('debug')",
    "console.trace()"
  ],
  shouldNotMatch: [
    "Console.log('hello')",
    "Effect.log('hello')",
    "Effect.logError(err)",
    "yield* Console.error('error')",
    "const console = mockConsole",
    // String / template / comment content
    "const tip = 'use Effect.logInfo, not console.log'",
    'const doc = "replace console.error with Effect.logError"',
    "const tmpl = `avoid console.warn in domain`",
    "// console.log is fine in scripts",
    "/* avoid console.error here */ const x = 1",
    // Method names that aren't `console`
    "logger.log('hello')",
    "myConsole.log(x)"
  ]
})
