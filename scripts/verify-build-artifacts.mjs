import { accessSync, constants, statSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

export const REQUIRED_BUILD_ARTIFACTS = ["main.js", "manifest.json", "styles.css"];

export function verifyBuildArtifacts({
	cwd = process.cwd(),
	requiredArtifacts = REQUIRED_BUILD_ARTIFACTS,
} = {}) {
	const missing = [];
	const empty = [];

	for (const artifact of requiredArtifacts) {
		const artifactPath = path.join(cwd, artifact);
		try {
			accessSync(artifactPath, constants.R_OK);
			if (statSync(artifactPath).size === 0) {
				empty.push(artifact);
			}
		} catch {
			missing.push(artifact);
		}
	}

	return { ok: missing.length === 0 && empty.length === 0, missing, empty };
}

const isDirectRun = process.argv[1] === fileURLToPath(import.meta.url);
if (isDirectRun) {
	const result = verifyBuildArtifacts();
	if (!result.ok) {
		console.error("Build artifact verification failed.");
		if (result.missing.length > 0) {
			console.error(`Missing: ${result.missing.join(", ")}`);
		}
		if (result.empty.length > 0) {
			console.error(`Empty: ${result.empty.join(", ")}`);
		}
		process.exit(1);
	}
	console.log(`Verified build artifacts: ${REQUIRED_BUILD_ARTIFACTS.join(", ")}`);
}
