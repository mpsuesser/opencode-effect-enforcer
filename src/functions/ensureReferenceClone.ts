/**
 * Ensure a shallow clone of the Effect v4 source code exists at
 * `${projectDir}/.references/effect-v4/`.
 *
 * The clone targets Effect-TS/effect-smol at the tag matching the
 * project's installed Effect version. Safe to call from multiple hooks
 * concurrently — only one clone runs at a time. Failures are silent
 * so the agent is never blocked by a failed clone.
 */

import { exec } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { promisify } from 'node:util';

import { GITHUB_REPO } from '../constants.ts';

const execAsync = promisify(exec);

/** Shared promise to prevent concurrent clone operations. */
let clonePromise: Promise<void> | null = null;

export const ensureReferenceClone = async (
	projectDir: string,
	version: string
): Promise<void> => {
	const refDir = path.join(projectDir, '.references', 'effect-v4');

	// Fast path: already cloned
	if (fs.existsSync(path.join(refDir, '.git'))) return;

	// Prevent concurrent clones
	if (clonePromise) return clonePromise;

	const tag = `effect@${version}`;
	const tmpDir = `${refDir}.cloning`;

	clonePromise = (async () => {
		try {
			// Ensure parent directory exists
			fs.mkdirSync(path.join(projectDir, '.references'), {
				recursive: true
			});

			// Clean up any previous failed clone attempt
			if (fs.existsSync(tmpDir)) {
				fs.rmSync(tmpDir, { recursive: true, force: true });
			}

			await execAsync(
				`git clone --depth 1 --branch ${JSON.stringify(tag)} ${JSON.stringify(GITHUB_REPO)} ${JSON.stringify(tmpDir)}`
			);

			// Atomic rename into place
			fs.renameSync(tmpDir, refDir);
		} catch {
			// Clone failed — clean up temp dir, continue without reference
			try {
				if (fs.existsSync(tmpDir)) {
					fs.rmSync(tmpDir, { recursive: true, force: true });
				}
			} catch {
				// Ignore cleanup errors
			}
		} finally {
			clonePromise = null;
		}
	})();

	return clonePromise;
};
