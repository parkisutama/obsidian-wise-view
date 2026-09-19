import { describe, expect, it } from "vitest";
import { calculateGridColumns } from "../src/core/layouts/GridLayout";

describe("calculateGridColumns", () => {
	it("fits as many minimum-width columns as possible", () => {
		expect(calculateGridColumns({ containerWidth: 1000, minColumnWidth: 200, gap: 0 })).toEqual({
			columns: 5,
			columnWidth: 200,
		});
	});

	it("accounts for the gap between columns", () => {
		// 3 columns of 200 + 2 gaps of 20 = 640; a 4th column would need 200 + 20 = 220 more (860 total),
		// which doesn't fit in 700.
		const result = calculateGridColumns({ containerWidth: 700, minColumnWidth: 200, gap: 20 });
		expect(result.columns).toBe(3);
		expect(result.columnWidth).toBeCloseTo((700 - 2 * 20) / 3, 5);
	});

	it("stretches columns to fill the remaining width evenly", () => {
		const result = calculateGridColumns({ containerWidth: 1000, minColumnWidth: 300, gap: 0 });
		expect(result.columns).toBe(3);
		expect(result.columnWidth).toBeCloseTo(1000 / 3, 5);
	});

	it("never returns zero columns for a positive width, even narrower than one column", () => {
		expect(calculateGridColumns({ containerWidth: 100, minColumnWidth: 200, gap: 0 }).columns).toBe(1);
	});

	it("clamps a zero, negative, or non-finite width to a single safe column", () => {
		for (const width of [0, -100, Number.NaN, Number.POSITIVE_INFINITY]) {
			const result = calculateGridColumns({ containerWidth: width, minColumnWidth: 200, gap: 8 });
			expect(result.columns).toBeGreaterThanOrEqual(1);
			expect(Number.isFinite(result.columnWidth)).toBe(true);
			expect(result.columnWidth).toBeGreaterThanOrEqual(0);
		}
	});

	it("clamps an invalid minColumnWidth or gap instead of dividing by zero/negative", () => {
		const result = calculateGridColumns({ containerWidth: 1000, minColumnWidth: 0, gap: -10 });
		expect(Number.isFinite(result.columns)).toBe(true);
		expect(Number.isFinite(result.columnWidth)).toBe(true);
		expect(result.columns).toBeGreaterThanOrEqual(1);
	});

	it("caps the column count at maxColumns even when more would fit", () => {
		const result = calculateGridColumns({ containerWidth: 2000, minColumnWidth: 100, gap: 0, maxColumns: 2 });
		expect(result.columns).toBe(2);
		expect(result.columnWidth).toBeCloseTo(1000, 5);
	});

	it("is deterministic for the same input", () => {
		const input = { containerWidth: 913, minColumnWidth: 217, gap: 13 };
		expect(calculateGridColumns(input)).toEqual(calculateGridColumns(input));
	});
});
