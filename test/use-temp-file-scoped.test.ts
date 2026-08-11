import { testPattern } from "./helpers/pattern-test-harness.ts"

testPattern({
  name: "use-temp-file-scoped",
  tag: "use-scoped-temp",
  shouldMatch: [
    "import os from 'os'",
    "import * as os from 'os'",
    "require('os')",
    "const os = await import('node:os')",
    "os.tmpdir()",
    "FileSystem.makeTempFile()",
    "FileSystem.makeTempDirectory()",
    "const tmpFile = yield* FileSystem.makeTempFile()"
  ],
  shouldNotMatch: [
    "makeTempFileScoped",
    "makeTempDirectoryScoped",
    "yield* FileSystem.makeTempFileScoped()",
    "const osName = 'linux'",
    "const temp = createTempFileScoped()"
  ]
})
