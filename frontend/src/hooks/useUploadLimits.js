/**
 * The active upload limits, shared by every form that enforces them.
 *
 * Modelled on useEventTypes: a built-in fallback so a form never renders empty,
 * and a `reload` for callers that need to force a refetch. It also subscribes to
 * the settings cache, so when an admin saves in another tab this one picks the
 * change up on focus instead of serving stale caps until a full reload.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import {
  DEFAULT_UPLOAD_LIMITS,
  fetchUploadLimits,
  subscribeUploadLimits,
} from "../services/settings";

export default function useUploadLimits() {
  const [limits, setLimits] = useState(DEFAULT_UPLOAD_LIMITS);
  const [loading, setLoading] = useState(true);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const load = useCallback(async ({ force = false } = {}) => {
    setLoading(true);
    try {
      const next = await fetchUploadLimits({ force });
      if (mounted.current && next) setLimits(next);
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => subscribeUploadLimits(() => load({ force: true })), [load]);

  return { limits, loading, reload: load };
}
