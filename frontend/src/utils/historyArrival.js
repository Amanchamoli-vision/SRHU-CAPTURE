/**
 * Did the visitor reach the current page with the browser's Back/Forward?
 *
 * Going Back (or Forward) out of the signed-in area onto a public page ends
 * the session -- see EndSessionOnHistoryReturn. This answers the "how did
 * they get here" half of that.
 */

/** Pages a visitor sees signed out. Everything else lives under a role area. */
const PUBLIC_PATHS = new Set([
  "/",
  "/login",
  "/register",
  "/verify-email",
  "/forgot-password",
  "/reset-password",
]);

export const isPublicPath = (pathname) => PUBLIC_PATHS.has(pathname);

// Set by the first Back/Forward step inside this page load. React Router
// reports the page's very first location as a "POP" too, so without this the
// initial render and a real Back step look the same.
let traversedInDocument = false;
if (typeof window !== "undefined") {
  window.addEventListener("popstate", () => {
    traversedInDocument = true;
  });
}

/** True when this page load itself came from Back/Forward (a cache miss). */
export function documentLoadedByTraversal() {
  try {
    return performance.getEntriesByType("navigation")[0]?.type === "back_forward";
  } catch {
    return false;
  }
}

/** `navigationType` is React Router's useNavigationType() for the current location. */
export function arrivedByHistory(navigationType) {
  if (navigationType !== "POP") return false;
  if (traversedInDocument) return true;
  return documentLoadedByTraversal();
}
