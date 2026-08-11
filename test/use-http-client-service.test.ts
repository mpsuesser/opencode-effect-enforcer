import { testPattern } from "./helpers/pattern-test-harness.ts"

testPattern({
  name: "use-http-client-service",
  tag: "use-effect-http-client",
  shouldMatch: [
    "import http from 'node:http'",
    "import https from 'node:https'",
    "import * as http from 'http'",
    "import * as https from 'https'",
    "import { request } from 'node:http'",
    "import { createServer } from 'node:https'",
    "const http = require('node:http')",
    "const https = require('node:https')",
    "const http = require('http')",
    "const http = await import('node:http')"
  ],
  shouldNotMatch: [
    "import { HttpClient } from 'effect/unstable/http'",
    "import { HttpClientRequest, HttpClientResponse } from 'effect/unstable/http'",
    "import { BunHttpClient } from '@effect/platform-bun'",
    "import { NodeHttpClient } from '@effect/platform-node'",
    "import { something } from 'other-lib/http'",
    // Strings / comments mentioning the banned modules
    "const note = 'use HttpClient instead of node:http'",
    "// node:https is low-level callback API"
  ]
})
