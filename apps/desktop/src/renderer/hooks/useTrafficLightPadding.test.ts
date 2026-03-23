import { describe, expect, test } from "bun:test";
import {
	BASE_MAC_PADDING,
	BASE_NON_MAC_PADDING,
	computeTrafficLightPadding,
} from "./useTrafficLightPadding";

describe("computeTrafficLightPadding", () => {
	test("returns base mac padding (88px) at default zoom (1.0)", () => {
		expect(computeTrafficLightPadding(true, 1.0)).toBe("88px");
	});

	test("returns base non-mac padding (16px) at default zoom (1.0)", () => {
		expect(computeTrafficLightPadding(false, 1.0)).toBe("16px");
	});

	test("BUG REPRO: zoom out to 0.8 causes insufficient padding without fix", () => {
		// At zoom 0.8, 88 CSS pixels = 70 screen pixels.
		// macOS traffic lights span ~80 screen pixels, so buttons overlap.
		// The fix should return a larger CSS value to compensate.
		const result = computeTrafficLightPadding(true, 0.8);
		// 88 / 0.8 = 110px — enough screen pixels to clear the traffic lights
		expect(result).toBe("110px");
	});

	test("zoom out to 0.5 doubles the padding", () => {
		expect(computeTrafficLightPadding(true, 0.5)).toBe("176px");
	});

	test("zoom in to 1.25 reduces the padding", () => {
		// 88 / 1.25 = 70.4 → 70
		expect(computeTrafficLightPadding(true, 1.25)).toBe("70px");
	});

	test("zoom out scales non-mac padding too", () => {
		// 16 / 0.8 = 20
		expect(computeTrafficLightPadding(false, 0.8)).toBe("20px");
	});

	test("zoom factor of 0.75 (common CMD+- step)", () => {
		// 88 / 0.75 = 117.33 → 117
		expect(computeTrafficLightPadding(true, 0.75)).toBe("117px");
	});

	test("extreme zoom out (0.25) still produces valid padding", () => {
		// 88 / 0.25 = 352
		expect(computeTrafficLightPadding(true, 0.25)).toBe("352px");
	});

	test("exports expected base padding values", () => {
		expect(BASE_MAC_PADDING).toBe(88);
		expect(BASE_NON_MAC_PADDING).toBe(16);
	});
});
