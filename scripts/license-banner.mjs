// License notices prepended to the distributed plugin files.
// Full license texts live in THIRD_PARTY_NOTICES.md; keep both in sync.

export const PROJECT_LICENSE = "GPL-3.0-or-later";
export const REPOSITORY_URL = "https://github.com/parkisutama/obsidian-wise-view";

export const PROJECT_COPYRIGHTS = [
	"Copyright (C) 2025 Sawyer Rensel (Planner, https://github.com/SawyerRensel/Planner)",
	"Copyright (C) 2026 Parkis Utama",
];

// `files` lists the distributed files that contain code from each component.
export const THIRD_PARTY_COMPONENTS = [
	{
		name: "obsidian-bases-gantt",
		license: "MIT",
		copyright: "Copyright (c) 2026 Lars Tray",
		files: ["main.js", "styles.css"],
	},
	{
		name: "FullCalendar",
		license: "MIT",
		copyright: "Copyright (c) 2021 Adam Shaw",
		files: ["main.js"],
	},
	{
		name: "Preact",
		license: "MIT",
		copyright: "Copyright (c) 2015-present Jason Miller",
		files: ["main.js"],
	},
	{
		name: "Frappe Gantt",
		license: "MIT",
		copyright: "Copyright (c) 2024 Frappe Technologies Pvt. Ltd.",
		files: ["main.js", "styles.css"],
	},
	{
		name: "tslib",
		license: "0BSD",
		copyright: "Copyright (c) Microsoft Corporation",
		files: ["main.js"],
	},
];

export const BANNER_START = "/*! Wise View";

/** Build the preserved (`/*!`) license banner for one distributed file. */
export function buildLicenseBanner(file, version) {
	const components = THIRD_PARTY_COMPONENTS.filter((c) => c.files.includes(file));
	const lines = [
		`${BANNER_START}${version ? ` v${version}` : ""} | SPDX-License-Identifier: ${PROJECT_LICENSE}`,
		...PROJECT_COPYRIGHTS,
		`Source: ${REPOSITORY_URL}`,
		"",
		"This file includes third-party software:",
		...components.map((c) => `  ${c.name} (${c.license}) ${c.copyright}`),
		`Full license texts: ${REPOSITORY_URL}/blob/main/THIRD_PARTY_NOTICES.md`,
	];
	return `${lines[0]}\n${lines
		.slice(1)
		.map((line) => (line ? ` * ${line}` : " *"))
		.join("\n")}\n */\n`;
}

/** Return the notice fragments a distributed file must contain. */
export function requiredNoticeFragments(file) {
	return [
		`SPDX-License-Identifier: ${PROJECT_LICENSE}`,
		...PROJECT_COPYRIGHTS,
		...THIRD_PARTY_COMPONENTS.filter((c) => c.files.includes(file)).map(
			(c) => `${c.name} (${c.license}) ${c.copyright}`,
		),
	];
}
