import { describe, expect, it } from 'vitest';
import { buildTimelineModel, flattenTimelineRows } from '../src/views/timeline/TimelineModel';
import { timelineRequestedProperties, type TimelineOptions } from '../src/views/timeline/timelineOptions';
import { date, text, timelineSnapshot } from './fixtures/timeline';

const options: TimelineOptions = {
	startProperty: 'note.begins',
	endProperty: 'note.finishes',
	titleProperty: 'note.caption',
	colorProperty: 'note.category',
	groupProperty: 'note.owner',
	zoom: 'month',
};

describe('Timeline model', () => {
	it('maps arbitrary configured properties without a required schema', () => {
		const model = buildTimelineModel([
			timelineSnapshot('Notes/A.md', {
				'note.begins': date('2026-01-01'),
				'note.finishes': date('2026-01-03'),
				'note.caption': text('Alpha'),
				'note.category': text('Research'),
				'note.owner': text('Team A'),
			}),
		], options);
		expect(model.groups[0]).toMatchObject({ key: 'Team A', items: [{ path: 'Notes/A.md', title: 'Alpha', colorValue: 'Research' }] });
		expect(model.groups[0]?.items[0]?.range?.endExclusive?.iso).toBe('2026-01-04');
	});

	it('preserves first-seen group and item order', () => {
		const entries = [
			timelineSnapshot('B.md', { 'note.begins': date('2026-01-02'), 'note.owner': text('Second') }),
			timelineSnapshot('A.md', { 'note.begins': date('2026-01-01'), 'note.owner': text('First') }),
			timelineSnapshot('C.md', { 'note.begins': date('2026-01-03'), 'note.owner': text('Second') }),
		];
		const model = buildTimelineModel(entries, options);
		expect(model.groups.map(group => group.key)).toEqual(['Second', 'First']);
		expect(model.groups[0]?.items.map(item => item.path)).toEqual(['B.md', 'C.md']);
	});

	it('routes missing and invalid dates to unscheduled with explicit reasons', () => {
		const entries = [
			timelineSnapshot('Missing.md', {}),
			timelineSnapshot('BadStart.md', { 'note.begins': text('tomorrow') }),
			timelineSnapshot('BadEnd.md', { 'note.begins': date('2026-01-01'), 'note.finishes': text('later') }),
		];
		const model = buildTimelineModel(entries, options);
		expect(model.groups).toEqual([]);
		expect(model.unscheduled.map(item => [item.path, item.unscheduledReason])).toEqual([
			['Missing.md', 'start-missing'],
			['BadStart.md', 'start-invalid'],
			['BadEnd.md', 'end-invalid'],
		]);
	});

	it('treats an unconfigured start property as configuration state, not unscheduled data', () => {
		const model = buildTimelineModel([timelineSnapshot('A.md', {})], { ...options, startProperty: null });
		expect(model.startConfigured).toBe(false);
		expect(model.unscheduled).toEqual([]);
		expect(flattenTimelineRows(model)).toEqual([]);
	});

	it('uses basename and Ungrouped only as presentation fallbacks', () => {
		const model = buildTimelineModel([
			timelineSnapshot('Folder/Fallback.md', { 'note.begins': date('2026-01-01') }),
		], options);
		expect(model.groups[0]).toMatchObject({ key: 'Ungrouped', items: [{ title: 'Fallback' }] });
	});

	it('requests only configured properties and contains no workflow ranking', () => {
		expect(timelineRequestedProperties(options)).toEqual([
			'note.begins', 'note.finishes', 'note.caption', 'note.category', 'note.owner',
		]);
		const model = buildTimelineModel([], options) as unknown as Record<string, unknown>;
		expect(model).not.toHaveProperty('statusOrder');
		expect(model).not.toHaveProperty('priorityRanking');
	});

	it('flattens groups and unscheduled items into one stable virtual-row order', () => {
		const model = buildTimelineModel([
			timelineSnapshot('A.md', { 'note.begins': date('2026-01-01'), 'note.owner': text('Team') }),
			timelineSnapshot('B.md', { 'note.owner': text('Team') }),
		], options);
		expect(flattenTimelineRows(model).map(row => [row.kind, row.path])).toEqual([
			['group', 'wise-view-timeline-group:Team'],
			['item', 'A.md'],
			['group', 'wise-view-timeline-group:Unscheduled'],
			['item', 'B.md'],
		]);
		expect(flattenTimelineRows(model, new Set(['Team', 'Unscheduled'])).map(row => row.kind)).toEqual([
			'group', 'group',
		]);
	});
});
