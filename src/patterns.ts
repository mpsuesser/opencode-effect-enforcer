/**
 * Pattern Engine
 *
 * Loads, validates, and matches pattern definitions from markdown files
 * with YAML frontmatter. Patterns detect code smells and dangerous
 * commands based on regex or AST matching.
 *
 * This module is pure logic — no plugin hooks or session state.
 */

import { Lang, parse } from '@ast-grep/napi';
import * as Arr from 'effect/Array';
import * as Option from 'effect/Option';
import * as Order from 'effect/Order';
import * as Schema from 'effect/Schema';
// @ts-expect-error no type declarations
import picomatch from 'picomatch';

import * as fs from 'node:fs';
import * as path from 'node:path';

import { SKIPPED_FILES } from './constants.ts';
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

export interface PatternDefinition {
	readonly name: string;
	readonly description: string;
	readonly event: 'before' | 'after';
	readonly tool: string;
	readonly glob?: string;
	readonly pattern: string;
	readonly detector: 'regex' | 'ast';
	readonly inside?: string;
	readonly action: 'context' | 'ask' | 'deny';
	readonly level: 'critical' | 'high' | 'medium' | 'warning' | 'info';
	readonly suggestSkills?: readonly string[];
	readonly body: string;
	readonly filePath: string;
}

// ─── Pure Helpers ─────────────────────────────────────────────

const isSkippedFile = (filename: string): boolean =>
	SKIPPED_FILES.some(
		(prefix) =>
			filename.startsWith(prefix) ||
			filename.toLowerCase() === `${prefix.toLowerCase()}.md`
	);

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

// ─── Pattern Reading ──────────────────────────────────────────

const decodePattern = Schema.decodeUnknownOption(PatternFrontmatter);

const normalizeEvent = (event: string | undefined): 'before' | 'after' => {
	if (!event) return 'after';
	const lower = event.toLowerCase();
	return lower === 'pretooluse' || lower === 'before' ? 'before' : 'after';
};

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
	if (Option.isNone(result)) return null;

	const fm = result.value;

	if (fm.detector !== 'ast' && !validateRegex(fm.pattern)) return null;
	if (fm.tool !== '.*' && !validateRegex(fm.tool)) return null;

	return {
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
	};
};

// ─── Pattern Loading ──────────────────────────────────────────

const walkPatternDir = (dir: string): PatternDefinition[] => {
	const results: PatternDefinition[] = [];
	let entries: string[];
	try {
		entries = fs.readdirSync(dir);
	} catch {
		return results;
	}

	for (const entry of entries) {
		const fullPath = path.join(dir, entry);
		let stat: fs.Stats;
		try {
			stat = fs.statSync(fullPath);
		} catch {
			continue;
		}

		if (stat.isDirectory()) {
			results.push(...walkPatternDir(fullPath));
		} else if (entry.endsWith('.md') && !isSkippedFile(entry)) {
			let content: string;
			try {
				content = fs.readFileSync(fullPath, 'utf-8');
			} catch {
				continue;
			}
			const pattern = readPattern(fullPath, content);
			if (pattern) results.push(pattern);
		}
	}

	return results;
};

let cachedPatterns: PatternDefinition[] | null = null;

export const getPatterns = (): PatternDefinition[] => {
	if (cachedPatterns) return cachedPatterns;

	const dirname = import.meta.dirname ?? '.';
	const patternsDir = path.join(dirname, '..', 'patterns');

	try {
		cachedPatterns = fs.existsSync(patternsDir)
			? walkPatternDir(patternsDir)
			: [];
	} catch {
		cachedPatterns = [];
	}

	return cachedPatterns;
};

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
	return JSON.stringify(input);
};

const getFilePath = (input: Record<string, unknown>): string | undefined => {
	const fp = input.filePath;
	return typeof fp === 'string' ? fp : undefined;
};

export const matches = (
	toolName: string,
	args: Record<string, unknown>,
	eventType: 'before' | 'after',
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

// ─── Sorting & Formatting ─────────────────────────────────────

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

export const sortByLevel = (
	patterns: PatternDefinition[]
): PatternDefinition[] => Arr.sort(patterns, PatternLevelOrder);

export const bodyWithSkillHints = (p: PatternDefinition): string => {
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
