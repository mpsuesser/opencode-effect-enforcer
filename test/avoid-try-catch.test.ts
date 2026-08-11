import { testPattern } from "./helpers/pattern-test-harness.ts"

testPattern({
  name: "avoid-try-catch",
  tag: "avoid-try-catch",
  shouldMatch: [
    "try { foo() } catch (e) { }",
    "try { foo() }",
    "try {\n  const x = riskyOperation()\n} catch (err) {\n  console.error(err)\n}",
    "try{ foo() }",
    "try  { foo() }",
    // try-finally (no catch) — still problematic, should be Effect.ensuring
    "try { x() } finally { cleanup() }",
    // try-catch-finally
    "try { x() } catch {} finally { cleanup() }",
    // catch without param binding
    "try { x() } catch { handle() }"
  ],
  shouldNotMatch: [
    "Effect.try({ try: () => foo() })",
    "Effect.tryPromise({ try: () => foo(), catch: (e) => e })",
    "const retry = 5",
    "tryPromise",
    "Effect.tryPromise",
    // String / template / comment content mentioning `try {`
    "const tmpl = 'try { run() } catch (e) {}'",
    'const doc = "avoid try { } catch in Effect code"',
    "const t = `try { x() } catch (e) { handle(e) }`",
    "// try { x } catch (e) { } belongs in boundary code",
    "/* do not use try / catch */ const x = 1",
    // Object method named `try`
    "myService.try(() => doThing())",
    // `catch` used as Promise method
    "promise.catch(e => handle(e))"
  ]
})
