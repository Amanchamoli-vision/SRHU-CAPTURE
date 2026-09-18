import { useCallback, useEffect, useRef } from "react";

// Several thumbnails usually fail together when their links expire; one
// refetch covers them all, and a file that is genuinely broken (for example a
// video format the browser cannot play) must not cause a refetch loop.
const MIN_INTERVAL_MS = 60 * 1000;

/**
 * Media and document links from the API are signed and expire. Returns a
 * handler for img/video onError that calls `reload` (which should refetch
 * the event's media and store the fresh URLs) at most once per minute.
 */
export default function useMediaRefresh(reload) {
  const reloadRef = useRef(reload);
  useEffect(() => {
    reloadRef.current = reload;
  }, [reload]);

  const lastRunRef = useRef(0);
  const inFlightRef = useRef(false);

  return useCallback(() => {
    if (inFlightRef.current) return;
    if (Date.now() - lastRunRef.current < MIN_INTERVAL_MS) return;
    lastRunRef.current = Date.now();
    inFlightRef.current = true;
    Promise.resolve()
      .then(() => reloadRef.current?.())
      .catch((err) => console.warn("Refreshing media links failed:", err))
      .finally(() => {
        inFlightRef.current = false;
      });
  }, []);
}
