/**
 * Module-level manager for persistent webview elements.
 *
 * React owns the overlay surfaces and positioning. This module only owns the
 * stable Electron webview node for each browser pane plus the imperative
 * browser actions that operate on that node.
 */

import { electronTrpcClient } from "renderer/lib/trpc-client";
import { useTabsStore } from "renderer/stores/tabs/store";

interface WebviewEntry {
	webview: Electron.WebviewTag;
	webContentsId: number | null;
	faviconUrl: string | undefined;
}

const webviews = new Map<string, WebviewEntry>();
const slots = new Map<string, HTMLElement>();
const overlayLayoutListeners = new Set<() => void>();
let overlayLayoutVersion = 0;

function emitOverlayLayoutChange(): void {
	overlayLayoutVersion += 1;
	for (const listener of overlayLayoutListeners) {
		listener();
	}
}

export function subscribeOverlayLayout(listener: () => void): () => void {
	overlayLayoutListeners.add(listener);
	return () => overlayLayoutListeners.delete(listener);
}

export function getOverlayLayoutVersion(): number {
	return overlayLayoutVersion;
}

export function notifyOverlayLayoutChanged(): void {
	emitOverlayLayoutChange();
}

function sanitizeUrl(url: string): string {
	if (/^https?:\/\//i.test(url) || url.startsWith("about:")) return url;
	if (url.startsWith("localhost") || url.startsWith("127.0.0.1"))
		return `http://${url}`;
	if (url.includes(".")) return `https://${url}`;
	return `https://www.google.com/search?q=${encodeURIComponent(url)}`;
}

function getOrCreateWebview(paneId: string, initialUrl: string): WebviewEntry {
	const existing = webviews.get(paneId);
	if (existing) return existing;

	const webview = document.createElement("webview") as Electron.WebviewTag;
	webview.setAttribute("partition", "persist:superset");
	webview.setAttribute("allowpopups", "");
	webview.style.display = "flex";
	webview.style.flex = "1";
	webview.style.width = "100%";
	webview.style.height = "100%";
	webview.style.border = "none";
	webview.src = sanitizeUrl(initialUrl);

	const entry: WebviewEntry = {
		webview,
		webContentsId: null,
		faviconUrl: undefined,
	};
	webviews.set(paneId, entry);

	attachEventHandlers(paneId, entry);

	return entry;
}

export function attachWebviewToHost(
	paneId: string,
	hostElement: HTMLElement,
	initialUrl: string,
): void {
	const entry = getOrCreateWebview(paneId, initialUrl);
	if (!hostElement.contains(entry.webview)) {
		hostElement.appendChild(entry.webview);
	}
}

export function destroyWebview(paneId: string): void {
	const entry = webviews.get(paneId);
	if (!entry) return;
	entry.webview.remove();
	webviews.delete(paneId);
	electronTrpcClient.browser.unregister.mutate({ paneId }).catch(() => {});
}

function attachEventHandlers(paneId: string, entry: WebviewEntry): void {
	const { webview } = entry;

	const handleDomReady = () => {
		const id = webview.getWebContentsId();
		if (entry.webContentsId !== id) {
			entry.webContentsId = id;
			electronTrpcClient.browser.register
				.mutate({ paneId, webContentsId: id })
				.catch(() => {});
		}
	};

	const handleDidStartLoading = () => {
		const store = useTabsStore.getState();
		store.updateBrowserLoading(paneId, true);
		store.setBrowserError(paneId, null);
		entry.faviconUrl = undefined;
	};

	const handleDidStopLoading = () => {
		const store = useTabsStore.getState();
		store.updateBrowserLoading(paneId, false);

		const url = webview.getURL();
		const title = webview.getTitle();
		store.updateBrowserUrl(paneId, url ?? "", title ?? "", entry.faviconUrl);

		if (url && url !== "about:blank") {
			electronTrpcClient.browserHistory.upsert
				.mutate({
					url,
					title: title ?? "",
					faviconUrl: entry.faviconUrl ?? null,
				})
				.catch(() => {});
		}
	};

	const handleDidNavigate = (e: Electron.DidNavigateEvent) => {
		const store = useTabsStore.getState();
		store.updateBrowserUrl(
			paneId,
			e.url ?? "",
			webview.getTitle() ?? "",
			entry.faviconUrl,
		);
		store.updateBrowserLoading(paneId, false);
	};

	const handleDidNavigateInPage = (e: Electron.DidNavigateInPageEvent) => {
		const store = useTabsStore.getState();
		store.updateBrowserUrl(
			paneId,
			e.url ?? "",
			webview.getTitle() ?? "",
			entry.faviconUrl,
		);
	};

	const handlePageTitleUpdated = (e: Electron.PageTitleUpdatedEvent) => {
		const store = useTabsStore.getState();
		const currentUrl = store.panes[paneId]?.browser?.currentUrl ?? "";
		store.updateBrowserUrl(paneId, currentUrl, e.title ?? "", entry.faviconUrl);
	};

	const handlePageFaviconUpdated = (e: Electron.PageFaviconUpdatedEvent) => {
		const favicons = e.favicons;
		if (favicons?.length > 0) {
			entry.faviconUrl = favicons[0];
			const store = useTabsStore.getState();
			const browser = store.panes[paneId]?.browser;
			const currentUrl = browser?.currentUrl ?? "";
			const currentTitle =
				browser?.history[browser?.historyIndex ?? 0]?.title ?? "";
			store.updateBrowserUrl(paneId, currentUrl, currentTitle, favicons[0]);
			if (currentUrl && currentUrl !== "about:blank") {
				electronTrpcClient.browserHistory.upsert
					.mutate({
						url: currentUrl,
						title: currentTitle,
						faviconUrl: favicons[0],
					})
					.catch(() => {});
			}
		}
	};

	const handleDidFailLoad = (e: Electron.DidFailLoadEvent) => {
		if (e.errorCode === -3) return; // ERR_ABORTED
		const store = useTabsStore.getState();
		store.updateBrowserLoading(paneId, false);
		store.setBrowserError(paneId, {
			code: e.errorCode ?? 0,
			description: e.errorDescription ?? "",
			url: e.validatedURL ?? "",
		});
	};

	webview.addEventListener("dom-ready", handleDomReady);
	webview.addEventListener("did-start-loading", handleDidStartLoading);
	webview.addEventListener("did-stop-loading", handleDidStopLoading);
	webview.addEventListener("did-navigate", handleDidNavigate as EventListener);
	webview.addEventListener(
		"did-navigate-in-page",
		handleDidNavigateInPage as EventListener,
	);
	webview.addEventListener(
		"page-title-updated",
		handlePageTitleUpdated as EventListener,
	);
	webview.addEventListener(
		"page-favicon-updated",
		handlePageFaviconUpdated as EventListener,
	);
	webview.addEventListener("did-fail-load", handleDidFailLoad as EventListener);
}

export function registerSlot(paneId: string, element: HTMLElement): void {
	slots.set(paneId, element);
	emitOverlayLayoutChange();
}

export function unregisterSlot(paneId: string): void {
	slots.delete(paneId);
	emitOverlayLayoutChange();
}

export function getSlotElement(paneId: string): HTMLElement | null {
	return slots.get(paneId) ?? null;
}

export function webviewNavigateTo(paneId: string, url: string): void {
	const entry = webviews.get(paneId);
	if (entry) entry.webview.loadURL(sanitizeUrl(url));
}

export function webviewReload(paneId: string): void {
	const entry = webviews.get(paneId);
	if (entry) entry.webview.reload();
}

export function webviewGoBack(paneId: string): void {
	const store = useTabsStore.getState();
	const url = store.navigateBrowserHistory(paneId, "back");
	if (url) {
		const entry = webviews.get(paneId);
		if (entry) entry.webview.loadURL(sanitizeUrl(url));
	}
}

export function webviewGoForward(paneId: string): void {
	const store = useTabsStore.getState();
	const url = store.navigateBrowserHistory(paneId, "forward");
	if (url) {
		const entry = webviews.get(paneId);
		if (entry) entry.webview.loadURL(sanitizeUrl(url));
	}
}
