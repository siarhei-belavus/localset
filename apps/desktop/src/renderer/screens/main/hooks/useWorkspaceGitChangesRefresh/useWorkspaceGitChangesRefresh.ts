import { useEffect, useRef } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useWorkspaceFileEvents } from "renderer/screens/main/components/WorkspaceView/hooks/useWorkspaceFileEvents";

const DEFAULT_DEBOUNCE_MS = 75;

interface UseWorkspaceGitChangesRefreshOptions {
	workspaceId?: string;
	worktreePath?: string;
	defaultBranch?: string;
	enabled?: boolean;
	debounceMs?: number;
}

export function useWorkspaceGitChangesRefresh({
	workspaceId,
	worktreePath,
	defaultBranch,
	enabled = true,
	debounceMs = DEFAULT_DEBOUNCE_MS,
}: UseWorkspaceGitChangesRefreshOptions): void {
	const trpcUtils = electronTrpc.useUtils();
	const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	useEffect(() => {
		return () => {
			if (refreshTimerRef.current) {
				clearTimeout(refreshTimerRef.current);
				refreshTimerRef.current = null;
			}
		};
	}, []);

	useWorkspaceFileEvents(
		workspaceId ?? "",
		() => {
			if (!worktreePath || !defaultBranch) {
				return;
			}

			if (refreshTimerRef.current) {
				clearTimeout(refreshTimerRef.current);
			}

			refreshTimerRef.current = setTimeout(() => {
				refreshTimerRef.current = null;
				Promise.all([
					trpcUtils.changes.getStatus.invalidate({
						worktreePath,
						defaultBranch,
					}),
					trpcUtils.changes.getBranches.invalidate({ worktreePath }),
				]).catch((error) => {
					console.error(
						"[useWorkspaceGitChangesRefresh] Failed to refresh git changes:",
						{
							workspaceId,
							worktreePath,
							error,
						},
					);
				});
			}, debounceMs);
		},
		enabled && Boolean(workspaceId && worktreePath && defaultBranch),
	);
}
