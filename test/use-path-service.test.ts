import { testPattern } from "./helpers/pattern-test-harness.ts"

testPattern({
  name: "use-path-service",
  tag: "use-effect-path",
  shouldMatch: [
    "import path from 'node:path'",
    "import * as path from 'path'",
    "import { join } from 'node:path'",
    "import { dirname, basename } from 'path'"
  ],
  shouldNotMatch: [
    "import { Path } from 'effect'",
    "yield* Path.join(dir, file)",
    "import * as Path from 'effect/Path'",
    "const filePath = '/some/path'",
    "import fs from 'node:fs'"
  ]
})
