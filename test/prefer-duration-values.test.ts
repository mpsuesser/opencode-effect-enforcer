import { testPattern } from "./helpers/pattern-test-harness.ts"

testPattern({
  name: "prefer-duration-values",
  tag: "ef-16-duration-values",
  shouldMatch: [
    "Effect.sleep(1000)",
    "Effect.delay(program, 1000)",
    "program.pipe(Effect.delay(1000))",
    "Effect.timeout(program, 5000)",
    "program.pipe(Effect.timeout(5000))",
    "Effect.timeoutOption(program, 5000)",
    "program.pipe(Effect.timeoutOption(5000))",
    "Effect.timeoutOrElse(program, { duration: 5000, orElse: () => fallback })",
    "program.pipe(Effect.timeoutOrElse({ duration: 5000, orElse: () => fallback }))",
    "Schedule.duration(1000)",
    "Schedule.fixed(1000)",
    "Schedule.spaced(1000)",
    "Schedule.windowed(1000)"
  ],
  shouldNotMatch: [
    "Effect.sleep(Duration.seconds(1))",
    "Effect.delay(program, Duration.seconds(1))",
    "program.pipe(Effect.delay(Duration.seconds(1)))",
    "Effect.timeout(program, Duration.seconds(5))",
    "program.pipe(Effect.timeout(Duration.seconds(5)))",
    "Effect.timeoutOption(program, Duration.seconds(5))",
    "program.pipe(Effect.timeoutOption(Duration.seconds(5)))",
    "Effect.timeoutOrElse(program, { duration: Duration.seconds(5), orElse: () => fallback })",
    "program.pipe(Effect.timeoutOrElse({ duration: Duration.seconds(5), orElse: () => fallback }))",
    "Schedule.spaced(Duration.millis(250))",
    "Duration.millis(1000)",
    "const timeoutMs = 1000",
    "const millis = 1000",
    "// Effect.sleep(1000)",
    'const doc = "Effect.timeout(program, 5000)"'
  ]
})
