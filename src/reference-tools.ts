/**
 * Effect v4 Source Reference Provider
 *
 * Provides custom OpenCode tools that give the agent read-only access to
 * the Effect v4 source code (github.com/Effect-TS/effect-smol) at the
 * user's installed version. Files are fetched from GitHub on demand and
 * cached locally in ~/.cache/opencode-effect-enforcer/{version}/.
 *
 * Also provides a path-intercept helper so that legacy `.references/effect-v4/`
 * and `.references/effect-smol/` paths are silently redirected to the cache.
 */

import { tool } from '@opencode-ai/plugin';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

const GITHUB_REPO = 'Effect-TS/effect-smol';
const DEFAULT_VERSION = '4.0.0-beta.43';
const CACHE_BASE = path.join(
	os.homedir(),
	'.cache',
	'opencode-effect-enforcer'
);
const MAX_SEARCH_MATCHES = 100;

// ─── Version Detection ─────────────────────────────────────────

/**
 * Detect the installed Effect version from the user's project.
 * Falls back to a hardcoded default if Effect is not installed.
 */
export const detectEffectVersion = (projectDir: string): string => {
	try {
		const pkgPath = path.join(
			projectDir,
			'node_modules',
			'effect',
			'package.json'
		);
		const content = fs.readFileSync(pkgPath, 'utf-8');
		const pkg: { version?: string } = JSON.parse(content);
		return pkg.version ?? DEFAULT_VERSION;
	} catch {
		return DEFAULT_VERSION;
	}
};

// ─── Caching ───────────────────────────────────────────────────

const getCacheDir = (version: string) => path.join(CACHE_BASE, version);

const getCachedFilePath = (version: string, filePath: string) =>
	path.join(getCacheDir(version), filePath);

const readFromCache = (version: string, filePath: string): string | null => {
	try {
		return fs.readFileSync(getCachedFilePath(version, filePath), 'utf-8');
	} catch {
		return null;
	}
};

const writeToCache = (
	version: string,
	filePath: string,
	content: string
): void => {
	const cached = getCachedFilePath(version, filePath);
	fs.mkdirSync(path.dirname(cached), { recursive: true });
	fs.writeFileSync(cached, content);
};

// ─── GitHub Fetching ───────────────────────────────────────────

const fetchFileFromGitHub = async (
	version: string,
	filePath: string
): Promise<string> => {
	const cached = readFromCache(version, filePath);
	if (cached !== null) return cached;

	const tag = `effect@${version}`;
	const url = `https://raw.githubusercontent.com/${GITHUB_REPO}/${encodeURIComponent(tag)}/${filePath}`;
	const response = await fetch(url);
	if (!response.ok) {
		throw new Error(
			`Failed to fetch Effect source: ${filePath} (HTTP ${String(response.status)})`
		);
	}
	const content = await response.text();
	writeToCache(version, filePath, content);
	return content;
};

interface DirectoryEntry {
	readonly name: string;
	readonly type: 'directory' | 'file';
	readonly size: number;
}

const fetchDirectoryListing = async (
	version: string,
	dirPath: string
): Promise<ReadonlyArray<DirectoryEntry>> => {
	const tag = `effect@${version}`;
	const normalizedPath = dirPath.replace(/\/$/, '');
	const url = `https://api.github.com/repos/${GITHUB_REPO}/contents/${normalizedPath}?ref=${encodeURIComponent(tag)}`;
	const response = await fetch(url, {
		headers: { Accept: 'application/vnd.github.v3+json' }
	});
	if (!response.ok) {
		throw new Error(
			`Failed to list directory: ${dirPath} (HTTP ${String(response.status)})`
		);
	}
	const items: unknown = await response.json();
	if (!Array.isArray(items)) {
		throw new Error(`Path is not a directory: ${dirPath}`);
	}
	return items.map((item: { name: string; type: string; size: number }) => ({
		name: item.name,
		type: (item.type === 'dir' ? 'directory' : 'file') as
			| 'directory'
			| 'file',
		size: item.size
	}));
};

// ─── Helpers ───────────────────────────────────────────────────

const applyOffsetLimit = (
	content: string,
	offset?: number,
	limit?: number
): string => {
	const lines = content.split('\n');
	const startLine = Math.max(0, (offset ?? 1) - 1);
	const maxLines = limit ?? 2000;
	const slice = lines.slice(startLine, startLine + maxLines);
	const totalLines = lines.length;
	const header = `(${String(totalLines)} lines total, showing ${String(startLine + 1)}-${String(Math.min(startLine + maxLines, totalLines))})\n`;
	return (
		header +
		slice
			.map((line, i) => `${String(startLine + i + 1)}: ${line}`)
			.join('\n')
	);
};

const matchesExtensionFilter = (
	fileName: string,
	include: string | undefined
): boolean => {
	if (!include) return true;
	const ext = include.replace('*', '');
	return fileName.endsWith(ext);
};

// ─── Tool Definitions ──────────────────────────────────────────

export const createReferenceTools = (version: string) => ({
	effect_ref_read: tool({
		description: `Read a file from the Effect v4 source code (v${version}). Returns line-numbered content. Use this to look up Effect APIs, types, implementations, and documentation. Key paths: LLMS.md, MIGRATION.md, packages/effect/SCHEMA.md, packages/effect/HTTPAPI.md, packages/effect/src/*.ts`,
		args: {
			path: tool.schema
				.string()
				.describe(
					"Path relative to the Effect repo root, e.g. 'packages/effect/src/Schema.ts' or 'LLMS.md'"
				),
			offset: tool.schema
				.number()
				.optional()
				.describe('Line number to start from (1-indexed, default: 1)'),
			limit: tool.schema
				.number()
				.optional()
				.describe('Maximum number of lines to return (default: 2000)')
		},
		async execute(args) {
			const content = await fetchFileFromGitHub(version, args.path);
			return applyOffsetLimit(content, args.offset, args.limit);
		}
	}),

	effect_ref_list: tool({
		description:
			'List contents of a directory in the Effect v4 source code. Returns file/directory names with types and sizes.',
		args: {
			path: tool.schema
				.string()
				.describe(
					"Directory path relative to the Effect repo root, e.g. 'packages/effect/src/' or 'packages/'"
				)
		},
		async execute(args) {
			const items = await fetchDirectoryListing(version, args.path);
			return items
				.map(
					(item) =>
						`${item.type === 'directory' ? '[dir]' : `[${String(item.size)}b]`} ${item.name}`
				)
				.join('\n');
		}
	}),

	effect_ref_search: tool({
		description:
			'Search for a regex pattern in Effect v4 source files within a directory. Lazily fetches files on demand. Returns matching lines with file paths and line numbers.',
		args: {
			pattern: tool.schema
				.string()
				.describe('Regex pattern to search for'),
			path: tool.schema
				.string()
				.optional()
				.describe(
					"Directory or file to search in (default: 'packages/effect/src/'). If a file path, searches that single file."
				),
			include: tool.schema
				.string()
				.optional()
				.describe(
					"File extension filter, e.g. '*.ts' or '*.md' (default: all files)"
				)
		},
		async execute(args) {
			const searchPath = args.path ?? 'packages/effect/src/';
			const regex = new RegExp(args.pattern, 'g');

			// Single file search
			if (/\.\w+$/.test(searchPath)) {
				const content = await fetchFileFromGitHub(version, searchPath);
				const matches: string[] = [];
				for (const [i, line] of content.split('\n').entries()) {
					regex.lastIndex = 0;
					if (regex.test(line)) {
						matches.push(
							`${searchPath}:${String(i + 1)}: ${line.trim()}`
						);
					}
				}
				return matches.length > 0
					? matches.join('\n')
					: 'No matches found.';
			}

			// Directory search — list files, then search each lazily
			const items = await fetchDirectoryListing(version, searchPath);
			const files = items.filter(
				(item) =>
					item.type === 'file' &&
					matchesExtensionFilter(item.name, args.include)
			);

			const results: string[] = [];
			for (const file of files) {
				if (results.length >= MAX_SEARCH_MATCHES) break;
				const filePath = `${searchPath.replace(/\/$/, '')}/${file.name}`;
				try {
					const content = await fetchFileFromGitHub(
						version,
						filePath
					);
					for (const [i, line] of content.split('\n').entries()) {
						regex.lastIndex = 0;
						if (regex.test(line)) {
							results.push(
								`${filePath}:${String(i + 1)}: ${line.trim()}`
							);
							if (results.length >= MAX_SEARCH_MATCHES) break;
						}
					}
				} catch {
					// Skip files that can't be fetched
				}
			}

			return results.length > 0
				? `Found ${String(results.length)} match${results.length === 1 ? '' : 'es'}:\n${results.join('\n')}`
				: 'No matches found.';
		}
	})
});

// ─── Path Intercept (for legacy .references/ paths) ────────────

const REFERENCE_PREFIXES = [
	'.references/effect-v4/',
	'.references/effect-smol/'
];

/**
 * Extract the relative Effect repo path from a legacy `.references/` path.
 * Returns `null` if the path doesn't match either known prefix.
 */
export const extractReferencePath = (filePath: string): string | null => {
	for (const prefix of REFERENCE_PREFIXES) {
		const idx = filePath.indexOf(prefix);
		if (idx !== -1) {
			return filePath.slice(idx + prefix.length);
		}
	}
	return null;
};

/**
 * Ensure a file is fetched and cached locally, returning the absolute
 * path to the cached copy. Used by the Read-tool intercept to silently
 * redirect `.references/` paths to real local files.
 */
export const ensureCachedFile = async (
	version: string,
	relativePath: string
): Promise<string> => {
	// fetchFileFromGitHub handles caching internally
	await fetchFileFromGitHub(version, relativePath);
	return getCachedFilePath(version, relativePath);
};
