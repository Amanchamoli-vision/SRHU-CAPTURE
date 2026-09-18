import { useEffect, useState } from "react";

const read = (name, fallback) => {
  if (typeof document === "undefined") return fallback;
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  return value || fallback;
};

/**
 * Resolved theme tokens, re-read whenever the theme flips.
 *
 * SVG charts need concrete colours — `var()` in a presentation attribute is
 * not dependable — so anything drawn into an `<svg>` asks for the values here
 * instead of naming the custom property. `data-theme` on `<html>` is watched,
 * which is exactly what `useThemeToggle` sets, so a chart retints with the
 * rest of the page. This mirrors the Himovation hero canvas, which re-reads
 * `--c-accent` when the theme changes.
 *
 * Values come back as space-separated RGB channel triplets ("3 105 161"), the
 * form the stylesheet stores them in, so callers can add any alpha.
 */
export default function useThemeTokens() {
  const [tokens, setTokens] = useState(() => ({
    accent: read("--c-accent", "3 105 161"),
    surface: read("--c-surface", "255 255 255"),
    ink: read("--c-ink", "15 26 46"),
    muted: read("--c-muted", "75 90 115"),
  }));

  useEffect(() => {
    const refresh = () =>
      setTokens({
        accent: read("--c-accent", "3 105 161"),
        surface: read("--c-surface", "255 255 255"),
        ink: read("--c-ink", "15 26 46"),
        muted: read("--c-muted", "75 90 115"),
      });

    // The toggle sets / removes data-theme on <html>; nothing else moves these.
    const observer = new MutationObserver(refresh);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });

    refresh();
    return () => observer.disconnect();
  }, []);

  return tokens;
}
