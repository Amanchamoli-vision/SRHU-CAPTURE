import { useRef, useState } from "react";
import Modal from "../teacher/Modal";
import { apiJson } from "../../services/api";
import { copyText } from "../../utils/clipboard";
import {
  IconAlertTriangle,
  IconCheck,
  IconCheckCircle,
  IconCopy,
  IconFile,
  IconInfo,
  IconMail,
  IconPlus,
  IconRefresh,
  IconTrash,
  IconUpload,
  IconUser,
  IconX,
} from "../teacher/icons";

// The server's rules for one roster (schemas/superadmin.py): checking them
// here names the bad rows instead of the whole upload failing with one 422.
const MAX_BULK_TEACHERS = 500;
const MAX_NAME_LENGTH = 120;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function BulkTeacherOnboardModal({ isOpen, onClose, onSuccess }) {
  const fileInputRef = useRef(null);
  const [file, setFile] = useState(null);
  const [parsedRows, setParsedRows] = useState([]);
  const [sendEmail, setSendEmail] = useState(true);
  const [parsingError, setParsingError] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [inputMode, setInputMode] = useState("file");
  const [csvText, setCsvText] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [copied, setCopied] = useState(false);
  const [invalidRows, setInvalidRows] = useState([]);

  // The modal stays mounted while closed, so without this the next opening
  // showed the last summary -- temporary passwords included -- and a second
  // import needed a page reload.
  const resetAll = () => {
    setFile(null);
    setParsedRows([]);
    setInvalidRows([]);
    setParsingError("");
    setIsDragging(false);
    setInputMode("file");
    setCsvText("");
    setError("");
    setResult(null);
    setCopied(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const close = () => {
    if (loading) return;
    resetAll();
    onClose();
  };

  const handleDownloadSample = () => {
    const csvContent =
      "Name,Email ID\n" +
      "Dr. Rajesh Sharma,rajesh.cse@srhu.edu.in\n" +
      "Dr. Meenakshi Sundaram,meenakshi.ece@srhu.edu.in\n" +
      "Prof. Amit Chauhan,amit.mgmt@srhu.edu.in\n";
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", "teachers_onboard_sample.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const parseCSVText = (text) => {
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (!lines.length) {
      throw new Error("The CSV file is empty.");
    }

    const parseLine = (line) => {
      const entries = [];
      let current = "";
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === "," && !inQuotes) {
          entries.push(current.trim());
          current = "";
        } else {
          current += char;
        }
      }
      entries.push(current.trim());
      return entries;
    };

    const rows = lines.map(parseLine);
    const header = rows[0].map((c) => c.toLowerCase());

    let nameIdx = -1;
    let emailIdx = -1;

    header.forEach((col, idx) => {
      if (["name", "teacher name", "teacher_name", "full name", "fullname", "faculty name"].includes(col)) {
        nameIdx = idx;
      } else if (["email", "email id", "email_id", "email address", "username", "mail"].includes(col)) {
        emailIdx = idx;
      }
    });

    let startRow = 1;
    if (nameIdx === -1 && emailIdx === -1) {
      startRow = 0;
      nameIdx = 0;
      emailIdx = 1;
    } else if (nameIdx === -1) {
      nameIdx = emailIdx !== 0 ? 0 : 1;
    } else if (emailIdx === -1) {
      emailIdx = nameIdx !== 1 ? 1 : 0;
    }

    const teachers = [];
    const invalid = [];
    for (let i = startRow; i < rows.length; i++) {
      const row = rows[i];
      if (!row || !row.some((cell) => cell)) continue;
      const name = (row[nameIdx] || "").trim();
      const email = (row[emailIdx] || "").trim().toLowerCase();
      // Any other column (an old sheet's Department) is ignored: the
      // platform serves SST only.
      const line = i + 1; // as the spreadsheet numbers it
      if (!name || !email) {
        invalid.push({ line, label: name || email || "(blank)", reason: !name ? "no name" : "no email" });
      } else if (!EMAIL_PATTERN.test(email)) {
        invalid.push({ line, label: email, reason: "not a valid email address" });
      } else if (name.length > MAX_NAME_LENGTH) {
        invalid.push({ line, label: `${name.slice(0, 30)}…`, reason: `name longer than ${MAX_NAME_LENGTH} characters` });
      } else {
        teachers.push({ name, email });
      }
    }

    if (!teachers.length) {
      throw new Error(
        invalid.length
          ? `No valid teacher records found. Row ${invalid[0].line}: ${invalid[0].reason}.`
          : "No valid teacher records found. Please ensure 'Name' and 'Email' columns exist."
      );
    }
    if (teachers.length > MAX_BULK_TEACHERS) {
      throw new Error(
        `A roster may hold at most ${MAX_BULK_TEACHERS} teachers; this one has ${teachers.length}. Split it and upload each part.`
      );
    }
    return { teachers, invalid };
  };

  const handleFileChange = (e) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;
    processFile(selectedFile);
  };

  const processFile = (selectedFile) => {
    setParsingError("");
    setError("");
    setFile(selectedFile);

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result;
        const { teachers, invalid } = parseCSVText(text);
        setParsedRows(teachers);
        setInvalidRows(invalid);
      } catch (err) {
        setParsingError(err.message || "Failed to parse CSV file.");
        setParsedRows([]);
      }
    };
    reader.onerror = () => {
      setParsingError("Error reading file.");
      setParsedRows([]);
    };
    reader.readAsText(selectedFile);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const droppedFile = e.dataTransfer.files?.[0];
    if (droppedFile) {
      processFile(droppedFile);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleClearFile = () => {
    setFile(null);
    setParsedRows([]);
    setInvalidRows([]);
    setParsingError("");
    setError("");
    setCsvText("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleOnboardSubmit = async () => {
    if (!parsedRows.length) return;
    try {
      setLoading(true);
      setError("");

      const res = await apiJson("/superadmin/teachers/bulk-onboard", {
        method: "POST",
        body: {
          teachers: parsedRows,
          send_email: sendEmail,
        },
      });

      setResult(res);
      onSuccess?.();
    } catch (err) {
      setError(err?.message || "Failed to onboard teachers.");
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadCredentialsCSV = () => {
    if (!result?.created_teachers?.length) return;
    let csv = "Name,Email,Temporary Password\n";
    result.created_teachers.forEach((t) => {
      csv += `"${t.name}","${t.email}","${t.temporary_password}"\n`;
    });
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", "created_teacher_credentials.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleCopyCredentials = async () => {
    if (!result?.created_teachers?.length) return;
    const text = result.created_teachers
      .map((t) => `${t.name} | ${t.email} | Temp Password: ${t.temporary_password}`)
      .join("\n");
    if (!(await copyText(text))) {
      setError("Could not copy automatically. Use Download CSV instead.");
      return;
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleApplyCsvText = () => {
    setParsingError("");
    setError("");
    try {
      const { teachers, invalid } = parseCSVText(csvText);
      setParsedRows(teachers);
      setInvalidRows(invalid);
      setFile({ name: "pasted_teachers.csv" });
    } catch (err) {
      setParsingError(err.message || "Failed to parse CSV text.");
      setParsedRows([]);
    }
  };

  if (!isOpen) return null;

  return (
    <Modal
      open={isOpen}
      onClose={close}
      title={result ? "Onboarding Summary" : "Bulk Onboard Teachers"}
    >
      {!result ? (
        <div className="space-y-4">
          <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
            <p className="prose-muted text-xs">
              Upload or paste a CSV with teacher names and institutional emails to auto-generate credentials.
            </p>
            <button
              type="button"
              onClick={handleDownloadSample}
              className="btn btn-ghost btn-xs shrink-0 self-start text-accent hover:underline sm:self-auto"
            >
              <IconFile className="h-3.5 w-3.5" />
              Download CSV Template
            </button>
          </div>

          <div className="flex rounded-xl border hairline bg-surface-2 p-1">
            <button
              type="button"
              onClick={() => {
                setInputMode("file");
                setParsingError("");
              }}
              className={`flex-1 rounded-lg py-1.5 text-center text-xs font-medium transition ${
                inputMode === "file"
                  ? "bg-raised text-ink shadow-sm"
                  : "text-muted hover:text-ink"
              }`}
            >
              Upload CSV File
            </button>
            <button
              type="button"
              onClick={() => {
                setInputMode("paste");
                setParsingError("");
              }}
              className={`flex-1 rounded-lg py-1.5 text-center text-xs font-medium transition ${
                inputMode === "paste"
                  ? "bg-raised text-ink shadow-sm"
                  : "text-muted hover:text-ink"
              }`}
            >
              Paste CSV Text
            </button>
          </div>

          {error && (
            <div className="flex items-start gap-2.5 rounded-xl border border-err/20 bg-err/10 p-3 text-xs text-err">
              <IconAlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {parsingError && (
            <div className="flex items-start gap-2.5 rounded-xl border border-err/20 bg-err/10 p-3 text-xs text-err">
              <IconAlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{parsingError}</span>
            </div>
          )}

          {invalidRows.length > 0 && parsedRows.length > 0 && (
            <div className="rounded-xl border border-ember/30 bg-ember/10 p-3 text-xs text-ink" role="status">
              <p className="font-semibold text-emberink">
                {invalidRows.length} row{invalidRows.length === 1 ? "" : "s"} left out; the other {parsedRows.length} can be onboarded:
              </p>
              <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-muted">
                {invalidRows.slice(0, 5).map((row) => (
                  <li key={row.line}>
                    Row {row.line} ({row.label}): {row.reason}
                  </li>
                ))}
                {invalidRows.length > 5 && <li>and {invalidRows.length - 5} more</li>}
              </ul>
            </div>
          )}

          {!file ? (
            inputMode === "file" ? (
              <div
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onClick={() => fileInputRef.current?.click()}
                className={`flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-8 text-center transition ${
                  isDragging
                    ? "border-accent bg-accent/5"
                    : "border-line/20 hover:border-accent/40 hover:bg-raised/40"
                }`}
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent/10 text-accent">
                  <IconUpload className="h-6 w-6" />
                </div>
                <p className="font-display mt-3 text-sm font-semibold text-ink">
                  Click or drag & drop CSV file here
                </p>
                <p className="prose-muted mt-1 text-xs">
                  Supports .csv format with Name and Email columns
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,text/csv"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </div>
            ) : (
              <div className="space-y-2">
                <textarea
                  rows={5}
                  value={csvText}
                  onChange={(e) => setCsvText(e.target.value)}
                  placeholder="Name,Email ID&#10;Dr. Rajesh Sharma,rajesh.cse@srhu.edu.in&#10;Dr. Meenakshi Sundaram,meenakshi.ece@srhu.edu.in"
                  className="w-full rounded-xl border hairline bg-surface px-3 py-2 font-mono text-xs text-ink placeholder:text-muted/60 focus:border-accent focus:outline-none"
                />
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={handleApplyCsvText}
                    disabled={!csvText.trim()}
                    className="btn btn-brand btn-xs"
                  >
                    Parse CSV Text
                  </button>
                </div>
              </div>
            )
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between rounded-xl border hairline bg-raised/50 p-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent/10 text-accent">
                    <IconFile className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-display text-sm font-semibold text-ink">{file.name}</p>
                    <p className="text-[11px] text-muted">
                      {parsedRows.length} valid teacher records found
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleClearFile}
                  disabled={loading}
                  className="btn btn-ghost btn-xs text-muted hover:text-err"
                  title="Remove file"
                >
                  <IconTrash className="h-4 w-4" />
                </button>
              </div>

              {parsedRows.length > 0 && (
                <div className="max-h-52 overflow-y-auto rounded-xl border hairline bg-surface">
                  <table className="w-full text-left text-xs">
                    <thead className="sticky top-0 border-b hairline bg-raised/80 font-semibold text-muted backdrop-blur-sm">
                      <tr>
                        <th className="px-3 py-2">#</th>
                        <th className="px-3 py-2">Name</th>
                        <th className="px-3 py-2">Email</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line/8">
                      {parsedRows.map((row, idx) => (
                        <tr key={idx} className="hover:bg-raised/30">
                          <td className="px-3 py-2 text-muted">{idx + 1}</td>
                          <td className="font-medium text-ink px-3 py-2">{row.name}</td>
                          <td className="text-muted px-3 py-2">{row.email}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <label className="flex cursor-pointer items-center gap-2.5 rounded-xl border hairline bg-raised/30 p-3">
                <input
                  type="checkbox"
                  checked={sendEmail}
                  onChange={(e) => setSendEmail(e.target.checked)}
                  className="rounded border-line text-accent focus:ring-accent"
                />
                <div className="text-xs">
                  <span className="font-semibold text-ink">
                    Send credentials email via SMTP immediately
                  </span>
                  <p className="text-muted">
                    Each teacher will receive their username and unique temporary password.
                  </p>
                </div>
              </label>
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={close}
              disabled={loading}
              className="btn btn-ghost btn-sm"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleOnboardSubmit}
              disabled={loading || !parsedRows.length}
              className="btn btn-brand btn-sm"
            >
              {loading ? (
                <>
                  <span className="spin h-4 w-4 border-2 border-white/30 border-t-white" />
                  Creating Accounts…
                </>
              ) : (
                <>
                  <IconPlus className="h-4 w-4" />
                  Onboard {parsedRows.length || ""} {parsedRows.length === 1 ? "Teacher" : "Teachers"}
                </>
              )}
            </button>
          </div>
        </div>
      ) : (
        /* Results View */
        <div className="space-y-4">
          {error && (
            <div className="flex items-start gap-2.5 rounded-xl border border-err/20 bg-err/10 p-3 text-xs text-err" role="alert">
              <IconAlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-xl border hairline bg-raised/40 p-3 text-center">
              <span className="text-[11px] font-medium text-muted">Processed</span>
              <p className="font-display text-lg font-bold text-ink">{result.total_processed}</p>
            </div>
            <div className="rounded-xl border hairline bg-ok/10 p-3 text-center">
              <span className="text-[11px] font-medium text-ok">Created</span>
              <p className="font-display text-lg font-bold text-ok">{result.created_count}</p>
            </div>
            <div className="rounded-xl border hairline bg-accent/10 p-3 text-center">
              <span className="text-[11px] font-medium text-accent">Emails Sent</span>
              <p className="font-display text-lg font-bold text-accent">{result.email_sent_count}</p>
            </div>
            <div className="rounded-xl border hairline bg-err/10 p-3 text-center">
              <span className="text-[11px] font-medium text-err">Skipped / Failed</span>
              <p className="font-display text-lg font-bold text-err">
                {result.skipped_count + result.email_failed_count}
              </p>
            </div>
          </div>

          {result.skipped?.length > 0 && (
            <div className="rounded-xl border border-ember/30 bg-ember/10 p-3 text-xs">
              <p className="font-semibold text-emberink">
                Skipped Accounts ({result.skipped.length}):
              </p>
              <ul className="mt-1.5 list-disc space-y-1 pl-4 text-muted">
                {result.skipped.map((s, i) => (
                  <li key={i}>
                    <strong>{s.email}</strong>: {s.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {result.email_failures?.length > 0 && (
            <div className="rounded-xl border border-err/20 bg-err/10 p-3 text-xs">
              <p className="font-semibold text-err">
                Email Delivery Failures ({result.email_failures.length}):
              </p>
              <ul className="mt-1.5 list-disc space-y-1 pl-4 text-muted">
                {result.email_failures.map((f, i) => (
                  <li key={i}>
                    <strong>{f.email}</strong>: {f.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {result.created_teachers?.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted">
                  Generated Credentials ({result.created_teachers.length})
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleCopyCredentials}
                    className="btn btn-ghost btn-xs text-xs"
                  >
                    {copied ? <IconCheck className="text-ok" /> : <IconCopy />}
                    {copied ? "Copied" : "Copy List"}
                  </button>
                  <button
                    type="button"
                    onClick={handleDownloadCredentialsCSV}
                    className="btn btn-ghost btn-xs text-xs text-accent"
                  >
                    <IconFile className="h-3.5 w-3.5" />
                    Download CSV
                  </button>
                </div>
              </div>

              <div className="max-h-48 overflow-y-auto rounded-xl border hairline bg-surface">
                <table className="w-full text-left text-xs">
                  <thead className="sticky top-0 border-b hairline bg-raised/80 font-semibold text-muted">
                    <tr>
                      <th className="px-3 py-2">Teacher</th>
                      <th className="px-3 py-2">Email</th>
                      <th className="px-3 py-2">Temporary Password</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line/8 font-mono">
                    {result.created_teachers.map((t, idx) => (
                      <tr key={idx} className="hover:bg-raised/30">
                        <td className="px-3 py-2 font-sans font-medium text-ink">{t.name}</td>
                        <td className="px-3 py-2 text-muted">{t.email}</td>
                        <td className="px-3 py-2 font-bold text-accent">
                          <code className="rounded bg-raised px-1.5 py-0.5 text-[11px]">
                            {t.temporary_password}
                          </code>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="flex items-center justify-end pt-2">
            <button
              type="button"
              onClick={close}
              className="btn btn-brand btn-sm"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
