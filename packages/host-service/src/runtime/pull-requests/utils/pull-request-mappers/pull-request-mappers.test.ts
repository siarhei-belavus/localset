import { describe, expect, test } from "bun:test";
import {
	coercePullRequestState,
	mapPullRequestState,
} from "./pull-request-mappers";

describe("mapPullRequestState", () => {
	test("returns 'merged' for MERGED state", () => {
		expect(mapPullRequestState("MERGED", false)).toBe("merged");
	});

	test("returns 'closed' for CLOSED state", () => {
		expect(mapPullRequestState("CLOSED", false)).toBe("closed");
	});

	test("returns 'draft' for draft PRs", () => {
		expect(mapPullRequestState("OPEN", true)).toBe("draft");
	});

	test("returns 'open' for regular open PRs", () => {
		expect(mapPullRequestState("OPEN", false)).toBe("open");
	});

	test("returns 'queued' when PR has a merge queue entry", () => {
		expect(mapPullRequestState("OPEN", false, { position: 1 })).toBe("queued");
	});

	test("returns 'queued' when merge queue entry has null position", () => {
		expect(mapPullRequestState("OPEN", false, { position: null })).toBe(
			"queued",
		);
	});

	test("returns 'merged' even if merge queue entry is present (merged takes priority)", () => {
		expect(mapPullRequestState("MERGED", false, { position: 1 })).toBe(
			"merged",
		);
	});

	test("returns 'draft' over queued (draft takes priority)", () => {
		expect(mapPullRequestState("OPEN", true, { position: 1 })).toBe("draft");
	});

	test("returns 'open' when mergeQueueEntry is null", () => {
		expect(mapPullRequestState("OPEN", false, null)).toBe("open");
	});

	test("returns 'open' when mergeQueueEntry is undefined", () => {
		expect(mapPullRequestState("OPEN", false, undefined)).toBe("open");
	});
});

describe("coercePullRequestState", () => {
	test("coerces 'queued' correctly", () => {
		expect(coercePullRequestState("queued")).toBe("queued");
	});

	test("coerces known states correctly", () => {
		expect(coercePullRequestState("open")).toBe("open");
		expect(coercePullRequestState("merged")).toBe("merged");
		expect(coercePullRequestState("closed")).toBe("closed");
		expect(coercePullRequestState("draft")).toBe("draft");
	});

	test("defaults unknown values to 'open'", () => {
		expect(coercePullRequestState("unknown")).toBe("open");
		expect(coercePullRequestState(null)).toBe("open");
	});
});
