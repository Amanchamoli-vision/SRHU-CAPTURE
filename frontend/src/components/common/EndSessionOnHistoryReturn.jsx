import { useEffect, useRef } from "react";
import { useAuth } from "../../context/AuthContext";
import { getSession } from "../../services/auth";
import { documentLoadedByTraversal, isPublicPath } from "../../utils/historyArrival";

/**
 * Going Back (or Forward) out of the signed-in area onto a public page -- the
 * home page, sign-in, registration -- ends the session, on the server too.
 *
 * Without it the session outlived the visit: Back to the home page showed a
 * signed-out looking screen while the session was still live, and Forward or
 * "Sign in" walked straight back in without a password.
 *
 * Only history steps count. Following a link to a public page, or typing its
 * address, leaves the session alone. Sign-in pushes the dashboard on top of
 * /login rather than replacing it, so Back from the signed-in area always
 * lands on a public page instead of leaving the site with the session live.
 *
 * It listens to the browser's own events rather than comparing rendered
 * routes: a Back pressed moments after signing in can reach React in the same
 * render as the sign-in navigation, and a comparison would see no change.
 * signOut() forgets the session synchronously, so the route change and the
 * sign-out render together and the public page never shows signed in.
 *
 * Renders nothing.
 */
export default function EndSessionOnHistoryReturn() {
  const { user, loading, signOut } = useAuth();
  const checkedLoad = useRef(false);

  useEffect(() => {
    const endIfPublic = () => {
      if (isPublicPath(window.location.pathname) && getSession()) signOut();
    };
    const onPopState = (event) => {
      // A same-page "#section" jump on the home page: an entry the browser
      // made itself, which carries no state. Every page the router shows has
      // some.
      if (event.state == null) return;
      endIfPublic();
    };
    // Restored from the back/forward cache: a Back/Forward arrival by
    // definition, which React sees no navigation for.
    const onPageShow = (event) => {
      if (event.persisted) endIfPublic();
    };
    window.addEventListener("popstate", onPopState);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      window.removeEventListener("popstate", onPopState);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, [signOut]);

  // This page load itself came from Back/Forward (the page was not cached).
  // Judged once, when the stored session has been confirmed.
  useEffect(() => {
    if (loading || checkedLoad.current) return;
    checkedLoad.current = true;
    if (user && isPublicPath(window.location.pathname) && documentLoadedByTraversal()) {
      signOut();
    }
  }, [loading, user, signOut]);

  return null;
}
