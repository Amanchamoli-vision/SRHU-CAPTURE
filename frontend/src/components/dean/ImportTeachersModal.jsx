import { useEffect, useMemo, useRef, useState } from "react";
import Modal from "../teacher/Modal";
import { ROLE_TRACK } from "../common/roles";
import { importTeachers, previewTeacherImport } from "../../services/deanTeachers";
import { OutcomeChip, ProgressLine, Tally } from "./CredentialReport";
import { TRACK_ERR, TRACK_MUTED, TRACK_OK, TRACK_WARN } from "./outcomes";
import {
  IconAlertTriangle,
  IconArrowLeft,
  IconDownload,
  IconInfo,
  IconMail,
  IconUploadCloud,
} from "../teacher/icons";

/**
 * Import Teacher accounts from an Excel (.xlsx) or CSV roster.
 *
 * upload -> preview -> working -> done. The server reads the file and says
 * what each row would do; the Dean ticks the rows to import and chooses
 * whether to send invitations (a one-time "set your password" link) straight
 * away. Imported teachers join the teacher list either way, and can be
 * invited from there later.
 */

const ROW_STATUS = {
  new: { label: "New", track: TRACK_OK },
  exists: { label: "Already exists", track: TRACK_MUTED },
  duplicate: { label: "Duplicate", track: TRACK_WARN },
  invalid: { label: "Invalid", track: TRACK_ERR },
};

const TH = "whitespace-nowrap px-3 py-2.5 text-xs font-semibold uppercase tracking-wider text-muted";

function downloadTemplate() {
  const csv =
    "Name,Email,Mobile,Department,Designation\n" +
    "Dr. Rajesh Sharma,rajesh.sharma@srhu.edu.in,9876543210,Computer Science & Engineering,Assistant Professor\n" +
    "Dr. Meenakshi Rao,meenakshi.rao@srhu.edu.in,9876543211,Management Studies,Associate Professor\n";
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "teacher_import_template.csv";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export default function ImportTeachersModal({ open, onClose, onDone, onUnauthorized, inviteDays = 7 }) {
  const inputRef = useRef(null);
  const [step, setStep] = useState("upload");
  const [dragging, setDragging] = useState(false);
  const [uploadPct, setUploadPct] = useState(null);
  const [error, setError] = useState("");

  const [preview, setPreview] = useState(null);
  const [picked, setPicked] = useState(() => new Set()); // row numbers
  const [sendEmail, setSendEmail] = useState(true);

  const [progress, setProgress] = useState({ phase: "", done: 0, total: 0 });
  const [outcome, setOutcome] = useState(null);

  // A fresh start every time the dialog opens.
  useEffect(() => {
    if (!open) return;
    setStep("upload");
    setPreview(null);
    setPicked(new Set());
    setError("");
    setUploadPct(null);
    setOutcome(null);
  }, [open]);

  const importable = useMemo(
    () => (preview?.rows || []).filter((r) => r.status === "new"),
    [preview],
  );
  const allPicked = importable.length > 0 && importable.every((r) => picked.has(r.row));
  const somePicked = importable.some((r) => picked.has(r.row));
  const emailConfigured = preview?.email_configured !== false;
  const willEmail = sendEmail && emailConfigured;
  const deliveryOff = preview?.email_delivery_enabled === false;

  const handleFile = async (file) => {
    if (!file) return;
    setError("");
    setStep("reading");
    setUploadPct(0);
    try {
      const data = await previewTeacherImport(file, { onProgress: (p) => setUploadPct(p) });
      setPreview(data);
      setPicked(new Set(data.rows.filter((r) => r.status === "new").map((r) => r.row)));
      setSendEmail(data.email_configured !== false);
      setStep("preview");
    } catch (err) {
      if (err?.status === 401) {
        onUnauthorized?.();
        return;
      }
      setError(err?.message || "The file could not be read.");
      setStep("upload");
    } finally {
      setUploadPct(null);
    }
  };

  const toggleRow = (row) => {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(row)) next.delete(row);
      else next.add(row);
      return next;
    });
  };

  const selectAll = () => setPicked(new Set(importable.map((r) => r.row)));
  const clearAll = () => setPicked(new Set());

  const runImport = async () => {
    const rows = importable.filter((r) => picked.has(r.row));
    if (rows.length === 0) return;
    setError("");
    setStep("working");
    setProgress({ phase: "import", done: 0, total: rows.length });

    try {
      // One request: the server creates the accounts and, when asked,
      // invites the new ones in parallel before answering.
      const imported = await importTeachers(
        rows.map(({ name, email, phone, department, designation }) => ({
          name, email, phone, department, designation,
        })),
        { sendInvites: willEmail },
      );
      const created = imported.results.filter((r) => r.status === "created");

      let email = null;
      if (willEmail && created.length > 0) {
        const byId = new Map(created.map((r) => [r.user_id, r]));
        const results = imported.invites?.results
          || created.map((r) => ({ user_id: r.user_id, status: "failed", reason: `Not attempted: ${imported.invite_error || "the invitations could not be sent."}` }));
        email = {
          results: results.map((r) => ({
            ...r,
            name: r.name ?? byId.get(r.user_id)?.name ?? null,
            email: r.email ?? byId.get(r.user_id)?.email ?? null,
          })),
          error: imported.invite_error || "",
        };
      }

      setOutcome({ imported, email, emailRequested: willEmail });
      setStep("done");
      onDone?.();
    } catch (err) {
      if (err?.status === 401) {
        onUnauthorized?.();
        return;
      }
      setError(err?.message || "The import failed. Nothing was sent.");
      setStep("preview");
      onDone?.();
    }
  };

  const busy = step === "reading" || step === "working";
  const pickedCount = importable.filter((r) => picked.has(r.row)).length;

  let footer = null;
  if (step === "preview") {
    footer = (
      <>
        <button type="button" onClick={() => { setStep("upload"); setPreview(null); }} className="btn btn-ghost btn-sm mr-auto">
          <IconArrowLeft />
          Choose another file
        </button>
        <button type="button" onClick={onClose} className="btn btn-ghost btn-sm">Cancel</button>
        <button type="button" onClick={runImport} disabled={pickedCount === 0} className="btn btn-primary btn-sm">
          {willEmail ? <IconMail /> : null}
          {willEmail
            ? `Import ${pickedCount} & send invitations`
            : `Import ${pickedCount} ${pickedCount === 1 ? "teacher" : "teachers"}`}
        </button>
      </>
    );
  } else if (step === "done") {
    footer = <button type="button" onClick={onClose} className="btn btn-primary btn-sm">Done</button>;
  } else if (step === "upload") {
    footer = <button type="button" onClick={onClose} className="btn btn-ghost btn-sm">Cancel</button>;
  }

  return (
    <Modal
      open={open}
      onClose={() => { if (!busy) onClose(); }}
      eyebrow="Teachers"
      title={
        step === "done" ? "Import report"
          : step === "preview" ? "Review and choose teachers to import"
            : "Import teachers from Excel"
      }
      subtitle={step === "preview" && preview?.filename ? preview.filename : undefined}
      wide
      footer={footer}
    >
      {error && (
        <div className="toast toast-err mb-4 text-sm" role="alert">
          <IconAlertTriangle className="h-4 w-4 shrink-0 text-err" />
          <span>{error}</span>
        </div>
      )}

      {/* ---------------------------------------------------- upload */}
      {(step === "upload" || step === "reading") && (
        <div className="space-y-4">
          <div
            role="button"
            tabIndex={0}
            onClick={() => step === "upload" && inputRef.current?.click()}
            onKeyDown={(e) => {
              if ((e.key === "Enter" || e.key === " ") && step === "upload") {
                e.preventDefault();
                inputRef.current?.click();
              }
            }}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              if (step === "upload") handleFile(e.dataTransfer?.files?.[0]);
            }}
            className={`dropzone cursor-pointer ${dragging ? "is-dragging" : ""} ${step === "reading" ? "is-locked" : ""}`}
          >
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
              className="hidden"
              onChange={(e) => {
                handleFile(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
            <span className="icon-tile"><IconUploadCloud /></span>
            <p className="mt-3 font-display text-sm font-semibold text-ink">
              {step === "reading" ? "Reading the file…" : "Drop an Excel file here, or click to choose"}
            </p>
            <p className="prose-muted mt-1 text-xs">.xlsx or .csv · up to 500 teachers · 2 MB</p>
            {step === "reading" && (
              <div className="mx-auto mt-4 w-full max-w-xs">
                <div className="progress-track">
                  <span
                    className={`progress-bar ${uploadPct == null ? "is-indeterminate" : ""}`}
                    style={uploadPct != null ? { width: `${Math.round(uploadPct * 100)}%` } : undefined}
                  />
                </div>
              </div>
            )}
          </div>

          <div className="flex items-start gap-3 rounded-2xl border hairline bg-raised/40 p-4 text-sm">
            <IconInfo className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
            <div className="min-w-0 flex-1 space-y-1">
              <p className="text-ink">
                The first sheet is read. Only an <strong>Email</strong> column is required; <strong>Name</strong>,{" "}
                <strong>Mobile</strong>, <strong>Department</strong> and <strong>Designation</strong> are used when
                present. Column order does not matter.
              </p>
              <p className="prose-muted text-xs">
                Nothing is saved until you review the rows and confirm. Teachers who already have an account are
                skipped, never changed.
              </p>
            </div>
            <button type="button" onClick={downloadTemplate} className="btn btn-ghost btn-xs shrink-0">
              <IconDownload />
              Template
            </button>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------- preview */}
      {step === "preview" && preview && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Tally label="New" value={preview.counts.new} track={TRACK_OK} />
            <Tally label="Already exist" value={preview.counts.exists} track={TRACK_MUTED} />
            <Tally label="Duplicates" value={preview.counts.duplicate} track={TRACK_WARN} />
            <Tally label="Invalid" value={preview.counts.invalid} track={TRACK_ERR} />
          </div>

          {preview.truncated && (
            <div className="toast toast-err text-sm" role="alert">
              <IconAlertTriangle className="h-4 w-4 shrink-0 text-err" />
              <span>Only the first {preview.max_rows} rows were read. Split the file to import the rest.</span>
            </div>
          )}

          <div className="flex flex-col gap-3 rounded-2xl border hairline bg-raised/40 p-4 sm:flex-row sm:items-center sm:justify-between">
            <label className={`flex items-start gap-3 ${emailConfigured ? "cursor-pointer" : "opacity-60"}`}>
              <input
                type="checkbox"
                role="switch"
                checked={willEmail}
                disabled={!emailConfigured}
                onChange={(e) => setSendEmail(e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border-line text-accent focus:ring-accent"
              />
              <span className="text-sm">
                <span className="block font-semibold text-ink">Send invitations now</span>
                <span className="block text-xs text-muted">
                  {emailConfigured
                    ? willEmail
                      ? `Each imported teacher is emailed a one-time link to set their own password, valid for ${inviteDays} days. No password is sent.`
                      : "Teachers are added to the list without an email. Invite them from the list whenever you are ready."
                    : "Email is not configured on the server. Teachers are added now; invite them once email is set up."}
                </span>
                {deliveryOff && willEmail && (
                  <span className="mt-1 block text-xs font-medium text-ink">
                    Email delivery is switched off: invitations are saved to the server outbox, not sent.
                  </span>
                )}
              </span>
            </label>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-ink">
              <span className="num font-semibold">{pickedCount}</span> of {importable.length} new{" "}
              {importable.length === 1 ? "teacher" : "teachers"} selected
            </p>
            <div className="flex gap-2">
              <button type="button" onClick={selectAll} disabled={allPicked || importable.length === 0} className="btn btn-ghost btn-xs">
                Select all
              </button>
              <button type="button" onClick={clearAll} disabled={!somePicked} className="btn btn-ghost btn-xs">
                Clear selection
              </button>
            </div>
          </div>

          <div className="max-h-[45vh] overflow-auto rounded-2xl border hairline">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 z-10 bg-surface">
                <tr className="border-b hairline">
                  <th scope="col" className="w-10 px-3 py-2.5">
                    <HeaderBox
                      checked={allPicked}
                      indeterminate={!allPicked && somePicked}
                      disabled={importable.length === 0}
                      onChange={() => (allPicked ? clearAll() : selectAll())}
                    />
                  </th>
                  <th scope="col" className={TH}>Row</th>
                  <th scope="col" className={TH}>Teacher</th>
                  <th scope="col" className={TH}>Mobile</th>
                  <th scope="col" className={TH}>Department</th>
                  <th scope="col" className={TH}>Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line/8">
                {preview.rows.map((r) => {
                  const canPick = r.status === "new";
                  const style = ROW_STATUS[r.status] || ROW_STATUS.invalid;
                  return (
                    <tr key={r.row} className={canPick ? "" : "opacity-70"}>
                      <td className="px-3 py-2.5 align-top">
                        <input
                          type="checkbox"
                          checked={canPick && picked.has(r.row)}
                          disabled={!canPick}
                          onChange={() => toggleRow(r.row)}
                          aria-label={`Import ${r.email || `row ${r.row}`}`}
                          className="h-4 w-4 cursor-pointer rounded border-line text-accent focus:ring-accent disabled:cursor-not-allowed"
                        />
                      </td>
                      <td className="num px-3 py-2.5 align-top text-xs text-muted">{r.row}</td>
                      <td className="px-3 py-2.5 align-top">
                        <p className="font-medium text-ink">
                          {r.name || <span className="text-muted">—</span>}
                          {r.name_derived && (
                            <span className="ml-1.5 text-[11px] font-normal text-muted" title="No name in the file; taken from the email address">
                              (from email)
                            </span>
                          )}
                        </p>
                        <p className="text-xs text-muted">{r.email || "No email"}</p>
                      </td>
                      <td className="num whitespace-nowrap px-3 py-2.5 align-top text-xs text-muted">{r.phone || "—"}</td>
                      <td className="px-3 py-2.5 align-top text-xs text-muted">
                        {[r.department, r.designation].filter(Boolean).join(" · ") || "—"}
                      </td>
                      <td className="px-3 py-2.5 align-top">
                        <span className="chip chip-sm chip-track" style={{ "--track": style.track }}>
                          <span className="dot dot-sm" />
                          {style.label}
                        </span>
                        {r.reason && <p className="mt-1 text-[11px] text-muted">{r.reason}</p>}
                        {r.warnings?.map((w) => (
                          <p key={w} className="mt-1 text-[11px]" style={{ color: TRACK_WARN }}>{w}</p>
                        ))}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------- working */}
      {step === "working" && (
        <div className="space-y-3 py-6">
          <p className="font-display text-sm font-semibold text-ink">
            {willEmail
              ? "Creating teacher accounts and sending invitations…"
              : "Creating teacher accounts…"}
          </p>
          {progress.phase === "import" ? (
            <div className="progress-track"><span className="progress-bar is-indeterminate" /></div>
          ) : (
            <ProgressLine total={progress.total} />
          )}
        </div>
      )}

      {/* ---------------------------------------------------- done */}
      {step === "done" && outcome && <ImportReport outcome={outcome} />}
    </Modal>
  );
}

function HeaderBox({ checked, indeterminate, disabled, onChange }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);
  return (
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      disabled={disabled}
      onChange={onChange}
      aria-label="Select all new teachers"
      className="h-4 w-4 cursor-pointer rounded border-line text-accent focus:ring-accent"
    />
  );
}

function ImportReport({ outcome }) {
  const { imported, email, emailRequested } = outcome;
  const emailById = new Map((email?.results || []).map((r) => [r.user_id, r]));
  const sent = (email?.results || []).filter((r) => r.status === "sent").length;
  const notDelivered = (email?.results || []).length - sent;

  const rows = imported.results.map((r) => {
    const mail = r.user_id ? emailById.get(r.user_id) : null;
    return {
      ...r,
      emailOutcome: r.status !== "created" ? null : mail ? mail.status : "not_sent",
      reason: r.reason || mail?.reason || null,
    };
  });

  return (
    <div className="space-y-5">
      {email?.error && (
        <div className="toast toast-err text-sm" role="alert">
          <IconAlertTriangle className="h-4 w-4 shrink-0 text-err" />
          <span>Emailing stopped early: {email.error}</span>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tally label="Imported" value={imported.created_count} track={ROLE_TRACK.teacher} />
        <Tally label="Skipped" value={imported.skipped_count} track={TRACK_WARN} />
        <Tally label="Emails sent" value={sent} track={TRACK_OK} />
        <Tally label={emailRequested ? "Emails not delivered" : "Emails not sent"} value={emailRequested ? notDelivered : imported.created_count} track={emailRequested ? TRACK_ERR : TRACK_MUTED} />
      </div>

      {!emailRequested && imported.created_count > 0 && (
        <p className="prose-muted text-sm">
          No emails were sent. The imported teachers are in the list; select them and use{" "}
          <strong className="text-ink">Send invitations</strong> when you are ready.
        </p>
      )}

      <div className="max-h-[45vh] overflow-auto rounded-2xl border hairline">
        <table className="w-full text-left text-sm">
          <thead className="sticky top-0 z-10 bg-surface">
            <tr className="border-b hairline">
              <th scope="col" className={TH}>Teacher</th>
              <th scope="col" className={TH}>Account</th>
              <th scope="col" className={TH}>Invitation</th>
              <th scope="col" className={TH}>Reason</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line/8">
            {rows.map((r) => (
              <tr key={r.email}>
                <td className="px-3 py-2.5">
                  <p className="font-medium text-ink">{r.name || "—"}</p>
                  <p className="text-xs text-muted">{r.email}</p>
                </td>
                <td className="px-3 py-2.5"><OutcomeChip outcome={r.status} /></td>
                <td className="px-3 py-2.5">{r.emailOutcome ? <OutcomeChip outcome={r.emailOutcome} /> : <span className="text-xs text-muted">—</span>}</td>
                <td className="px-3 py-2.5 text-xs text-muted">{r.reason || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
