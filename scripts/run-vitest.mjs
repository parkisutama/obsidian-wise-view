import { spawnSync } from "child_process";
import { existsSync } from "fs";
import os from "os";

const tempDir = process.env.VITEST_TMPDIR ?? (existsSync("/tmp") ? "/tmp" : (process.env.TEMP ?? process.env.TMP ?? os.tmpdir()));

const result = spawnSync("pnpm", ["exec", "vitest", "run"], {
	stdio: "inherit",
	env: {
		...process.env,
		TMPDIR: tempDir,
		TEMP: tempDir,
		TMP: tempDir,
	},
});

process.exit(result.status ?? 1);
