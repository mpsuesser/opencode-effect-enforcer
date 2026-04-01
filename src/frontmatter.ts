/**
 * Shared frontmatter utilities for OpenCode plugins.
 *
 * Provides YAML frontmatter parsing and body extraction for markdown
 * pattern/skill/agent definition files. All YAML parsing uses the `yaml`
 * library — no ad-hoc regex line parsers.
 */
import YAML from 'yaml';

const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---/;

/**
 * Pre-process YAML frontmatter values to prevent parse failures.
 *
 * Pattern frontmatter frequently contains regex strings with YAML
 * indicator characters (`@`, `[`, `!`, `:`, `'`, `"`, `{`, etc.).
 * This pre-processor wraps unquoted values in double-quotes when they
 * contain anything beyond trivially safe characters.
 *
 * Values that are already quoted (`'...'` or `"..."`) pass through.
 * Block sequence lines (`  - item`) and bare keys (`key:`) pass through.
 */
const isAlreadyQuoted = (val: string): boolean =>
	(val.startsWith("'") && val.endsWith("'")) ||
	(val.startsWith('"') && val.endsWith('"'));

/** A value is safe if it contains only alphanumeric, space, hyphen, dot, underscore, slash. */
const SAFE_VALUE_RE = /^[\w\s.\-/]+$/;

const quoteYamlValue = (line: string): string => {
	const m = line.match(/^(\s*)(\w[\w-]*):\s+(.+)$/);
	if (!m) return line;
	const [, indent, key, val] = m as [string, string, string, string];
	if (isAlreadyQuoted(val) || SAFE_VALUE_RE.test(val)) return line;
	const escaped = val.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
	return `${indent}${key}: "${escaped}"`;
};

/**
 * Extract and parse YAML frontmatter from a markdown string.
 *
 * Pre-processes unquoted values containing YAML special characters
 * (common in regex pattern definitions) before parsing. Returns an
 * empty record when the content has no frontmatter block or when the
 * YAML is malformed.
 */
export const parseFrontmatter = (content: string): Record<string, unknown> => {
	const match = content.match(FRONTMATTER_RE);
	if (!match?.[1]) return {};
	try {
		const sanitized = match[1].split('\n').map(quoteYamlValue).join('\n');
		const parsed: unknown = YAML.parse(sanitized);
		return typeof parsed === 'object' && parsed !== null
			? (parsed as Record<string, unknown>)
			: {};
	} catch {
		return {};
	}
};

/**
 * Strip the frontmatter block from a markdown string and return the
 * remaining body content, trimmed.
 */
export const extractBody = (content: string): string =>
	content.replace(/^---\n[\s\S]*?\n---\n?/, '').trim();
