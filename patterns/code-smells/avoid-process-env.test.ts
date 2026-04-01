import { testPattern } from '../../test/pattern-test-harness';

testPattern({
	name: 'avoid-process-env',
	shouldMatch: [
		'const home = process.env.HOME',
		'process.env.API_KEY',
		"const port = process.env.PORT || '3000'",
		"if (process.env.NODE_ENV === 'production')",
		'Option.fromNullable(process.env.HOME)'
	],
	shouldNotMatch: [
		"Config.string('HOME')",
		'const env = getEnvironment()',
		'const processEnvelope = true'
	]
});
