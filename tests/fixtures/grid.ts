import { StringValue, TFile } from './obsidian';
import { BasesGridView } from '../../src/views/grid/BasesGridView';
import type WiseViewPlugin from '../../src/main';
import type { BasesPropertyId } from 'obsidian';

/** A note as Bases exposes it: frontmatter keyed by property name, wrapped in real Value instances. */
export interface GridNoteFixture {
	path: string;
	values?: Record<string, unknown>;
}

export function note(path: string, values: Record<string, unknown> = {}): GridNoteFixture {
	return { path, values };
}

export interface GridHarnessOptions {
	notes?: GridNoteFixture[];
	config?: Record<string, unknown>;
	order?: BasesPropertyId[];
	containerWidth?: number;
}

export interface GridHarness {
	view: BasesGridView;
	host: HTMLElement;
	gridEl: HTMLElement;
	opened: string[];
	destroy(): void;
}

function wrapValue(raw: unknown): unknown {
	return typeof raw === 'string' ? new StringValue(raw) : raw;
}

function makeEntry(fixture: GridNoteFixture) {
	const file = new TFile(fixture.path) as TFile & { extension: string; parent: { path: string } | null; stat: { ctime: number; mtime: number } };
	file.extension = 'md';
	file.parent = fixture.path.includes('/') ? { path: fixture.path.slice(0, fixture.path.lastIndexOf('/')) } : null;
	file.stat = { ctime: 1, mtime: 2 };
	const values = fixture.values ?? {};
	return {
		file,
		getValue: (id: string) => wrapValue(values[id]) ?? null,
	};
}

export function createGridHarness(options: GridHarnessOptions = {}): GridHarness {
	const notes = options.notes ?? [note('A.md'), note('B.md')];
	const config: Record<string, unknown> = { ...options.config };
	const entries = notes.map((fixture) => makeEntry(fixture));
	const opened: string[] = [];

	const app = {
		vault: {
			getAbstractFileByPath: () => null,
			getResourcePath: (file: TFile) => `app://vault/${file.path}`,
			getFiles: () => [],
		},
		workspace: {
			openLinkText: async (path: string) => {
				opened.push(path);
			},
			trigger: () => {},
		},
	};

	const controller = {
		app,
		config: {
			get: (key: string) => config[key],
			getAsPropertyId: (key: string) => {
				const value = config[key];
				return typeof value === 'string' && /^(note|file|formula)\./.test(value) ? (value as never) : null;
			},
			getOrder: () => options.order ?? [],
			getDisplayName: (id: string) => id.replace(/^(note|file|formula)\./, ''),
		},
		data: { data: entries },
	};
	const plugin = { app } as unknown as WiseViewPlugin;

	const host = document.createElement('div');
	document.body.appendChild(host);
	if (options.containerWidth !== undefined) {
		Object.defineProperty(host, 'clientWidth', { configurable: true, value: options.containerWidth });
	}

	const view = new BasesGridView(controller as never, host, plugin);
	view.onload();
	view.onDataUpdated();
	const gridEl = host.querySelector<HTMLElement>('.wise-view-grid__grid')!;

	return {
		view,
		host,
		gridEl,
		opened,
		destroy() {
			view.onunload();
			host.remove();
		},
	};
}
