import * as anthropic from "@anthropic-ai/sdk";
import { Laminar } from "@lmnr-ai/lmnr";

let laminarInitialized = false;
let anthropicPatched = false;

function getLaminarApiKey(): string | null {
	const apiKey = process.env.LMNR_PROJECT_API_KEY?.trim();
	return apiKey ? apiKey : null;
}

export function initializeLaminarForApi(): boolean {
	const apiKey = getLaminarApiKey();
	if (!apiKey) return false;
	if (laminarInitialized) return true;

	try {
		Laminar.initialize({
			projectApiKey: apiKey,
			metadata: {
				environment: process.env.NODE_ENV ?? "development",
				service: "superset-api",
			},
		});
		laminarInitialized = true;
		return true;
	} catch (error) {
		console.warn(
			"[laminar] API initialization failed; tracing disabled",
			error,
		);
		return false;
	}
}

export function patchLaminarAnthropic(): boolean {
	if (!initializeLaminarForApi()) return false;
	if (anthropicPatched) return true;

	try {
		Laminar.patch({ anthropic });
		anthropicPatched = true;
		return true;
	} catch (error) {
		console.warn("[laminar] Anthropic patch failed; tracing disabled", error);
		return false;
	}
}
