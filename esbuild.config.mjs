import dotenv from "dotenv";
import esbuild from "esbuild";
import process from "process";
import { builtinModules } from 'node:module';
import fs from "fs";
import path from "path";
import {
	BANNER_START,
	buildLicenseBanner,
	collectBundledPackages,
	findUnlistedPackages,
} from "./scripts/license-banner.mjs";
import { createCssMergePlugin } from "./scripts/css-merge.mjs";
import { UI_RUNTIME_ALIASES } from "./scripts/ui-runtime-aliases.mjs";

const prod = (process.argv[2] === "production");

// Load environment variables from .env file for development copy targets.
if (!prod) {
	dotenv.config();
}

// Plugin to load HTML files as strings for mobile-compatible bundled assets.
const htmlPlugin = {
	name: "html-loader",
	setup(build) {
		build.onLoad({ filter: /\.html$/ }, async (args) => {
			// Bundle HTML files inline for mobile compatibility where runtime file loading doesn't work.
			const html = await fs.promises.readFile(args.path, "utf8");
			return {
				contents: `export default ${JSON.stringify(html)};`,
				loader: "js",
			};
		});
	},
};

// Frappe Gantt's stylesheet targets :root; scope it to the view and map its variables to Obsidian's theme.
function scopeFrappeGanttCss(css) {
	const scoped = css
		.replace(/:root/g, ".bases-gantt-view")
		.replace(/html\[data-theme=dark\]/g, "body.theme-dark .bases-gantt-view")
		.replace(/html\[data-theme="dark"\]/g, "body.theme-dark .bases-gantt-view");
	const themeVars = {
		"--g-arrow-color": "var(--text-muted)",
		"--g-bar-color": "var(--interactive-accent)",
		"--g-bar-border": "var(--background-modifier-border)",
		"--g-tick-color-thick": "var(--background-modifier-border-hover)",
		"--g-tick-color": "var(--background-modifier-border)",
		"--g-actions-background": "var(--background-secondary)",
		"--g-border-color": "var(--background-modifier-border)",
		"--g-text-muted": "var(--text-muted)",
		"--g-text-light": "var(--text-on-accent)",
		"--g-text-dark": "var(--text-normal)",
		"--g-progress-color": "var(--interactive-accent-hover)",
		"--g-handle-color": "var(--text-normal)",
		"--g-weekend-label-color": "var(--background-secondary-alt)",
		"--g-expected-progress": "var(--background-modifier-hover)",
		"--g-header-background": "var(--background-primary)",
		"--g-row-color": "var(--background-primary)",
		"--g-row-border-color": "var(--background-modifier-border)",
		"--g-today-highlight": "var(--interactive-accent)",
		"--g-popup-actions": "var(--background-secondary)",
		"--g-weekend-highlight-color": "var(--background-secondary)",
	};
	return Object.entries(themeVars).reduce(
		(result, [name, value]) =>
			result.replace(new RegExp(`${name}:\\s*[^;}}]+`, "g"), `${name}: ${value}`),
		scoped,
	);
}

// Explicit, non-path-sorted order for first-party CSS source modules (spec §7.17). Foundations
// and shared components load before any view so a view's rules can override a shared default;
// gantt.css also carries the first-party Frappe Gantt bar/WBS overrides that used to sit
// separately from the rest of the Gantt rules in the pre-extraction styles.css — moving them
// adjacent is safe because their selectors (.bar-*, .gantt-*, frappe-gantt classes) never
// overlap with settings/modal or any other view's selectors.
const FIRST_PARTY_CSS = [
	"src/styles/foundations/common.css",
	"src/styles/components/settings.css",
	"src/styles/views/swimlane.css",
	"src/styles/views/calendar.css",
	"src/styles/views/gantt.css",
	"src/styles/views/timeline.css",
	"src/styles/views/gantt-beta.css",
].map((p) => path.resolve(p));

// Merge first-party sources, imported CSS, and the Gantt Chart and Frappe Gantt stylesheets (which nothing
// imports) into styles.css.
const cssPlugin = createCssMergePlugin({
	stylesPath: "./styles.css",
	banner: buildLicenseBanner("styles.css"),
	bannerStart: BANNER_START,
	firstPartyCss: FIRST_PARTY_CSS,
	extraCss: [
		{
			path: path.resolve("node_modules/@jaeungkim/gantt-chart/dist/gantt-chart.css"),
			note: "Unmodified; Gantt Beta themes it through --gantt-* tokens in first-party CSS",
		},
		{
			path: path.resolve("node_modules/frappe-gantt/dist/frappe-gantt.css"),
			transform: scopeFrappeGanttCss,
			note: "Modified: scoped to .bases-gantt-view and themed with Obsidian CSS variables",
		},
	],
});

// Plugin to verify that every bundled npm package is attributed in THIRD_PARTY_NOTICES.md.
// Production builds exit non-zero on a problem; watch mode only warns.
const licenseProblems = [];
const licenseCheckPlugin = {
	name: "license-check",
	setup(build) {
		build.onEnd((result) => {
			licenseProblems.length = 0;
			if (!result.metafile) return;
			const bundled = collectBundledPackages(result.metafile, (dir) =>
				JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8")),
			);
			const notices = fs.readFileSync("THIRD_PARTY_NOTICES.md", "utf8");
			licenseProblems.push(...findUnlistedPackages(bundled, notices));
			for (const problem of licenseProblems) {
				console.error(`✗ License notice: ${problem}`);
			}
		});
	},
};

// Plugin untuk menyalin file build ke vault Obsidian saat development.
const copyToVaultPlugin = {
	name: 'copy-to-vault',
	setup(build) {
		build.onEnd((result) => {
			if (prod) return;
			if (result.errors.length > 0) return;

			// Baca path dari environment variable
			const vaultPath = process.env.OBSIDIAN_VAULT_PLUGIN_PATH;

			// Skip jika tidak ada environment variable (opsional untuk development)
			if (!vaultPath) {
				console.log('⚠ OBSIDIAN_VAULT_PLUGIN_PATH tidak diset, skip copy ke vault');
				return;
			}

			const filesToCopy = ['manifest.json', 'main.js', 'styles.css'];

			// Buat direktori jika belum ada
			if (!fs.existsSync(vaultPath)) {
				fs.mkdirSync(vaultPath, { recursive: true });
				console.log(`📁 Membuat direktori: ${vaultPath}`);
			}

			// Copy setiap file
			for (const file of filesToCopy) {
				if (fs.existsSync(file)) {
					fs.copyFileSync(file, path.join(vaultPath, file));
					console.log(`✓ Copied ${file} ke vault`);
				} else {
					console.log(`⚠ File ${file} tidak ditemukan`);
				}
			}

			console.log(`✓ Build berhasil di-copy ke vault`);
		});
	},
};

const { version } = JSON.parse(fs.readFileSync("manifest.json", "utf8"));
const banner = `${buildLicenseBanner("main.js", version)}
/*
THIS IS A GENERATED/BUNDLED FILE BY ESBUILD
if you want to view the source, please visit the github repository of this plugin
*/
`;

const context = await esbuild.context({
	// React-targeting libraries (Gantt Beta) run on Preact; see scripts/ui-runtime-aliases.mjs.
	alias: UI_RUNTIME_ALIASES,
	banner: {
		js: banner,
	},
	entryPoints: ["src/main.ts"],
	bundle: true,
	external: [
		"obsidian",
		"electron",
		"@codemirror/autocomplete",
		"@codemirror/collab",
		"@codemirror/commands",
		"@codemirror/language",
		"@codemirror/lint",
		"@codemirror/search",
		"@codemirror/state",
		"@codemirror/view",
		"@lezer/common",
		"@lezer/highlight",
		"@lezer/lr",
		...builtinModules],
	format: "cjs",
	target: "es2018",
	logLevel: "info",
	sourcemap: prod ? false : "inline",
	treeShaking: true,
	outfile: "main.js",
	minify: prod,
	metafile: true,
	plugins: [htmlPlugin, cssPlugin, licenseCheckPlugin, copyToVaultPlugin],
});

if (prod) {
	await context.rebuild();
	process.exit(licenseProblems.length > 0 ? 1 : 0);
} else {
	await context.watch();
}
