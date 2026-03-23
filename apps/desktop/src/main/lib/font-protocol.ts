import path from "node:path";

/**
 * macOS system font directories that do NOT require TCC / Full Disk Access.
 *
 * Terminal.app/Contents/Resources/Fonts is intentionally excluded — accessing
 * another app's bundle triggers macOS "would like to access data from other
 * apps" prompts that reappear every time the user denies them (see #2799).
 */
export const SYSTEM_FONT_DIRS = ["/System/Library/Fonts", "/Library/Fonts"];

/**
 * SF Mono fonts ship under two naming conventions:
 *   - Terminal.app bundle uses hyphens: SF-Mono-Regular.otf
 *   - /System/Library/Fonts uses no hyphen: SFMono-Regular.otf
 *
 * The @font-face CSS requests the hyphenated names. This map lets us find the
 * font even when only the non-hyphenated variant exists on disk.
 */
const FONT_FILENAME_ALIASES: Record<string, string> = {
	"SF-Mono-Regular.otf": "SFMono-Regular.otf",
	"SF-Mono-Bold.otf": "SFMono-Bold.otf",
	"SF-Mono-RegularItalic.otf": "SFMono-RegularItalic.otf",
	"SF-Mono-BoldItalic.otf": "SFMono-BoldItalic.otf",
};

/**
 * Build the list of candidate paths for a given font filename.
 *
 * For each system font directory we yield:
 *   1. The original filename (e.g. SF-Mono-Regular.otf)
 *   2. An alias, if one exists (e.g. SFMono-Regular.otf)
 */
export function resolveFontCandidates(filename: string): string[] {
	const candidates: string[] = [];
	const alias = FONT_FILENAME_ALIASES[filename];

	for (const dir of SYSTEM_FONT_DIRS) {
		candidates.push(path.join(dir, filename));
		if (alias) {
			candidates.push(path.join(dir, alias));
		}
	}

	return candidates;
}
