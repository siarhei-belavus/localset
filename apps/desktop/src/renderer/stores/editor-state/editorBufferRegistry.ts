import type { EditorContentRepresentation } from "./types";

interface EditorBufferEntry {
	baselineContent: string;
	renderedMarkdownBaselineContent: string | null;
	currentContent: string;
	initialized: boolean;
}

const documentBuffers = new Map<string, EditorBufferEntry>();

function ensureBuffer(documentKey: string): EditorBufferEntry {
	const existing = documentBuffers.get(documentKey);
	if (existing) {
		return existing;
	}

	const created: EditorBufferEntry = {
		baselineContent: "",
		renderedMarkdownBaselineContent: null,
		currentContent: "",
		initialized: false,
	};
	documentBuffers.set(documentKey, created);
	return created;
}

export function hasDocumentBuffer(documentKey: string): boolean {
	return documentBuffers.has(documentKey);
}

export function getDocumentBaselineContent(documentKey: string): string {
	return documentBuffers.get(documentKey)?.baselineContent ?? "";
}

export function getDocumentCurrentContent(documentKey: string): string {
	return documentBuffers.get(documentKey)?.currentContent ?? "";
}

export function getDocumentComparisonBaselineContent(
	documentKey: string,
	representation: EditorContentRepresentation,
): string {
	const entry = documentBuffers.get(documentKey);
	if (!entry) {
		return "";
	}

	if (representation === "rendered-markdown") {
		return entry.renderedMarkdownBaselineContent ?? entry.baselineContent;
	}

	return entry.baselineContent;
}

export function hasInitializedDocumentBuffer(documentKey: string): boolean {
	return documentBuffers.get(documentKey)?.initialized ?? false;
}

export function setDocumentLoadedContent(
	documentKey: string,
	content: string,
): void {
	const entry = ensureBuffer(documentKey);
	entry.baselineContent = content;
	entry.renderedMarkdownBaselineContent = null;
	entry.currentContent = content;
	entry.initialized = true;
}

export function setDocumentCurrentContent(
	documentKey: string,
	content: string,
): void {
	const entry = ensureBuffer(documentKey);
	if (!entry.initialized) {
		entry.baselineContent = content;
		entry.renderedMarkdownBaselineContent = null;
		entry.initialized = true;
	}
	entry.currentContent = content;
}

export function setDocumentRenderedMarkdownBaselineContent(
	documentKey: string,
	content: string,
): void {
	const entry = ensureBuffer(documentKey);
	if (!entry.initialized) {
		entry.baselineContent = content;
		entry.currentContent = content;
		entry.initialized = true;
	}
	entry.renderedMarkdownBaselineContent = content;
}

export function markDocumentSavedContent(
	documentKey: string,
	savedContent: string,
	currentContent: string,
): void {
	const entry = ensureBuffer(documentKey);
	entry.baselineContent = savedContent;
	entry.renderedMarkdownBaselineContent = null;
	entry.currentContent = currentContent;
	entry.initialized = true;
}

export function discardDocumentCurrentContent(documentKey: string): string {
	const entry = ensureBuffer(documentKey);
	entry.currentContent = entry.baselineContent;
	return entry.currentContent;
}

export function transferDocumentBuffer(
	previousDocumentKey: string,
	nextDocumentKey: string,
): void {
	if (previousDocumentKey === nextDocumentKey) {
		return;
	}

	const previous = documentBuffers.get(previousDocumentKey);
	if (!previous) {
		return;
	}

	documentBuffers.set(nextDocumentKey, { ...previous });
	documentBuffers.delete(previousDocumentKey);
}

export function deleteDocumentBuffer(documentKey: string): void {
	documentBuffers.delete(documentKey);
}
