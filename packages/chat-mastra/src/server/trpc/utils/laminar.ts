import { Laminar, observe } from "@lmnr-ai/lmnr";

let laminarInitialized = false;

function getLaminarApiKey(): string | null {
	const apiKey = process.env.LMNR_PROJECT_API_KEY?.trim();
	return apiKey ? apiKey : null;
}

export function initializeLaminarForChatMastra(): boolean {
	const apiKey = getLaminarApiKey();
	if (!apiKey) return false;
	if (laminarInitialized) return true;

	try {
		Laminar.initialize({
			projectApiKey: apiKey,
			metadata: {
				environment: process.env.NODE_ENV ?? "development",
				service: "superset-chat-mastra",
			},
		});
		laminarInitialized = true;
		return true;
	} catch (error) {
		console.warn(
			"[laminar] Chat-mastra initialization failed; tracing disabled",
			error,
		);
		return false;
	}
}

type ObserveOptions = Parameters<typeof observe>[0];

export function observeChatMastra<T>(
	options: ObserveOptions,
	fn: () => Promise<T>,
): Promise<T> {
	if (!initializeLaminarForChatMastra()) return fn();
	return observe(options, fn);
}
