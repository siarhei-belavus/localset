import fs from "node:fs";
import path from "node:path";
import {
	buildWrapperScript,
	createWrapper,
	writeFileIfChanged,
} from "./agent-wrappers-common";
import { getNotifyScriptPath } from "./notify-hook";
import { HOOKS_DIR } from "./paths";

export const PI_EXTENSION_FILE = "pi-superset-extension.ts";

const PI_EXTENSION_SIGNATURE = "// Superset pi extension";
const PI_EXTENSION_VERSION = "v1";
export const PI_EXTENSION_MARKER = `${PI_EXTENSION_SIGNATURE} ${PI_EXTENSION_VERSION}`;

const PI_EXTENSION_TEMPLATE_PATH = path.join(
	__dirname,
	"templates",
	"pi-extension.template.ts",
);

export function getPiExtensionPath(): string {
	return path.join(HOOKS_DIR, PI_EXTENSION_FILE);
}

export function getPiExtensionContent(notifyPath: string): string {
	const template = fs.readFileSync(PI_EXTENSION_TEMPLATE_PATH, "utf-8");
	return template
		.replace(
			'import { spawn } from "node:child_process";',
			`${PI_EXTENSION_MARKER}\nimport { spawn } from "node:child_process";`,
		)
		.replace('"__PI_NOTIFY_PATH__"', JSON.stringify(notifyPath));
}

export function createPiExtension(): void {
	const extensionPath = getPiExtensionPath();
	const notifyPath = getNotifyScriptPath();
	const content = getPiExtensionContent(notifyPath);
	const changed = writeFileIfChanged(extensionPath, content, 0o644);
	console.log(`[agent-setup] ${changed ? "Updated" : "Verified"} Pi extension`);
}

export function buildPiWrapperExecLine(): string {
	const extensionPath = getPiExtensionPath();
	return `if [ -n "$SUPERSET_TAB_ID" ] && [ -f "${extensionPath}" ]; then
  exec "$REAL_BIN" -e "${extensionPath}" "$@"
fi

exec "$REAL_BIN" "$@"`;
}

export function createPiWrapper(): void {
	const script = buildWrapperScript("pi", buildPiWrapperExecLine());
	createWrapper("pi", script);
}
