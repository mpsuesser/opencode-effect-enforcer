import { testPattern } from "./helpers/pattern-test-harness.ts"

testPattern({
  name: "avoid-platform-coupling",
  shouldMatch: [
    `import * as BunServices from "@effect/platform-bun/BunServices"`,
    `import { BunRuntime } from "@effect/platform-bun/BunRuntime"`,
    `import { BunServices } from "@effect/platform-bun"`,
    `import { NodeServices } from "@effect/platform-node"`,
    `const platform = await import("@effect/platform-node/NodeServices")`
  ],
  shouldNotMatch: [
    `import * as ChildProcessSpawner from "effect/unstable/process/ChildProcessSpawner"`,
    `import * as FileSystem from "effect/FileSystem"`,
    `import * as HttpClient from "effect/unstable/http/HttpClient"`
  ]
})
