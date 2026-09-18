import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
	resolve: {
		alias: {
			// The obsidian package ships types only; tests run against a test double.
			obsidian: fileURLToPath(new URL("./tests/fixtures/obsidian.ts", import.meta.url)),
		},
	},
	test: {
		include: ["tests/**/*.test.{ts,mjs}"],
		setupFiles: ["tests/setup.ts"],
		// Fail instead of passing silently when a filter or glob matches nothing.
		passWithNoTests: false,
		coverage: {
			provider: "v8",
			include: ["src/**/*.ts", "scripts/**/*.mjs"],
			reporter: ["text-summary", "lcov"],
			// Ratchet: the floor sits just below current coverage (the Gantt view has no tests yet).
			// Raise it as coverage grows; CI fails if coverage drops below it.
			thresholds: {
				statements: 22,
				branches: 18,
				functions: 26,
				lines: 23,
			},
		},
	},
});
