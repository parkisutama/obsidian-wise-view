import type { EntrySnapshot } from '../../src/core/entries/EntrySnapshot';
import type { NormalizedValue } from '../../src/core/entries/NormalizedValue';
import { DateValue, StringValue, TFile } from './obsidian';
import { BasesTimelineView } from '../../src/views/timeline/BasesTimelineView';
import type WiseViewPlugin from '../../src/main';

export function timelineSnapshot(path: string, values: Record<string, NormalizedValue>): EntrySnapshot {
	const basename = path.replace(/\.md$/i, '').split('/').pop() ?? path;
	return {
		path,
		basename,
		extension: 'md',
		folder: path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '',
		ctime: 1,
		mtime: 2,
		values: new Map(Object.entries(values)),
	};
}

export const text = (value: string): NormalizedValue => ({ kind: 'text', value });
export const date = (value: string): NormalizedValue => ({ kind: 'date', value, hasTime: value.includes('T') });

export interface TimelineHarness {
	view: BasesTimelineView;
	host: HTMLElement;
	opened: string[];
	hovers: Array<Record<string, unknown>>;
	frontmatterWrites: number;
	frontmatterUpdates: Array<Record<string, unknown>>;
	destroy(): void;
}

export function createTimelineHarness(): TimelineHarness {
	const opened: string[] = [];
	const hovers: Array<Record<string, unknown>> = [];
	let frontmatterWrites = 0;
	const frontmatterUpdates: Array<Record<string, unknown>> = [];
	const file = new TFile('Notes/Alpha.md') as TFile & {
		extension: string;
		parent: { path: string };
		stat: { ctime: number; mtime: number };
	};
	file.extension = 'md';
	file.parent = { path: 'Notes' };
	file.stat = { ctime: 1, mtime: 2 };
	const unscheduledFile = new TFile('Notes/Beta.md') as TFile & {
		extension: string;
		parent: { path: string };
		stat: { ctime: number; mtime: number };
	};
	unscheduledFile.extension = 'md';
	unscheduledFile.parent = { path: 'Notes' };
	unscheduledFile.stat = { ctime: 1, mtime: 2 };
	const entry = {
		file,
		getValue(id: string) {
			if (id === 'note.start') return new DateValue('2026-01-01');
			if (id === 'note.end') return new DateValue('2026-01-03');
			if (id === 'note.title') return new StringValue('Alpha title');
			return null;
		},
	};
	const unscheduledEntry = {
		file: unscheduledFile,
		getValue(id: string) {
			if (id === 'note.title') return new StringValue('Beta title');
			return null;
		},
	};
	const config: Record<string, unknown> = {
		startDate: 'note.start',
		endDate: 'note.end',
		titleBy: 'note.title',
		zoom: 'month',
	};
	const app = {
		vault: {
			getAbstractFileByPath: (path: string) => path === file.path ? file : path === unscheduledFile.path ? unscheduledFile : null,
		},
		workspace: {
			openLinkText: async (path: string) => { opened.push(path); },
			trigger: (_name: string, payload: Record<string, unknown>) => { hovers.push(payload); },
		},
		fileManager: {
			processFrontMatter: async (_file: TFile, update: (frontmatter: Record<string, unknown>) => void) => {
				frontmatterWrites += 1;
				const frontmatter: Record<string, unknown> = {};
				update(frontmatter);
				frontmatterUpdates.push(frontmatter);
			},
		},
	};
	const controller = {
		app,
		config: {
			get: (key: string) => config[key],
			set: (key: string, value: unknown) => { config[key] = value; },
			getAsPropertyId: (key: string) => typeof config[key] === 'string' && String(config[key]).includes('.') ? config[key] : null,
			getOrder: () => [],
			getDisplayName: (id: string) => id,
		},
		data: { data: [entry, unscheduledEntry], groupedData: [{ entries: [entry, unscheduledEntry], hasKey: () => false }] },
	};
	const plugin = { app } as unknown as WiseViewPlugin;
	const host = document.createElement('div');
	document.body.appendChild(host);
	const view = new BasesTimelineView(controller as never, host, plugin);
	view.onload();
	view.onDataUpdated();
	return {
		view,
		host,
		opened,
		hovers,
		get frontmatterWrites() { return frontmatterWrites; },
		frontmatterUpdates,
		destroy() {
			view.onunload();
			host.remove();
		},
	};
}
