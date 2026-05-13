import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import { verifyBuildArtifacts } from "../scripts/verify-build-artifacts.mjs";

const tempDirs = [];

function makeTempDir() {
	const cwd = mkdtempSync(path.join(tmpdir(), "wise-view-artifacts-"));
	tempDirs.push(cwd);
	return cwd;
}

afterEach(() => {
	while (tempDirs.length > 0) {
		rmSync(tempDirs.pop(), { recursive: true, force: true });
	}
});

describe("verifyBuildArtifacts", () => {
	it("passes when all required plugin artifacts exist and are non-empty", () => {
		const cwd = makeTempDir();
		for (const artifact of ["main.js", "manifest.json", "styles.css"]) {
			writeFileSync(path.join(cwd, artifact), "ok\n");
		}

		expect(verifyBuildArtifacts({ cwd }).ok).toBe(true);
	});

	it("reports missing and empty artifacts", () => {
		const cwd = makeTempDir();
		writeFileSync(path.join(cwd, "main.js"), "");
		writeFileSync(path.join(cwd, "manifest.json"), "ok\n");

		expect(verifyBuildArtifacts({ cwd })).toEqual({
			ok: false,
			missing: ["styles.css"],
			empty: ["main.js"],
		});
	});
});
