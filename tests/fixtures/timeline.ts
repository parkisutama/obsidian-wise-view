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
	destroy(): void;
}

export function createTimelineHarness(): TimelineHarness {
	const opened: string[] = [];
	const hovers: Array<Record<string, unknown>> = [];
	let frontmatterWrites = 0;
	const file = new TFile('Notes/Alpha.md') as TFile & {
		extension: string;
		parent: { path: string };
		stat: { ctime: number; mtime: number };
	};
	file.extension = 'md';
	file.parent = { path: 'Notes' };
	file.stat = { ctime: 1, mtime: 2 };
	const entry = {
		file,
		getValue(id: string) {
			if (id === 'note.start') return new DateValue('2026-01-01');
			if (id === 'note.end') return new DateValue('2026-01-03');
			if (id === 'note.title') return new StringValue('Alpha title');
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
		workspace: {
			openLinkText: async (path: string) => { opened.push(path); },
			trigger: (_name: string, payload: Record<string, unknown>) => { hovers.push(payload); },
		},
		fileManager: {
			processFrontMatter: async () => { frontmatterWrites += 1; },
		},
	};
	const controller = {
		app,
		config: {
			get: (key: string) => config[key],
			getAsPropertyId: (key: string) => typeof config[key] === 'string' && String(config[key]).includes('.') ? config[key] : null,
			getOrder: () => [],
			getDisplayName: (id: string) => id,
		},
		data: { data: [entry], groupedData: [{ entries: [entry], hasKey: () => false }] },
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
		destroy() {
			view.onunload();
			host.remove();
		},
	};
}
