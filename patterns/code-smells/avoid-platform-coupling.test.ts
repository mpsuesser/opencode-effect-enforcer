import { testPattern } from '../../test/pattern-test-harness';

testPattern({
	name: 'avoid-platform-coupling',
	shouldMatch: [
		`import * as BunServices from "@effect/platform-bun/BunServices"`,
		`import { BunRuntime } from "@effect/platform-bun/BunRuntime"`,
		`import * as BunContext from "@effect/platform-bun/BunContext"`
	],
	shouldNotMatch: [
		`import * as ChildProcessSpawner from "effect/unstable/process/ChildProcessSpawner"`,
		`import * as FileSystem from "effect/FileSystem"`,
		`import * as HttpClient from "effect/unstable/http/HttpClient"`
	]
});
