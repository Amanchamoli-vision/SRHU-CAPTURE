import { useLocation } from "react-router-dom";

/**
 * The `state` to attach to a link into the event wizard, so its Back control
 * can return to the page the teacher actually came from.
 *
 * The wizard is reachable from My Events (with a status filter applied), an
 * event's details page, the dashboard tracking modal, a notification and the
 * profile. Its header arrow used to be a hard-coded link to the dashboard, so
 * "Back" threw away wherever the teacher had been. React Router keeps no
 * referrer of its own, and `navigate(-1)` is no good here -- duplicating a
 * draft and clicking status tabs both push entries, so counting backwards
 * lands on a stale view or leaves the app entirely. Carrying the origin
 * forward is the only way the wizard can know.
 *
 * The search string is included, so a filtered list comes back filtered.
 */
export function useOriginState() {
  const location = useLocation();
  return { from: `${location.pathname}${location.search}` };
}

export default useOriginState;
