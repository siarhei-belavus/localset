import { beforeEach, describe, expect, it, mock } from "bun:test";
import { deleteDocumentBuffer } from "./editorBufferRegistry";
import type { EditorDocumentState } from "./types";
import { useEditorDocumentsStore } from "./useEditorDocumentsStore";

Object.defineProperty(globalThis, "localStorage", {
	value: {
		getItem: () => null,
		setItem: () => undefined,
		removeItem: () => undefined,
	},
	configurable: true,
});

mock.module("renderer/lib/trpc-client", () => ({
	electronReactClient: {},
	electronTrpcClient: {
		uiState: {
			tabs: {
				get: { query: async () => null },
				set: { mutate: async () => undefined },
			},
			theme: {
				get: { query: async () => null },
				set: { mutate: async () => undefined },
			},
			hotkeys: {
				get: { query: async () => ({ hotkeysState: null }) },
				set: { mutate: async () => undefined },
			},
		},
	},
}));

const {
	applyLoadedDocumentContent,
	getEditorDocumentBaselineContent,
	getEditorDocumentContentForSave,
	getEditorDocumentCurrentContent,
	markDocumentSaved,
	registerDocumentRenderedMarkdownBaseline,
	updateDocumentDraft,
} = await import("./editorCoordinator");

const DOCUMENT_KEY = "workspace::working::README.md";

function createDocumentState(
	overrides: Partial<EditorDocumentState> = {},
): EditorDocumentState {
	return {
		documentKey: DOCUMENT_KEY,
		workspaceId: "workspace",
		filePath: "README.md",
		status: "ready",
		dirty: false,
		baselineRevision: null,
		hasExternalDiskChange: false,
		conflict: null,
		contentVersion: 0,
		isEditable: true,
		sessionPaneIds: [],
		...overrides,
	};
}

describe("editorCoordinator markdown representations", () => {
	beforeEach(() => {
		deleteDocumentBuffer(DOCUMENT_KEY);
		useEditorDocumentsStore.setState({
			documents: {
				[DOCUMENT_KEY]: createDocumentState(),
			},
		});
	});

	it("uses the rendered markdown baseline for rendered dirty checks only", () => {
		applyLoadedDocumentContent(DOCUMENT_KEY, "hello", null);
		registerDocumentRenderedMarkdownBaseline(DOCUMENT_KEY, "hello\n");

		expect(getEditorDocumentBaselineContent(DOCUMENT_KEY)).toBe("hello");
		expect(
			updateDocumentDraft(DOCUMENT_KEY, "hello\n", "rendered-markdown"),
		).toBe(false);
		expect(getEditorDocumentCurrentContent(DOCUMENT_KEY)).toBe("hello\n");
		expect(getEditorDocumentContentForSave(DOCUMENT_KEY)).toBe("hello");
		expect(updateDocumentDraft(DOCUMENT_KEY, "hello\n", "raw")).toBe(true);
		expect(getEditorDocumentContentForSave(DOCUMENT_KEY)).toBe("hello\n");
	});

	it("clears the rendered markdown baseline after save/load transitions", () => {
		applyLoadedDocumentContent(DOCUMENT_KEY, "hello", null);
		registerDocumentRenderedMarkdownBaseline(DOCUMENT_KEY, "hello\n");

		markDocumentSaved(DOCUMENT_KEY, {
			savedContent: "updated",
			currentContent: "updated",
			revision: "rev-1",
		});

		expect(
			updateDocumentDraft(DOCUMENT_KEY, "updated\n", "rendered-markdown"),
		).toBe(true);

		applyLoadedDocumentContent(DOCUMENT_KEY, "fresh", null);

		expect(
			updateDocumentDraft(DOCUMENT_KEY, "fresh\n", "rendered-markdown"),
		).toBe(true);
		expect(getEditorDocumentBaselineContent(DOCUMENT_KEY)).toBe("fresh");
	});
});
