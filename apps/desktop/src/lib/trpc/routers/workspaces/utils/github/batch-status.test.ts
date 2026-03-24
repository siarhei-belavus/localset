import { describe, expect, test } from "bun:test";
import {
	type BatchWorkspaceInput,
	buildBatchQuery,
	groupByRepo,
	parseBatchResponse,
} from "./batch-status";
import { getCachedGitHubStatus, setCachedGitHubStatus } from "./cache";

const makeInput = (
	worktreePath: string,
	branchName: string,
	nwo = "superset-sh/superset",
	isFork = false,
): BatchWorkspaceInput => ({
	worktreePath,
	branchName,
	repoContext: {
		repoUrl: `https://github.com/${nwo}`,
		upstreamUrl: `https://github.com/${nwo}`,
		isFork,
	},
});

describe("groupByRepo", () => {
	test("groups workspaces by their target repository", () => {
		const inputs = [
			makeInput("/ws/a", "feat/a", "org/repo1"),
			makeInput("/ws/b", "feat/b", "org/repo1"),
			makeInput("/ws/c", "feat/c", "org/repo2"),
		];
		const groups = groupByRepo(inputs);
		expect(groups.size).toBe(2);
		expect(groups.get("org/repo1")?.length).toBe(2);
		expect(groups.get("org/repo2")?.length).toBe(1);
	});

	test("uses upstream URL for forks", () => {
		const input: BatchWorkspaceInput = {
			worktreePath: "/ws/fork",
			branchName: "feat/fork",
			repoContext: {
				repoUrl: "https://github.com/myuser/repo",
				upstreamUrl: "https://github.com/org/repo",
				isFork: true,
			},
		};
		const groups = groupByRepo([input]);
		expect(groups.has("org/repo")).toBe(true);
		expect(groups.has("myuser/repo")).toBe(false);
	});

	test("skips inputs with invalid URLs", () => {
		const input: BatchWorkspaceInput = {
			worktreePath: "/ws/bad",
			branchName: "main",
			repoContext: {
				repoUrl: "not-a-url",
				upstreamUrl: "not-a-url",
				isFork: false,
			},
		};
		const groups = groupByRepo([input]);
		expect(groups.size).toBe(0);
	});
});

describe("buildBatchQuery", () => {
	test("generates query with repo and PR aliases", () => {
		const inputs = [
			makeInput("/ws/a", "feat/a", "org/repo"),
			makeInput("/ws/b", "fix/b", "org/repo"),
		];
		const groups = groupByRepo(inputs);
		const { query, aliasMap } = buildBatchQuery(groups);

		expect(query).toContain("query BatchPRStatus");
		expect(query).toContain('repo_0: repository(owner: "org", name: "repo")');
		expect(query).toContain(
			'pr_0_0: pullRequests(first: 1, headRefName: "feat/a"',
		);
		expect(query).toContain(
			'pr_0_1: pullRequests(first: 1, headRefName: "fix/b"',
		);
		expect(query).toContain("fragment PRFields on PullRequest");
		expect(aliasMap.size).toBe(2);
	});

	test("generates separate repo blocks for different repos", () => {
		const inputs = [
			makeInput("/ws/a", "feat/a", "org/repo1"),
			makeInput("/ws/b", "feat/b", "org/repo2"),
		];
		const groups = groupByRepo(inputs);
		const { query } = buildBatchQuery(groups);

		expect(query).toContain("repo_0:");
		expect(query).toContain("repo_1:");
		expect(query).toContain('"repo1"');
		expect(query).toContain('"repo2"');
	});

	test("escapes special characters in branch names", () => {
		const inputs = [makeInput("/ws/a", 'feat/"special', "org/repo")];
		const groups = groupByRepo(inputs);
		const { query } = buildBatchQuery(groups);

		expect(query).toContain('feat/\\"special');
	});
});

describe("parseBatchResponse", () => {
	test("maps PR data to GitHubStatus per workspace", () => {
		const inputs = [
			makeInput("/ws/a", "feat/a", "org/repo"),
			makeInput("/ws/b", "feat/b", "org/repo"),
		];
		const groups = groupByRepo(inputs);
		const { aliasMap } = buildBatchQuery(groups);

		const data = {
			repo_0: {
				pr_0_0: {
					nodes: [
						{
							number: 42,
							title: "Add feature A",
							url: "https://github.com/org/repo/pull/42",
							state: "OPEN" as const,
							isDraft: false,
							mergedAt: null,
							additions: 10,
							deletions: 3,
							headRefName: "feat/a",
							headRefOid: "abc123",
							reviewDecision: "APPROVED" as const,
							statusCheckRollup: null,
							reviewRequests: { nodes: [] },
						},
					],
				},
				pr_0_1: {
					nodes: [],
				},
			},
		};

		const results = parseBatchResponse(data, aliasMap);

		expect(results.size).toBe(2);

		const statusA = results.get("/ws/a");
		expect(statusA).toBeDefined();
		expect(statusA?.pr).not.toBeNull();
		expect(statusA?.pr?.number).toBe(42);
		expect(statusA?.pr?.state).toBe("open");
		expect(statusA?.pr?.reviewDecision).toBe("approved");
		expect(statusA?.branchExistsOnRemote).toBe(true);

		const statusB = results.get("/ws/b");
		expect(statusB).toBeDefined();
		expect(statusB?.pr).toBeNull();
		expect(statusB?.branchExistsOnRemote).toBe(false);
	});

	test("maps draft PRs correctly", () => {
		const inputs = [makeInput("/ws/draft", "feat/draft", "org/repo")];
		const groups = groupByRepo(inputs);
		const { aliasMap } = buildBatchQuery(groups);

		const data = {
			repo_0: {
				pr_0_0: {
					nodes: [
						{
							number: 99,
							title: "Draft PR",
							url: "https://github.com/org/repo/pull/99",
							state: "OPEN" as const,
							isDraft: true,
							mergedAt: null,
							additions: 5,
							deletions: 0,
							headRefName: "feat/draft",
							headRefOid: "def456",
							reviewDecision: null,
							statusCheckRollup: null,
							reviewRequests: { nodes: [] },
						},
					],
				},
			},
		};

		const results = parseBatchResponse(data, aliasMap);
		expect(results.get("/ws/draft")?.pr?.state).toBe("draft");
	});

	test("maps merged PRs correctly", () => {
		const inputs = [makeInput("/ws/merged", "feat/merged", "org/repo")];
		const groups = groupByRepo(inputs);
		const { aliasMap } = buildBatchQuery(groups);

		const data = {
			repo_0: {
				pr_0_0: {
					nodes: [
						{
							number: 100,
							title: "Merged PR",
							url: "https://github.com/org/repo/pull/100",
							state: "MERGED" as const,
							isDraft: false,
							mergedAt: "2026-03-20T10:00:00Z",
							additions: 20,
							deletions: 5,
							headRefName: "feat/merged",
							headRefOid: "ghi789",
							reviewDecision: "APPROVED" as const,
							statusCheckRollup: null,
							reviewRequests: { nodes: [] },
						},
					],
				},
			},
		};

		const results = parseBatchResponse(data, aliasMap);
		const status = results.get("/ws/merged");
		expect(status).toBeDefined();
		expect(status?.pr?.state).toBe("merged");
		expect(status?.pr?.mergedAt).toBe(
			new Date("2026-03-20T10:00:00Z").getTime(),
		);
	});

	test("extracts check statuses from statusCheckRollup", () => {
		const inputs = [makeInput("/ws/checks", "feat/checks", "org/repo")];
		const groups = groupByRepo(inputs);
		const { aliasMap } = buildBatchQuery(groups);

		const data = {
			repo_0: {
				pr_0_0: {
					nodes: [
						{
							number: 101,
							title: "PR with checks",
							url: "https://github.com/org/repo/pull/101",
							state: "OPEN" as const,
							isDraft: false,
							mergedAt: null,
							additions: 1,
							deletions: 0,
							headRefName: "feat/checks",
							headRefOid: "jkl012",
							reviewDecision: "" as const,
							statusCheckRollup: {
								contexts: {
									nodes: [
										{
											__typename: "CheckRun",
											name: "CI",
											conclusion: "SUCCESS",
											detailsUrl: "https://example.com/ci",
										},
										{
											__typename: "StatusContext",
											context: "deploy/preview",
											state: "FAILURE",
											targetUrl: "https://example.com/deploy",
										},
									],
								},
							},
							reviewRequests: { nodes: [] },
						},
					],
				},
			},
		};

		const results = parseBatchResponse(data, aliasMap);
		const status = results.get("/ws/checks");
		expect(status).toBeDefined();
		expect(status?.pr?.checks).toHaveLength(2);
		expect(status?.pr?.checks[0]).toEqual({
			name: "CI",
			status: "success",
			url: "https://example.com/ci",
		});
		expect(status?.pr?.checks[1]).toEqual({
			name: "deploy/preview",
			status: "failure",
			url: "https://example.com/deploy",
		});
		expect(status?.pr?.checksStatus).toBe("failure");
	});

	test("extracts requested reviewers", () => {
		const inputs = [makeInput("/ws/reviewers", "feat/rev", "org/repo")];
		const groups = groupByRepo(inputs);
		const { aliasMap } = buildBatchQuery(groups);

		const data = {
			repo_0: {
				pr_0_0: {
					nodes: [
						{
							number: 102,
							title: "PR with reviewers",
							url: "https://github.com/org/repo/pull/102",
							state: "OPEN" as const,
							isDraft: false,
							mergedAt: null,
							additions: 1,
							deletions: 0,
							headRefName: "feat/rev",
							headRefOid: "mno345",
							reviewDecision: "REVIEW_REQUIRED" as const,
							statusCheckRollup: null,
							reviewRequests: {
								nodes: [
									{ requestedReviewer: { login: "alice" } },
									{
										requestedReviewer: { slug: "core-team", name: "Core Team" },
									},
								],
							},
						},
					],
				},
			},
		};

		const results = parseBatchResponse(data, aliasMap);
		const status = results.get("/ws/reviewers");
		expect(status).toBeDefined();
		expect(status?.pr?.requestedReviewers).toEqual(["alice", "core-team"]);
	});
});

describe("batch cache integration", () => {
	test("setCachedGitHubStatus entries are readable by getCachedGitHubStatus", () => {
		const worktreePaths = ["/ws/cache-1", "/ws/cache-2", "/ws/cache-3"];

		try {
			for (const path of worktreePaths) {
				const status = {
					pr: null,
					repoUrl: "https://github.com/org/repo",
					upstreamUrl: "https://github.com/org/repo",
					isFork: false,
					branchExistsOnRemote: false,
					lastRefreshed: Date.now(),
				};
				setCachedGitHubStatus(path, status);
			}

			// All entries should be immediately readable
			for (const path of worktreePaths) {
				const cached = getCachedGitHubStatus(path);
				expect(cached).not.toBeNull();
				expect(cached?.repoUrl).toBe("https://github.com/org/repo");
			}
		} finally {
			// Clean up - import not available, but cache entries will expire
		}
	});

	test("demonstrates N+1 problem: N workspaces need N individual cache reads", () => {
		// Without batch fetching, each workspace must populate its cache individually.
		// With batch fetching, a single call populates all entries at once.
		const N = 10;
		const worktreePaths = Array.from({ length: N }, (_, i) => `/ws/n1-${i}`);
		let loadCallCount = 0;

		// Simulate N individual fetches (the current behavior)
		for (const _path of worktreePaths) {
			// Each workspace would call fetchGitHubPRStatus independently
			loadCallCount++;
		}
		expect(loadCallCount).toBe(N);

		// With batch: a single parseBatchResponse call populates all entries
		const inputs = worktreePaths.map((p, i) =>
			makeInput(p, `branch-${i}`, "org/repo"),
		);
		const groups = groupByRepo(inputs);
		const { aliasMap } = buildBatchQuery(groups);

		// Build mock response data
		const mockData: Record<string, Record<string, { nodes: never[] }>> = {};
		for (const [prAlias] of aliasMap) {
			const repoKey = `repo_${prAlias.split("_")[1]}`;
			if (!mockData[repoKey]) {
				mockData[repoKey] = {};
			}
			mockData[repoKey][prAlias] = { nodes: [] };
		}

		const results = parseBatchResponse(mockData, aliasMap);
		// Single batch call returns all N results
		expect(results.size).toBe(N);
	});
});
