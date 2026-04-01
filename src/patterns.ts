/**
 * OpenCode Effect Enforcer — Patterns Plugin
 *
 * Detects dangerous commands and code smells based on pattern definitions.
 * Patterns are defined in patterns/ as markdown files with YAML frontmatter.
 *
 * - `before` patterns can block (deny) or prompt (ask) for dangerous commands
 * - `after` patterns provide context/suggestions after tool execution
 */

import { Lang, parse } from '@ast-grep/napi';
import * as BunServices from '@effect/platform-bun/BunServices';
import type { Plugin } from '@opencode-ai/plugin';
import * as Arr from 'effect/Array';
import * as Effect from 'effect/Effect';
import * as FileSystem from 'effect/FileSystem';
import * as Option from 'effect/Option';
import * as Order from 'effect/Order';
import * as Path from 'effect/Path';
import * as Schema from 'effect/Schema';
// @ts-expect-error no type declarations
import picomatch from 'picomatch';

import { extractBody, parseFrontmatter } from './frontmatter.ts';

// ─── Schema Definitions ───────────────────────────────────────

const PatternEvent = Schema.Literals(['before', 'after'] as const);
type PatternEvent = typeof PatternEvent.Type;

const PatternAction = Schema.Literals(['context', 'ask', 'deny'] as const);
type PatternAction = typeof PatternAction.Type;

const PatternLevel = Schema.Literals([
	'critical',
	'high',
	'medium',
	'warning',
	'info'
] as const);
type PatternLevel = typeof PatternLevel.Type;

const PatternDetector = Schema.Literals(['regex', 'ast'] as const);
type PatternDetector = typeof PatternDetector.Type;

const PatternFrontmatter = Schema.Struct({
	name: Schema.String,
	description: Schema.String.pipe(Schema.withDecodingDefault(() => '')),
	event: PatternEvent.pipe(
		Schema.withDecodingDefault(() => 'after' as const)
	),
	tool: Schema.String.pipe(Schema.withDecodingDefault(() => '.*')),
	glob: Schema.String.pipe(Schema.optionalKey),
	pattern: Schema.String,
	detector: PatternDetector.pipe(
		Schema.withDecodingDefault(() => 'regex' as const)
	),
	inside: Schema.String.pipe(Schema.optionalKey),
	action: PatternAction.pipe(
		Schema.withDecodingDefault(() => 'context' as const)
	),
	level: PatternLevel.pipe(Schema.withDecodingDefault(() => 'info' as const)),
	suggestSkills: Schema.Array(Schema.String).pipe(Schema.optionalKey)
});
type PatternFrontmatter = typeof PatternFrontmatter.Type;

class PatternDefinition extends Schema.Class<PatternDefinition>(
	'PatternDefinition'
)({
	name: Schema.String,
	description: Schema.String,
	event: PatternEvent,
	tool: Schema.String,
	glob: Schema.String.pipe(Schema.optionalKey),
	pattern: Schema.String,
	detector: PatternDetector,
	inside: Schema.String.pipe(Schema.optionalKey),
	action: PatternAction,
	level: PatternLevel,
	suggestSkills: Schema.Array(Schema.String).pipe(Schema.optionalKey),
	body: Schema.String,
	filePath: Schema.String
}) {}

// ─── Pure Helpers ─────────────────────────────────────────────

const SKIPPED_FILES = ['CLAUDE', 'AGENTS', 'GEMINI', 'README'];

const isSkippedFile = (filename: string): boolean =>
	SKIPPED_FILES.some(
		(prefix) =>
			filename.startsWith(prefix) ||
			filename.toLowerCase() === `${prefix.toLowerCase()}.md`
	);

const normalizeEvent = (event: string | undefined): PatternEvent => {
	if (!event) return 'after';
	const lower = event.toLowerCase();
	if (lower === 'pretooluse' || lower === 'before') return 'before';
	return 'after';
};

const validateRegex = (pattern: string): boolean => {
	try {
		new RegExp(pattern);
		return true;
	} catch {
		return false;
	}
};

const testRegex = (text: string, pattern: string): boolean => {
	try {
		return new RegExp(pattern).test(text);
	} catch {
		return false;
	}
};

const testGlob = (filePath: string, glob: string): boolean => {
	try {
		return picomatch(glob)(filePath);
	} catch {
		return false;
	}
};

const langFromPath = (filePath: string | undefined): Lang | null => {
	if (!filePath) return null;
	if (filePath.endsWith('.tsx')) return Lang.Tsx;
	if (filePath.endsWith('.ts')) return Lang.TypeScript;
	if (filePath.endsWith('.jsx')) return Lang.Tsx;
	if (filePath.endsWith('.js')) return Lang.JavaScript;
	return null;
};

const testAst = (
	text: string,
	pattern: PatternDefinition,
	filePath: string | undefined
): boolean => {
	const lang = langFromPath(filePath);
	if (!lang) return false;

	try {
		const root = parse(lang, text).root();
		const nodes = pattern.inside
			? root.findAll({
					rule: {
						pattern: pattern.pattern,
						inside: {
							pattern: pattern.inside,
							stopBy: 'end'
						}
					}
				})
			: root.findAll(pattern.pattern);
		return nodes.length > 0;
	} catch {
		return false;
	}
};

const decodePattern = Schema.decodeUnknownOption(PatternFrontmatter);

const readPattern = (
	filePath: string,
	content: string
): PatternDefinition | null => {
	const raw = parseFrontmatter(content);
	if (!raw.name || !raw.pattern) return null;

	const normalized = {
		...raw,
		event: normalizeEvent(raw.event as string | undefined)
	};

	const result = decodePattern(normalized);
	if (Option.isNone(result)) {
		return null;
	}

	const fm = result.value;

	if (fm.detector !== 'ast' && !validateRegex(fm.pattern)) {
		return null;
	}

	if (fm.tool !== '.*' && !validateRegex(fm.tool)) {
		return null;
	}

	return new PatternDefinition({
		name: fm.name,
		description: fm.description,
		event: fm.event,
		tool: fm.tool,
		...(fm.glob !== undefined ? { glob: fm.glob } : {}),
		pattern: fm.pattern,
		detector: fm.detector,
		...(fm.inside !== undefined ? { inside: fm.inside } : {}),
		action: fm.action,
		level: fm.level,
		...(fm.suggestSkills !== undefined
			? { suggestSkills: fm.suggestSkills }
			: {}),
		body: extractBody(content),
		filePath
	});
};

// ─── Effect-based Directory Walking ───────────────────────────

/** Recursively walk a directory and collect PatternDefinitions from .md files. */
const walkPatternDir = (
	dir: string
): Effect.Effect<
	PatternDefinition[],
	never,
	FileSystem.FileSystem | Path.Path
> =>
	Effect.gen(function* () {
		const fs = yield* FileSystem.FileSystem;
		const p = yield* Path.Path;

		const entries = yield* fs
			.readDirectory(dir)
			.pipe(Effect.catch(() => Effect.succeed([] as string[])));

		const results: PatternDefinition[] = [];

		for (const entry of entries) {
			const fullPath = p.join(dir, entry);
			const info = yield* fs
				.stat(fullPath)
				.pipe(
					Effect.catch(() =>
						Effect.succeed(null as { type: string } | null)
					)
				);
			if (!info) continue;

			if (info.type === 'Directory') {
				const subPatterns = yield* walkPatternDir(fullPath);
				results.push(...subPatterns);
			} else if (entry.endsWith('.md') && !isSkippedFile(entry)) {
				const content = yield* fs
					.readFileString(fullPath)
					.pipe(Effect.catch(() => Effect.succeed('')));
				const pattern = readPattern(fullPath, content);
				if (pattern) results.push(pattern);
			}
		}

		return results;
	});

/** Load all pattern definitions from the patterns directory. */
const loadPatterns = Effect.gen(function* () {
	const p = yield* Path.Path;
	const fs = yield* FileSystem.FileSystem;
	const dirname = import.meta.dirname ?? '.';
	const packageRoot = p.join(dirname, '..');
	const patternsDir = p.join(packageRoot, 'patterns');

	const exists = yield* fs
		.exists(patternsDir)
		.pipe(Effect.catch(() => Effect.succeed(false)));
	if (!exists) return [];

	return yield* walkPatternDir(patternsDir).pipe(
		Effect.catchCause((cause) =>
			Effect.gen(function* () {
				yield* Effect.logError(
					`Failed to load patterns from ${patternsDir}`,
					cause
				);
				return [] as PatternDefinition[];
			})
		)
	);
}).pipe(Effect.provide(BunServices.layer));

// ─── Pattern Matching ─────────────────────────────────────────

const contentFields = [
	'command',
	'newString',
	'content',
	'pattern',
	'query',
	'url',
	'prompt'
] as const;

const getMatchableContent = (input: Record<string, unknown>): string => {
	for (const field of contentFields) {
		if (typeof input[field] === 'string') {
			return input[field] as string;
		}
	}
	return String(input);
};

const getFilePath = (input: Record<string, unknown>): string | undefined => {
	const fp = input.filePath;
	return typeof fp === 'string' ? fp : undefined;
};

const matches = (
	toolName: string,
	args: Record<string, unknown>,
	eventType: PatternEvent,
	pattern: PatternDefinition
): boolean => {
	const filePath = getFilePath(args);
	const content = getMatchableContent(args);

	const globMatches = pattern.glob
		? filePath !== undefined && testGlob(filePath, pattern.glob)
		: true;

	if (
		pattern.event !== eventType ||
		!testRegex(toolName, pattern.tool) ||
		!globMatches
	) {
		return false;
	}

	if (pattern.detector === 'ast') {
		return testAst(content, pattern, filePath);
	}

	return testRegex(content, pattern.pattern);
};

const levelPriority: Record<PatternLevel, number> = {
	critical: 0,
	high: 1,
	medium: 2,
	warning: 3,
	info: 4
};

const PatternLevelOrder = Order.mapInput(
	Order.Number,
	(p: PatternDefinition) => levelPriority[p.level]
);

const sortByLevel = (patterns: PatternDefinition[]): PatternDefinition[] =>
	Arr.sort(patterns, PatternLevelOrder);

const bodyWithSkillHints = (p: PatternDefinition): string => {
	if (p.suggestSkills === undefined || p.suggestSkills.length === 0) {
		return p.body;
	}
	const hints = p.suggestSkills
		.map(
			(skill) =>
				`If you have not loaded the \`${skill}\` skill, you should load it before continuing.`
		)
		.join('\n');
	return `${p.body}\n\n${hints}`;
};

// ─── Cached Pattern Loading ───────────────────────────────────

let cachedPatterns: PatternDefinition[] | null = null;

const getPatterns = async (): Promise<PatternDefinition[]> => {
	if (cachedPatterns) return cachedPatterns;
	cachedPatterns = await Effect.runPromise(loadPatterns);
	return cachedPatterns;
};

// ─── Guidance Doc Injection ───────────────────────────────────

const loadDoc = (filename: string) =>
	Effect.gen(function* () {
		const fs = yield* FileSystem.FileSystem;
		const p = yield* Path.Path;
		const dirname = import.meta.dirname ?? '.';
		const packageRoot = p.join(dirname, '..');
		const docPath = p.join(packageRoot, 'docs', filename);
		const exists = yield* fs
			.exists(docPath)
			.pipe(Effect.catch(() => Effect.succeed(false)));
		if (!exists) return '';
		return yield* fs
			.readFileString(docPath)
			.pipe(Effect.catch(() => Effect.succeed('')));
	}).pipe(Effect.provide(BunServices.layer));

let cachedProgressiveDisclosureDoc: string | null = null;
let cachedGuidanceDoc: string | null = null;

const getProgressiveDisclosureDoc = async (): Promise<string> => {
	if (cachedProgressiveDisclosureDoc !== null)
		return cachedProgressiveDisclosureDoc;
	cachedProgressiveDisclosureDoc = await Effect.runPromise(
		loadDoc('progressive-disclosure-guidance.md')
	);
	return cachedProgressiveDisclosureDoc;
};

const getGuidanceDoc = async (): Promise<string> => {
	if (cachedGuidanceDoc !== null) return cachedGuidanceDoc;
	cachedGuidanceDoc = await Effect.runPromise(
		loadDoc('effect-first-development.md')
	);
	return cachedGuidanceDoc;
};

const injectedSessions = new Set<string>();

// ─── Plugin ───────────────────────────────────────────────────

import {
	createReferenceTools,
	detectEffectVersion,
	ensureCachedFile,
	extractReferencePath
} from './reference-tools.ts';

export const EffectEnforcerPlugin: Plugin = async (pluginInput) => {
	const effectVersion = detectEffectVersion(pluginInput.directory);
	const referenceTools = createReferenceTools(effectVersion);
	const { client } = pluginInput;

	const injectGuidance = async (sessionID: string): Promise<void> => {
		const progressiveDisclosureDoc = await getProgressiveDisclosureDoc();
		if (progressiveDisclosureDoc) {
			await client.session.prompt({
				path: { id: sessionID },
				body: {
					noReply: true,
					parts: [
						{
							type: 'text',
							text: `<progressive-disclosure-guidance>\n${progressiveDisclosureDoc}\n</progressive-disclosure-guidance>`,
							synthetic: true
						}
					]
				}
			});
		}

		const doc = await getGuidanceDoc();
		if (doc) {
			await client.session.prompt({
				path: { id: sessionID },
				body: {
					noReply: true,
					parts: [
						{
							type: 'text',
							text: `<effect-first-development-guide>\n${doc}\n</effect-first-development-guide>`,
							synthetic: true
						}
					]
				}
			});
		}
	};

	return {
		tool: referenceTools,

		'chat.message': async (_input, output) => {
			const sessionID = (output as Record<string, unknown>).message
				? ((
						(output as Record<string, unknown>).message as Record<
							string,
							unknown
						>
					).sessionID as string)
				: undefined;
			if (!sessionID) return;

			if (injectedSessions.has(sessionID)) return;
			injectedSessions.add(sessionID);
			await injectGuidance(sessionID);
		},

		event: async ({ event }) => {
			if (event.type === 'session.compacted') {
				const sessionID = (event.properties as Record<string, unknown>)
					.sessionID as string;
				if (sessionID) {
					injectedSessions.delete(sessionID);
					await injectGuidance(sessionID);
					injectedSessions.add(sessionID);
				}
			}
			if (event.type === 'session.deleted') {
				const info = (event.properties as Record<string, unknown>)
					.info as Record<string, unknown> | undefined;
				const sessionID = info?.id as string | undefined;
				if (sessionID) {
					injectedSessions.delete(sessionID);
				}
			}
		},

		'tool.execute.before': async (input, output) => {
			// ── Path intercept for legacy .references/ paths ──
			if (input.tool === 'read') {
				const filePath = (output.args as Record<string, unknown>)
					.filePath;
				if (typeof filePath === 'string') {
					const refPath = extractReferencePath(filePath);
					if (refPath) {
						(output.args as Record<string, string>).filePath =
							await ensureCachedFile(effectVersion, refPath);
						return;
					}
				}
			}

			// ── Pattern detection ──
			const { client } = pluginInput;
			const patterns = await getPatterns();

			const toolName = input.tool;
			const args = output.args as Record<string, unknown>;

			const matched = patterns.filter((p: PatternDefinition) =>
				matches(toolName, args, 'before', p)
			);
			if (matched.length === 0) return;

			const blockingPatterns = sortByLevel(
				matched.filter(
					(p: PatternDefinition) =>
						p.action === 'deny' || p.action === 'ask'
				)
			);
			const primary = blockingPatterns[0];

			if (primary?.action === 'deny') {
				throw new Error(
					`[DENIED] ${primary.name}: ${primary.description}\n\n${bodyWithSkillHints(primary)}`
				);
			}

			if (primary?.action === 'ask') {
				await client.session.prompt({
					path: {
						id: input.sessionID
					},
					body: {
						noReply: true,
						parts: [
							{
								type: 'text',
								text: `<pattern-warning name="${primary.name}" level="${primary.level}">\n${bodyWithSkillHints(primary)}\n</pattern-warning>`
							}
						]
					}
				});
			}

			const contextPatterns = matched.filter(
				(p: PatternDefinition) => p.action === 'context'
			);
			if (contextPatterns.length > 0) {
				const message = contextPatterns
					.map(
						(p: PatternDefinition) =>
							`<code-smell name="${p.name}" level="${p.level}">\n${bodyWithSkillHints(p)}\n</code-smell>`
					)
					.join('\n\n');

				await client.session.prompt({
					path: {
						id: input.sessionID
					},
					body: {
						noReply: true,
						parts: [
							{
								type: 'text',
								text: message
							}
						]
					}
				});
			}
		},

		'tool.execute.after': async (input, output) => {
			const { client } = pluginInput;
			const patterns = await getPatterns();

			const toolName = input.tool;
			const pseudoArgs: Record<string, unknown> = {
				content: output.output
			};

			const contextPatterns = patterns.filter(
				(p: PatternDefinition) =>
					matches(toolName, pseudoArgs, 'after', p) &&
					p.action === 'context'
			);

			if (contextPatterns.length === 0) return;

			const message = contextPatterns
				.map(
					(p: PatternDefinition) =>
						`<code-smell name="${p.name}" level="${p.level}">\n${bodyWithSkillHints(p)}\n</code-smell>`
				)
				.join('\n\n');

			await client.session.prompt({
				path: {
					id: input.sessionID
				},
				body: {
					noReply: true,
					parts: [
						{
							type: 'text',
							text: message
						}
					]
				}
			});
		}
	};
};

/** @deprecated Use `EffectEnforcerPlugin` instead. */
export const PatternsPlugin = EffectEnforcerPlugin;

export default EffectEnforcerPlugin;
