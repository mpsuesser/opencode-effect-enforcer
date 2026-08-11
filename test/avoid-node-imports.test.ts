import { testPattern } from "./helpers/pattern-test-harness.ts"

testPattern({
  name: "avoid-node-imports",
  tag: "use-effect-platform",
  shouldMatch: [
    // Modules without a dedicated rule fall under this catch-all.
    'import * as stream from "node:stream"',
    'import readline from "node:readline"',
    'import "node:crypto"',
    'import * as url from "node:url"',
    'import net from "node:net"',
    'const crypto = await import("node:crypto")',
    'const stream = require("node:stream")'
  ],
  shouldNotMatch: [
    // Effect imports — always fine.
    'import * as Path from "effect/Path"',
    'import * as FileSystem from "effect/FileSystem"',
    'import * as HttpClient from "effect/unstable/http/HttpClient"',
    'import * as ChildProcess from "effect/unstable/process/ChildProcess"',
    'import { Stream } from "effect"',
    'import * as Terminal from "effect/Terminal"',
    'import { node } from "other-lib"',
    // Covered by dedicated `use-*-service` rules — must NOT also match here
    // to avoid duplicate diagnostics.
    'import * as path from "node:path"',
    'import * as fs from "node:fs"',
    'import { readFile } from "node:fs/promises"',
    'import { spawn } from "node:child_process"',
    'import http from "node:http"',
    'import https from "node:https"',
    'import os from "node:os"',
    "const fs = require('node:fs')",
    "const path = require( 'node:path' )",
    "const cp = require('node:child_process')",
    "const http = require('node:http')",
    'const fs = await import("node:fs")'
  ]
})
