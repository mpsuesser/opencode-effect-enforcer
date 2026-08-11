import { testPattern } from "./helpers/pattern-test-harness.ts"

testPattern({
  name: "use-command-executor-service",
  tag: "use-effect-command-executor",
  shouldMatch: [
    "import { spawn } from 'node:child_process'",
    "import * as cp from 'child_process'",
    "import { exec, execFile } from 'node:child_process'",
    "const cp = require('child_process')",
    "const cp = require('node:child_process')",
    "const cp = await import('child_process')"
  ],
  shouldNotMatch: [
    "import { ChildProcess } from 'effect/unstable/process'",
    "import { ChildProcessSpawner } from 'effect/unstable/process'",
    "import { spawn } from 'other-lib/child_process'",
    // Strings / comments mentioning the banned module
    "const note = 'wrap node:child_process with ChildProcessSpawner'",
    "// node:child_process gives callback APIs"
  ]
})
