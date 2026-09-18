import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { apiJson, apiUpload, isAbortError } from "../../services/api";
import { fetchCurrentUser, signOut } from "../../services/auth";
import { canTeacherEditEvent } from "../../utils/constants";
import {
  getTeacherDraftById,
  saveTeacherDraft,
  deleteTeacherDraft,
  encodeEventMetadata,
  decodeEventMetadata,
} from "../../utils/draftStorage";
import TeacherShell from "../../components/teacher/TeacherShell";
import Modal from "../../components/teacher/Modal";
import UploadPanel from "../../components/teacher/UploadPanel";
import useMediaRefresh from "../../components/common/useMediaRefresh";
import StatusChip from "../../components/teacher/StatusChip";
import { trackOf } from "../../components/teacher/status";
import {
  IconAlertTriangle,
  IconArrowLeft,
  IconArrowRight,
  IconBookmark,
  IconCheck,
  IconCheckCircle,
  IconFilePlus,
  IconFilm,
  IconImagePlus,
  IconInfo,
  IconLayers,
} from "../../components/teacher/icons";

const EVENT_TYPES = [
  "Academic",
  "Cultural",
  "Sports",
  "Workshop",
  "Seminar",
  "Conference",
  "Celebration",
  "Other",
];

/** "2026-10-04" → "04 Oct 2026", for the submit confirmation. */
function formatSummaryDate(value) {
  if (!value) return "Not set";
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

// Photos and videos are separate steps, so each carries its own cap.
const MAX_MEDIA_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_DOC_SIZE = 25 * 1024 * 1024; // 25MB
const MAX_IMAGE_COUNT = 4;
const MAX_VIDEO_COUNT = 2;

const ALLOWED_DOC_EXTENSIONS = [
  "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt", "csv",
];

const STEPS = [
  { key: "details", label: "Details", Icon: IconLayers },
  { key: "photos", label: "Photos", Icon: IconImagePlus },
  { key: "videos", label: "Videos", Icon: IconFilm },
  { key: "documents", label: "Documents", Icon: IconFilePlus },
];

const REQUIRED_DETAILS = [
  ["eventName", "Please enter the event name."],
  ["eventDate", "Please select the event date."],
  ["eventType", "Please select the event type."],
  ["startTime", "Please specify the event start time."],
  ["endTime", "Please specify the event end time."],
  ["location", "Please enter the venue / location."],
  ["department", "Please specify the host department or school."],
  ["organizer", "Please enter the organizer or faculty coordinator name."],
  ["contactInfo", "Please provide organizer contact information."],
  ["description", "Please provide a description for the event."],
];

let uploadKeySeed = 0;

const EMPTY_FORM = {
  eventName: "",
  eventDate: "",
  eventType: "",
  startTime: "",
  endTime: "",
  location: "",
  department: "",
  organizer: "",
  expectedParticipants: "",
  contactInfo: "",
  description: "",
  socialNetworkUrl: "",
};

// How long typing must pause before step-1 edits are saved to the server draft.
const AUTOSAVE_DELAY_MS = 1500;

/** Field -> message for everything wrong with the step-1 details. */
function detailsErrorsOf(data) {
  const errors = {};

  for (const [field, message] of REQUIRED_DETAILS) {
    if (!String(data[field] ?? "").trim()) errors[field] = message;
  }

  if (data.socialNetworkUrl.trim()) {
    try {
      const url = new URL(data.socialNetworkUrl.trim());
      if (url.protocol !== "http:" && url.protocol !== "https:") {
        errors.socialNetworkUrl = "The link must start with http:// or https://";
      }
    } catch {
      errors.socialNetworkUrl = "Please enter a valid social network URL.";
    }
  }

  return errors;
}

const snapshotOf = (data) => JSON.stringify(data);

function CreateEvent() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const draftIdParam = searchParams.get("draftId");
  const editEventIdParam = searchParams.get("editEventId");

  const [step, setStep] = useState(1);
  const [maxStepReached, setMaxStepReached] = useState(1);

  const [formData, setFormData] = useState(EMPTY_FORM);

  // The form as last stored somewhere (server draft, browser draft, or the
  // blank form it started as). Anything different is an unsaved change.
  const [savedSnapshot, setSavedSnapshot] = useState(() => snapshotOf(EMPTY_FORM));
  const [autoSave, setAutoSave] = useState("idle"); // idle | saving | error

  const [fieldErrors, setFieldErrors] = useState({});

  // Files live on the server from the moment they are picked, so these hold
  // saved records rather than browser File objects.
  const [mediaItems, setMediaItems] = useState([]);
  const [documentItems, setDocumentItems] = useState([]);
  const [uploads, setUploads] = useState([]);

  const [currentUser, setCurrentUser] = useState(null);
  const [editingDraftId, setEditingDraftId] = useState(draftIdParam || null);
  const [serverEvent, setServerEvent] = useState(null);
  const [serverEventId, setServerEventId] = useState(null);

  const [initialising, setInitialising] = useState(Boolean(editEventIdParam));
  const [loading, setLoading] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  /**
   * Set once a draft has been stored, and rendered as a dialog rather than a
   * banner. The Save Draft button lives at the foot of a long form, and the
   * banner rendered above it: on a laptop the confirmation appeared roughly
   * 480px above the top of the viewport, so the teacher clicked Save Draft and
   * saw nothing happen at all. `where` distinguishes the two resting places a
   * draft can have, because only one of them survives a change of browser.
   */
  const [draftSaved, setDraftSaved] = useState(null);

  // Submitting is two dialogs: "are you sure?" before anything is sent, then
  // "submitted" once the server has it. The confirm dialog carries its own
  // error line, because the page's banner sits far above the sticky Submit
  // button and a failure there would go unseen.
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmError, setConfirmError] = useState("");
  const [submitted, setSubmitted] = useState(null); // the saved event

  // The event id is also held in a ref: several files picked at once each need
  // it, and React state would still be null for all of them.
  const eventIdRef = useRef(null);
  const creatingEventRef = useRef(null);
  const formDataRef = useRef(formData);
  const userRef = useRef(null);
  const editingDraftRef = useRef(draftIdParam || null);

  // Aborted when the page unmounts, so uploads and saves stop instead of
  // running on (and setting state) after the teacher has left.
  const abortRef = useRef(null);
  useEffect(() => {
    const controller = new AbortController();
    abortRef.current = controller;
    return () => controller.abort();
  }, []);
  const isGone = () => Boolean(abortRef.current?.signal.aborted);

  useEffect(() => {
    formDataRef.current = formData;
  }, [formData]);

  const photos = mediaItems.filter((m) => m.media_type === "image");
  const videos = mediaItems.filter((m) => m.media_type === "video");

  const photoUploads = uploads.filter((u) => u.kind === "image");
  const videoUploads = uploads.filter((u) => u.kind === "video");
  const documentUploads = uploads.filter((u) => u.kind === "document");

  const uploading = uploads.some((u) => !u.error);
  const isDraftEvent = !serverEvent || serverEvent.status === "draft";

  const formSnapshot = snapshotOf(formData);
  const formDirty = formSnapshot !== savedSnapshot;
  const detailsComplete = Object.keys(detailsErrorsOf(formData)).length === 0;
  // Only a rejected event that is being resubmitted; a draft is not one.
  const resubmitting = Boolean(serverEvent) && serverEvent.status !== "draft";

  // --------------------------------------------------
  // Load user, and any draft or event being edited
  // --------------------------------------------------
  useEffect(() => {
    let cancelled = false;

    async function initUserAndData() {
      try {
        const user = await fetchCurrentUser();

        if (!user) {
          navigate("/login");
          return;
        }

        if (cancelled) return;
        setCurrentUser(user);
        userRef.current = user;

        // 1. A local draft saved before any file was attached.
        if (draftIdParam) {
          const draft = getTeacherDraftById(user.id, draftIdParam);
          if (draft && !cancelled) {
            setEditingDraftId(draft.id);
            editingDraftRef.current = draft.id;
            const loaded = {
              eventName: draft.event_name || "",
              eventDate: draft.event_date || "",
              eventType: draft.event_type || "",
              startTime: draft.start_time || "",
              endTime: draft.end_time || "",
              location: draft.location || "",
              department: draft.department || "",
              organizer: draft.organizer || "",
              expectedParticipants: draft.expected_participants || "",
              contactInfo: draft.contact_info || "",
              description: draft.description || "",
              socialNetworkUrl: draft.social_network_url || "",
            };
            setFormData(loaded);
            setSavedSnapshot(snapshotOf(loaded));
          }
        }

        // 2. An event already on the server: a draft being resumed, or a
        //    rejected event being corrected. Both bring their files with them.
        if (editEventIdParam) {
          try {
            const result = await apiJson(`/teacher/events/${editEventIdParam}`);
            const event = result?.event || null;

            if (cancelled) return;

            if (event && !canTeacherEditEvent(event)) {
              setError("This event has already been approved and can no longer be edited.");
              setInitialising(false);
              return;
            }

            if (event) {
              const { description, meta } = decodeEventMetadata(event.description);

              setServerEvent(event);
              setServerEventId(event.id);
              eventIdRef.current = event.id;
              setMediaItems(result.media || []);
              setDocumentItems(result.documents || []);
              const loaded = {
                eventName: event.event_name || "",
                eventDate: event.event_date || "",
                eventType: event.event_type || "",
                startTime: meta.startTime || "",
                endTime: meta.endTime || "",
                location: event.location || "",
                department: meta.department || "",
                organizer: meta.organizer || "",
                expectedParticipants: meta.expectedParticipants || "",
                contactInfo: meta.contactInfo || "",
                description: description || "",
                socialNetworkUrl: event.social_network_url || "",
              };
              setFormData(loaded);
              setSavedSnapshot(snapshotOf(loaded));

              // Everything is already filled in, so every step is reachable.
              setMaxStepReached(STEPS.length);
            }
          } catch (err) {
            if (!cancelled) {
              setError(err?.message || "Could not load this event.");
            }
          }
        }
      } catch (err) {
        console.error("Init CreateEvent error:", err);
      } finally {
        if (!cancelled) setInitialising(false);
      }
    }

    initUserAndData();
    return () => {
      cancelled = true;
    };
  }, [draftIdParam, editEventIdParam, navigate]);

  // --------------------------------------------------
  // Form change
  // --------------------------------------------------
  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    setFieldErrors((prev) => {
      if (!prev[name]) return prev;
      const next = { ...prev };
      delete next[name];
      return next;
    });
  };

  // --------------------------------------------------
  // Step 1 validation
  // --------------------------------------------------
  const validateDetails = () => {
    const errors = detailsErrorsOf(formData);
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const buildEventBody = (saveAsDraft) => {
    const data = formDataRef.current;
    return {
      event_name: data.eventName.trim(),
      event_date: data.eventDate,
      event_type: data.eventType,
      location: data.location.trim(),
      description: encodeEventMetadata(data.description, {
        startTime: data.startTime,
        endTime: data.endTime,
        department: data.department,
        organizer: data.organizer,
        expectedParticipants: data.expectedParticipants,
        contactInfo: data.contactInfo,
      }),
      social_network_url: data.socialNetworkUrl.trim() || null,
      save_as_draft: saveAsDraft,
    };
  };

  /**
   * The event id to attach files to, creating a server-side draft the first
   * time one is needed. Concurrent callers share a single in-flight create, so
   * picking four photos at once cannot produce four draft events.
   */
  const ensureEventId = useCallback(async () => {
    if (eventIdRef.current) return eventIdRef.current;
    if (creatingEventRef.current) return creatingEventRef.current;

    creatingEventRef.current = (async () => {
      const sent = formDataRef.current;
      const { event } = await apiJson("/teacher/events", {
        method: "POST",
        body: buildEventBody(true),
        signal: abortRef.current?.signal,
      });

      eventIdRef.current = event.id;
      setSavedSnapshot(snapshotOf(sent));
      setServerEventId(event.id);
      setServerEvent(event);

      // The draft now lives on the server, so drop the browser copy rather
      // than leaving the teacher with two drafts of the same event.
      const localId = editingDraftRef.current;
      if (localId && userRef.current) {
        deleteTeacherDraft(userRef.current.id, localId);
        editingDraftRef.current = null;
        setEditingDraftId(null);
      }

      return event.id;
    })();

    try {
      return await creatingEventRef.current;
    } finally {
      creatingEventRef.current = null;
    }
    // buildEventBody reads through refs, so this needs no dependencies.
  }, []);

  // --------------------------------------------------
  // Auto-save step-1 edits once a server draft exists
  //
  // The draft is created on the first upload. Without this, edits made after
  // that were kept only until the tab closed. Saved after a short pause in
  // typing, and only when the details are complete (the API rejects partial
  // ones). A rejected event being corrected is not a draft and cannot be
  // saved as one, so it relies on the beforeunload warning below instead.
  // --------------------------------------------------
  useEffect(() => {
    if (!serverEventId || !isDraftEvent || !formDirty || !detailsComplete) return undefined;
    if (loading || savingDraft || submitted) return undefined;

    const snapshot = formSnapshot;
    const timer = setTimeout(async () => {
      if (isGone()) return;
      setAutoSave("saving");
      try {
        await apiJson(`/teacher/events/${serverEventId}`, {
          method: "PATCH",
          body: buildEventBody(true),
          signal: abortRef.current?.signal,
        });
        if (isGone()) return;
        setSavedSnapshot(snapshot);
        setAutoSave("idle");
      } catch (err) {
        if (isGone() || isAbortError(err)) return;
        console.error("Auto-save error:", err);
        setAutoSave("error");
      }
    }, AUTOSAVE_DELAY_MS);

    return () => clearTimeout(timer);
    // buildEventBody reads through refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formSnapshot, formDirty, serverEventId, isDraftEvent, detailsComplete, loading, savingDraft, submitted]);

  // Warn before closing the tab while edits or uploads would be lost.
  const hasUnsavedWork = !submitted && (formDirty || uploading);
  useEffect(() => {
    if (!hasUnsavedWork) return undefined;
    const onBeforeUnload = (e) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [hasUnsavedWork]);

  // --------------------------------------------------
  // Uploading
  // --------------------------------------------------
  const setUploadState = (key, changes) => {
    setUploads((prev) =>
      prev.map((item) => (item.key === key ? { ...item, ...changes } : item))
    );
  };

  const runUpload = useCallback(async (entry) => {
    const signal = abortRef.current?.signal;
    if (signal?.aborted) return;
    try {
      setUploadState(entry.key, { error: null, progress: 0 });

      const eventId = await ensureEventId();
      if (signal?.aborted) return;
      const path =
        entry.kind === "document"
          ? `/teacher/events/${eventId}/documents`
          : `/teacher/events/${eventId}/media`;

      const result = await apiUpload(path, {
        file: entry.file,
        signal,
        onProgress: (fraction) => setUploadState(entry.key, { progress: fraction }),
      });
      if (signal?.aborted) return;

      if (entry.kind === "document") {
        if (result?.document) setDocumentItems((prev) => [...prev, result.document]);
      } else if (result?.media) {
        setMediaItems((prev) => [...prev, result.media]);
      }

      setUploads((prev) => prev.filter((item) => item.key !== entry.key));
    } catch (err) {
      // Left the page: the upload was cancelled on purpose.
      if (signal?.aborted || isAbortError(err)) return;
      console.error("Upload error:", err);
      setUploadState(entry.key, {
        error: err?.message || "Upload failed.",
        progress: null,
      });
    }
  }, [ensureEventId]);

  /**
   * Validate a batch against the per-step caps and queue what survives.
   * Counts include files already on the server and still uploading, so the
   * caps hold across repeated picks rather than per batch.
   */
  const handlePick = (files, kind) => {
    const rejected = [];
    const accepted = [];

    const isDocument = kind === "document";
    const maxSize = isDocument ? MAX_DOC_SIZE : MAX_MEDIA_SIZE;
    const sizeLabel = isDocument ? "25MB" : "10MB";

    const max = kind === "image" ? MAX_IMAGE_COUNT : kind === "video" ? MAX_VIDEO_COUNT : null;
    let used =
      kind === "image"
        ? photos.length + photoUploads.filter((u) => !u.error).length
        : kind === "video"
        ? videos.length + videoUploads.filter((u) => !u.error).length
        : 0;

    for (const file of files) {
      if (kind === "image" && !file.type.startsWith("image/")) {
        rejected.push(`"${file.name}" is not an image.`);
        continue;
      }
      if (kind === "video" && !file.type.startsWith("video/")) {
        rejected.push(`"${file.name}" is not a video.`);
        continue;
      }
      if (isDocument) {
        const ext = file.name.split(".").pop()?.toLowerCase();
        if (!ext || !ALLOWED_DOC_EXTENSIONS.includes(ext)) {
          rejected.push(`"${file.name}" is not a supported document type.`);
          continue;
        }
      }

      if (file.size > maxSize) {
        rejected.push(`"${file.name}" is larger than ${sizeLabel}.`);
        continue;
      }

      if (max != null && used >= max) {
        rejected.push(
          `"${file.name}" was not added. The limit is ${max} ${
            kind === "image" ? "photos" : "videos"
          }.`
        );
        continue;
      }

      used += 1;
      accepted.push(file);
    }

    setError(rejected.join(" "));

    if (accepted.length === 0) return;

    const entries = accepted.map((file) => ({
      key: `u${(uploadKeySeed += 1)}`,
      name: file.name,
      size: file.size,
      kind,
      file,
      progress: 0,
      error: null,
    }));

    setUploads((prev) => [...prev, ...entries]);

    // One at a time: the caps are small, and a single progress bar moving is
    // easier to follow than four crawling together.
    (async () => {
      for (const entry of entries) {
        if (isGone()) break;
        await runUpload(entry);
      }
    })();
  };

  const handleRemoveMedia = async (item) => {
    const eventId = eventIdRef.current;
    if (!eventId) return;

    setMediaItems((prev) =>
      prev.map((m) => (m.id === item.id ? { ...m, removing: true } : m))
    );

    try {
      await apiJson(`/teacher/events/${eventId}/media/${item.id}`, { method: "DELETE" });
      setMediaItems((prev) => prev.filter((m) => m.id !== item.id));
    } catch (err) {
      console.error("Remove media error:", err);
      setError(err?.message || "Could not remove that file.");
      setMediaItems((prev) =>
        prev.map((m) => (m.id === item.id ? { ...m, removing: false } : m))
      );
    }
  };

  const handleRemoveDocument = async (item) => {
    const eventId = eventIdRef.current;
    if (!eventId) return;

    setDocumentItems((prev) =>
      prev.map((d) => (d.id === item.id ? { ...d, removing: true } : d))
    );

    try {
      await apiJson(`/teacher/events/${eventId}/documents/${item.id}`, { method: "DELETE" });
      setDocumentItems((prev) => prev.filter((d) => d.id !== item.id));
    } catch (err) {
      console.error("Remove document error:", err);
      setError(err?.message || "Could not remove that file.");
      setDocumentItems((prev) =>
        prev.map((d) => (d.id === item.id ? { ...d, removing: false } : d))
      );
    }
  };

  // Saved files' links are signed and expire; refetch them when one fails.
  const refreshMediaLinks = useMediaRefresh(async () => {
    const eventId = eventIdRef.current;
    if (!eventId || isGone()) return;
    const result = await apiJson(`/teacher/events/${eventId}`, {
      signal: abortRef.current?.signal,
    });
    if (isGone()) return;
    setMediaItems(result?.media || []);
    setDocumentItems(result?.documents || []);
  });

  const dismissUpload = (entry) =>
    setUploads((prev) => prev.filter((item) => item.key !== entry.key));

  // --------------------------------------------------
  // Navigation
  // --------------------------------------------------
  const goToStep = (next) => {
    setStep(next);
    setMaxStepReached((prev) => Math.max(prev, next));
    setError("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleNext = () => {
    if (step === 1 && !validateDetails()) {
      setError("Please complete the required fields before continuing.");
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    goToStep(Math.min(step + 1, STEPS.length));
  };

  const handleBack = () => goToStep(Math.max(step - 1, 1));

  // --------------------------------------------------
  // Save draft
  // --------------------------------------------------
  const handleSaveDraft = async () => {
    setError("");
    setSuccess("");

    if (!currentUser) {
      setError("Please log in to save drafts.");
      return;
    }

    setSavingDraft(true);
    try {
      let where;

      const sent = formDataRef.current;

      if (eventIdRef.current) {
        // Already on the server, with its files attached.
        await apiJson(`/teacher/events/${eventIdRef.current}`, {
          method: "PATCH",
          body: buildEventBody(true),
        });
        setSavedSnapshot(snapshotOf(sent));
        where = "server";
      } else if (validateDetails()) {
        // Complete enough for the API to accept: promote it to a server draft
        // so any files added later have somewhere to go.
        await ensureEventId();
        where = "server";
      } else {
        // Still partial. Keep it in the browser, as before, so a half-filled
        // form is never lost.
        const saved = saveTeacherDraft(currentUser.id, {
          id: editingDraftId || undefined,
          ...formData,
        });
        if (!saved) {
          // Storage full, private mode or blocked: say so rather than
          // claiming a save that did not happen.
          setError(
            "The draft could not be saved in this browser (storage is full or blocked). " +
              "Fill in the required details so it can be saved to your account instead."
          );
          return;
        }
        setSavedSnapshot(snapshotOf(sent));
        setEditingDraftId(saved.id);
        editingDraftRef.current = saved.id;
        setFieldErrors({});
        where = "browser";
      }

      setDraftSaved({ where });
    } catch (err) {
      console.error("Save draft error:", err);
      setError(err?.message || "Failed to save draft. Please try again.");
    } finally {
      setSavingDraft(false);
    }
  };

  // --------------------------------------------------
  // Submit
  //
  // The Submit button only asks. Everything that could stop a submission —
  // missing details, uploads still running — is checked first, so the
  // confirm dialog never offers a submission that is bound to fail.
  // --------------------------------------------------
  const handleSubmit = (e) => {
    e.preventDefault();

    // Only the last step submits. Without this the form goes in early in two
    // ways: pressing Enter in any step-1 text field, and clicking "Next" on the
    // step before the last, where React patches the very same DOM button from
    // type="button" to type="submit" mid-click and the browser then runs the
    // form's default action.
    if (step !== STEPS.length) return;

    if (loading || savingDraft) return;

    setError("");
    setSuccess("");

    if (!validateDetails()) {
      setStep(1);
      setError("Please complete the required fields before submitting.");
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    if (uploading) {
      setError("Please wait for the uploads to finish.");
      return;
    }

    setConfirmError("");
    setConfirmOpen(true);
  };

  /** Cancel: close the question and leave the form exactly as it was. */
  const cancelSubmit = () => {
    if (loading) return; // never abandon a request mid-flight
    setConfirmOpen(false);
    setConfirmError("");
  };

  /** Confirm: send it. The server puts it in the Dean's queue as pending. */
  const confirmSubmit = async () => {
    if (loading) return;

    setConfirmError("");
    setLoading(true);

    try {
      const user = await fetchCurrentUser();
      if (!user) throw new Error("Your session has expired. Please log in again.");

      // A draft or a rejected event already exists and is edited in place,
      // with its files attached; otherwise nothing was uploaded and the event
      // is created now. Either way the server sets it to pending.
      const result = eventIdRef.current
        ? await apiJson(`/teacher/events/${eventIdRef.current}`, {
            method: "PATCH",
            body: buildEventBody(false),
          })
        : await apiJson("/teacher/events", {
            method: "POST",
            body: buildEventBody(false),
          });

      if (editingDraftRef.current) {
        deleteTeacherDraft(user.id, editingDraftRef.current);
      }

      setSavedSnapshot(snapshotOf(formDataRef.current));
      setConfirmOpen(false);
      setSubmitted(result?.event || { status: "pending" });
    } catch (err) {
      console.error("Create / Resubmit event error:", err);
      setConfirmError(err?.message || "Something went wrong while submitting the event.");
    } finally {
      setLoading(false);
    }
  };

  /** Leaving the success dialog leaves the form: it has done its job. */
  const finishSubmission = () => {
    setSubmitted(null);
    navigate("/teacher/my-events?filter=submitted");
  };

  const handleLogout = async () => {
    await signOut();
    navigate("/login", { replace: true });
  };

  // --------------------------------------------------
  // Copy
  // --------------------------------------------------
  // "Draft" is about how the page was opened, not about whether a draft row
  // exists yet. Someone part-way through creating an event is still creating
  // it, even though the first upload has already parked it as a draft.
  const resumedExisting = Boolean(draftIdParam || editEventIdParam);
  const mode = resubmitting ? "resubmit" : resumedExisting ? "draft" : "new";

  const heroCopy = {
    resubmit: {
      eyebrow: "Resubmission",
      title: "Edit &",
      accent: "Resubmit",
      subtitle:
        "Update the rejected event as advised by the Dean, then resubmit it for approval.",
    },
    draft: {
      eyebrow: "Draft Mode",
      title: "Edit Event",
      accent: "Draft",
      subtitle:
        "Resume your saved draft. Anything you upload is kept, so you can finish this later.",
    },
    new: {
      eyebrow: "New Proposal",
      title: "Create",
      accent: "Event",
      subtitle:
        "Submit event details for Dean approval, or save a draft and finish it later.",
    },
  }[mode];

  const busy = loading || savingDraft;

  if (initialising) {
    return (
      <div className="hv-root flex min-h-screen items-center justify-center">
        <div className="text-center">
          <span className="spin mx-auto mb-4 block h-10 w-10 text-accent" />
          <p className="prose-muted text-sm">Loading event…</p>
        </div>
      </div>
    );
  }

  return (
    <TeacherShell
      active="create"
      profile={
        currentUser
          ? { id: currentUser.id, name: currentUser.name || currentUser.email }
          : null
      }
      onLogout={handleLogout}
      railNote="Photos, videos and documents upload as soon as you pick them, so a saved draft keeps them."
      showToTop={false}
    >
      {/* Sized so the details step fits a laptop screen with at most a short
          scroll: title, step rail and form share one card instead of a hero
          band above it, the fields run three across, and the action bar
          sticks to the bottom of the screen so Next is never out of reach. */}
      <div className="mx-auto w-full max-w-6xl px-4 py-4 sm:px-6 lg:px-8">

        {/* Dean's feedback on a rejected event — the one thing that has to be
            read before anything below it is touched. */}
        {resubmitting && (
          <div
            style={{ "--track": trackOf("rejected") }}
            className="reveal mb-4 rounded-2xl border p-4"
            data-tint="rejected"
          >
            <div className="flex items-start gap-3">
              <span className="icon-tile icon-tile-track shrink-0">
                <IconAlertTriangle />
              </span>
              <div className="min-w-0">
                <h2 className="h3 text-ink">Dean's rejection feedback</h2>
                <p className="prose-muted mt-1.5 text-sm">
                  {serverEvent.rejection_reason || "No explicit rejection reason provided."}
                </p>
              </div>
            </div>
          </div>
        )}

        {success && (
          <div className="toast toast-ok mb-4" role="status">
            <IconCheckCircle className="mt-0.5 h-5 w-5 shrink-0 text-ok" />
            <p className="text-sm font-medium text-ink">{success}</p>
          </div>
        )}

        {error && (
          <div className="toast toast-err mb-4" role="alert">
            <IconAlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-err" />
            <p className="text-sm font-medium text-ink">{error}</p>
          </div>
        )}

        {/* ------------------------------------------------------------ form */}
        <form onSubmit={handleSubmit} className="glass overflow-clip">

          {/* --------------------------------------- title + step rail */}
          <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-b hairline px-4 py-3.5 sm:px-6">
            <div className="flex min-w-0 items-center gap-3">
              <Link
                to="/teacher/dashboard"
                className="icon-btn icon-btn-sm shrink-0"
                aria-label="Back to Dashboard"
                title="Back to Dashboard"
              >
                <IconArrowLeft />
              </Link>
              <div className="min-w-0">
                <p className="eyebrow text-[11px]">{heroCopy.eyebrow}</p>
                <h1 className="truncate font-display text-xl font-bold leading-tight text-ink" title={heroCopy.subtitle}>
                  {heroCopy.title} <span className="hero-accent">{heroCopy.accent}</span>
                </h1>
              </div>
            </div>

            <div className="wiz-rail" role="list">
              {STEPS.map((item, index) => {
                const number = index + 1;
                const done = number < step;
                const reachable = number <= maxStepReached;

                return (
                  <div key={item.key} className="flex items-center" role="listitem">
                    {index > 0 && <span className="wiz-sep" aria-hidden="true" />}
                    <button
                      type="button"
                      onClick={() => reachable && goToStep(number)}
                      disabled={!reachable || busy}
                      aria-current={number === step ? "step" : undefined}
                      data-done={done ? "true" : undefined}
                      className="wiz-step"
                    >
                      <i>{done ? <IconCheck className="h-3 w-3" /> : number}</i>
                      <span className={number === step ? "" : "hidden sm:inline"}>
                        {item.label}
                      </span>
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* One line for what used to be a three-line band. The step count
              lives here so it survives the rail scrolling on a phone. */}
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b hairline bg-line/2 px-4 py-2.5 sm:px-6">
            <h2 className="text-sm font-semibold text-ink">
              {step === 1 && "Event Information"}
              {step === 2 && "Photos"}
              {step === 3 && "Videos"}
              {step === 4 && "Supporting Documents"}
              <span className="ml-2 text-[11px] font-semibold uppercase tracking-wider text-accent">
                Step {step} of {STEPS.length}
              </span>
            </h2>
            <p className="prose-muted text-xs sm:text-sm">
              {step === 1 && (
                <>
                  Core event details. Fields marked <span className="req">*</span> are
                  required before the event can be submitted.
                </>
              )}
              {step === 2 &&
                `Optional. Posters, banners and photographs — up to ${MAX_IMAGE_COUNT} images, 10MB each.`}
              {step === 3 &&
                `Optional. Teasers and recordings — up to ${MAX_VIDEO_COUNT} videos, 10MB each.`}
              {step === 4 && "Optional. PDF, Word, Excel or presentation files — up to 25MB each."}
            </p>
          </div>

          {/* ------------------------------------------------ step 1: details */}
          {step === 1 && (
            <div className="grid grid-cols-2 gap-x-3 gap-y-4 px-4 py-5 sm:gap-x-5 sm:px-6 lg:grid-cols-3">

              <div className="field col-span-2">
                <label htmlFor="eventName">
                  Event Name<span className="req">*</span>
                </label>
                <input
                  id="eventName"
                  name="eventName"
                  type="text"
                  value={formData.eventName}
                  onChange={handleChange}
                  placeholder="e.g. National Science Day Symposium 2026"
                  disabled={busy}
                  aria-invalid={fieldErrors.eventName ? "true" : undefined}
                  className="input min-h-10 py-2"
                />
                {fieldErrors.eventName && <p className="field-error">{fieldErrors.eventName}</p>}
              </div>

              <div className="field">
                <label htmlFor="eventType">
                  Event Type<span className="req">*</span>
                </label>
                <select
                  id="eventType"
                  name="eventType"
                  value={formData.eventType}
                  onChange={handleChange}
                  disabled={busy}
                  aria-invalid={fieldErrors.eventType ? "true" : undefined}
                  className="input min-h-10 py-2"
                >
                  <option value="">Select type</option>
                  {EVENT_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
                {fieldErrors.eventType && <p className="field-error">{fieldErrors.eventType}</p>}
              </div>

              <div className="field">
                <label htmlFor="eventDate">
                  Event Date<span className="req">*</span>
                </label>
                <input
                  id="eventDate"
                  name="eventDate"
                  type="date"
                  value={formData.eventDate}
                  onChange={handleChange}
                  disabled={busy}
                  aria-invalid={fieldErrors.eventDate ? "true" : undefined}
                  className="input min-h-10 py-2"
                />
                {fieldErrors.eventDate && <p className="field-error">{fieldErrors.eventDate}</p>}
              </div>

              <div className="field">
                <label htmlFor="startTime">
                  Start Time<span className="req">*</span>
                </label>
                <input
                  id="startTime"
                  name="startTime"
                  type="time"
                  value={formData.startTime}
                  onChange={handleChange}
                  disabled={busy}
                  aria-invalid={fieldErrors.startTime ? "true" : undefined}
                  className="input min-h-10 py-2"
                />
                {fieldErrors.startTime && <p className="field-error">{fieldErrors.startTime}</p>}
              </div>

              <div className="field">
                <label htmlFor="endTime">
                  End Time<span className="req">*</span>
                </label>
                <input
                  id="endTime"
                  name="endTime"
                  type="time"
                  value={formData.endTime}
                  onChange={handleChange}
                  disabled={busy}
                  aria-invalid={fieldErrors.endTime ? "true" : undefined}
                  className="input min-h-10 py-2"
                />
                {fieldErrors.endTime && <p className="field-error">{fieldErrors.endTime}</p>}
              </div>

              <div className="field col-span-2">
                <label htmlFor="location">
                  Venue / Location<span className="req">*</span>
                </label>
                <input
                  id="location"
                  name="location"
                  type="text"
                  value={formData.location}
                  onChange={handleChange}
                  placeholder="e.g. Auditorium Hall B, Medical College Block"
                  disabled={busy}
                  aria-invalid={fieldErrors.location ? "true" : undefined}
                  className="input min-h-10 py-2"
                />
                {fieldErrors.location && <p className="field-error">{fieldErrors.location}</p>}
              </div>

              <div className="field col-span-2 md:col-span-1">
                <label htmlFor="expectedParticipants">
                  Expected Participants
                  <span className="ml-2 font-normal text-muted">(Optional)</span>
                </label>
                <input
                  id="expectedParticipants"
                  name="expectedParticipants"
                  type="text"
                  value={formData.expectedParticipants}
                  onChange={handleChange}
                  placeholder="e.g. 150 Students & Faculty"
                  disabled={busy}
                  className="input min-h-10 py-2"
                />
              </div>

              <div className="field col-span-2 md:col-span-1">
                <label htmlFor="department">
                  Host Department / School<span className="req">*</span>
                </label>
                <input
                  id="department"
                  name="department"
                  type="text"
                  value={formData.department}
                  onChange={handleChange}
                  placeholder="e.g. Department of Computer Science & Engineering"
                  disabled={busy}
                  aria-invalid={fieldErrors.department ? "true" : undefined}
                  className="input min-h-10 py-2"
                />
                {fieldErrors.department && (
                  <p className="field-error">{fieldErrors.department}</p>
                )}
              </div>

              <div className="field col-span-2 md:col-span-1">
                <label htmlFor="organizer">
                  Organizer / Faculty Coordinator<span className="req">*</span>
                </label>
                <input
                  id="organizer"
                  name="organizer"
                  type="text"
                  value={formData.organizer}
                  onChange={handleChange}
                  placeholder="e.g. Dr. Rajesh Sharma"
                  disabled={busy}
                  aria-invalid={fieldErrors.organizer ? "true" : undefined}
                  className="input min-h-10 py-2"
                />
                {fieldErrors.organizer && <p className="field-error">{fieldErrors.organizer}</p>}
              </div>

              <div className="field col-span-2 md:col-span-1">
                <label htmlFor="contactInfo">
                  Coordinator Contact Information<span className="req">*</span>
                </label>
                <input
                  id="contactInfo"
                  name="contactInfo"
                  type="text"
                  value={formData.contactInfo}
                  onChange={handleChange}
                  placeholder="e.g. coordinator@srhu.edu.in / +91 9876543210"
                  disabled={busy}
                  aria-invalid={fieldErrors.contactInfo ? "true" : undefined}
                  className="input min-h-10 py-2"
                />
                {fieldErrors.contactInfo && (
                  <p className="field-error">{fieldErrors.contactInfo}</p>
                )}
              </div>

              <div className="field col-span-2">
                <label htmlFor="description">
                  Event Description<span className="req">*</span>
                </label>
                <textarea
                  id="description"
                  name="description"
                  rows="4"
                  value={formData.description}
                  onChange={handleChange}
                  placeholder="Describe event objectives, agenda, keynote speakers, target audience, and expected outcomes…"
                  disabled={busy}
                  aria-invalid={fieldErrors.description ? "true" : undefined}
                  className="input min-h-24 py-2"
                />
                {fieldErrors.description && (
                  <p className="field-error">{fieldErrors.description}</p>
                )}
              </div>

              <div className="field col-span-2 lg:col-span-1">
                <label htmlFor="socialNetworkUrl">
                  Social Network Link
                  <span className="ml-2 font-normal text-muted">(Optional)</span>
                </label>
                <input
                  id="socialNetworkUrl"
                  name="socialNetworkUrl"
                  type="url"
                  value={formData.socialNetworkUrl}
                  onChange={handleChange}
                  placeholder="https://instagram.com/srhu_official"
                  disabled={busy}
                  aria-invalid={fieldErrors.socialNetworkUrl ? "true" : undefined}
                  className="input min-h-10 py-2"
                />
                {fieldErrors.socialNetworkUrl ? (
                  <p className="field-error">{fieldErrors.socialNetworkUrl}</p>
                ) : (
                  <p className="prose-muted text-xs">
                    Instagram, LinkedIn, YouTube, X/Twitter, or Facebook.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* ------------------------------------------------- step 2: photos */}
          {step === 2 && (
            <div className="px-4 py-5 sm:px-6">
              <UploadPanel
                kind="image"
                accept="image/*"
                items={photos}
                uploads={photoUploads}
                max={MAX_IMAGE_COUNT}
                maxSizeLabel="JPG, PNG, WebP or GIF up to 10MB each"
                emptyLabel="Drag photos here"
                hint="Posters, banners, and photographs of the event."
                disabled={busy}
                onPick={(files) => handlePick(files, "image")}
                onRemove={handleRemoveMedia}
                onRetry={runUpload}
                onDismiss={dismissUpload}
                onLoadError={refreshMediaLinks}
              />
            </div>
          )}

          {/* ------------------------------------------------- step 3: videos */}
          {step === 3 && (
            <div className="px-4 py-5 sm:px-6">
              <UploadPanel
                kind="video"
                accept="video/*"
                items={videos}
                uploads={videoUploads}
                max={MAX_VIDEO_COUNT}
                maxSizeLabel="MP4, WebM or MOV up to 10MB each"
                emptyLabel="Drag videos here"
                hint="Teasers, highlights, or a recording of the event."
                disabled={busy}
                onPick={(files) => handlePick(files, "video")}
                onRemove={handleRemoveMedia}
                onRetry={runUpload}
                onDismiss={dismissUpload}
                onLoadError={refreshMediaLinks}
              />
            </div>
          )}

          {/* ---------------------------------------------- step 4: documents */}
          {step === 4 && (
            <div className="px-4 py-5 sm:px-6">
              <UploadPanel
                kind="document"
                accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv"
                items={documentItems}
                uploads={documentUploads}
                maxSizeLabel="PDF, Word, Excel, PowerPoint, TXT or CSV up to 25MB each"
                emptyLabel="Drag documents here"
                hint="Agenda, budget, invitation letter, or approval paperwork."
                disabled={busy}
                onPick={(files) => handlePick(files, "document")}
                onRemove={handleRemoveDocument}
                onRetry={runUpload}
                onDismiss={dismissUpload}
                onLoadError={refreshMediaLinks}
              />

              <div className="mt-4 flex items-start gap-3 rounded-xl border border-accent/15 bg-accent/6 p-3.5">
                <IconInfo className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
                <p className="text-sm text-ink">
                  {resubmitting
                    ? "Resubmitting sets the event status back to Pending and notifies the Dean for re-evaluation."
                    : "Once submitted, your event enters the approval workflow and is reviewed by the Dean."}
                </p>
              </div>
            </div>
          )}

          {/* ---------------------------------------------- saved-files note */}
          {serverEventId && isDraftEvent && (
            <div className="border-t hairline px-4 py-2.5 sm:px-6" role="status">
              {uploading ? (
                <p className="prose-muted flex items-center gap-2 text-xs">
                  <span className="spin h-4 w-4 shrink-0 text-accent" />
                  Uploading. Keep this page open until the uploads finish.
                </p>
              ) : !formDirty ? (
                <p className="prose-muted flex items-center gap-2 text-xs">
                  <IconCheckCircle className="h-4 w-4 shrink-0 text-ok" />
                  Saved as a draft with your files. You can close this page and come
                  back to it.
                </p>
              ) : autoSave === "error" ? (
                <p className="flex items-center gap-2 text-xs text-err">
                  <IconAlertTriangle className="h-4 w-4 shrink-0" />
                  Your latest changes could not be saved automatically. Use Save Draft
                  before leaving this page.
                </p>
              ) : !detailsComplete ? (
                <p className="prose-muted flex items-center gap-2 text-xs">
                  <IconInfo className="h-4 w-4 shrink-0 text-accent" />
                  Your files are saved, but your latest edits are not. Complete the
                  required details so they can be saved.
                </p>
              ) : (
                <p className="prose-muted flex items-center gap-2 text-xs">
                  <span className="spin h-4 w-4 shrink-0 text-accent" />
                  Saving your changes…
                </p>
              )}
            </div>
          )}

          {/* ------------------------------------------------------- actions
              Sticky, so Next / Submit and Save Draft stay on screen however
              far down the form the teacher is. One row at every width: on a
              phone Save Draft drops to its icon rather than stacking three
              full-width buttons over the form. */}
          <div className="sticky bottom-0 z-10 flex items-center gap-2 border-t hairline bg-(--card-bg) px-4 py-3 shadow-[0_-10px_24px_-18px_var(--shadow-strong)] sm:gap-3 sm:px-6">
            {step === 1 ? (
              <button
                type="button"
                onClick={() => navigate("/teacher/my-events")}
                disabled={busy}
                className="btn btn-ghost btn-sm"
              >
                Cancel
              </button>
            ) : (
              <button
                type="button"
                onClick={handleBack}
                disabled={busy}
                className="btn btn-ghost btn-sm"
              >
                <IconArrowLeft />
                Back
              </button>
            )}

            <div className="ml-auto flex min-w-0 items-center gap-2 sm:gap-3">
              {!resubmitting && (
                <button
                  type="button"
                  onClick={handleSaveDraft}
                  disabled={busy || uploading}
                  className="btn btn-ghost btn-sm"
                  aria-label={savingDraft ? "Saving draft" : "Save draft"}
                >
                  {savingDraft ? <span className="spin h-4 w-4" /> : <IconBookmark />}
                  <span className="hidden sm:inline">
                    {savingDraft ? "Saving Draft…" : "Save Draft"}
                  </span>
                </button>
              )}

              {/* Distinct keys matter: with one key React would reuse a single
                  DOM button and only swap its type, which is what let a click
                  on "Next" fall through into a form submit. */}
              {step < STEPS.length ? (
                <button
                  key="wizard-next"
                  type="button"
                  onClick={handleNext}
                  disabled={busy}
                  className="btn btn-primary btn-sm"
                >
                  <span className="sm:hidden">Next</span>
                  <span className="hidden sm:inline">Next: {STEPS[step].label}</span>
                  <IconArrowRight />
                </button>
              ) : (
                <button
                  key="wizard-submit"
                  type="submit"
                  disabled={busy || uploading}
                  className="btn btn-primary btn-sm"
                >
                  {loading && <span className="spin h-4 w-4" />}
                  <span className="sm:hidden">
                    {loading ? "Sending…" : uploading ? "Uploading…" : resubmitting ? "Resubmit" : "Submit"}
                  </span>
                  <span className="hidden sm:inline">
                    {loading
                      ? resubmitting
                        ? "Resubmitting…"
                        : "Submitting…"
                      : uploading
                      ? "Waiting for uploads…"
                      : resubmitting
                      ? "Update & Resubmit for Approval"
                      : "Submit for Approval"}
                  </span>
                </button>
              )}
            </div>
          </div>
        </form>

      </div>

      {/* Confirmation that the draft is stored. A dialog, not a banner: it is
          centred wherever the page happens to be scrolled, and it names the
          two ways out instead of leaving the teacher on a form they have
          already saved. */}
      <Modal
        open={Boolean(draftSaved)}
        onClose={() => setDraftSaved(null)}
        eyebrow="Draft saved"
        title="Your event is saved as a draft"
        subtitle="Nothing has been sent to the Dean yet."
        footer={
          <>
            <button
              type="button"
              onClick={() => setDraftSaved(null)}
              className="btn btn-ghost"
            >
              Keep editing
            </button>
            <Link to="/teacher/my-events?filter=draft" className="btn btn-primary">
              Go to My Events
              <IconArrowRight />
            </Link>
          </>
        }
      >
        <div className="flex items-start gap-3">
          <IconCheckCircle className="mt-0.5 h-5 w-5 shrink-0 text-ok" />
          <div className="min-w-0">
            <p className="text-sm font-medium text-ink">
              “{formData.eventName.trim() || "Untitled event"}” has been saved.
            </p>

            {/* The distinction matters: a browser draft is the one that does
                not follow the teacher to another machine. */}
            <p className="prose-muted mt-1.5 text-sm">
              {draftSaved?.where === "server"
                ? "It is stored on your Campus Capture account, with any files you have already uploaded. Pick it up from My Events whenever you like, on any device."
                : "It is kept in this browser until the required details are filled in, so nothing you have typed is lost. Complete the event details to store it on your account."}
            </p>

            <p className="prose-muted mt-3 text-xs">
              Submit it for Dean approval from the last step when it is ready.
            </p>
          </div>
        </div>
      </Modal>

      {/* -------------------------------------------------- 1. are you sure?
          Nothing has been sent while this is open. Cancel (or Escape, or a
          click outside) returns to the form with every field as it was. */}
      <Modal
        open={confirmOpen}
        onClose={cancelSubmit}
        eyebrow="Confirm"
        title={
          resubmitting
            ? "Are you sure you want to resubmit this event?"
            : "Are you sure you want to submit this event?"
        }
        subtitle="It will be sent to the Dean for approval."
        footer={
          <>
            <button
              type="button"
              onClick={cancelSubmit}
              disabled={loading}
              className="btn btn-ghost btn-sm"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={confirmSubmit}
              disabled={loading}
              className="btn btn-primary btn-sm"
              autoFocus
            >
              {loading ? <span className="spin h-4 w-4" /> : <IconCheck />}
              {loading
                ? resubmitting
                  ? "Resubmitting…"
                  : "Submitting…"
                : resubmitting
                ? "Confirm & resubmit"
                : "Confirm & submit"}
            </button>
          </>
        }
      >
        {/* What is about to go out, so the teacher confirms this event and
            not merely "an event". */}
        <dl className="grid gap-x-6 gap-y-3 rounded-xl border hairline bg-raised/40 p-4 sm:grid-cols-2">
          {[
            ["Event", formData.eventName.trim() || "Untitled event"],
            ["Type", formData.eventType || "Not set"],
            ["Date", formatSummaryDate(formData.eventDate)],
            ["Venue", formData.location.trim() || "Not set"],
          ].map(([label, value]) => (
            <div key={label} className="min-w-0">
              <dt className="text-[11px] font-semibold uppercase tracking-[.12em] text-muted">
                {label}
              </dt>
              <dd className="mt-0.5 truncate text-sm font-medium text-ink" title={value}>
                {value}
              </dd>
            </div>
          ))}
        </dl>

        <p className="prose-muted mt-3 text-xs">
          {photos.length} photo{photos.length === 1 ? "" : "s"} · {videos.length} video
          {videos.length === 1 ? "" : "s"} · {documentItems.length} document
          {documentItems.length === 1 ? "" : "s"} attached. You can still edit the
          event until the Dean approves it.
        </p>

        {confirmError && (
          <div
            className="mt-4 flex items-start gap-2.5 rounded-xl border px-3.5 py-3"
            data-tint=""
            style={{ "--track": trackOf("rejected") }}
            role="alert"
          >
            <IconAlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-err" />
            <p className="text-sm text-ink">
              {confirmError} Nothing was submitted — try again, or cancel to keep editing.
            </p>
          </div>
        )}
      </Modal>

      {/* ---------------------------------------------------- 2. submitted
          Shown only once the server has accepted it, with the status the
          server gave it, so "pending" here is the real state, not a guess. */}
      <Modal
        open={Boolean(submitted)}
        onClose={finishSubmission}
        eyebrow={resubmitting ? "Resubmitted" : "Submitted"}
        title={
          resubmitting
            ? "Event resubmitted successfully!"
            : "Event submitted successfully!"
        }
        subtitle="It is now with the Dean for approval."
        footer={
          <>
            {submitted?.id && (
              <Link
                to={`/teacher/events/${submitted.id}`}
                onClick={() => setSubmitted(null)}
                className="btn btn-ghost btn-sm"
              >
                View event
              </Link>
            )}
            <button type="button" onClick={finishSubmission} className="btn btn-primary btn-sm">
              Go to My Events
              <IconArrowRight />
            </button>
          </>
        }
      >
        <div className="flex items-start gap-3">
          <span
            className="icon-tile icon-tile-track shrink-0"
            style={{ "--track": trackOf("approved") }}
          >
            <IconCheckCircle />
          </span>

          <div className="min-w-0">
            <p className="font-display text-sm font-semibold text-ink">
              “{submitted?.event_name || formData.eventName.trim() || "Your event"}”
            </p>

            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted">
              Status:
              <StatusChip status={submitted?.status || "pending"} />
              <span>— submitted for Dean approval</span>
            </div>

            <p className="prose-muted mt-3 text-sm">
              You will get a notification when the Dean approves it or asks for
              changes, and every step appears in the event’s progress history.
            </p>
          </div>
        </div>
      </Modal>
    </TeacherShell>
  );
}

export default CreateEvent;
