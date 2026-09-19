import { describe, expect, it } from 'vitest';
import {
	appendGanttDependency,
	parseGanttDependencies,
	removeGanttDependencyFromAllTypes,
	toGanttWikiLink,
	type LinkResolver,
} from '../src/core/gantt/dependencies';

const paths = new Map([
	['Tasks/A', 'Tasks/A.md'],
	['Tasks/B', 'Tasks/B.md'],
	['A', 'Tasks/A.md'],
	['B', 'Tasks/B.md'],
]);
const resolve: LinkResolver = target => paths.get(target) ?? null;

describe('Gantt dependency conversion (GBETA-006)', () => {
	it('parses each dependency type, resolves aliases, and skips unresolved links', () => {
		expect(parseGanttDependencies({
			FS: ['[[Tasks/A]]', '[[Missing]]'],
			SS: '[[B|Alias]], [[Tasks/A]]',
			FF: '[[Tasks/B]]',
			SF: '',
		}, resolve)).toEqual([
			{ targetId: 'Tasks/A.md', type: 'FS' },
			{ targetId: 'Tasks/B.md', type: 'SS' },
			{ targetId: 'Tasks/A.md', type: 'SS' },
			{ targetId: 'Tasks/B.md', type: 'FF' },
		]);
	});

	it('appends while preserving list, comma-string, and newline-string shapes', () => {
		expect(appendGanttDependency(['[[Missing]]'], 'Tasks/B.md', resolve)).toEqual([
			'[[Missing]]',
			'[[Tasks/B]]',
		]);
		expect(appendGanttDependency('[[Missing]]', 'Tasks/B.md', resolve)).toBe('[[Missing]], [[Tasks/B]]');
		expect(appendGanttDependency('[[Missing]]\n[[Tasks/A]]', 'Tasks/B.md', resolve)).toBe(
			'[[Missing]]\n[[Tasks/A]]\n[[Tasks/B]]',
		);
	});

	it('does not append a dependency that already resolves to the target', () => {
		const current = ['[[B|Existing alias]]'];
		expect(appendGanttDependency(current, 'Tasks/B.md', resolve)).toBe(current);
	});

	it('removes a pair from every type and preserves unresolved values and storage shape', () => {
		expect(removeGanttDependencyFromAllTypes({
			FS: ['[[Tasks/A]]', '[[Missing]]'],
			SS: '[[Tasks/A]], [[Missing]]',
			FF: '[[Missing]]\n[[A|Alias]]',
			SF: '[[Tasks/B]]',
		}, 'Tasks/A.md', resolve)).toEqual({
			FS: ['[[Missing]]'],
			SS: '[[Missing]]',
			FF: '[[Missing]]',
			SF: '[[Tasks/B]]',
		});
	});

	it('writes the exact wiki-link form characterized by the Frappe view', () => {
		expect(toGanttWikiLink('Tasks/B.md')).toBe('[[Tasks/B]]');
		expect(appendGanttDependency('[[Tasks/A]]', 'Tasks/B.md', resolve)).toBe('[[Tasks/A]], [[Tasks/B]]');
	});
});
