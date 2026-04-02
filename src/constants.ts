/** Effect-smol repository URL for reference cloning. */
export const GITHUB_REPO = 'https://github.com/Effect-TS/effect-smol.git';

/** Fallback Effect version when the project has no installed copy. */
export const DEFAULT_VERSION = '4.0.0-beta.43';

/** Minimum number of effect-* skills required before writing Effect code. */
export const MIN_EFFECT_SKILLS = 7;

/** Tool names that constitute file writes (blocked without enough skills). */
export const WRITE_TOOLS = new Set(['write', 'edit']);

/** Matches content containing Effect code (the word `Effect` or effect imports). */
export const EFFECT_CODE_RE = /\bEffect\b|from\s+['"]effect(?:\/[^'"]*)?['"]/;

/** Markdown files to skip when walking pattern directories. */
export const SKIPPED_FILES = ['CLAUDE', 'AGENTS', 'GEMINI', 'README'];
