// Module aliases that run React-targeting libraries on Preact (spec docs/specs/gantt-beta.md D1).
// `react`/`react-dom` stay forbidden dependencies (tests/architecture.test.ts); these aliases are
// the only way a React import resolves. Shared by esbuild.config.mjs, vitest, and the bundle test.
export const UI_RUNTIME_ALIASES = {
	react: "preact/compat",
	"react-dom": "preact/compat",
	"react/jsx-runtime": "preact/jsx-runtime",
};
