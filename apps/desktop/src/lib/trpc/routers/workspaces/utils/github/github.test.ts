import { describe, expect, test } from "bun:test";
import {
	branchMatchesPR,
	getPullRequestRepoArgs,
	mergePullRequestComments,
	parseConversationCommentsResponse,
	parsePaginatedApiArray,
	parseReviewCommentsResponse,
} from "./github";

describe("branchMatchesPR", () => {
	test("matches same-repo branch exactly", () => {
		expect(branchMatchesPR("feature/my-thing", "feature/my-thing")).toBe(true);
	});

	test("matches fork PR with owner prefix", () => {
		expect(
			branchMatchesPR("forkowner/feature/my-thing", "feature/my-thing"),
		).toBe(true);
	});

	test("rejects different branch name", () => {
		expect(branchMatchesPR("feature/new-thing", "feature/old-thing")).toBe(
			false,
		);
	});

	test("rejects stale tracking ref mismatch", () => {
		expect(branchMatchesPR("kitenite/fix-bug", "someone-else/old-pr")).toBe(
			false,
		);
	});

	test("rejects partial suffix match that is not a path segment", () => {
		expect(branchMatchesPR("my-thing", "thing")).toBe(false);
	});
});

describe("getPullRequestRepoArgs", () => {
	test("returns upstream repo args for forks", () => {
		expect(
			getPullRequestRepoArgs({
				isFork: true,
				upstreamUrl: "git@github.com:superset-sh/superset.git",
			}),
		).toEqual(["--repo", "superset-sh/superset"]);
	});

	test("returns no repo args for non-forks", () => {
		expect(
			getPullRequestRepoArgs({
				isFork: false,
				upstreamUrl: "https://github.com/superset-sh/superset",
			}),
		).toEqual([]);
	});

	test("returns no repo args for malformed upstream urls", () => {
		expect(
			getPullRequestRepoArgs({
				isFork: true,
				upstreamUrl: "not-a-github-url",
			}),
		).toEqual([]);
	});
});

describe("parseReviewCommentsResponse", () => {
	test("normalizes inline review comments with file metadata", () => {
		expect(
			parseReviewCommentsResponse([
				{
					id: 42,
					user: {
						login: "octocat",
						avatar_url: "https://avatars.githubusercontent.com/u/1?v=4",
					},
					body: "Please rename this helper.",
					created_at: "2026-03-21T04:19:41Z",
					html_url:
						"https://github.com/superset-sh/superset/pull/2681#discussion_r42",
					path: "apps/desktop/src/file.ts",
					line: 19,
				},
			]),
		).toEqual([
			{
				id: "review-42",
				authorLogin: "octocat",
				avatarUrl: "https://avatars.githubusercontent.com/u/1?v=4",
				body: "Please rename this helper.",
				createdAt: new Date("2026-03-21T04:19:41Z").getTime(),
				url: "https://github.com/superset-sh/superset/pull/2681#discussion_r42",
				kind: "review",
				path: "apps/desktop/src/file.ts",
				line: 19,
			},
		]);
	});
});

describe("parsePaginatedApiArray", () => {
	test("flattens slurped paginated arrays", () => {
		expect(
			parsePaginatedApiArray(
				JSON.stringify([[{ id: 1 }, { id: 2 }], [{ id: 3 }]]),
			),
		).toEqual([{ id: 1 }, { id: 2 }, { id: 3 }]);
	});

	test("keeps single-page arrays intact", () => {
		expect(
			parsePaginatedApiArray(JSON.stringify([{ id: 1 }, { id: 2 }])),
		).toEqual([{ id: 1 }, { id: 2 }]);
	});
});

describe("parseConversationCommentsResponse", () => {
	test("normalizes top-level PR conversation comments", () => {
		expect(
			parseConversationCommentsResponse([
				{
					id: 7,
					user: {
						login: "hubot",
						avatar_url: "https://avatars.githubusercontent.com/u/2?v=4",
					},
					body: "Looks good overall.",
					created_at: "2026-03-21T04:08:13Z",
					html_url:
						"https://github.com/superset-sh/superset/pull/2681#issuecomment-7",
				},
			]),
		).toEqual([
			{
				id: "conversation-7",
				authorLogin: "hubot",
				avatarUrl: "https://avatars.githubusercontent.com/u/2?v=4",
				body: "Looks good overall.",
				createdAt: new Date("2026-03-21T04:08:13Z").getTime(),
				url: "https://github.com/superset-sh/superset/pull/2681#issuecomment-7",
				kind: "conversation",
			},
		]);
	});
});

describe("mergePullRequestComments", () => {
	test("sorts mixed comment kinds by recency", () => {
		expect(
			mergePullRequestComments(
				[
					{
						id: "review-42",
						authorLogin: "octocat",
						body: "Inline note",
						createdAt: 200,
						kind: "review",
					},
				],
				[
					{
						id: "conversation-7",
						authorLogin: "hubot",
						body: "Top-level note",
						createdAt: 100,
						kind: "conversation",
					},
				],
			),
		).toEqual([
			{
				id: "review-42",
				authorLogin: "octocat",
				body: "Inline note",
				createdAt: 200,
				kind: "review",
			},
			{
				id: "conversation-7",
				authorLogin: "hubot",
				body: "Top-level note",
				createdAt: 100,
				kind: "conversation",
			},
		]);
	});
});
