// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Parkis Utama

import type {
	GanttDependencyChange,
	GanttTaskDraft,
	GanttTaskMoveChange,
	Task,
} from '@jaeungkim/gantt-chart';
import { diffGanttTasks } from '../../core/gantt/diff';
import { writeGanttDate } from '../../core/gantt/dates';
import {
	buildGanttMutationPlan,
	type GanttMutationPlanOptions,
} from '../../core/gantt/mutationPlan';
import { SYNTHETIC_PHASE_PREFIX } from '../../core/gantt/phases';
import type { GrantedMutations } from '../../platform/mutations/grants';
import type { MutationResult } from '../../platform/mutations/types';

interface BaselineValues {
	currentOrder?: ReadonlyMap<string, number | null | undefined>;
	currentDependsOn?: ReadonlyMap<string, unknown>;
}

export interface GanttBetaWriteBackOptions {
	mutations: GrantedMutations;
	properties: GanttMutationPlanOptions;
	/**
	 * Restores the chart to `tasks` after a failed write. The library ignores a `tasks` prop whose
	 * contents equal the last one it was given, so the host must remount rather than re-pass.
	 */
	revertTasks(tasks: Task[]): void;
	notice(message: string): void;
	createTask?(draft: GanttTaskDraft): Promise<void>;
	/** Holds Bases re-renders while writes are in flight (see EchoGate). */
	gate?: { begin(): void; end(): void };
}

function failed(message: string): MutationResult {
	return { ok: false, reason: 'error', message };
}

/**
 * Converts controlled chart gestures into the smallest scoped mutation calls. It owns only an
 * immutable task baseline and plain frontmatter values; no live Bases object crosses an update.
 */
export class GanttBetaWriteBack {
	private baseline: Task[];
	private properties: GanttMutationPlanOptions;
	private queue: Promise<void> = Promise.resolve();
	private epoch = 0;

	constructor(tasks: Task[], private readonly options: GanttBetaWriteBackOptions) {
		this.baseline = tasks;
		this.properties = options.properties;
	}

	get tasks(): Task[] {
		return this.baseline;
	}

	replaceProperties(properties: GanttMutationPlanOptions): void {
		this.properties = properties;
	}

	replaceBaseline(tasks: Task[], values: BaselineValues = {}): void {
		this.baseline = tasks;
		this.properties = { ...this.properties, ...values };
	}

	onDependencyCreate(change: GanttDependencyChange): boolean {
		if (change.type === 'FS' && this.properties.dependsOn && this.options.mutations.dependency) return true;
		this.options.notice('Gantt Beta currently supports finish-to-start dependencies only.');
		return false;
	}

	onDependencyDelete(change: GanttDependencyChange): boolean {
		return this.onDependencyCreate(change);
	}

	onTaskMove(change: GanttTaskMoveChange): boolean {
		if (change.toParentId?.startsWith(SYNTHETIC_PHASE_PREFIX)) {
			this.options.notice('Tasks cannot be moved into a synthetic Base group.');
			return false;
		}
		if (change.fromParentId === change.toParentId && !this.properties.order) {
			this.options.notice('Configure an Order property before reordering rows.');
			return false;
		}
		if (change.fromParentId !== change.toParentId && !this.properties.parent) {
			this.options.notice('Configure a Parent property before moving tasks between phases.');
			return false;
		}
		return true;
	}

	async onTaskCreate(draft: GanttTaskDraft): Promise<void> {
		if (!this.options.createTask) {
			this.options.notice('Task creation is not available.');
			return;
		}
		try {
			await this.options.createTask(draft);
		} catch (error) {
			this.options.notice(`Could not create Gantt note: ${error instanceof Error ? error.message : String(error)}`);
		}
	}

	/**
	 * Gestures are applied strictly in order, each diffed against the state the previous one left
	 * behind. A failed gesture voids every gesture queued before its revert, because the chart is
	 * remounted from the pre-failure baseline and those later arrays still contain the failed edit.
	 */
	onTasksChange(nextTasks: Task[]): Promise<void> {
		const epoch = this.epoch;
		this.options.gate?.begin();
		const job = this.queue
			.then(() => (epoch === this.epoch ? this.apply(nextTasks) : undefined))
			.finally(() => this.options.gate?.end());
		this.queue = job.catch(() => undefined);
		return job;
	}

	private async apply(nextTasks: Task[]): Promise<void> {
		const previous = this.baseline;
		const plan = buildGanttMutationPlan(diffGanttTasks(previous, nextTasks), this.properties);
		if (plan.length === 0) {
			this.baseline = nextTasks;
			return;
		}

		let failureMessage: string | null = null;
		try {
			const results = await Promise.all(plan.flatMap(item => this.writeItem(item.path, item.values)));
			const failure = results.find(result => !result.ok);
			if (failure && !failure.ok) failureMessage = failure.message;
		} catch (error) {
			failureMessage = error instanceof Error ? error.message : String(error);
		}

		if (failureMessage !== null) {
			this.epoch += 1;
			this.options.revertTasks(previous);
			this.options.notice(`Could not save Gantt change: ${failureMessage}`);
			return;
		}
		this.baseline = nextTasks;
	}

	private writeItem(path: string, values: Record<string, unknown>): Promise<MutationResult>[] {
		const remaining = { ...values };
		const calls: Promise<MutationResult>[] = [];
		const start = this.properties.start;
		const end = this.properties.end;

		if (start && Object.hasOwn(remaining, start.id)) {
			const startValue = remaining[start.id];
			const endValue = end && Object.hasOwn(remaining, end.id) ? remaining[end.id] : undefined;
			delete remaining[start.id];
			if (end) delete remaining[end.id];
			calls.push(this.options.mutations.date?.updateRange(
				path, start.id, String(startValue), end?.id, endValue == null ? null : String(endValue),
			) ?? Promise.resolve(failed('Date mutation capability is unavailable.')));
		} else if (end && Object.hasOwn(remaining, end.id)) {
			const endValue = remaining[end.id];
			delete remaining[end.id];
			const current = this.baseline.find(task => task.id === path);
			const currentStart = current && start ? writeGanttDate(current.startDate, start.type, 'start') : null;
			calls.push(currentStart && start ? (this.options.mutations.date?.updateRange(
				path, start.id, currentStart, end.id, endValue == null ? null : String(endValue),
			) ?? Promise.resolve(failed('Date mutation capability is unavailable.')))
				: Promise.resolve(failed('The task start date is unavailable.')));
		}

		const dependency = this.properties.dependsOn;
		if (dependency && Object.hasOwn(remaining, dependency)) {
			const value = remaining[dependency];
			delete remaining[dependency];
			calls.push(this.options.mutations.dependency?.setDependencies(path, dependency, value)
				?? Promise.resolve(failed('Dependency mutation capability is unavailable.')));
		}

		if (Object.keys(remaining).length > 0) {
			calls.push(this.options.mutations.property?.setProperties(path, remaining)
				?? Promise.resolve(failed('Property mutation capability is unavailable.')));
		}
		return calls;
	}
}
