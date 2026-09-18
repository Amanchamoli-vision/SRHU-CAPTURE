import { useEffect, useState } from "react";

export const THEME_KEY = "campus-capture-theme";

/**
 * Light is the default; dark is opt-in and remembered. The matching pre-paint
 * script in index.html applies the stored choice before first paint, so the
 * page never flashes light before switching.
 *
 * Shared by every role shell (teacher, dean, superadmin) so the toggle behaves the same
 * everywhere and all of them read the same stored preference.
 */
export default function useThemeToggle() {
  const [dark, setDark] = useState(
    () => typeof document !== "undefined" &&
      document.documentElement.getAttribute("data-theme") === "dark"
  );

  useEffect(() => {
    const root = document.documentElement;
    if (dark) root.setAttribute("data-theme", "dark");
    else root.removeAttribute("data-theme");

    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", dark ? "#070B14" : "#F5F7FB");

    try {
      localStorage.setItem(THEME_KEY, dark ? "dark" : "light");
    } catch {
      /* private mode / blocked storage — the toggle still works for this visit */
    }
  }, [dark]);

  return [dark, () => setDark((v) => !v)];
}
