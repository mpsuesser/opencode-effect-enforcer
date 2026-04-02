/**
 * Detect the installed Effect version from a project's node_modules.
 * Falls back to DEFAULT_VERSION when Effect is not installed.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import { DEFAULT_VERSION } from '../constants.ts';

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
