// @vitest-environment happy-dom

import { afterEach, describe, expect, it } from 'vitest';
import type { ComponentChild, VNode } from 'preact';
import { BasesGanttBetaView, BASES_GANTT_BETA_VIEW_ID, createGanttBetaViewRegistration } from '../src/views/gantt-beta';
import type { ChartRender } from '../src/views/gantt-beta/chartHost';

const flush = () => new Promise(resolve => setTimeout(resolve, 0));

interface Harness {
	view: BasesGanttBetaView;
	host: HTMLElement;
	renders: ComponentChild[];
}

function mount(): Harness {
	const host = document.createElement('div');
	document.body.appendChild(host);
	const renders: ComponentChild[] = [];
	const renderChart: ChartRender = (node, container) => {
		renders.push(node);
		container.replaceChildren();
		if (node !== null && node !== undefined && node !== false) {
			const marker = document.createElement('div');
			marker.dataset.preactTree = 'mounted';
			container.appendChild(marker);
		}
	};
	const controller = { app: {}, config: {}, data: null };
	const view = new BasesGanttBetaView(controller as never, host, renderChart);
	return { view, host, renders };
}

function lastProps(harness: Harness): Record<string, unknown> {
	return (harness.renders.at(-1) as VNode<Record<string, unknown>>).props;
}

afterEach(() => {
	document.body.classList.remove('theme-dark');
	document.body.replaceChildren();
});

describe('Gantt Beta skeleton (GBETA-004)', () => {
	it('registers the permanent id and display name', () => {
		const registration = createGanttBetaViewRegistration();
		expect(BASES_GANTT_BETA_VIEW_ID).toBe('wise-view-gantt-beta');
		expect(registration.name).toBe('Gantt Beta');
		expect(registration.factory).toBeTypeOf('function');
	});

	it('mounts a static, read-only chart', () => {
		const harness = mount();
		expect(harness.host.dataset.preactTree).toBeUndefined();
		expect(harness.host.querySelector('[data-preact-tree="mounted"]')).not.toBeNull();
		expect(lastProps(harness)).toMatchObject({
			theme: 'light',
			readOnly: true,
			hierarchy: true,
			showTaskList: true,
		});
		expect(lastProps(harness).tasks).toHaveLength(3);
		harness.view.onunload();
	});

	it('repaints when the owning document switches theme', async () => {
		const harness = mount();
		const initialRenderCount = harness.renders.length;

		document.body.classList.add('theme-dark');
		await flush();

		expect(harness.renders.length).toBe(initialRenderCount + 1);
		expect(lastProps(harness).theme).toBe('dark');
		harness.view.onunload();
	});

	it('unmounts the Preact tree and disconnects theme repainting on unload', async () => {
		const harness = mount();
		harness.view.onunload();
		const renderCountAfterUnload = harness.renders.length;

		expect(harness.renders.at(-1)).toBeNull();
		expect(harness.host.childElementCount).toBe(0);
		expect(harness.host.classList.contains('bases-gantt-beta-view')).toBe(false);

		document.body.classList.add('theme-dark');
		await flush();
		expect(harness.renders).toHaveLength(renderCountAfterUnload);
	});
});
