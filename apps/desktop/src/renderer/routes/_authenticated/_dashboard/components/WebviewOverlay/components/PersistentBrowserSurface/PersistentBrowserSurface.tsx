import { GlobeIcon } from "lucide-react";
import {
	useCallback,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
	useSyncExternalStore,
} from "react";
import { BrowserErrorOverlay } from "renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/TabView/BrowserPane/components/BrowserErrorOverlay";
import { DEFAULT_BROWSER_URL } from "renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/TabView/BrowserPane/constants";
import { useTabsStore } from "renderer/stores/tabs/store";
import {
	attachWebviewToHost,
	getOverlayLayoutVersion,
	getSlotElement,
	subscribeOverlayLayout,
	webviewReload,
} from "renderer/stores/webview-overlay";

interface PersistentBrowserSurfaceProps {
	paneId: string;
}

interface SurfacePlacement {
	left: number;
	top: number;
	width: number;
	height: number;
	isVisible: boolean;
}

const HIDDEN_SURFACE_PLACEMENT: SurfacePlacement = {
	left: 0,
	top: 0,
	width: 0,
	height: 0,
	isVisible: false,
};

function placementsAreEqual(
	left: SurfacePlacement,
	right: SurfacePlacement,
): boolean {
	return (
		left.left === right.left &&
		left.top === right.top &&
		left.width === right.width &&
		left.height === right.height &&
		left.isVisible === right.isVisible
	);
}

function readPlacementFromSlot(paneId: string): SurfacePlacement {
	const slot = getSlotElement(paneId);
	if (!slot || !slot.isConnected) {
		return HIDDEN_SURFACE_PLACEMENT;
	}

	const isVisible = getComputedStyle(slot).visibility !== "hidden";
	if (!isVisible) {
		return HIDDEN_SURFACE_PLACEMENT;
	}

	const rect = slot.getBoundingClientRect();
	if (rect.width <= 0 || rect.height <= 0) {
		return HIDDEN_SURFACE_PLACEMENT;
	}

	return {
		left: rect.left,
		top: rect.top,
		width: rect.width,
		height: rect.height,
		isVisible: true,
	};
}

export function PersistentBrowserSurface({
	paneId,
}: PersistentBrowserSurfaceProps) {
	const pane = useTabsStore((state) => state.panes[paneId]);
	const browserState = pane?.browser;
	const currentUrl = browserState?.currentUrl ?? DEFAULT_BROWSER_URL;
	const isLoading = browserState?.isLoading ?? false;
	const loadError = browserState?.error ?? null;
	const isBlankPage = currentUrl === DEFAULT_BROWSER_URL;
	const hostRef = useRef<HTMLDivElement>(null);
	const overlayLayoutVersion = useSyncExternalStore(
		subscribeOverlayLayout,
		getOverlayLayoutVersion,
		getOverlayLayoutVersion,
	);
	const slotElement = useMemo(() => {
		void overlayLayoutVersion;
		return getSlotElement(paneId);
	}, [paneId, overlayLayoutVersion]);
	const [placement, setPlacement] = useState<SurfacePlacement>(() =>
		readPlacementFromSlot(paneId),
	);

	const syncPlacement = useCallback(() => {
		const nextPlacement = readPlacementFromSlot(paneId);
		setPlacement((previousPlacement) =>
			placementsAreEqual(previousPlacement, nextPlacement)
				? previousPlacement
				: nextPlacement,
		);
	}, [paneId]);

	const handleReload = useCallback(() => {
		webviewReload(paneId);
	}, [paneId]);

	useLayoutEffect(() => {
		if (!pane || pane.type !== "webview") {
			return;
		}

		const hostElement = hostRef.current;
		if (!hostElement) {
			return;
		}

		attachWebviewToHost(paneId, hostElement, currentUrl);
	}, [pane, paneId, currentUrl]);

	useLayoutEffect(() => {
		syncPlacement();

		if (!slotElement) {
			return;
		}

		const resizeObserver = new ResizeObserver(syncPlacement);
		resizeObserver.observe(slotElement);
		window.addEventListener("resize", syncPlacement);

		return () => {
			resizeObserver.disconnect();
			window.removeEventListener("resize", syncPlacement);
		};
	}, [slotElement, syncPlacement]);

	if (!pane || pane.type !== "webview") {
		return null;
	}

	return (
		<div
			style={{
				position: "absolute",
				left: placement.left,
				top: placement.top,
				width: placement.width,
				height: placement.height,
				display: placement.isVisible ? "block" : "none",
				overflow: "hidden",
				pointerEvents: placement.isVisible ? "auto" : "none",
			}}
		>
			<div
				ref={hostRef}
				style={{
					position: "absolute",
					inset: 0,
				}}
			/>
			{loadError && !isLoading ? (
				<div className="absolute inset-0 z-10 pointer-events-auto">
					<BrowserErrorOverlay error={loadError} onRetry={handleReload} />
				</div>
			) : isBlankPage && !isLoading && !loadError ? (
				<div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-background pointer-events-none">
					<GlobeIcon className="size-10 text-muted-foreground/30" />
					<div className="text-center">
						<p className="text-sm font-medium text-muted-foreground/50">
							Browser
						</p>
						<p className="mt-1 text-xs text-muted-foreground/30">
							Enter a URL above, or instruct an agent to navigate
							<br />
							and use the browser
						</p>
					</div>
				</div>
			) : null}
		</div>
	);
}
