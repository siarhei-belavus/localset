import { spawn } from "node:child_process";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

const notifyPath = "__PI_NOTIFY_PATH__";

function dispatchLifecycleEvent(eventType: "Start" | "Stop") {
	if (!process.env.SUPERSET_TAB_ID && !process.env.SUPERSET_PANE_ID) {
		return;
	}

	const child = spawn(notifyPath, [JSON.stringify({ eventType })], {
		detached: true,
		stdio: "ignore",
	});
	child.unref();
}

export default function supersetPiExtension(pi: ExtensionAPI) {
	pi.on("agent_start", async () => {
		dispatchLifecycleEvent("Start");
	});

	pi.on("agent_end", async () => {
		dispatchLifecycleEvent("Stop");
	});
}
