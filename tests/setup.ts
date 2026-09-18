import { installDomHelpers } from "./fixtures/obsidian";

// DOM tests opt in with `// @vitest-environment happy-dom`; Node tests have no HTMLElement.
if (typeof HTMLElement !== "undefined") {
	installDomHelpers();
}
