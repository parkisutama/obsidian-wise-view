import { spawnSync } from "child_process";
import { existsSync } from "fs";
import { createRequire } from "module";
import os from "os";
import path from "path";

const tempDir = process.env.VITEST_TMPDIR ?? (existsSync("/tmp") ? "/tmp" : (process.env.TEMP ?? process.env.TMP ?? os.tmpdir()));

// Run the vitest CLI with the current Node binary instead of spawning `pnpm`: on Windows pnpm is a
// .cmd shim, which spawnSync cannot start without a shell.
const require = createRequire(import.meta.url);
const vitestCli = path.join(path.dirname(require.resolve("vitest/package.json")), "vitest.mjs");

const result = spawnSync(process.execPath, [vitestCli, "run", ...process.argv.slice(2)], {
	stdio: "inherit",
	env: {
		...process.env,
		TMPDIR: tempDir,
		TEMP: tempDir,
		TMP: tempDir,
	},
});

if (result.error) {
	console.error(`Failed to start vitest: ${result.error.message}`);
}
process.exit(result.status ?? 1);
