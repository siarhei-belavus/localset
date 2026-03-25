type PostHogCaptureProperties = Record<string, unknown>;

export const posthog = {
	capture(_event: string, _properties?: PostHogCaptureProperties) {},
	identify(_id: string, _properties?: PostHogCaptureProperties) {},
	reset() {},
	reloadFeatureFlags() {},
	opt_in_capturing() {},
	opt_out_capturing() {},
};

export function initPostHog() {
	console.log("[posthog] Disabled");
}
