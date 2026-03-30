export const AUTO_UPDATE_STATUS = {
	IDLE: "idle",
	CHECKING: "checking",
	AVAILABLE: "available",
	DOWNLOADING: "downloading",
	READY: "ready",
	ERROR: "error",
} as const;

export type AutoUpdateStatus =
	(typeof AUTO_UPDATE_STATUS)[keyof typeof AUTO_UPDATE_STATUS];

export const RELEASES_URL =
	"https://github.com/siarhei-belavus/localset/releases";
export const LATEST_RELEASE_URL = `${RELEASES_URL}/latest`;
