import { testPattern } from '../../test/pattern-test-harness';

testPattern({
	name: 'avoid-node-imports',
	tag: 'use-effect-platform',
	shouldMatch: [
		'import * as path from "node:path"',
		'import * as fs from "node:fs"',
		'import { spawn } from "node:child_process"',
		'import http from "node:http"',
		'import * as stream from "node:stream"',
		'import readline from "node:readline"',
		"const fs = require('node:fs')",
		"const path = require( 'node:path' )",
		'from "node:crypto"'
	],
	shouldNotMatch: [
		'import * as Path from "effect/Path"',
		'import * as FileSystem from "effect/FileSystem"',
		'import * as HttpClient from "effect/unstable/http/HttpClient"',
		'import * as ChildProcess from "effect/unstable/process/ChildProcess"',
		'import { Stream } from "effect"',
		'import * as Terminal from "effect/Terminal"',
		'import { node } from "other-lib"'
	]
});
