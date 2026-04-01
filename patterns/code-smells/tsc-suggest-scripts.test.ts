import { testPattern } from '../../test/pattern-test-harness';

testPattern({
	name: 'tsc-suggest-scripts',
	tag: 'tsc-context',
	shouldMatch: [
		'tsc',
		'tsc --build',
		'tsc --build .',
		'tsc --noEmit',
		'tsc --watch',
		'tsc -p tsconfig.json',
		'tsc --project tsconfig.json'
	],
	shouldNotMatch: [
		'mise run typecheck',
		'mise run tc',
		'npm run typecheck',
		'bun run typecheck',
		'yarn typecheck'
	]
});
