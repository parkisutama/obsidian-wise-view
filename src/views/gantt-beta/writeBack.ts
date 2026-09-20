// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Parkis Utama

import type {
	GanttDependencyChange,
	GanttTaskDraft,
	GanttTaskMoveChange,
	Task,
} from '@jaeungkim/gantt-chart';
import { diffGanttTasks } from '../../core/gantt/diff';
import { applyGanttDependencyPolicy, type GanttDependencyPolicy } from '../../core/gantt/cascade';
import { readGanttDate, writeGanttDate } from '../../core/gantt/dates';
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
	dependencyPolicy?: GanttDependencyPolicy;
	writePhaseDates?: boolean;
	/** Applies cascade results without remounting the chart. */
	renderTasks?(tasks: Task[]): void;
	/** Holds Bases re-renders while writes are in flight (see EchoGate). */
	gate?: { begin(): void; end(): void };
}

function failed(message: string): MutationResult {
	return { ok: false, reason: 'error', message };
}

function canonicalDate(value: string, type: 'date' | 'datetime', boundary: 'start' | 'end'): string {
	if (type === 'datetime') return value;
	const stored = writeGanttDate(value, type, boundary);
	return stored ? (readGanttDate(stored, type, boundary) ?? value) : value;
}

function chartTime(value: string): number {
	return Date.parse(`${value}${value.includes('T') && !/[zZ]|[+-]\d\d:\d\d$/.test(value) ? 'Z' : ''}`);
}

function hasReversedRange(task: Task, endType: 'date' | 'datetime'): boolean {
	// Date tasks use an exclusive chart end, so equality would persist as an inclusive end one day
	// before the start. Date & time tasks may intentionally be zero-duration milestones.
	const start = chartTime(task.startDate);
	const end = chartTime(task.endDate);
	return Number.isFinite(start) && Number.isFinite(end) && (endType === 'date' ? end <= start : end < start);
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
	private dependencyPolicy: GanttDependencyPolicy;
	private writePhaseDates: boolean;
	private pendingDependencyChange = false;

	constructor(tasks: Task[], private readonly options: GanttBetaWriteBackOptions) {
		this.baseline = tasks;
		this.properties = options.properties;
		this.dependencyPolicy = options.dependencyPolicy ?? 'none';
		this.writePhaseDates = options.writePhaseDates ?? false;
	}

	get tasks(): Task[] {
		return this.baseline;
	}

	replaceProperties(properties: GanttMutationPlanOptions): void {
		this.properties = properties;
	}

	replaceScheduleOptions(dependencyPolicy: GanttDependencyPolicy, writePhaseDates: boolean): void {
		this.dependencyPolicy = dependencyPolicy;
		this.writePhaseDates = writePhaseDates;
	}

	replaceBaseline(tasks: Task[], values: BaselineValues = {}): void {
		this.baseline = tasks;
		this.properties = { ...this.properties, ...values };
	}

	onDependencyCreate(change: GanttDependencyChange): boolean {
		if (change.type === 'FS' && this.properties.dependsOn && this.options.mutations.dependency) {
			this.pendingDependencyChange = true;
			return true;
		}
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
		const type = this.properties.end?.type ?? null;
		if (type && hasReversedRange({ ...draft, id: '', name: '', parentId: null, sequence: '' }, type)) {
			this.options.notice('End must not be earlier than start.');
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
		const allowDependencyChange = this.pendingDependencyChange;
		this.pendingDependencyChange = false;
		const dateNormalizedTasks = nextTasks.map(task => {
			const types = this.properties.dateTypes?.get(task.id);
			const startType = types?.start ?? this.properties.start?.type;
			const endType = types?.end ?? this.properties.end?.type;
			const startDate = startType ? canonicalDate(task.startDate, startType, 'start') : task.startDate;
			const endDate = endType ? canonicalDate(task.endDate, endType, 'end') : task.endDate;
			return startDate === task.startDate && endDate === task.endDate ? task : { ...task, startDate, endDate };
		});
		const preservedTasks = allowDependencyChange ? dateNormalizedTasks : dateNormalizedTasks.map(task => {
			const previous = this.baseline.find(candidate => candidate.id === task.id);
			if (!previous || task.dependencies === previous.dependencies) return task;
			return { ...task, dependencies: previous.dependencies };
		});
		const normalizedTasks = preservedTasks.every((task, index) => task === nextTasks[index])
			? nextTasks : preservedTasks;
		this.options.gate?.begin();
		const job = this.queue
			.then(() => (epoch === this.epoch ? this.apply(normalizedTasks, nextTasks) : undefined))
			.finally(() => this.options.gate?.end());
		this.queue = job.catch(() => undefined);
		return job;
	}

	private async apply(nextTasks: Task[], sourceTasks: Task[] = nextTasks): Promise<void> {
		const previous = this.baseline;
		const ids = new Set(nextTasks.map(task => task.id));
		const phaseIds = new Set(nextTasks.map(task => task.parentId).filter((id): id is string => id !== null && ids.has(id)));
		const reversed = nextTasks.find(task => {
			if (task.id.startsWith(SYNTHETIC_PHASE_PREFIX)) return false;
			if (!this.writePhaseDates && phaseIds.has(task.id)) return false;
			if (!this.properties.end) return false;
			const baselineTask = previous.find(candidate => candidate.id === task.id);
			if (baselineTask
				&& baselineTask.startDate === task.startDate
				&& baselineTask.endDate === task.endDate) return false;
			const type = this.properties.dateTypes?.get(task.id)?.end ?? this.properties.end.type;
			return type ? hasReversedRange(task, type) : false;
		});
		if (reversed) {
			this.epoch += 1;
			this.options.revertTasks(previous);
			this.options.notice(`Could not save ${reversed.name}: end must not be earlier than start.`);
			return;
		}
		const scheduledTasks = applyGanttDependencyPolicy(previous, nextTasks, this.dependencyPolicy);
		const plan = buildGanttMutationPlan(diffGanttTasks(previous, scheduledTasks), {
			...this.properties, phaseIds, writePhaseDates: this.writePhaseDates,
		});
		if (plan.length === 0) {
			this.baseline = scheduledTasks;
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
		this.baseline = scheduledTasks;
		if (scheduledTasks.some((task, index) => task !== sourceTasks[index])) this.options.renderTasks?.(scheduledTasks);
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
			const startType = this.properties.dateTypes?.get(path)?.start ?? start?.type;
			const currentStart = current && startType ? writeGanttDate(current.startDate, startType, 'start') : null;
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
