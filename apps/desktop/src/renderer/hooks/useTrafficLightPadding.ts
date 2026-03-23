import { useCallback, useEffect, useState } from "react";

export const BASE_MAC_PADDING = 88;
export const BASE_NON_MAC_PADDING = 16;

function getZoomFactor(): number {
	return window.App?.getZoomFactor?.() ?? 1;
}

/**
 * Compute the CSS padding needed to avoid overlapping macOS traffic lights
 * at a given zoom factor. Exported for testing.
 */
export function computeTrafficLightPadding(
	isMac: boolean,
	zoomFactor: number,
): string {
	const base = isMac ? BASE_MAC_PADDING : BASE_NON_MAC_PADDING;
	return `${Math.round(base / zoomFactor)}px`;
}

/**
 * Returns the left padding needed to avoid overlapping macOS traffic lights.
 * The traffic lights are positioned at fixed screen coordinates by Electron,
 * but CSS pixels scale with page zoom. This hook compensates by scaling the
 * padding inversely with the zoom factor.
 */
export function useTrafficLightPadding(isMac: boolean): string {
	const [padding, setPadding] = useState(() =>
		computeTrafficLightPadding(isMac, getZoomFactor()),
	);

	const updatePadding = useCallback(() => {
		setPadding(computeTrafficLightPadding(isMac, getZoomFactor()));
	}, [isMac]);

	useEffect(() => {
		updatePadding();
		// Zoom changes in Electron cause a resize event as the viewport
		// dimensions change in CSS pixels.
		window.addEventListener("resize", updatePadding);
		return () => window.removeEventListener("resize", updatePadding);
	}, [updatePadding]);

	return padding;
}
