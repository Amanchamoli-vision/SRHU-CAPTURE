import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "../../services/supabase";
import srhuLogo from "../../assets/logo.png";
import {
  getTeacherDraftById,
  saveTeacherDraft,
  deleteTeacherDraft,
  encodeEventMetadata,
  decodeEventMetadata,
} from "../../utils/draftStorage";
import NotificationBell from "../../components/NotificationBell";

/* ============ Inline icons (no external icon library needed) ============ */
const IconLogout = ({ className = "h-4 w-4" }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M15 3h3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-3" />
    <path d="M10 17l5-5-5-5" />
    <path d="M15 12H3" />
  </svg>
);
const IconGrid = ({ className = "h-[18px] w-[18px]" }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
    <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
    <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
    <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
  </svg>
);
const IconPlus = ({ className = "h-4 w-4" }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);
const IconList = ({ className = "h-[18px] w-[18px]" }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <rect x="5" y="4" width="14" height="17" rx="2" />
    <path d="M9 3.5h6a1 1 0 0 1 1 1V6H8V4.5a1 1 0 0 1 1-1Z" />
    <path d="M9 12h6M9 16h6M9 8.5h2" />
  </svg>
);
const IconArrowLeft = ({ className = "h-4 w-4" }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M19 12H5M11 6l-6 6 6 6" />
  </svg>
);
const IconCheckCircle = ({ className = "h-5 w-5" }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M8.5 12.2l2.4 2.4 4.6-5" />
  </svg>
);
const IconAlertTriangle = ({ className = "h-5 w-5" }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M12 3.5 21.5 20h-19L12 3.5Z" />
    <path d="M12 9.5v4.5M12 17h.01" />
  </svg>
);
const IconImagePlus = ({ className = "h-4 w-4" }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
    <circle cx="9" cy="10" r="1.75" />
    <path d="M20.5 15.5 15.5 11l-9 8" />
  </svg>
);
const IconFilePlus = ({ className = "h-4 w-4" }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M7 3.5h7l4 4v13a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 6 20.5v-15A1.5 1.5 0 0 1 7 3.5Z" />
    <path d="M14 3.5V8h4" />
    <path d="M12 12v5M9.5 14.5h5" />
  </svg>
);
const IconX = ({ className = "h-4 w-4" }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);
const IconBookmark = ({ className = "h-4 w-4" }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
  </svg>
);
const IconInfo = ({ className = "h-5 w-5" }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 11v5.5M12 7.75h.01" />
  </svg>
);

function CreateEvent() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const draftIdParam = searchParams.get("draftId");
  const editEventIdParam = searchParams.get("editEventId");

  const fileInputRef = useRef(null);
  const documentInputRef = useRef(null);

  const [formData, setFormData] = useState({
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
  });

  const [mediaFiles, setMediaFiles] = useState([]);
  const [documentFiles, setDocumentFiles] = useState([]);

  const [currentUser, setCurrentUser] = useState(null);
  const [editingDraftId, setEditingDraftId] = useState(draftIdParam || null);
  const [editingEvent, setEditingEvent] = useState(null); // When editing rejected event

  const [loading, setLoading] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // --------------------------------------------------
  // Load User & Pre-populate Draft or Rejected Event
  // --------------------------------------------------
  useEffect(() => {
    async function initUserAndData() {
      try {
        const {
          data: { user },
          error: authError,
        } = await supabase.auth.getUser();

        if (authError || !user) {
          navigate("/login");
          return;
        }

        setCurrentUser(user);

        // 1. If editing an existing local draft
        if (draftIdParam) {
          const draft = getTeacherDraftById(user.id, draftIdParam);
          if (draft) {
            setEditingDraftId(draft.id);
            setFormData({
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
            });
          }
        }

        // 2. If editing a rejected event to resubmit
        if (editEventIdParam) {
          const { data: event, error: eventErr } = await supabase
            .from("events")
            .select("*")
            .eq("id", editEventIdParam)
            .eq("teacher_id", user.id)
            .single();

          if (!eventErr && event) {
            setEditingEvent(event);
            const { description, meta } = decodeEventMetadata(event.description);
            setFormData({
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
            });
          }
        }
      } catch (err) {
        console.error("Init CreateEvent error:", err);
      }
    }

    initUserAndData();
  }, [draftIdParam, editEventIdParam, navigate]);

  // --------------------------------------------------
  // Form Change
  // --------------------------------------------------
  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  // --------------------------------------------------
  // Media Selection & Validation (Max 10MB)
  // --------------------------------------------------
  const MAX_MEDIA_SIZE = 10 * 1024 * 1024; // 10MB

  const handleMediaChange = (e) => {
    const rawFiles = Array.from(e.target.files || []);
    const validFiles = [];
    const rejectedErrors = [];

    for (const file of rawFiles) {
      const isImageOrVideo =
        file.type.startsWith("image/") || file.type.startsWith("video/");

      if (!isImageOrVideo) {
        rejectedErrors.push(
          `"${file.name}" is not a valid image or video file.`
        );
        continue;
      }

      if (file.size > MAX_MEDIA_SIZE) {
        rejectedErrors.push(`"${file.name}" exceeds the 10MB limit.`);
        continue;
      }

      validFiles.push(file);
    }

    if (rejectedErrors.length > 0) {
      setError(rejectedErrors.join(" "));
    }

    if (validFiles.length > 0) {
      setMediaFiles((prev) => [...prev, ...validFiles]);
    }

    e.target.value = "";
  };

  const removeMediaFile = (index) => {
    setMediaFiles((prev) => prev.filter((_, i) => i !== index));
  };

  // --------------------------------------------------
  // Document Selection & Validation (Max 25MB)
  // --------------------------------------------------
  const MAX_DOC_SIZE = 25 * 1024 * 1024; // 25MB
  const ALLOWED_DOC_EXTENSIONS = [
    "pdf",
    "doc",
    "docx",
    "xls",
    "xlsx",
    "ppt",
    "pptx",
    "txt",
    "csv",
  ];

  const handleDocumentChange = (e) => {
    const rawFiles = Array.from(e.target.files || []);
    const validFiles = [];
    const rejectedErrors = [];

    for (const file of rawFiles) {
      const ext = file.name.split(".").pop()?.toLowerCase();
      const isValidExt = ext && ALLOWED_DOC_EXTENSIONS.includes(ext);

      if (!isValidExt) {
        rejectedErrors.push(
          `"${file.name}" is not a supported document type (allowed: PDF, DOC, DOCX, XLS, XLSX, PPT, PPTX, TXT, CSV).`
        );
        continue;
      }

      if (file.size > MAX_DOC_SIZE) {
        rejectedErrors.push(`"${file.name}" exceeds the 25MB limit.`);
        continue;
      }

      validFiles.push(file);
    }

    if (rejectedErrors.length > 0) {
      setError(rejectedErrors.join(" "));
    }

    if (validFiles.length > 0) {
      setDocumentFiles((prev) => [...prev, ...validFiles]);
    }

    e.target.value = "";
  };

  const removeDocumentFile = (index) => {
    setDocumentFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const formatFileSize = (bytes) => {
    if (!bytes) return "0 KB";
    const kb = bytes / 1024;
    if (kb < 1024) return `${kb.toFixed(1)} KB`;
    const mb = kb / 1024;
    return `${mb.toFixed(1)} MB`;
  };

  const getFileExtension = (fileName) => {
    const parts = fileName.split(".");
    if (parts.length <= 1) return "FILE";
    return parts.pop().toUpperCase();
  };

  // --------------------------------------------------
  // Upload Media Helper
  // --------------------------------------------------
  const uploadMediaFiles = async (userId, eventId, accumulator = []) => {
    for (const file of mediaFiles) {
      const safeFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const uniqueFileName = `${Date.now()}-${Math.random().toString(36).substring(2, 8)}-${safeFileName}`;
      const filePath = `${userId}/${eventId}/${uniqueFileName}`;

      const { error: uploadError } = await supabase.storage
        .from("event-media")
        .upload(filePath, file, {
          cacheControl: "3600",
          upsert: false,
        });

      if (uploadError) {
        throw new Error(`Failed to upload ${file.name}: ${uploadError.message}`);
      }

      const tracker = { storagePath: filePath, databaseId: null };
      accumulator.push(tracker);

      const { data: publicUrlData } = supabase.storage
        .from("event-media")
        .getPublicUrl(filePath);

      const mediaType = file.type.startsWith("video/") ? "video" : "image";

      const mediaRecord = {
        event_id: eventId,
        media_url: publicUrlData.publicUrl,
        media_type: mediaType,
        cloudinary_public_id: null,
      };

      const { data: insertedMedia, error: mediaInsertError } = await supabase
        .from("event_media")
        .insert(mediaRecord)
        .select()
        .single();

      if (mediaInsertError) {
        throw new Error(`Failed to save media record for ${file.name}: ${mediaInsertError.message}`);
      }

      tracker.databaseId = insertedMedia.id;
    }

    return accumulator;
  };

  // --------------------------------------------------
  // Upload Documents Helper
  // --------------------------------------------------
  const uploadDocumentFiles = async (userId, eventId, accumulator = []) => {
    for (const file of documentFiles) {
      const safeFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const uniqueFileName = `${Date.now()}-${Math.random().toString(36).substring(2, 8)}-${safeFileName}`;
      const filePath = `${userId}/${eventId}/${uniqueFileName}`;

      const { error: uploadError } = await supabase.storage
        .from("event-documents")
        .upload(filePath, file, {
          cacheControl: "3600",
          upsert: false,
          contentType: file.type || undefined,
        });

      if (uploadError) {
        throw new Error(`Failed to upload ${file.name}: ${uploadError.message}`);
      }

      const tracker = { storagePath: filePath, databaseId: null };
      accumulator.push(tracker);

      const { data: publicUrlData } = supabase.storage
        .from("event-documents")
        .getPublicUrl(filePath);

      const documentRecord = {
        event_id: eventId,
        file_name: file.name,
        file_url: publicUrlData.publicUrl,
        file_type: file.type || null,
        file_size: file.size || null,
      };

      const { data: insertedDocument, error: documentInsertError } = await supabase
        .from("event_documents")
        .insert(documentRecord)
        .select()
        .single();

      if (documentInsertError) {
        throw new Error(`Failed to save document record for ${file.name}: ${documentInsertError.message}`);
      }

      tracker.databaseId = insertedDocument.id;
    }

    return accumulator;
  };

  // --------------------------------------------------
  // Rollback on Failure
  // --------------------------------------------------
  const rollbackSubmission = async ({ eventId, mediaUploads = [], documentUploads = [] }) => {
    for (const media of mediaUploads) {
      if (media.databaseId) {
        try {
          await supabase.from("event_media").delete().eq("id", media.databaseId);
        } catch (e) {
          console.error("Rollback media DB error:", e);
        }
      }
    }

    if (mediaUploads.length > 0) {
      const paths = mediaUploads.map((item) => item.storagePath).filter(Boolean);
      if (paths.length > 0) {
        try {
          await supabase.storage.from("event-media").remove(paths);
        } catch (e) {
          console.error("Rollback media storage error:", e);
        }
      }
    }

    for (const document of documentUploads) {
      if (document.databaseId) {
        try {
          await supabase.from("event_documents").delete().eq("id", document.databaseId);
        } catch (e) {
          console.error("Rollback doc DB error:", e);
        }
      }
    }

    if (documentUploads.length > 0) {
      const paths = documentUploads.map((item) => item.storagePath).filter(Boolean);
      if (paths.length > 0) {
        try {
          await supabase.storage.from("event-documents").remove(paths);
        } catch (e) {
          console.error("Rollback doc storage error:", e);
        }
      }
    }

    // Only delete new events (not existing rejected events that were being resubmitted)
    if (eventId && !editingEvent) {
      try {
        await supabase.from("events").delete().eq("id", eventId);
      } catch (e) {
        console.error("Rollback event error:", e);
      }
    }
  };

  // --------------------------------------------------
  // Action 1: Save Draft (Allows partial/incomplete data)
  // --------------------------------------------------
  const handleSaveDraft = () => {
    setError("");
    setSuccess("");

    if (!currentUser) {
      setError("Please log in to save drafts.");
      return;
    }

    setSavingDraft(true);
    try {
      const saved = saveTeacherDraft(currentUser.id, {
        id: editingDraftId || undefined,
        ...formData,
        mediaFiles,
        documentFiles,
      });

      setEditingDraftId(saved.id);
      setSuccess("Draft saved successfully. You can continue editing anytime from My Events.");
      setTimeout(() => {
        setSuccess("");
      }, 4000);
    } catch (err) {
      console.error("Save draft error:", err);
      setError("Failed to save draft. Please try again.");
    } finally {
      setSavingDraft(false);
    }
  };

  // --------------------------------------------------
  // Action 2: Submit / Resubmit for Approval
  // --------------------------------------------------
  const handleSubmit = async (e) => {
    e.preventDefault();

    if (loading || savingDraft) return;

    setError("");
    setSuccess("");

    let targetEventId = null;
    let currentUserId = null;
    let mediaUploads = [];
    let documentUploads = [];

    // --- Strict Field Validation for Submission ---
    if (!formData.eventName.trim()) {
      setError("Please enter the event name.");
      return;
    }
    if (!formData.eventDate) {
      setError("Please select the event date.");
      return;
    }
    if (!formData.eventType) {
      setError("Please select the event type.");
      return;
    }
    if (!formData.startTime.trim()) {
      setError("Please specify the event start time.");
      return;
    }
    if (!formData.endTime.trim()) {
      setError("Please specify the event end time.");
      return;
    }
    if (!formData.location.trim()) {
      setError("Please enter the venue / location.");
      return;
    }
    if (!formData.department.trim()) {
      setError("Please specify the host department or school.");
      return;
    }
    if (!formData.organizer.trim()) {
      setError("Please enter the organizer or faculty coordinator name.");
      return;
    }
    if (!formData.contactInfo.trim()) {
      setError("Please provide organizer contact information (email or phone).");
      return;
    }
    if (!formData.description.trim()) {
      setError("Please provide a description for the event.");
      return;
    }

    // Social URL validation (optional)
    if (formData.socialNetworkUrl.trim()) {
      try {
        const url = new URL(formData.socialNetworkUrl.trim());
        if (url.protocol !== "http:" && url.protocol !== "https:") {
          setError("Please enter a valid social network URL starting with http:// or https://");
          return;
        }
      } catch {
        setError("Please enter a valid social network URL.");
        return;
      }
    }

    setLoading(true);

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        throw new Error("Your session has expired. Please log in again.");
      }

      currentUserId = user.id;

      // Encode extended metadata cleanly into description
      const fullDescription = encodeEventMetadata(formData.description, {
        startTime: formData.startTime,
        endTime: formData.endTime,
        department: formData.department,
        organizer: formData.organizer,
        expectedParticipants: formData.expectedParticipants,
        contactInfo: formData.contactInfo,
      });

      if (editingEvent) {
        // --- RESUBMISSION OF REJECTED EVENT ---
        const { error: updateError } = await supabase
          .from("events")
          .update({
            event_name: formData.eventName.trim(),
            event_date: formData.eventDate,
            event_type: formData.eventType,
            location: formData.location.trim(),
            description: fullDescription,
            social_network_url: formData.socialNetworkUrl.trim() || null,
            status: "pending",
            rejection_reason: null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", editingEvent.id)
          .eq("teacher_id", user.id);

        if (updateError) {
          throw new Error(updateError.message || "Failed to resubmit event.");
        }

        targetEventId = editingEvent.id;
      } else {
        // --- NEW EVENT CREATION ---
        const eventData = {
          teacher_id: user.id,
          event_name: formData.eventName.trim(),
          event_date: formData.eventDate,
          event_type: formData.eventType,
          location: formData.location.trim(),
          description: fullDescription,
          social_network_url: formData.socialNetworkUrl.trim() || null,
          status: "pending", // Initial submission status for Dean review
        };

        const { data: event, error: eventError } = await supabase
          .from("events")
          .insert(eventData)
          .select()
          .single();

        if (eventError) {
          throw new Error(eventError.message || "Failed to create event.");
        }

        targetEventId = event.id;
      }

      // Upload Media
      if (mediaFiles.length > 0) {
        await uploadMediaFiles(currentUserId, targetEventId, mediaUploads);
      }

      // Upload Documents
      if (documentFiles.length > 0) {
        await uploadDocumentFiles(currentUserId, targetEventId, documentUploads);
      }

      // If this was an existing local draft, remove it from draft storage now
      if (editingDraftId) {
        deleteTeacherDraft(user.id, editingDraftId);
      }

      setSuccess(
        editingEvent
          ? "Event resubmitted successfully! It is now pending Dean approval."
          : "Event submitted successfully for Dean approval."
      );

      // Redirect to My Events after a short delay
      setTimeout(() => {
        navigate("/teacher/my-events?filter=submitted");
      }, 1500);
    } catch (err) {
      console.error("Create / Resubmit event error:", err);

      if (targetEventId && !editingEvent) {
        await rollbackSubmission({
          eventId: targetEventId,
          mediaUploads,
          documentUploads,
        });
      }

      setError(err?.message || "Something went wrong while submitting the event.");
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/login", { replace: true });
  };

  return (
    <div className="min-h-screen bg-[#F3F5F9]">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:wght@500;600;700&display=swap');
        .font-display { font-family: 'Fraunces', ui-serif, Georgia, 'Times New Roman', serif; }
        @keyframes ccFadeUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>

      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white">
        <div className="flex h-[76px] items-center justify-between px-6">
          <Link to="/teacher/dashboard" className="flex items-center gap-3.5">
            <img
              src={srhuLogo}
              alt="Swami Rama Himalayan University"
              className="h-12 sm:h-14 w-auto object-contain shrink-0"
            />
            <div>
              <h1 className="font-display text-lg font-semibold leading-tight text-[#101A33]">
                Campus Capture
              </h1>
              <p className="text-xs font-medium text-slate-400">
                Swami Rama Himalayan University
              </p>
            </div>
          </Link>

          <div className="flex items-center gap-3">
            <div className="relative">
              <NotificationBell currentUser={currentUser ? { id: currentUser.id } : null} />
            </div>

            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium text-slate-500 transition hover:bg-slate-50 hover:text-slate-900"
            >
              <IconLogout />
              <span className="hidden sm:inline">Logout</span>
            </button>
          </div>
        </div>
      </header>

      <div className="flex">
        {/* Sidebar */}
        <aside className="sticky top-[76px] hidden h-[calc(100vh-76px)] w-64 shrink-0 flex-col bg-gradient-to-b from-[#101A33] to-[#1B2748] px-4 py-6 md:flex">
          <nav className="space-y-1.5">
            <Link
              to="/teacher/dashboard"
              className="flex items-center gap-3 rounded-lg border-l-[3px] border-transparent px-4 py-3 text-sm font-medium text-slate-300 transition hover:bg-white/5 hover:text-white"
            >
              <IconGrid />
              Dashboard
            </Link>

            <Link
              to="/teacher/create-event"
              className="flex items-center gap-3 rounded-lg border-l-[3px] border-[#D4AF6A] bg-white/10 px-4 py-3 text-sm font-semibold text-white"
            >
              <IconPlus className="h-[18px] w-[18px]" />
              Create Event
            </Link>

            <Link
              to="/teacher/my-events"
              className="flex items-center gap-3 rounded-lg border-l-[3px] border-transparent px-4 py-3 text-sm font-medium text-slate-300 transition hover:bg-white/5 hover:text-white"
            >
              <IconList />
              My Events
            </Link>
          </nav>

          <div className="mt-auto rounded-xl border border-white/10 bg-white/5 p-4">
            <p className="text-xs leading-relaxed text-slate-300">
              Save drafts anytime to finish later, or submit directly for Dean review.
            </p>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 px-5 py-8 lg:px-10">
          <div className="mx-auto max-w-5xl">
            {/* Back link */}
            <Link
              to="/teacher/dashboard"
              className="mb-5 inline-flex items-center gap-1.5 text-sm font-semibold text-[#101A33] transition hover:text-[#c79a54]"
            >
              <IconArrowLeft />
              Back to Dashboard
            </Link>

            {/* Hero Banner */}
            <div
              style={{ animation: "ccFadeUp 0.5s ease-out both" }}
              className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#101A33] via-[#182449] to-[#1B2748] p-7 sm:p-9"
            >
              <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full border border-white/10"></div>
              <div className="pointer-events-none absolute -right-6 -top-6 h-40 w-40 rounded-full border border-[#D4AF6A]/20"></div>

              <p className="relative text-xs font-semibold uppercase tracking-[0.14em] text-[#D4AF6A]">
                {editingEvent ? "Resubmission" : editingDraftId ? "Draft Mode" : "New Proposal"}
              </p>
              <h2 className="font-display relative mt-2 text-3xl font-semibold text-white sm:text-4xl">
                {editingEvent
                  ? "Edit & Resubmit Event"
                  : editingDraftId
                  ? "Edit Event Draft"
                  : "Create Event"}
              </h2>
              <p className="relative mt-2 max-w-lg text-sm text-slate-300">
                {editingEvent
                  ? "Update rejected event details as advised by the Dean, then resubmit for approval."
                  : editingDraftId
                  ? "Resume and edit your saved draft. You can save updates or submit for approval."
                  : "Submit event details for Dean approval or save as a draft to finish later."}
              </p>
            </div>

            {/* Editing Rejected Event Callout */}
            {editingEvent && (
              <div className="mt-6 rounded-2xl border border-rose-200 bg-rose-50 p-5">
                <div className="flex items-start gap-3">
                  <IconAlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-rose-600" />
                  <div>
                    <h3 className="text-sm font-semibold text-rose-900">
                      Dean's Rejection Feedback
                    </h3>
                    <p className="mt-1 text-sm text-rose-700">
                      {editingEvent.rejection_reason || "No explicit rejection reason provided."}
                    </p>
                    <p className="mt-2 text-xs font-medium text-rose-600">
                      Update the event details below to resolve this feedback, then click "Update & Resubmit for Approval".
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Editing Draft Callout */}
            {editingDraftId && !editingEvent && (
              <div className="mt-6 flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50 p-4">
                <div className="flex items-center gap-3">
                  <IconBookmark className="h-5 w-5 shrink-0 text-amber-600" />
                  <p className="text-sm text-amber-800">
                    You are editing a saved draft. Changes will update your draft until submitted.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleSaveDraft}
                  disabled={savingDraft}
                  className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-800 transition hover:bg-amber-100"
                >
                  {savingDraft ? "Saving..." : "Quick Save"}
                </button>
              </div>
            )}

            {/* Success Alert */}
            {success && (
              <div className="mt-6 flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                <IconCheckCircle className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" />
                <p className="text-sm font-medium text-emerald-700">{success}</p>
              </div>
            )}

            {/* Error Alert */}
            {error && (
              <div className="mt-6 flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4">
                <IconAlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-rose-500" />
                <p className="text-sm font-medium text-rose-700">{error}</p>
              </div>
            )}

            {/* Form */}
            <form
              onSubmit={handleSubmit}
              className="mt-6 overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-md"
            >
              {/* Event Information Section */}
              <div className="border-b border-slate-100 px-6 py-5 sm:px-8">
                <h3 className="font-display text-lg font-semibold text-slate-900">
                  Event Information
                </h3>
                <p className="mt-0.5 text-sm text-slate-500">
                  Provide core event details. All marked (<span className="text-rose-500">*</span>) fields are required for submission.
                </p>
              </div>

              <div className="space-y-6 px-6 py-7 sm:px-8">
                {/* Event Name */}
                <div>
                  <label htmlFor="eventName" className="mb-2 block text-sm font-medium text-slate-700">
                    Event Name
                    <span className="ml-1 text-rose-500">*</span>
                  </label>
                  <input
                    id="eventName"
                    name="eventName"
                    type="text"
                    value={formData.eventName}
                    onChange={handleChange}
                    placeholder="e.g. National Science Day Symposium 2026"
                    disabled={loading || savingDraft}
                    className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-[#101A33] focus:ring-2 focus:ring-[#101A33]/15 disabled:bg-slate-100"
                  />
                </div>

                {/* Date + Type */}
                <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                  <div>
                    <label htmlFor="eventDate" className="mb-2 block text-sm font-medium text-slate-700">
                      Event Date
                      <span className="ml-1 text-rose-500">*</span>
                    </label>
                    <input
                      id="eventDate"
                      name="eventDate"
                      type="date"
                      value={formData.eventDate}
                      onChange={handleChange}
                      disabled={loading || savingDraft}
                      className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-[#101A33] focus:ring-2 focus:ring-[#101A33]/15 disabled:bg-slate-100"
                    />
                  </div>

                  <div>
                    <label htmlFor="eventType" className="mb-2 block text-sm font-medium text-slate-700">
                      Event Type
                      <span className="ml-1 text-rose-500">*</span>
                    </label>
                    <select
                      id="eventType"
                      name="eventType"
                      value={formData.eventType}
                      onChange={handleChange}
                      disabled={loading || savingDraft}
                      className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-[#101A33] focus:ring-2 focus:ring-[#101A33]/15 disabled:bg-slate-100"
                    >
                      <option value="">Select event type</option>
                      <option value="Academic">Academic</option>
                      <option value="Cultural">Cultural</option>
                      <option value="Sports">Sports</option>
                      <option value="Workshop">Workshop</option>
                      <option value="Seminar">Seminar</option>
                      <option value="Conference">Conference</option>
                      <option value="Celebration">Celebration</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                </div>

                {/* Start Time + End Time */}
                <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                  <div>
                    <label htmlFor="startTime" className="mb-2 block text-sm font-medium text-slate-700">
                      Start Time
                      <span className="ml-1 text-rose-500">*</span>
                    </label>
                    <input
                      id="startTime"
                      name="startTime"
                      type="time"
                      value={formData.startTime}
                      onChange={handleChange}
                      disabled={loading || savingDraft}
                      className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-[#101A33] focus:ring-2 focus:ring-[#101A33]/15 disabled:bg-slate-100"
                    />
                  </div>

                  <div>
                    <label htmlFor="endTime" className="mb-2 block text-sm font-medium text-slate-700">
                      End Time
                      <span className="ml-1 text-rose-500">*</span>
                    </label>
                    <input
                      id="endTime"
                      name="endTime"
                      type="time"
                      value={formData.endTime}
                      onChange={handleChange}
                      disabled={loading || savingDraft}
                      className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-[#101A33] focus:ring-2 focus:ring-[#101A33]/15 disabled:bg-slate-100"
                    />
                  </div>
                </div>

                {/* Venue / Location */}
                <div>
                  <label htmlFor="location" className="mb-2 block text-sm font-medium text-slate-700">
                    Venue / Location
                    <span className="ml-1 text-rose-500">*</span>
                  </label>
                  <input
                    id="location"
                    name="location"
                    type="text"
                    value={formData.location}
                    onChange={handleChange}
                    placeholder="e.g. Auditorium Hall B, Medical College Block"
                    disabled={loading || savingDraft}
                    className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-[#101A33] focus:ring-2 focus:ring-[#101A33]/15 disabled:bg-slate-100"
                  />
                </div>

                {/* Department & Expected Participants */}
                <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                  <div>
                    <label htmlFor="department" className="mb-2 block text-sm font-medium text-slate-700">
                      Host Department / School
                      <span className="ml-1 text-rose-500">*</span>
                    </label>
                    <input
                      id="department"
                      name="department"
                      type="text"
                      value={formData.department}
                      onChange={handleChange}
                      placeholder="e.g. Department of Computer Science & Engineering"
                      disabled={loading || savingDraft}
                      className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-[#101A33] focus:ring-2 focus:ring-[#101A33]/15 disabled:bg-slate-100"
                    />
                  </div>

                  <div>
                    <label htmlFor="expectedParticipants" className="mb-2 block text-sm font-medium text-slate-700">
                      Expected Participants
                      <span className="ml-2 font-normal text-slate-400">(Optional)</span>
                    </label>
                    <input
                      id="expectedParticipants"
                      name="expectedParticipants"
                      type="text"
                      value={formData.expectedParticipants}
                      onChange={handleChange}
                      placeholder="e.g. 150 Students & Faculty"
                      disabled={loading || savingDraft}
                      className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-[#101A33] focus:ring-2 focus:ring-[#101A33]/15 disabled:bg-slate-100"
                    />
                  </div>
                </div>

                {/* Organizer & Contact Info */}
                <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                  <div>
                    <label htmlFor="organizer" className="mb-2 block text-sm font-medium text-slate-700">
                      Organizer / Faculty Coordinator
                      <span className="ml-1 text-rose-500">*</span>
                    </label>
                    <input
                      id="organizer"
                      name="organizer"
                      type="text"
                      value={formData.organizer}
                      onChange={handleChange}
                      placeholder="e.g. Dr. Rajesh Sharma"
                      disabled={loading || savingDraft}
                      className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-[#101A33] focus:ring-2 focus:ring-[#101A33]/15 disabled:bg-slate-100"
                    />
                  </div>

                  <div>
                    <label htmlFor="contactInfo" className="mb-2 block text-sm font-medium text-slate-700">
                      Coordinator Contact Information
                      <span className="ml-1 text-rose-500">*</span>
                    </label>
                    <input
                      id="contactInfo"
                      name="contactInfo"
                      type="text"
                      value={formData.contactInfo}
                      onChange={handleChange}
                      placeholder="e.g. coordinator@srhu.edu.in / +91 9876543210"
                      disabled={loading || savingDraft}
                      className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-[#101A33] focus:ring-2 focus:ring-[#101A33]/15 disabled:bg-slate-100"
                    />
                  </div>
                </div>

                {/* Description */}
                <div>
                  <label htmlFor="description" className="mb-2 block text-sm font-medium text-slate-700">
                    Event Description
                    <span className="ml-1 text-rose-500">*</span>
                  </label>
                  <textarea
                    id="description"
                    name="description"
                    rows="5"
                    value={formData.description}
                    onChange={handleChange}
                    placeholder="Describe event objectives, agenda, keynote speakers, target audience, and expected outcomes..."
                    disabled={loading || savingDraft}
                    className="w-full resize-none rounded-lg border border-slate-300 px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-[#101A33] focus:ring-2 focus:ring-[#101A33]/15 disabled:bg-slate-100"
                  />
                </div>

                {/* Social Network Link */}
                <div>
                  <label htmlFor="socialNetworkUrl" className="mb-2 block text-sm font-medium text-slate-700">
                    Social Network Link
                    <span className="ml-2 font-normal text-slate-400">(Optional)</span>
                  </label>
                  <input
                    id="socialNetworkUrl"
                    name="socialNetworkUrl"
                    type="url"
                    value={formData.socialNetworkUrl}
                    onChange={handleChange}
                    placeholder="https://instagram.com/srhu_official"
                    disabled={loading || savingDraft}
                    className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-[#101A33] focus:ring-2 focus:ring-[#101A33]/15 disabled:bg-slate-100"
                  />
                  <p className="mt-2 text-xs text-slate-500">
                    You can add an Instagram, LinkedIn, YouTube, X/Twitter, or Facebook link.
                  </p>
                </div>
              </div>

              {/* Photos & Videos */}
              <div className="border-t border-slate-100 px-6 py-7 sm:px-8">
                <h3 className="font-display text-lg font-semibold text-slate-900">
                  Photos & Videos
                </h3>
                <p className="mt-0.5 text-sm text-slate-500">
                  Upload photos, posters, banners, or teaser videos (Max 10MB each).
                </p>

                <div className="mt-5">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*,video/*"
                    multiple
                    onChange={handleMediaChange}
                    className="hidden"
                    disabled={loading || savingDraft}
                  />

                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={loading || savingDraft}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-slate-300 px-5 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:bg-slate-100 sm:w-auto"
                  >
                    <IconImagePlus />
                    Add Photos / Videos
                  </button>
                </div>

                {mediaFiles.length > 0 && (
                  <div className="mt-5 space-y-2.5">
                    {mediaFiles.map((file, index) => (
                      <div
                        key={`${file.name}-${index}`}
                        className="flex items-center justify-between gap-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-slate-800">{file.name}</p>
                          <p className="mt-0.5 text-xs text-slate-500">
                            {file.type.startsWith("video/") ? "Video" : "Image"} • {formatFileSize(file.size)}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeMediaFile(index)}
                          disabled={loading || savingDraft}
                          className="flex shrink-0 items-center gap-1 text-sm font-medium text-rose-600 transition hover:text-rose-700"
                        >
                          <IconX className="h-3.5 w-3.5" />
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Supporting Documents */}
              <div className="border-t border-slate-100 px-6 py-7 sm:px-8">
                <h3 className="font-display text-lg font-semibold text-slate-900">
                  Supporting Documents
                </h3>
                <p className="mt-0.5 text-sm text-slate-500">
                  Upload PDF, Word, Excel, or presentation files (Max 25MB each).
                </p>

                <div className="mt-5">
                  <input
                    ref={documentInputRef}
                    type="file"
                    multiple
                    accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv"
                    onChange={handleDocumentChange}
                    className="hidden"
                    disabled={loading || savingDraft}
                  />

                  <button
                    type="button"
                    onClick={() => documentInputRef.current?.click()}
                    disabled={loading || savingDraft}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-slate-300 px-5 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:bg-slate-100 sm:w-auto"
                  >
                    <IconFilePlus />
                    Add Documents
                  </button>
                </div>

                {documentFiles.length > 0 && (
                  <div className="mt-5 space-y-2.5">
                    {documentFiles.map((file, index) => (
                      <div
                        key={`${file.name}-${index}`}
                        className="flex items-center justify-between gap-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3"
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#101A33]/5">
                            <span className="text-xs font-bold text-[#101A33]">
                              {getFileExtension(file.name)}
                            </span>
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-slate-800">{file.name}</p>
                            <p className="mt-0.5 text-xs text-slate-500">
                              {formatFileSize(file.size)}
                            </p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeDocumentFile(index)}
                          disabled={loading || savingDraft}
                          className="flex shrink-0 items-center gap-1 text-sm font-medium text-rose-600 transition hover:text-rose-700"
                        >
                          <IconX className="h-3.5 w-3.5" />
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Submission Information Notice */}
              <div className="border-t border-slate-100 px-6 py-7 sm:px-8">
                <div className="flex items-start gap-3 rounded-xl border border-[#101A33]/10 bg-[#101A33]/5 p-4">
                  <IconInfo className="mt-0.5 h-5 w-5 shrink-0 text-[#101A33]" />
                  <p className="text-sm text-[#101A33]">
                    {editingEvent
                      ? "Resubmitting will set the event status back to Pending and notify the Dean for re-evaluation."
                      : "Once submitted, your event will enter the approval workflow and be reviewed by the Dean."}
                  </p>
                </div>
              </div>

              {/* Dual Action Buttons (Save Draft vs Submit for Approval) */}
              <div className="flex flex-col-reverse gap-3 border-t border-slate-100 px-6 py-6 sm:flex-row sm:items-center sm:justify-between sm:px-8">
                <button
                  type="button"
                  onClick={() => navigate("/teacher/my-events")}
                  disabled={loading || savingDraft}
                  className="w-full rounded-xl border border-slate-300 px-6 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:bg-slate-100 sm:w-auto"
                >
                  Cancel
                </button>

                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  {/* Save Draft Button (does not require all fields) */}
                  {!editingEvent && (
                    <button
                      type="button"
                      onClick={handleSaveDraft}
                      disabled={loading || savingDraft}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-xl border-2 border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 disabled:cursor-not-allowed disabled:bg-slate-100 sm:w-auto"
                    >
                      <IconBookmark className="h-4 w-4 text-slate-500" />
                      {savingDraft ? "Saving Draft..." : "Save Draft"}
                    </button>
                  )}

                  {/* Submit / Resubmit for Approval Button */}
                  <button
                    type="submit"
                    disabled={loading || savingDraft}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#101A33] px-6 py-3 text-sm font-semibold text-white shadow-md shadow-black/10 transition hover:bg-[#1B2748] disabled:cursor-not-allowed disabled:bg-slate-400 sm:w-auto"
                  >
                    {loading ? (
                      <>
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white"></span>
                        {editingEvent ? "Resubmitting..." : "Submitting..."}
                      </>
                    ) : editingEvent ? (
                      "Update & Resubmit for Approval"
                    ) : (
                      "Submit for Approval"
                    )}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </main>
      </div>
    </div>
  );
}

export default CreateEvent;