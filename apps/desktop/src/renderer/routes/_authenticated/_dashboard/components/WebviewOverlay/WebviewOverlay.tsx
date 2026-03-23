import { useMemo } from "react";
import { useTabsStore } from "renderer/stores/tabs/store";
import { PersistentBrowserSurface } from "./components/PersistentBrowserSurface";

/**
 * Persistent overlay for all browser webviews.
 *
 * Mounted at the dashboard layout level so browser surfaces survive
 * workspace/tab route changes. Each browser pane gets one stable overlay-owned
 * surface that positions a persistent Electron webview over its registered slot.
 */
export function WebviewOverlay() {
	const panes = useTabsStore((state) => state.panes);
	const browserPaneIds = useMemo(
		() =>
			Object.entries(panes)
				.filter(([, pane]) => pane.type === "webview")
				.map(([paneId]) => paneId),
		[panes],
	);

	return (
		<div
			style={{
				position: "fixed",
				inset: 0,
				pointerEvents: "none",
				zIndex: 50,
			}}
		>
			{browserPaneIds.map((paneId) => (
				<PersistentBrowserSurface key={paneId} paneId={paneId} />
			))}
		</div>
	);
}
