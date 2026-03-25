import { eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { useMatchRoute, useParams } from "@tanstack/react-router";
import type { CSSProperties } from "react";
import { HiOutlineWifi } from "react-icons/hi2";
import { useOnlineStatus } from "renderer/hooks/useOnlineStatus";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { getWorkspaceDisplayName } from "renderer/lib/getWorkspaceDisplayName";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { NavigationControls } from "./components/NavigationControls";
import { OpenInMenuButton } from "./components/OpenInMenuButton";
import { OrganizationDropdown } from "./components/OrganizationDropdown";
import { ResourceConsumption } from "./components/ResourceConsumption";
import { SearchBarTrigger } from "./components/SearchBarTrigger";
import { SidebarToggle } from "./components/SidebarToggle";
import { V2WorkspaceOpenInButton } from "./components/V2WorkspaceOpenInButton";
import { V2WorkspaceSearchBarTrigger } from "./components/V2WorkspaceSearchBarTrigger";
import { WindowControls } from "./components/WindowControls";

function normalizeHexColor(color: string | null | undefined): string | null {
	if (!color) return null;

	const hex = color.trim().replace(/^#/, "");
	if (!/^[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(hex)) {
		return null;
	}

	if (hex.length === 3) {
		return `#${hex
			.split("")
			.map((char) => `${char}${char}`)
			.join("")
			.toLowerCase()}`;
	}

	return `#${hex.toLowerCase()}`;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
	const normalized = normalizeHexColor(hex);
	if (!normalized) {
		return { r: 0, g: 0, b: 0 };
	}

	const value = normalized.slice(1);
	return {
		r: Number.parseInt(value.slice(0, 2), 16),
		g: Number.parseInt(value.slice(2, 4), 16),
		b: Number.parseInt(value.slice(4, 6), 16),
	};
}

function getChannelLuminance(channel: number): number {
	const normalized = channel / 255;
	return normalized <= 0.03928
		? normalized / 12.92
		: ((normalized + 0.055) / 1.055) ** 2.4;
}

function getRelativeLuminance(hex: string): number {
	const { r, g, b } = hexToRgb(hex);
	return (
		0.2126 * getChannelLuminance(r) +
		0.7152 * getChannelLuminance(g) +
		0.0722 * getChannelLuminance(b)
	);
}

function getTopBarForegroundColor(hex: string): string {
	return getRelativeLuminance(hex) > 0.45 ? "#111111" : "#ffffff";
}

function adjustHexColor(hex: string, amount: number): string {
	const { r, g, b } = hexToRgb(hex);
	const clamp = (value: number) => Math.max(0, Math.min(255, value));
	return `#${[r, g, b]
		.map((channel) =>
			clamp(channel + amount)
				.toString(16)
				.padStart(2, "0"),
		)
		.join("")}`;
}

function getTopBarBorderColor(hex: string): string {
	return getRelativeLuminance(hex) > 0.45
		? adjustHexColor(hex, -28)
		: adjustHexColor(hex, 28);
}

export function TopBar() {
	const collections = useCollections();
	const matchRoute = useMatchRoute();
	const { data: platform } = electronTrpc.window.getPlatform.useQuery();
	const { workspaceId } = useParams({ strict: false });
	const v2Match = matchRoute({
		to: "/v2-workspace/$workspaceId",
		fuzzy: true,
	});
	const v2WorkspaceId = v2Match !== false ? v2Match.workspaceId : null;
	const isV2WorkspaceRoute = v2WorkspaceId !== null;
	const effectiveWorkspaceId = v2WorkspaceId ?? workspaceId ?? null;
	const { data: workspace } = electronTrpc.workspaces.get.useQuery(
		{ id: effectiveWorkspaceId ?? "" },
		{ enabled: !!effectiveWorkspaceId && !isV2WorkspaceRoute },
	);
	const { data: v2Workspaces } = useLiveQuery(
		(q) =>
			q
				.from({ v2Workspaces: collections.v2Workspaces })
				.where(({ v2Workspaces }) => eq(v2Workspaces.id, v2WorkspaceId ?? "")),
		[collections, v2WorkspaceId],
	);
	const v2Workspace = v2Workspaces?.[0] ?? null;
	const effectiveProjectId = isV2WorkspaceRoute
		? (v2Workspace?.projectId ?? null)
		: (workspace?.projectId ?? workspace?.project?.id ?? null);
	const { data: project } = electronTrpc.projects.get.useQuery(
		{ id: effectiveProjectId ?? "" },
		{ enabled: !!effectiveProjectId },
	);
	const projectColor = normalizeHexColor(project?.color);
	const topBarForegroundColor = projectColor
		? getTopBarForegroundColor(projectColor)
		: "hsl(var(--muted-foreground))";
	const topBarHoverForegroundColor = projectColor
		? topBarForegroundColor
		: "hsl(var(--foreground))";
	const topBarStyle = {
		"--topbar-icon-color": topBarForegroundColor,
		"--topbar-icon-hover-color": topBarHoverForegroundColor,
		...(projectColor
			? {
					backgroundColor: projectColor,
					borderColor: getTopBarBorderColor(projectColor),
					color: topBarForegroundColor,
				}
			: {}),
	} as CSSProperties;
	const isOnline = useOnlineStatus();
	// Default to Mac layout while loading to avoid overlap with traffic lights
	const isMac = platform === undefined || platform === "darwin";

	return (
		<div
			className="drag gap-2 h-12 w-full flex items-center justify-between bg-muted/45 border-b border-border relative dark:bg-muted/35"
			style={topBarStyle}
		>
			<div
				className="flex items-center gap-1.5 h-full"
				style={{
					paddingLeft: isMac ? "88px" : "16px",
				}}
			>
				<SidebarToggle />
				<NavigationControls />
				<ResourceConsumption />
			</div>

			{isV2WorkspaceRoute ? (
				<V2WorkspaceSearchBarTrigger workspaceId={v2WorkspaceId} />
			) : (
				effectiveWorkspaceId && (
					<div className="absolute inset-0 flex items-center justify-center pointer-events-none">
						<div className="pointer-events-auto">
							<SearchBarTrigger
								workspaceName={
									workspace
										? getWorkspaceDisplayName(
												workspace.name,
												workspace.type,
												workspace.project?.name,
											)
										: undefined
								}
							/>
						</div>
					</div>
				)
			)}

			<div className="flex items-center gap-3 h-full pr-4 shrink-0">
				{!isOnline && (
					<div className="no-drag flex items-center gap-1.5 text-xs text-muted-foreground bg-muted px-2 py-1 rounded">
						<HiOutlineWifi className="size-3.5" />
						<span>Offline</span>
					</div>
				)}
				{isV2WorkspaceRoute ? (
					<V2WorkspaceOpenInButton workspaceId={v2WorkspaceId} />
				) : workspace?.worktreePath ? (
					<OpenInMenuButton
						worktreePath={workspace.worktreePath}
						branch={workspace.worktree?.branch}
						projectId={workspace.project?.id}
					/>
				) : null}
				<OrganizationDropdown />
				{!isMac && <WindowControls />}
			</div>
		</div>
	);
}
