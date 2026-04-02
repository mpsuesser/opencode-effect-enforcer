import { testPattern } from './pattern-test-harness.ts';

testPattern({
	name: 'prefer-match-over-switch',
	tag: 'ef-7-match-over-switch',
	shouldMatch: [
		'switch (phase) {',
		'switch (event.type) { case "click":',
		'switch(value){',
		'switch (action) {\n  case "create":\n    break;\n}',
		'return switch (status) {'
	],
	shouldNotMatch: [
		'Match.value(phase).pipe(',
		'// switch statements should not be used',
		'const switchEnabled = true',
		'import { Match } from "effect"'
	]
});
