import { testPattern } from "./helpers/pattern-test-harness.ts"

testPattern({
  name: "use-filesystem-service",
  tag: "use-effect-filesystem",
  shouldMatch: [
    // `fs` and `node:fs`
    "import fs from 'node:fs'",
    "import * as fs from 'fs'",
    "import { readFile } from 'node:fs'",
    "const fs = require('fs')",
    "require('node:fs')",
    // `fs/promises` and `node:fs/promises` — merged from avoid-fs-promises
    "import fs from 'fs/promises'",
    "import fsp from 'node:fs/promises'",
    "import { readFile, writeFile } from 'fs/promises'",
    "import { mkdir } from 'node:fs/promises'",
    "const fsp = require('fs/promises')",
    "const fsp = require('node:fs/promises')"
  ],
  shouldNotMatch: [
    "import { FileSystem } from 'effect'",
    "yield* FileSystem.readFile(path)",
    "import * as FileSystem from 'effect/FileSystem'",
    "import { join } from 'node:path'",
    // Strings / comments mentioning the banned modules
    "const note = 'use FileSystem instead of node:fs/promises'",
    "// node:fs/promises is callback-free but still Promise-based"
  ]
})
