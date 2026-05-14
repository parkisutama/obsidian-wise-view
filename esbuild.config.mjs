import dotenv from "dotenv";
import esbuild from "esbuild";
import process from "process";
import { builtinModules } from 'node:module';
import fs from "fs";
import path from "path";

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

// Plugin to extract and merge CSS into styles.css
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

const cssPlugin = {
	name: "css-merge",
	setup(build) {
		// Collect CSS from imports
		const cssContents = [];

		build.onLoad({ filter: /\.css$/ }, async (args) => {
			const css = await fs.promises.readFile(args.path, "utf8");
			cssContents.push(`/* From: ${path.basename(args.path)} */\n${css}`);
			return { contents: "", loader: "js" };
		});

		build.onEnd(async () => {
			// Read existing styles.css
			let existingStyles = "";
			const stylesPath = "./styles.css";
			if (fs.existsSync(stylesPath)) {
				existingStyles = await fs.promises.readFile(stylesPath, "utf8");
			}

			// Strip any previous bundled CSS section so we always re-merge
			const bundleMarker = "/* === BUNDLED CSS IMPORTS === */";
			const markerIdx = existingStyles.indexOf(bundleMarker);
			if (markerIdx >= 0) {
				existingStyles = existingStyles.substring(0, markerIdx).trimEnd();
				}

				// Always inject frappe-gantt base CSS from node_modules
				const frappeGanttCssPath = path.resolve(
					"node_modules/frappe-gantt/dist/frappe-gantt.css",
				);
				if (fs.existsSync(frappeGanttCssPath)) {
					const frappeCSS = scopeFrappeGanttCss(
						await fs.promises.readFile(frappeGanttCssPath, "utf8"),
					);
					const hasIt = cssContents.some(c => c.includes("From: frappe-gantt.css"));
					if (!hasIt) {
						cssContents.unshift(`/* From: frappe-gantt.css */\n${frappeCSS}`);
				}
			}

			if (cssContents.length > 0) {
				const mergedCSS = existingStyles + "\n\n" + bundleMarker + "\n" + cssContents.join("\n\n");
				await fs.promises.writeFile(stylesPath, mergedCSS);
				console.log("Merged CSS imports into styles.css");
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

const banner =
	`/*
THIS IS A GENERATED/BUNDLED FILE BY ESBUILD
if you want to view the source, please visit the github repository of this plugin
*/
`;

const context = await esbuild.context({
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
	plugins: [htmlPlugin, cssPlugin, copyToVaultPlugin],
});

if (prod) {
	await context.rebuild();
	process.exit(0);
} else {
	await context.watch();
}
