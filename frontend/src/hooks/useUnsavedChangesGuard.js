/**
 * Warn before unsaved edits are thrown away.
 *
 * React Router's `useBlocker` is the obvious tool and cannot be used here:
 * it requires a data router, and App.jsx mounts <BrowserRouter>, where it
 * throws. Until that migration this covers the two ways a half-edited form is
 * actually lost -- closing or reloading the tab, and clicking a link in the
 * shell's header, rail or mobile menu.
 *
 * The click listener runs in the capture phase so it sees the event before
 * React Router's own handler navigates.
 */

import { useEffect } from "react";

export default function useUnsavedChangesGuard(dirty, onInterceptNavigation) {
  useEffect(() => {
    if (!dirty) return undefined;

    const onBeforeUnload = (event) => {
      event.preventDefault();
      // Browsers show their own wording; assigning returnValue is what triggers it.
      event.returnValue = "";
    };

    const onClick = (event) => {
      if (event.defaultPrevented || event.button !== 0) return;
      // Let the browser handle the deliberate "open elsewhere" gestures.
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

      const anchor = event.target?.closest?.("a[href]");
      if (!anchor) return;
      if (anchor.target === "_blank" || anchor.hasAttribute("download")) return;

      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname) return;

      event.preventDefault();
      onInterceptNavigation(url.pathname + url.search);
    };

    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [dirty, onInterceptNavigation]);
}
