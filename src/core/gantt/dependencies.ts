// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Parkis Utama

import type { DependencyType, TaskDependency } from '@jaeungkim/gantt-chart';

export type DependencyValues = Partial<Record<DependencyType, unknown>>;
export type LinkResolver = (target: string) => string | null;

const TYPES: readonly DependencyType[] = ['FS', 'SS', 'FF', 'SF'];
const WIKILINK = /^\s*\[\[([^\]|]+)(?:\|[^\]]+)?\]\]\s*$/;

function parts(value: unknown): unknown[] {
	if (Array.isArray(value)) return value;
	if (typeof value === 'string') return value.split(/[\n,]/).map(part => part.trim()).filter(Boolean);
	return [];
}

function linkTarget(value: unknown): string | null {
	if (typeof value !== 'string') return null;
	const text = value.trim();
	if (!text) return null;
	return (WIKILINK.exec(text)?.[1] ?? text).trim();
}

export function toGanttWikiLink(filePath: string): string {
	return `[[${filePath.replace(/\.md$/i, '')}]]`;
}

export function parseGanttDependencies(values: DependencyValues, resolve: LinkResolver): TaskDependency[] {
	const result: TaskDependency[] = [];
	const seen = new Set<string>();
	for (const type of TYPES) {
		for (const raw of parts(values[type])) {
			const target = linkTarget(raw);
			const targetId = target ? resolve(target) : null;
			const key = targetId ? `${type}\0${targetId}` : null;
			if (!targetId || !key || seen.has(key)) continue;
			seen.add(key);
			result.push({ targetId, type });
		}
	}
	return result;
}

/** Appends one link without changing an existing array-vs-string storage shape. */
export function appendGanttDependency(value: unknown, targetPath: string, resolve: LinkResolver): unknown {
	const alreadyPresent = parts(value).some(raw => {
		const target = linkTarget(raw);
		return target !== null && resolve(target) === targetPath;
	});
	if (alreadyPresent) return value;
	const link = toGanttWikiLink(targetPath);
	if (Array.isArray(value)) return [...value, link];
	if (typeof value === 'string' && value.trim()) {
		return value.includes('\n') ? `${value}\n${link}` : `${value}, ${link}`;
	}
	return link;
}

function removeFromValue(value: unknown, targetPath: string, resolve: LinkResolver): unknown {
	const keep = (raw: unknown) => {
		const target = linkTarget(raw);
		return target === null || resolve(target) !== targetPath;
	};
	if (Array.isArray(value)) return value.filter(keep);
	if (typeof value !== 'string') return value;
	const separator = value.includes('\n') ? '\n' : ', ';
	return parts(value).filter(keep).join(separator);
}

/** Removes one resolved dependency while preserving array, comma, or newline storage shape. */
export function removeGanttDependency(value: unknown, targetPath: string, resolve: LinkResolver): unknown {
	return removeFromValue(value, targetPath, resolve);
}

/** Removes the target pair from every dependency-type property, as required by the library. */
export function removeGanttDependencyFromAllTypes(
	values: DependencyValues,
	targetPath: string,
	resolve: LinkResolver,
): DependencyValues {
	return Object.fromEntries(TYPES.map(type => [type, removeFromValue(values[type], targetPath, resolve)]));
}
