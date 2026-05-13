import { readFileSync, writeFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const readJson = (filePath) => JSON.parse(readFileSync(filePath, "utf8"));

const writeJson = (filePath, value) => {
	writeFileSync(filePath, `${JSON.stringify(value, null, "\t")}\n`);
};

export function syncVersionFiles({
	cwd = process.cwd(),
	targetVersion = process.env.npm_package_version,
} = {}) {
	if (!targetVersion) {
		throw new Error("Missing target version. Run through pnpm version or pass targetVersion.");
	}

	const manifestPath = path.join(cwd, "manifest.json");
	const versionsPath = path.join(cwd, "versions.json");

	const manifest = readJson(manifestPath);
	const { minAppVersion } = manifest;
	if (!minAppVersion) {
		throw new Error("manifest.json must define minAppVersion.");
	}

	manifest.version = targetVersion;
	writeJson(manifestPath, manifest);

	const versions = readJson(versionsPath);
	versions[targetVersion] = minAppVersion;
	writeJson(versionsPath, versions);

	return { manifest, versions };
}

const isDirectRun = process.argv[1] === fileURLToPath(import.meta.url);
if (isDirectRun) {
	syncVersionFiles();
}
