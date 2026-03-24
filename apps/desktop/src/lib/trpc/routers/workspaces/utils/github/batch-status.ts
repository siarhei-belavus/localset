import type { GitHubStatus } from "@superset/local-db";
import { execWithShellEnv } from "../shell-env";
import { setCachedGitHubStatus } from "./cache";
import { extractNwoFromUrl } from "./repo-context";
import type { RepoContext } from "./types";

/**
 * Input for a single workspace whose PR status should be fetched in batch.
 */
export interface BatchWorkspaceInput {
	/** Filesystem path to the worktree (used as cache key). */
	worktreePath: string;
	/** The local branch name. */
	branchName: string;
	/** Repository context (repoUrl, upstreamUrl, isFork). */
	repoContext: RepoContext;
}

/**
 * A single PR node returned by the batch GraphQL query.
 */
interface BatchPRNode {
	number: number;
	title: string;
	url: string;
	state: "OPEN" | "CLOSED" | "MERGED";
	isDraft: boolean;
	mergedAt: string | null;
	additions: number;
	deletions: number;
	headRefName: string;
	headRefOid: string;
	reviewDecision:
		| "APPROVED"
		| "CHANGES_REQUESTED"
		| "REVIEW_REQUIRED"
		| ""
		| null;
	statusCheckRollup: {
		contexts: {
			nodes: Array<{
				__typename: string;
				name?: string;
				context?: string;
				conclusion?: string;
				state?: string;
				detailsUrl?: string;
				targetUrl?: string;
			}>;
		};
	} | null;
	reviewRequests: {
		nodes: Array<{
			requestedReviewer: {
				login?: string;
				name?: string;
				slug?: string;
			} | null;
		}>;
	};
}

/**
 * Groups workspace inputs by their target repository (owner/name)
 * so we can batch PRs under the same `repository(...)` alias.
 */
export function groupByRepo(
	inputs: BatchWorkspaceInput[],
): Map<string, BatchWorkspaceInput[]> {
	const groups = new Map<string, BatchWorkspaceInput[]>();
	for (const input of inputs) {
		const targetUrl = input.repoContext.isFork
			? input.repoContext.upstreamUrl
			: input.repoContext.repoUrl;
		const nwo = extractNwoFromUrl(targetUrl);
		if (!nwo) continue;
		const existing = groups.get(nwo);
		if (existing) {
			existing.push(input);
		} else {
			groups.set(nwo, [input]);
		}
	}
	return groups;
}

/**
 * Sanitizes a string into a valid GraphQL alias identifier.
 * GraphQL aliases must match [_A-Za-z][_0-9A-Za-z]*.
 */
export function toGraphQLAlias(value: string): string {
	return `a_${value.replace(/[^A-Za-z0-9_]/g, "_")}`;
}

const PR_FRAGMENT = `
fragment PRFields on PullRequest {
  number
  title
  url
  state
  isDraft
  mergedAt
  additions
  deletions
  headRefName
  headRefOid
  reviewDecision
  statusCheckRollup: commits(last: 1) {
    nodes {
      commit {
        statusCheckRollup {
          contexts(first: 50) {
            nodes {
              __typename
              ... on CheckRun {
                name
                conclusion
                detailsUrl
              }
              ... on StatusContext {
                context
                state
                targetUrl
              }
            }
          }
        }
      }
    }
  }
  reviewRequests(first: 20) {
    nodes {
      requestedReviewer {
        ... on User { login }
        ... on Team { name slug }
      }
    }
  }
}
`;

/**
 * Builds a GraphQL query that fetches the most recent PR for each branch
 * across all repositories in a single request.
 *
 * Example output:
 * ```graphql
 * query BatchPRStatus {
 *   repo_0: repository(owner: "org", name: "repo") {
 *     pr_0: pullRequests(first: 1, headRefName: "feat/foo", orderBy: {field: CREATED_AT, direction: DESC}) {
 *       nodes { ...PRFields }
 *     }
 *   }
 * }
 * ```
 */
export function buildBatchQuery(groups: Map<string, BatchWorkspaceInput[]>): {
	query: string;
	aliasMap: Map<string, BatchWorkspaceInput>;
} {
	const aliasMap = new Map<string, BatchWorkspaceInput>();
	const repoBlocks: string[] = [];
	let repoIndex = 0;

	for (const [nwo, workspaces] of groups) {
		const [owner, name] = nwo.split("/");
		if (!owner || !name) continue;

		const prAliases: string[] = [];
		for (const [i, ws] of workspaces.entries()) {
			const prAlias = `pr_${repoIndex}_${i}`;
			aliasMap.set(prAlias, ws);
			const escapedBranch = ws.branchName
				.replace(/\\/g, "\\\\")
				.replace(/"/g, '\\"');
			prAliases.push(
				`    ${prAlias}: pullRequests(first: 1, headRefName: "${escapedBranch}", orderBy: {field: CREATED_AT, direction: DESC}) {\n      nodes { ...PRFields }\n    }`,
			);
		}

		const repoAlias = `repo_${repoIndex}`;
		const escapedOwner = owner.replace(/"/g, '\\"');
		const escapedName = name.replace(/"/g, '\\"');
		repoBlocks.push(
			`  ${repoAlias}: repository(owner: "${escapedOwner}", name: "${escapedName}") {\n${prAliases.join("\n")}\n  }`,
		);
		repoIndex++;
	}

	const query = `${PR_FRAGMENT}\nquery BatchPRStatus {\n${repoBlocks.join("\n")}\n}`;
	return { query, aliasMap };
}

/**
 * Parses the raw GraphQL response and extracts PR data keyed by alias.
 */
export function parseBatchResponse(
	data: Record<string, Record<string, { nodes: BatchPRNode[] }>>,
	aliasMap: Map<string, BatchWorkspaceInput>,
): Map<string, GitHubStatus> {
	const results = new Map<string, GitHubStatus>();

	for (const [prAlias, workspace] of aliasMap) {
		// Find the repo block containing this PR alias
		let prNode: BatchPRNode | null = null;
		for (const repoData of Object.values(data)) {
			const prConnection = repoData[prAlias];
			if (prConnection?.nodes?.[0]) {
				prNode = prConnection.nodes[0];
				break;
			}
		}

		const status: GitHubStatus = {
			pr: prNode ? formatBatchPRNode(prNode) : null,
			repoUrl: workspace.repoContext.repoUrl,
			upstreamUrl: workspace.repoContext.upstreamUrl,
			isFork: workspace.repoContext.isFork,
			branchExistsOnRemote: prNode !== null,
			lastRefreshed: Date.now(),
		};

		results.set(workspace.worktreePath, status);
	}

	return results;
}

function formatBatchPRNode(node: BatchPRNode): NonNullable<GitHubStatus["pr"]> {
	const checks = extractChecks(node);
	return {
		number: node.number,
		title: node.title,
		url: node.url,
		state: mapPRState(node.state, node.isDraft),
		mergedAt: node.mergedAt ? new Date(node.mergedAt).getTime() : undefined,
		additions: node.additions,
		deletions: node.deletions,
		headRefName: node.headRefName,
		reviewDecision: mapReviewDecision(node.reviewDecision),
		checksStatus: computeChecksStatus(checks),
		checks,
		requestedReviewers: extractReviewers(node),
	};
}

function mapPRState(
	state: "OPEN" | "CLOSED" | "MERGED",
	isDraft: boolean,
): NonNullable<GitHubStatus["pr"]>["state"] {
	if (state === "MERGED") return "merged";
	if (state === "CLOSED") return "closed";
	if (isDraft) return "draft";
	return "open";
}

function mapReviewDecision(
	decision: string | null | undefined,
): NonNullable<GitHubStatus["pr"]>["reviewDecision"] {
	if (decision === "APPROVED") return "approved";
	if (decision === "CHANGES_REQUESTED") return "changes_requested";
	return "pending";
}

function extractChecks(
	node: BatchPRNode,
): NonNullable<GitHubStatus["pr"]>["checks"] {
	const rollup = node.statusCheckRollup;
	if (!rollup?.contexts?.nodes) return [];

	return rollup.contexts.nodes.map((ctx) => {
		const name = ctx.name || ctx.context || "Unknown check";
		const url = ctx.detailsUrl || ctx.targetUrl;
		const rawStatus = ctx.state || ctx.conclusion;

		let status: "success" | "failure" | "pending" | "skipped" | "cancelled";
		if (rawStatus === "SUCCESS") {
			status = "success";
		} else if (
			rawStatus === "FAILURE" ||
			rawStatus === "ERROR" ||
			rawStatus === "TIMED_OUT"
		) {
			status = "failure";
		} else if (rawStatus === "SKIPPED" || rawStatus === "NEUTRAL") {
			status = "skipped";
		} else if (rawStatus === "CANCELLED") {
			status = "cancelled";
		} else {
			status = "pending";
		}

		return { name, status, url };
	});
}

function computeChecksStatus(
	checks: NonNullable<GitHubStatus["pr"]>["checks"],
): NonNullable<GitHubStatus["pr"]>["checksStatus"] {
	if (checks.length === 0) return "none";
	let hasFailure = false;
	let hasPending = false;
	for (const check of checks) {
		if (check.status === "failure") hasFailure = true;
		if (check.status === "pending") hasPending = true;
	}
	if (hasFailure) return "failure";
	if (hasPending) return "pending";
	return "success";
}

function extractReviewers(node: BatchPRNode): string[] {
	if (!node.reviewRequests?.nodes) return [];
	return node.reviewRequests.nodes
		.map(
			(r) =>
				r.requestedReviewer?.login ||
				r.requestedReviewer?.slug ||
				r.requestedReviewer?.name ||
				"",
		)
		.filter(Boolean);
}

/**
 * Fetches GitHub PR status for multiple workspaces in a single GraphQL request.
 * Results are written into the in-memory cache so subsequent `getCachedGitHubStatus`
 * calls return data immediately without CLI invocations.
 *
 * @param inputs - Workspaces to fetch PR status for.
 * @param cwd - A directory where `gh` can be invoked (any repo checkout).
 * @returns Map of worktreePath -> GitHubStatus
 */
export async function batchFetchGitHubPRStatuses(
	inputs: BatchWorkspaceInput[],
	cwd: string,
): Promise<Map<string, GitHubStatus>> {
	if (inputs.length === 0) {
		return new Map();
	}

	const groups = groupByRepo(inputs);
	if (groups.size === 0) {
		return new Map();
	}

	const { query, aliasMap } = buildBatchQuery(groups);

	try {
		const { stdout } = await execWithShellEnv(
			"gh",
			["api", "graphql", "-f", `query=${query}`],
			{ cwd },
		);

		const raw = JSON.parse(stdout.trim()) as {
			data?: Record<string, Record<string, { nodes: BatchPRNode[] }>>;
		};
		if (!raw.data) {
			return new Map();
		}

		const results = parseBatchResponse(raw.data, aliasMap);

		// Populate the in-memory cache so hover cards see data instantly
		for (const [worktreePath, status] of results) {
			setCachedGitHubStatus(worktreePath, status);
		}

		return results;
	} catch (error) {
		console.warn("[GitHub] Batch PR status fetch failed:", error);
		return new Map();
	}
}
