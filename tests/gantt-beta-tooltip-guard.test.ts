// @vitest-environment happy-dom

import { afterEach, describe, expect, it } from 'vitest';
import { TooltipGuard } from '../src/views/gantt-beta/tooltipGuard';

function chart(): HTMLElement {
	const root = document.createElement('div');
	root.innerHTML = `
		<section class="gantt-container">
			<div role="treegrid" aria-label="Gantt chart"></div>
			<button aria-label="Delete FS dependency"></button>
		</section>`;
	document.body.appendChild(root);
	return root;
}

afterEach(() => document.body.replaceChildren());

describe('Gantt Beta tooltip guard', () => {
	it('moves the treegrid name off aria-label so Obsidian shows no "Gantt chart" bubble', () => {
		const root = chart();
		const guard = new TooltipGuard(root, window);
		guard.sweep();

		const grid = root.querySelector('[role="treegrid"]')!;
		expect(grid.hasAttribute('aria-label')).toBe(false);
		const label = document.getElementById(grid.getAttribute('aria-labelledby')!);
		expect(label?.textContent).toBe('Gantt chart');
		expect(label?.className).toContain('gantt-sr-only');
		guard.dispose();
	});

	it('keeps tooltips on small controls, where they help', () => {
		const root = chart();
		const guard = new TooltipGuard(root, window);
		guard.sweep();

		expect(root.querySelector('button')?.getAttribute('aria-label')).toBe('Delete FS dependency');
		guard.dispose();
	});

	it('is idempotent and re-applies when the chart is rebuilt', () => {
		const root = chart();
		const guard = new TooltipGuard(root, window);
		guard.sweep();
		guard.sweep();
		expect(root.querySelectorAll('.gantt-sr-only')).toHaveLength(1);

		root.querySelector('.gantt-container')!.innerHTML = '<div role="treegrid" aria-label="Gantt chart"></div>';
		guard.sweep();
		const grid = root.querySelector('[role="treegrid"]')!;
		expect(grid.hasAttribute('aria-label')).toBe(false);
		expect(root.querySelectorAll('.gantt-sr-only')).toHaveLength(1);
		guard.dispose();
	});

	it('removes its hidden label on dispose', () => {
		const root = chart();
		const guard = new TooltipGuard(root, window);
		guard.sweep();
		guard.dispose();

		expect(root.querySelector('.gantt-sr-only')).toBeNull();
	});
});
