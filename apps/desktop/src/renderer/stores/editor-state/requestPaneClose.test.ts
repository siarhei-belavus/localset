import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { Pane } from "shared/tabs-types";

// Mock trpc-client to avoid electronTRPC dependency
mock.module("renderer/lib/trpc-client", () => ({
	electronTrpcClient: {
		terminal: { kill: { mutate: mock(() => Promise.resolve()) } },
		filesystem: {
			writeFile: { mutate: mock(() => Promise.resolve()) },
			readFile: { query: mock(() => Promise.resolve(null)) },
		},
		external: {
			openUrl: { mutate: mock(() => Promise.resolve()) },
		},
		uiState: {
			hotkeys: {
				get: { query: mock(() => Promise.resolve(null)) },
				set: { mutate: mock(() => Promise.resolve()) },
			},
			theme: {
				get: { query: mock(() => Promise.resolve(null)) },
				set: { mutate: mock(() => Promise.resolve()) },
			},
			tabs: {
				get: { query: mock(() => Promise.resolve(null)) },
				set: { mutate: mock(() => Promise.resolve()) },
			},
		},
	},
	electronReactClient: {},
}));

mock.module("renderer/lib/trpc-storage", () => ({
	trpcTabsStorage: {
		getItem: mock(() => null),
		setItem: mock(() => {}),
		removeItem: mock(() => {}),
	},
}));

mock.module("renderer/lib/posthog", () => ({
	posthog: { capture: mock(() => {}) },
}));

mock.module("renderer/lib/invalidate-file-save-queries", () => ({
	invalidateFileSaveQueries: mock(() => {}),
}));

// Import after mocks
const { useTabsStore } = await import("renderer/stores/tabs/store");
const { useEditorDocumentsStore } = await import("./useEditorDocumentsStore");
const { useEditorSessionsStore } = await import("./useEditorSessionsStore");
const {
	requestPaneClose,
	confirmPaneClose,
	cancelPendingPaneClose,
	applyLoadedDocumentContent,
	updateDocumentDraft,
} = await import("./editorCoordinator");

/**
 * Reproduction test for GitHub issue #2877:
 * Cmd+W immediately closes terminal/chat/browser panes without any
 * confirmation dialog or recovery mechanism.
 *
 * When switching between apps, users accidentally press Cmd+W while Superset
 * is focused, which instantly destroys their terminal session with no way
 * to recover the work.
 *
 * Root cause: `requestPaneClose()` was immediately removing non-file-viewer
 * panes via `useTabsStore.getState().removePane(paneId)`, while file-viewer
 * panes with unsaved changes got a confirmation dialog through the
 * pending-intent mechanism.
 *
 * Fix: Non-file-viewer panes now set `pendingPaneClose` state which triggers
 * a confirmation dialog in the UI, giving users a chance to cancel accidental
 * Cmd+W presses.
 */

const WORKSPACE_ID = "test-workspace";
const TAB_ID = "test-tab";

function createTestPane(
	id: string,
	type: Pane["type"],
	overrides?: Partial<Pane>,
): Pane {
	return {
		id,
		tabId: TAB_ID,
		type,
		name: `Test ${type}`,
		status: "idle",
		autoTitle: null,
		cwd: "/home/user",
		cwdConfirmed: true,
		initialCwd: "/home/user",
		initialCommand: null,
		isPreview: false,
		isPinned: false,
		fileViewer: null,
		browser: null,
		devtools: null,
		chat: null,
		workspaceRun: null,
		...overrides,
	};
}

function setupTabWithPanes(panes: Pane[]) {
	const panesMap: Record<string, Pane> = {};
	for (const pane of panes) {
		panesMap[pane.id] = pane;
	}

	let layout: string | { direction: string; first: unknown; second: unknown } =
		panes[0].id;
	for (let i = 1; i < panes.length; i++) {
		layout = {
			direction: "row",
			first: layout,
			second: panes[i].id,
		};
	}

	useTabsStore.setState({
		tabs: [
			{
				id: TAB_ID,
				workspaceId: WORKSPACE_ID,
				name: "Test Tab",
				autoTitle: null,
				layout: layout as never,
			},
		],
		panes: panesMap,
		activeTabIds: { [WORKSPACE_ID]: TAB_ID },
		focusedPaneIds: { [TAB_ID]: panes[0].id },
		tabHistoryStacks: {},
		closedTabsStack: [],
	});
}

function setupFileViewerWithDirtyDoc(paneId: string) {
	const docKey = `${WORKSPACE_ID}::working::test.ts`;

	useEditorDocumentsStore.getState().upsertDocument({
		documentKey: docKey,
		workspaceId: WORKSPACE_ID,
		filePath: "test.ts",
		status: "ready",
		dirty: false,
		baselineRevision: "rev-1",
		hasExternalDiskChange: false,
		conflict: null,
		isEditable: true,
	});

	applyLoadedDocumentContent(docKey, "original content", "rev-1");
	useEditorSessionsStore.getState().bindSession(paneId, docKey);
	updateDocumentDraft(docKey, "modified content");
}

beforeEach(() => {
	useTabsStore.setState({
		tabs: [],
		panes: {},
		activeTabIds: {},
		focusedPaneIds: {},
		tabHistoryStacks: {},
		closedTabsStack: [],
	});
	useEditorSessionsStore.setState({
		sessions: {},
		pendingTabClose: null,
		pendingPaneClose: null,
	});
	useEditorDocumentsStore.setState({ documents: {} });
});

describe("issue #2877: Cmd+W closes panes without confirmation or recovery", () => {
	test("terminal pane is NOT immediately removed — confirmation is required", () => {
		const terminalPane = createTestPane("terminal-1", "terminal");
		const otherPane = createTestPane("other-1", "terminal");
		setupTabWithPanes([terminalPane, otherPane]);

		expect(useTabsStore.getState().panes["terminal-1"]).toBeDefined();

		// Simulate Cmd+W
		const result = requestPaneClose("terminal-1");

		// FIX: Returns false — pane is not immediately closed
		expect(result).toBe(false);

		// FIX: Pane still exists, pending confirmation
		expect(useTabsStore.getState().panes["terminal-1"]).toBeDefined();

		// FIX: pendingPaneClose state is set for the UI to show dialog
		const pending = useEditorSessionsStore.getState().pendingPaneClose;
		expect(pending).not.toBeNull();
		expect(pending?.paneId).toBe("terminal-1");
		expect(pending?.paneType).toBe("terminal");
	});

	test("chat pane is NOT immediately removed — confirmation is required", () => {
		const chatPane = createTestPane("chat-1", "chat");
		const otherPane = createTestPane("other-1", "terminal");
		setupTabWithPanes([chatPane, otherPane]);

		const result = requestPaneClose("chat-1");

		expect(result).toBe(false);
		expect(useTabsStore.getState().panes["chat-1"]).toBeDefined();
		expect(useEditorSessionsStore.getState().pendingPaneClose?.paneId).toBe(
			"chat-1",
		);
	});

	test("browser pane is NOT immediately removed — confirmation is required", () => {
		const browserPane = createTestPane("browser-1", "webview");
		const otherPane = createTestPane("other-1", "terminal");
		setupTabWithPanes([browserPane, otherPane]);

		const result = requestPaneClose("browser-1");

		expect(result).toBe(false);
		expect(useTabsStore.getState().panes["browser-1"]).toBeDefined();
		expect(useEditorSessionsStore.getState().pendingPaneClose?.paneId).toBe(
			"browser-1",
		);
	});

	test("confirmPaneClose removes the pane after user confirms", () => {
		const terminalPane = createTestPane("terminal-1", "terminal");
		const otherPane = createTestPane("other-1", "terminal");
		setupTabWithPanes([terminalPane, otherPane]);

		requestPaneClose("terminal-1");
		expect(useTabsStore.getState().panes["terminal-1"]).toBeDefined();

		// User confirms close
		confirmPaneClose();

		// Pane is now removed
		expect(useTabsStore.getState().panes["terminal-1"]).toBeUndefined();
		// Pending state is cleared
		expect(useEditorSessionsStore.getState().pendingPaneClose).toBeNull();
	});

	test("cancelPendingPaneClose preserves the pane when user cancels", () => {
		const terminalPane = createTestPane("terminal-1", "terminal");
		const otherPane = createTestPane("other-1", "terminal");
		setupTabWithPanes([terminalPane, otherPane]);

		requestPaneClose("terminal-1");
		expect(useTabsStore.getState().panes["terminal-1"]).toBeDefined();

		// User cancels
		cancelPendingPaneClose();

		// Pane is preserved
		expect(useTabsStore.getState().panes["terminal-1"]).toBeDefined();
		// Pending state is cleared
		expect(useEditorSessionsStore.getState().pendingPaneClose).toBeNull();
	});

	test("file-viewer with unsaved changes still shows unsaved-changes dialog", () => {
		const filePane = createTestPane("file-1", "file-viewer", {
			fileViewer: {
				filePath: "test.ts",
				displayName: "test.ts",
				viewMode: "raw",
				isEditable: true,
				diffCategory: null,
				commitHash: null,
				oldPath: null,
			},
		});
		const otherPane = createTestPane("other-1", "terminal");
		setupTabWithPanes([filePane, otherPane]);
		setupFileViewerWithDirtyDoc("file-1");

		const result = requestPaneClose("file-1");

		expect(result).toBe(false);
		expect(useTabsStore.getState().panes["file-1"]).toBeDefined();

		const session = useEditorSessionsStore.getState().sessions["file-1"];
		expect(session?.pendingIntent).toEqual({ type: "close-pane" });
		expect(session?.dialog).toBe("unsaved");
	});

	test("all non-file-viewer pane types require confirmation", () => {
		const paneTypes = ["terminal", "chat", "webview", "devtools"] as const;

		for (const paneType of paneTypes) {
			useTabsStore.setState({
				tabs: [],
				panes: {},
				activeTabIds: {},
				focusedPaneIds: {},
				tabHistoryStacks: {},
				closedTabsStack: [],
			});
			useEditorSessionsStore.setState({ pendingPaneClose: null });

			const pane = createTestPane(`pane-${paneType}`, paneType);
			const other = createTestPane("other", "terminal");
			setupTabWithPanes([pane, other]);

			const result = requestPaneClose(`pane-${paneType}`);

			// FIX: All non-file-viewer panes now require confirmation
			expect(result).toBe(false);
			expect(useTabsStore.getState().panes[`pane-${paneType}`]).toBeDefined();
			expect(useEditorSessionsStore.getState().pendingPaneClose?.paneId).toBe(
				`pane-${paneType}`,
			);
		}
	});
});
