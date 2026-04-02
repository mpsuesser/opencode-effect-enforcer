import { testPattern } from './pattern-test-harness.ts';

testPattern({
	name: 'avoid-native-fetch',
	tag: 'ef-9b-no-native-fetch',
	shouldMatch: [
		'const response = await fetch("https://api.example.com")',
		'fetch("/api/users", { method: "POST" })',
		'return fetch(url)',
		'const data = await fetch(endpoint).then(r => r.json())'
	],
	shouldNotMatch: [
		'HttpClient.execute(request)',
		'HttpClientRequest.get("/api/users")',
		'const fetchData = Effect.fn("fetchData")',
		'// fetch should not be used directly',
		'const prefetch = () => {}'
	]
});
