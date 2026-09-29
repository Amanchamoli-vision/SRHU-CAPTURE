import { useEffect, useState } from "react";

import { REPORT_READY_EVENT } from "../../services/eventManager";
import { IconCheckCircle, IconExternalLink, IconX } from "./icons";

/**
 * "Your report is ready" -- shown when a report finished generating but the
 * browser's pop-up blocker stopped it opening by itself (see saveBlob in
 * services/eventManager.js). The Open button is a fresh click, which the
 * blocker allows.
 */
export default function ReportReadyPrompt() {
  const [report, setReport] = useState(null);

  useEffect(() => {
    const onReady = (event) => {
      setReport((previous) => {
        if (previous) window.URL.revokeObjectURL(previous.url);
        return event.detail;
      });
    };
    window.addEventListener(REPORT_READY_EVENT, onReady);
    return () => window.removeEventListener(REPORT_READY_EVENT, onReady);
  }, []);

  if (!report) return null;

  const dismiss = () => {
    window.URL.revokeObjectURL(report.url);
    setReport(null);
  };

  const open = () => {
    window.open(report.url, "_blank");
    // Keep the URL alive while the new tab reads it.
    const { url } = report;
    setTimeout(() => window.URL.revokeObjectURL(url), 60_000);
    setReport(null);
  };

  return (
    <div className="pointer-events-none fixed bottom-5 left-1/2 z-[60] w-[min(26rem,calc(100vw-2.5rem))] -translate-x-1/2">
      <div className="toast toast-ok pointer-events-auto" role="status">
        <IconCheckCircle className="mt-0.5 h-5 w-5 shrink-0 text-ok" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-ink">Your report is ready</p>
          <p className="truncate text-xs text-muted" title={report.fileName}>{report.fileName}</p>
        </div>
        <button type="button" onClick={open} className="btn btn-primary btn-xs shrink-0">
          <IconExternalLink />
          Open report
        </button>
        <button type="button" onClick={dismiss} aria-label="Dismiss" className="shrink-0 text-muted transition hover:text-ink">
          <IconX className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
