import { describe, expect, test } from "bun:test";
import { resolveFontCandidates, SYSTEM_FONT_DIRS } from "./font-protocol";

describe("font-protocol", () => {
	describe("SYSTEM_FONT_DIRS", () => {
		test("does not include Terminal.app bundle path (#2799)", () => {
			for (const dir of SYSTEM_FONT_DIRS) {
				expect(dir).not.toContain("Terminal.app");
			}
		});

		test("does not include any path inside another app bundle", () => {
			for (const dir of SYSTEM_FONT_DIRS) {
				expect(dir).not.toMatch(/\.app\//);
			}
		});

		test("includes standard system font directories", () => {
			expect(SYSTEM_FONT_DIRS).toContain("/System/Library/Fonts");
			expect(SYSTEM_FONT_DIRS).toContain("/Library/Fonts");
		});
	});

	describe("resolveFontCandidates", () => {
		test("returns candidates from all system font dirs", () => {
			const candidates = resolveFontCandidates("SomeFont.otf");
			expect(candidates).toEqual([
				"/System/Library/Fonts/SomeFont.otf",
				"/Library/Fonts/SomeFont.otf",
			]);
		});

		test("includes alias for SF-Mono hyphenated filenames", () => {
			const candidates = resolveFontCandidates("SF-Mono-Regular.otf");
			expect(candidates).toEqual([
				"/System/Library/Fonts/SF-Mono-Regular.otf",
				"/System/Library/Fonts/SFMono-Regular.otf",
				"/Library/Fonts/SF-Mono-Regular.otf",
				"/Library/Fonts/SFMono-Regular.otf",
			]);
		});

		test("includes alias for SF-Mono-Bold.otf", () => {
			const candidates = resolveFontCandidates("SF-Mono-Bold.otf");
			expect(candidates).toContainEqual(
				"/System/Library/Fonts/SFMono-Bold.otf",
			);
		});

		test("includes alias for SF-Mono-RegularItalic.otf", () => {
			const candidates = resolveFontCandidates("SF-Mono-RegularItalic.otf");
			expect(candidates).toContainEqual(
				"/System/Library/Fonts/SFMono-RegularItalic.otf",
			);
		});

		test("includes alias for SF-Mono-BoldItalic.otf", () => {
			const candidates = resolveFontCandidates("SF-Mono-BoldItalic.otf");
			expect(candidates).toContainEqual(
				"/System/Library/Fonts/SFMono-BoldItalic.otf",
			);
		});

		test("does not add alias for unknown fonts", () => {
			const candidates = resolveFontCandidates("Menlo-Regular.ttf");
			expect(candidates).toHaveLength(SYSTEM_FONT_DIRS.length);
		});

		test("never generates paths inside Terminal.app (#2799)", () => {
			const sfMonoFiles = [
				"SF-Mono-Regular.otf",
				"SF-Mono-Bold.otf",
				"SF-Mono-RegularItalic.otf",
				"SF-Mono-BoldItalic.otf",
			];
			for (const file of sfMonoFiles) {
				const candidates = resolveFontCandidates(file);
				for (const candidate of candidates) {
					expect(candidate).not.toContain("Terminal.app");
				}
			}
		});
	});
});
