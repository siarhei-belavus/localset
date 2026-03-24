"use client";

import { toast } from "@superset/ui/sonner";
import { useSearchParams } from "next/navigation";
import { useEffect } from "react";

const ERROR_MESSAGES: Record<string, string> = {
	oauth_denied: "Authorization was denied. Please try again.",
	missing_params: "Invalid OAuth response. Please try again.",
	invalid_state: "Invalid state parameter. Please try again.",
	token_exchange_failed: "Failed to connect to Linear. Please try again.",
	unauthorized: "You no longer have access to this organization.",
};

const WARNING_MESSAGES: Record<string, string> = {
	sync_queued_failed:
		"Linear connected, but initial sync failed to start. Please try reconnecting.",
	webhook_setup_failed:
		"Linear connected, but real-time sync could not be enabled. Reconnect using a Linear workspace admin account.",
};

export function ErrorHandler() {
	const searchParams = useSearchParams();

	useEffect(() => {
		const error = searchParams.get("error");
		const warning = searchParams.get("warning");
		if (error) {
			toast.error(ERROR_MESSAGES[error] ?? "Something went wrong.");
			window.history.replaceState({}, "", "/integrations/linear");
		} else if (warning) {
			toast.warning(WARNING_MESSAGES[warning] ?? "Warning occurred.");
			window.history.replaceState({}, "", "/integrations/linear");
		}
	}, [searchParams]);

	return null;
}
