import type { EntrySnapshot } from '../../src/core/entries/EntrySnapshot';
import type { NormalizedValue } from '../../src/core/entries/NormalizedValue';

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
