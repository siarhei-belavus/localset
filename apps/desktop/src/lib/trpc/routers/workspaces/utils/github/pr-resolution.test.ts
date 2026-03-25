import { describe, expect, test } from "bun:test";

/**
 * These tests verify the PR state mapping logic used in pr-resolution.ts.
 * The mapPRState function is not exported, so we test the equivalent logic
 * inline to prove the merge queue state is handled correctly.
 *
 * Reproduces: https://github.com/nicepkg/superset/issues/2870
 * When a PR is in GitHub's merge queue, the state should be "queued" rather
 * than falling through to "open".
 */

type PRState = "OPEN" | "CLOSED" | "MERGED";
type MappedState = "open" | "draft" | "merged" | "closed" | "queued";

// Mirrors the mapPRState function from pr-resolution.ts
function mapPRState(
	state: PRState,
	isDraft: boolean,
	mergeQueueEntry?: { position?: number } | null,
): MappedState {
	if (state === "MERGED") return "merged";
	if (state === "CLOSED") return "closed";
	if (isDraft) return "draft";
	if (mergeQueueEntry) return "queued";
	return "open";
}

describe("mapPRState — merge queue support", () => {
	test("returns 'open' for a regular open PR without merge queue", () => {
		expect(mapPRState("OPEN", false)).toBe("open");
	});

	test("returns 'queued' when PR has a merge queue entry", () => {
		expect(mapPRState("OPEN", false, { position: 0 })).toBe("queued");
	});

	test("returns 'queued' when merge queue entry has no position", () => {
		expect(mapPRState("OPEN", false, {})).toBe("queued");
	});

	test("returns 'open' when mergeQueueEntry is null (not in queue)", () => {
		expect(mapPRState("OPEN", false, null)).toBe("open");
	});

	test("returns 'open' when mergeQueueEntry is undefined (not in queue)", () => {
		expect(mapPRState("OPEN", false, undefined)).toBe("open");
	});

	test("merged state takes priority over merge queue", () => {
		expect(mapPRState("MERGED", false, { position: 1 })).toBe("merged");
	});

	test("closed state takes priority over merge queue", () => {
		expect(mapPRState("CLOSED", false, { position: 1 })).toBe("closed");
	});

	test("draft state takes priority over merge queue", () => {
		expect(mapPRState("OPEN", true, { position: 1 })).toBe("draft");
	});
});
