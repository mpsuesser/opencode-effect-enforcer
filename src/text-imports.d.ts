/** Allow importing markdown files as text via Bun's text loader. */
declare module '*.md' {
	const content: string;
	export default content;
}
