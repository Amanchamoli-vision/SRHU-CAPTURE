/**
 * The Super Admin's photo and video upload limits, fetched once and shared.
 *
 * Falls back to the shipped defaults if the request fails, so the create-event
 * wizard always has a number to validate against rather than blocking the
 * teacher on a lookup. The server re-checks every upload regardless.
 */

import { useEffect, useRef, useState } from "react";

import {
  FALLBACK_UPLOAD_LIMITS,
  fetchUploadLimits,
} from "../services/uploadLimits";

export default function useUploadLimits() {
  const [limits, setLimits] = useState(FALLBACK_UPLOAD_LIMITS);
  const [loading, setLoading] = useState(true);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    fetchUploadLimits()
      .then((value) => {
        if (!cancelled && mounted.current) setLimits(value);
      })
      .catch(() => {
        // Keep FALLBACK_UPLOAD_LIMITS. Nothing is shown to the teacher: the
        // limits they see would be the ones they had before this was
        // configurable, and the server has the final say either way.
      })
      .finally(() => {
        if (!cancelled && mounted.current) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return { limits, loading };
}
