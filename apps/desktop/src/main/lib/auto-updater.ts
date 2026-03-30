import { EventEmitter } from "node:events";
import { app, dialog, shell } from "electron";
import { autoUpdater } from "electron-updater";
import { env } from "main/env.main";
import { setSkipQuitConfirmation } from "main/index";
import { prerelease } from "semver";
import {
	AUTO_UPDATE_STATUS,
	LATEST_RELEASE_URL,
	type AutoUpdateStatus,
} from "shared/auto-update";
import { PLATFORM } from "shared/constants";
import { DESKTOP_DISTRIBUTION } from "shared/desktop-distribution";

const UPDATE_CHECK_INTERVAL_MS = 1000 * 60 * 60 * 4; // 4 hours

/**
 * Detect if this is a prerelease build from app version using semver.
 * Versions like "0.0.53-canary" have prerelease component ["canary"].
 * Stable versions like "0.0.53" have no prerelease component.
 */
function isPrereleaseBuild(): boolean {
	const version = app.getVersion();
	const prereleaseComponents = prerelease(version);
	return prereleaseComponents !== null && prereleaseComponents.length > 0;
}

const IS_PRERELEASE = isPrereleaseBuild();
const IS_MAC_AUTO_UPDATE_ENABLED =
	env.DESKTOP_MAC_UPDATER_ENABLED === "1" ||
	env.DESKTOP_MAC_UPDATER_ENABLED === "true";
const IS_UPDATE_CHECK_PLATFORM = PLATFORM.IS_MAC || PLATFORM.IS_LINUX;
const IS_IN_APP_INSTALL_ENABLED =
	PLATFORM.IS_LINUX || (PLATFORM.IS_MAC && IS_MAC_AUTO_UPDATE_ENABLED);
const IS_MANUAL_UPDATE_ONLY = PLATFORM.IS_MAC && !IS_MAC_AUTO_UPDATE_ENABLED;

const STABLE_UPDATE_FEED_URL = env.DESKTOP_UPDATER_BASE_URL ?? null;
const PRERELEASE_UPDATE_FEED_URL =
	env.DESKTOP_CANARY_UPDATER_BASE_URL ?? STABLE_UPDATE_FEED_URL;
const UPDATE_FEED_URL = IS_PRERELEASE
	? PRERELEASE_UPDATE_FEED_URL
	: STABLE_UPDATE_FEED_URL;

export interface AutoUpdateStatusEvent {
	status: AutoUpdateStatus;
	version?: string;
	error?: string;
	installMethod?: "auto" | "manual";
}

export const autoUpdateEmitter = new EventEmitter();

// Network errors that don't need to be shown to the user
// These are transient/expected and will resolve on retry
const SILENT_ERROR_PATTERNS = [
	"net::ERR_INTERNET_DISCONNECTED",
	"net::ERR_NETWORK_CHANGED",
	"net::ERR_CONNECTION_REFUSED",
	"net::ERR_NAME_NOT_RESOLVED",
	"net::ERR_CONNECTION_TIMED_OUT",
	"net::ERR_CONNECTION_RESET",
	"ENOTFOUND",
	"ETIMEDOUT",
	"ECONNREFUSED",
	"ECONNRESET",
];

function isNetworkError(error: Error | string): boolean {
	const message = typeof error === "string" ? error : error.message;
	return SILENT_ERROR_PATTERNS.some((pattern) => message.includes(pattern));
}

let currentStatus: AutoUpdateStatus = AUTO_UPDATE_STATUS.IDLE;
let currentVersion: string | undefined;
let currentInstallMethod: "auto" | "manual" | undefined;
let isDismissed = false;

function emitStatus(
	status: AutoUpdateStatus,
	version?: string,
	error?: string,
	installMethod?: "auto" | "manual",
): void {
	currentStatus = status;
	currentVersion = version;
	currentInstallMethod = installMethod;

	if (
		isDismissed &&
		(status === AUTO_UPDATE_STATUS.READY ||
			status === AUTO_UPDATE_STATUS.AVAILABLE)
	) {
		return;
	}

	autoUpdateEmitter.emit("status-changed", {
		status,
		version,
		error,
		installMethod,
	});
}

export function getUpdateStatus(): AutoUpdateStatusEvent {
	if (
		isDismissed &&
		(currentStatus === AUTO_UPDATE_STATUS.READY ||
			currentStatus === AUTO_UPDATE_STATUS.AVAILABLE)
	) {
		return { status: AUTO_UPDATE_STATUS.IDLE };
	}
	return {
		status: currentStatus,
		version: currentVersion,
		installMethod: currentInstallMethod,
	};
}

export function installUpdate(): void {
	if (IS_MANUAL_UPDATE_ONLY) {
		void shell.openExternal(LATEST_RELEASE_URL);
		return;
	}
	if (env.NODE_ENV === "development") {
		console.info("[auto-updater] Install skipped in dev mode");
		emitStatus(AUTO_UPDATE_STATUS.IDLE);
		return;
	}
	// Skip confirmation dialog - quitAndInstall internally calls app.quit()
	setSkipQuitConfirmation();
	autoUpdater.quitAndInstall(false, true);
}

export function dismissUpdate(): void {
	isDismissed = true;
	autoUpdateEmitter.emit("status-changed", { status: AUTO_UPDATE_STATUS.IDLE });
}

export function checkForUpdates(): void {
	if (env.NODE_ENV === "development" || !IS_UPDATE_CHECK_PLATFORM) {
		return;
	}
	isDismissed = false;
	emitStatus(AUTO_UPDATE_STATUS.CHECKING);
	autoUpdater.checkForUpdates().catch((error) => {
		if (isNetworkError(error)) {
			console.info("[auto-updater] Network unavailable, will retry later");
			emitStatus(AUTO_UPDATE_STATUS.IDLE);
			return;
		}
		console.error("[auto-updater] Failed to check for updates:", error);
		emitStatus(AUTO_UPDATE_STATUS.ERROR, undefined, error.message);
	});
}

export function checkForUpdatesInteractive(): void {
	if (env.NODE_ENV === "development") {
		dialog.showMessageBox({
			type: "info",
			title: "Updates",
			message: "Auto-updates are disabled in development mode.",
		});
		return;
	}
	if (!IS_UPDATE_CHECK_PLATFORM) {
		dialog.showMessageBox({
			type: "info",
			title: "Updates",
			message: "Auto-updates are only available on macOS and Linux.",
		});
		return;
	}
	if (!UPDATE_FEED_URL) {
		dialog.showMessageBox({
			type: "info",
			title: "Updates",
			message: `${DESKTOP_DISTRIBUTION.productName} updates are disabled for this build.`,
			detail:
				"Configure DESKTOP_UPDATER_BASE_URL to enable a fork-specific update feed.",
		});
		return;
	}

	isDismissed = false;
	emitStatus(AUTO_UPDATE_STATUS.CHECKING);

	autoUpdater
		.checkForUpdates()
		.then((result) => {
			if (
				!result?.updateInfo ||
				result.updateInfo.version === app.getVersion()
			) {
				emitStatus(AUTO_UPDATE_STATUS.IDLE);
				dialog.showMessageBox({
					type: "info",
					title: "No Updates",
					message: "You're up to date!",
					detail: `Version ${app.getVersion()} is the latest version.`,
				});
			}
		})
		.catch((error) => {
			if (isNetworkError(error)) {
				console.info("[auto-updater] Network unavailable");
				emitStatus(AUTO_UPDATE_STATUS.IDLE);
				dialog.showMessageBox({
					type: "info",
					title: "No Internet Connection",
					message:
						"Unable to check for updates. Please check your internet connection.",
				});
				return;
			}
			console.error("[auto-updater] Failed to check for updates:", error);
			emitStatus(AUTO_UPDATE_STATUS.ERROR, undefined, error.message);
			dialog.showMessageBox({
				type: "error",
				title: "Update Error",
				message: "Failed to check for updates. Please try again later.",
			});
		});
}

export function simulateUpdateReady(): void {
	if (env.NODE_ENV !== "development") return;
	isDismissed = false;
	emitStatus(AUTO_UPDATE_STATUS.READY, "99.0.0-test");
}

export function simulateDownloading(): void {
	if (env.NODE_ENV !== "development") return;
	isDismissed = false;
	emitStatus(AUTO_UPDATE_STATUS.DOWNLOADING, "99.0.0-test");
}

export function simulateError(): void {
	if (env.NODE_ENV !== "development") return;
	isDismissed = false;
	emitStatus(
		AUTO_UPDATE_STATUS.ERROR,
		undefined,
		"Simulated error for testing",
	);
}

export function setupAutoUpdater(): void {
	if (
		env.NODE_ENV === "development" ||
		!IS_UPDATE_CHECK_PLATFORM ||
		!UPDATE_FEED_URL
	) {
		if (
			env.NODE_ENV !== "development" &&
			PLATFORM.IS_MAC &&
			!IS_MAC_AUTO_UPDATE_ENABLED
		) {
			console.info(
				`[auto-updater] Running in manual macOS update mode for unsigned ${DESKTOP_DISTRIBUTION.productName} build`,
			);
		} else if (
			env.NODE_ENV !== "development" &&
			IS_UPDATE_CHECK_PLATFORM &&
			!UPDATE_FEED_URL
		) {
			console.info(
				`[auto-updater] Disabled: no fork update feed configured for ${DESKTOP_DISTRIBUTION.productName}`,
			);
		}
		return;
	}

	autoUpdater.autoDownload = IS_IN_APP_INSTALL_ENABLED;
	autoUpdater.autoInstallOnAppQuit = IS_IN_APP_INSTALL_ENABLED;
	autoUpdater.disableDifferentialDownload = true;

	// Allow downgrade for prerelease builds so users can switch back to stable
	autoUpdater.allowDowngrade = IS_PRERELEASE;

	// Use generic provider with explicit feed URL so electron-updater can request
	// the correct manifest for the current platform from GitHub release assets.
	autoUpdater.setFeedURL({
		provider: "generic",
		url: UPDATE_FEED_URL,
	});

	console.info(
		`[auto-updater] Initialized: version=${app.getVersion()}, channel=${IS_PRERELEASE ? "canary" : "stable"}, feedURL=${UPDATE_FEED_URL}, installMode=${IS_IN_APP_INSTALL_ENABLED ? "auto" : "manual"}`,
	);

	autoUpdater.on("error", (error) => {
		if (isNetworkError(error)) {
			console.info("[auto-updater] Network unavailable, will retry later");
			emitStatus(AUTO_UPDATE_STATUS.IDLE);
			return;
		}
		console.error(
			`[auto-updater] Error during update (currentVersion=${app.getVersion()}):`,
			error?.message || error,
		);
		emitStatus(AUTO_UPDATE_STATUS.ERROR, undefined, error.message);
	});

	autoUpdater.on("checking-for-update", () => {
		console.info(
			`[auto-updater] Checking for updates... (currentVersion=${app.getVersion()}, feedURL=${UPDATE_FEED_URL})`,
		);
		emitStatus(AUTO_UPDATE_STATUS.CHECKING);
	});

	autoUpdater.on("update-available", (info) => {
		console.info(
			`[auto-updater] Update available: ${app.getVersion()} → ${info.version} (files: ${info.files?.map((f: { url: string }) => f.url).join(", ")})`,
		);
		emitStatus(
			IS_IN_APP_INSTALL_ENABLED
				? AUTO_UPDATE_STATUS.DOWNLOADING
				: AUTO_UPDATE_STATUS.AVAILABLE,
			info.version,
			undefined,
			IS_IN_APP_INSTALL_ENABLED ? "auto" : "manual",
		);
	});

	autoUpdater.on("update-not-available", (info) => {
		console.info(
			`[auto-updater] No updates available (currentVersion=${app.getVersion()}, latestVersion=${info.version})`,
		);
		emitStatus(AUTO_UPDATE_STATUS.IDLE, info.version);
	});

	autoUpdater.on("download-progress", (progress) => {
		console.info(
			`[auto-updater] Download progress: ${progress.percent.toFixed(1)}% (${(progress.transferred / 1024 / 1024).toFixed(1)}MB / ${(progress.total / 1024 / 1024).toFixed(1)}MB)`,
		);
	});

	autoUpdater.on("update-downloaded", (info) => {
		console.info(
			`[auto-updater] Update downloaded: ${app.getVersion()} → ${info.version}. Ready to install.`,
		);
		emitStatus(AUTO_UPDATE_STATUS.READY, info.version, undefined, "auto");
	});

	const interval = setInterval(checkForUpdates, UPDATE_CHECK_INTERVAL_MS);
	interval.unref();

	if (app.isReady()) {
		void checkForUpdates();
	} else {
		app
			.whenReady()
			.then(() => checkForUpdates())
			.catch((error) => {
				console.error("[auto-updater] Failed to start update checks:", error);
			});
	}
}
