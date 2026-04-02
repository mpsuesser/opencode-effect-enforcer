import { testPattern } from './pattern-test-harness.ts';

testPattern({
	name: 'avoid-option-getorthrow',

	shouldMatch: [
		'Option.getOrThrow(maybeUser)',
		'pipe(option, Option.getOrThrow)',
		'const value = option.getOrThrow()',
		'result.pipe(Option.getOrThrow)'
	],
	shouldNotMatch: [
		'Option.match(maybeUser, { onNone, onSome })',
		'Option.getOrElse(() => default)'
	]
});
