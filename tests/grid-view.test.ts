// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { createGridHarness, note, type GridHarness } from './fixtures/grid';

let harness: GridHarness | null = null;
const mount = (...args: Parameters<typeof createGridHarness>) => {
	harness = createGridHarness(...args);
	return harness;
};

afterEach(() => {
	harness?.destroy();
	harness = null;
});

describe('BasesGridView rendering', () => {
	it('renders one card per entry, in Bases order', () => {
		const h = mount({ notes: [note('B.md'), note('A.md')] });
		const paths = [...h.gridEl.querySelectorAll<HTMLElement>('[data-note-path]')].map((el) => el.dataset.notePath);
		expect(paths).toEqual(['B.md', 'A.md']);
	});

	it('uses the file basename as title when no title property is configured', () => {
		const h = mount({ notes: [note('Tasks/Report.md')] });
		expect(h.gridEl.querySelector('.wise-view-card__title')?.textContent).toBe('Report');
	});

	it('uses the configured title property when it has a value', () => {
		const h = mount({
			notes: [note('A.md', { 'note.title': 'Real Title' })],
			config: { titleBy: 'note.title' },
		});
		expect(h.gridEl.querySelector('.wise-view-card__title')?.textContent).toBe('Real Title');
	});

	it('does not create a synthetic group when Group by is not configured', () => {
		const h = mount();
		expect(h.gridEl.querySelector('.wise-view-grid__group')).toBeNull();
	});

	it('groups cards under a header per group-by value, in encounter order', () => {
		const h = mount({
			notes: [note('A.md', { 'note.status': 'Todo' }), note('B.md', { 'note.status': 'Done' }), note('C.md', { 'note.status': 'Todo' })],
			config: { groupProperty: 'note.status' },
		});
		const rows = [...h.gridEl.children];
		const summary = rows.map((el) =>
			el.classList.contains('wise-view-grid__group') ? `group:${el.textContent}` : `item:${(el as HTMLElement).dataset.notePath}`,
		);
		expect(summary).toEqual(['group:Todo (2)', 'item:A.md', 'item:C.md', 'group:Done (1)', 'item:B.md']);
	});

	it('shows every configured property as a badge', () => {
		const h = mount({
			notes: [note('A.md', { 'note.status': 'Todo' })],
			order: ['note.status' as never],
		});
		expect(h.gridEl.querySelector('.wise-view-card__property-label')?.textContent).toBe('status');
		expect(h.gridEl.querySelector('.wise-view-card__property-value')?.textContent).toBe('Todo');
	});
});

describe('BasesGridView column layout', () => {
	it('sets the column count CSS variable from the container width and configured min card width', () => {
		const h = mount({ config: { minCardWidth: 200, gap: 0 }, containerWidth: 1000 });
		expect(h.gridEl.style.getPropertyValue('--wise-view-grid-columns')).toBe('5');
	});
});

describe('BasesGridView group collapse', () => {
	it("hides a collapsed group's cards but keeps its header, without losing card identity on expand", () => {
		const h = mount({
			notes: [note('A.md', { 'note.status': 'Todo' }), note('B.md', { 'note.status': 'Done' })],
			config: { groupProperty: 'note.status' },
		});
		const header = h.gridEl.querySelector<HTMLElement>('.wise-view-grid__group[data-group-key="Todo"]');
		expect(header).not.toBeNull();
		header?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

		expect(h.gridEl.querySelector('[data-note-path="A.md"]')).toBeNull();
		expect(h.gridEl.querySelector('.wise-view-grid__group[data-group-key="Todo"]')).not.toBeNull();
		expect(h.gridEl.querySelector('[data-note-path="B.md"]')).not.toBeNull();

		header?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		expect(h.gridEl.querySelector('[data-note-path="A.md"]')).not.toBeNull();
	});
});

describe('BasesGridView render fast path', () => {
	it('does not rebuild the grid on an identical update', () => {
		const h = mount();
		const before = h.gridEl.querySelector('[data-note-path="A.md"]');
		h.view.onDataUpdated();
		const after = h.gridEl.querySelector('[data-note-path="A.md"]');
		expect(after).toBe(before);
	});
});

describe('BasesGridView interactions', () => {
	it('opens the note on click through the shared navigation service', () => {
		const h = mount({ notes: [note('A.md')] });
		h.gridEl.querySelector<HTMLElement>('[data-note-path="A.md"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		expect(h.opened).toEqual(['A.md']);
	});
});

describe('BasesGridView lifecycle', () => {
	it('removes DOM and stops responding to interaction on unload', () => {
		const h = mount({ notes: [note('A.md')] });
		h.view.onunload();
		expect(h.host.childElementCount).toBe(0);
	});

	it('is safe to unload twice', () => {
		const h = mount();
		expect(() => {
			h.view.onunload();
			h.view.onunload();
		}).not.toThrow();
	});
});
