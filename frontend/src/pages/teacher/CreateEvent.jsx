import { useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../../services/supabase";

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
const IconInfo = ({ className = "h-5 w-5" }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 11v5.5M12 7.75h.01" />
  </svg>
);

function CreateEvent() {
  const navigate = useNavigate();

  const fileInputRef = useRef(null);
  const documentInputRef = useRef(null);

  const [formData, setFormData] = useState({
    eventName: "",
    eventDate: "",
    eventType: "",
    location: "",
    description: "",
    socialNetworkUrl: "",
  });

  const [mediaFiles, setMediaFiles] = useState([]);
  const [documentFiles, setDocumentFiles] = useState([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

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
  // Media Selection
  // --------------------------------------------------

  const handleMediaChange = (e) => {
    const files = Array.from(e.target.files || []);

    setMediaFiles((prev) => [...prev, ...files]);

    e.target.value = "";
  };

  const removeMediaFile = (index) => {
    setMediaFiles((prev) =>
      prev.filter((_, i) => i !== index)
    );
  };

  // --------------------------------------------------
  // Document Selection
  // --------------------------------------------------

  const handleDocumentChange = (e) => {
    const files = Array.from(e.target.files || []);

    setDocumentFiles((prev) => [
      ...prev,
      ...files,
    ]);

    e.target.value = "";
  };

  const removeDocumentFile = (index) => {
    setDocumentFiles((prev) =>
      prev.filter((_, i) => i !== index)
    );
  };

  // --------------------------------------------------
  // File Size
  // --------------------------------------------------

  const formatFileSize = (bytes) => {
    if (!bytes) return "0 KB";

    const kb = bytes / 1024;

    if (kb < 1024) {
      return `${kb.toFixed(1)} KB`;
    }

    const mb = kb / 1024;

    return `${mb.toFixed(1)} MB`;
  };

  // --------------------------------------------------
  // File Extension
  // --------------------------------------------------

  const getFileExtension = (fileName) => {
    const parts = fileName.split(".");

    if (parts.length <= 1) {
      return "FILE";
    }

    return parts.pop().toUpperCase();
  };

  // --------------------------------------------------
  // Upload Media
  // --------------------------------------------------

  const uploadMediaFiles = async (userId, eventId) => {
    const uploadedFiles = [];

    for (const file of mediaFiles) {
      const safeFileName = file.name.replace(
        /[^a-zA-Z0-9._-]/g,
        "_"
      );

      const uniqueFileName =
        `${Date.now()}-${Math.random()
          .toString(36)
          .substring(2, 8)}-${safeFileName}`;

      const filePath =
        `${userId}/${eventId}/${uniqueFileName}`;

      const { error: uploadError } =
        await supabase.storage
          .from("event-media")
          .upload(filePath, file, {
            cacheControl: "3600",
            upsert: false,
          });

      if (uploadError) {
        throw new Error(
          `Failed to upload ${file.name}: ${uploadError.message}`
        );
      }

      const {
        data: publicUrlData,
      } = supabase.storage
        .from("event-media")
        .getPublicUrl(filePath);

      const mediaType = file.type.startsWith("video/")
        ? "video"
        : "image";

      const mediaRecord = {
        event_id: eventId,
        media_url: publicUrlData.publicUrl,
        media_type: mediaType,
        cloudinary_public_id: null,
      };

      const {
        data: insertedMedia,
        error: mediaInsertError,
      } = await supabase
        .from("event_media")
        .insert(mediaRecord)
        .select()
        .single();

      if (mediaInsertError) {
        throw new Error(
          `Failed to save media information for ${file.name}: ${mediaInsertError.message}`
        );
      }

      uploadedFiles.push({
        storagePath: filePath,
        databaseId: insertedMedia.id,
      });
    }

    return uploadedFiles;
  };

  // --------------------------------------------------
  // Upload Documents
  // --------------------------------------------------

  const uploadDocumentFiles = async (userId, eventId) => {
    const uploadedFiles = [];

    for (const file of documentFiles) {
      const safeFileName = file.name.replace(
        /[^a-zA-Z0-9._-]/g,
        "_"
      );

      const uniqueFileName =
        `${Date.now()}-${Math.random()
          .toString(36)
          .substring(2, 8)}-${safeFileName}`;

      const filePath =
        `${userId}/${eventId}/${uniqueFileName}`;

      const { error: uploadError } =
        await supabase.storage
          .from("event-documents")
          .upload(filePath, file, {
            cacheControl: "3600",
            upsert: false,
            contentType: file.type || undefined,
          });

      if (uploadError) {
        throw new Error(
          `Failed to upload ${file.name}: ${uploadError.message}`
        );
      }

      const {
        data: publicUrlData,
      } = supabase.storage
        .from("event-documents")
        .getPublicUrl(filePath);

      const documentRecord = {
        event_id: eventId,
        file_name: file.name,
        file_url: publicUrlData.publicUrl,
        file_type: file.type || null,
        file_size: file.size || null,
      };

      const {
        data: insertedDocument,
        error: documentInsertError,
      } = await supabase
        .from("event_documents")
        .insert(documentRecord)
        .select()
        .single();

      if (documentInsertError) {
        throw new Error(
          `Failed to save document information for ${file.name}: ${documentInsertError.message}`
        );
      }

      uploadedFiles.push({
        storagePath: filePath,
        databaseId: insertedDocument.id,
      });
    }

    return uploadedFiles;
  };

  // --------------------------------------------------
  // Rollback Everything
  // --------------------------------------------------

  const rollbackSubmission = async ({
    eventId,
    mediaUploads = [],
    documentUploads = [],
  }) => {
    console.log("Starting rollback...");

    // ----------------------------------------------
    // Delete media database rows
    // ----------------------------------------------

    for (const media of mediaUploads) {
      if (media.databaseId) {
        try {
          await supabase
            .from("event_media")
            .delete()
            .eq("id", media.databaseId);
        } catch (error) {
          console.error(
            "Failed to delete media database row:",
            error
          );
        }
      }
    }

    // ----------------------------------------------
    // Delete media storage files
    // ----------------------------------------------

    if (mediaUploads.length > 0) {
      const paths = mediaUploads
        .map((item) => item.storagePath)
        .filter(Boolean);

      if (paths.length > 0) {
        try {
          const { error } =
            await supabase.storage
              .from("event-media")
              .remove(paths);

          if (error) {
            console.error(
              "Failed to delete media files:",
              error
            );
          }
        } catch (error) {
          console.error(
            "Media storage rollback error:",
            error
          );
        }
      }
    }

    // ----------------------------------------------
    // Delete document database rows
    // ----------------------------------------------

    for (const document of documentUploads) {
      if (document.databaseId) {
        try {
          await supabase
            .from("event_documents")
            .delete()
            .eq("id", document.databaseId);
        } catch (error) {
          console.error(
            "Failed to delete document database row:",
            error
          );
        }
      }
    }

    // ----------------------------------------------
    // Delete document storage files
    // ----------------------------------------------

    if (documentUploads.length > 0) {
      const paths = documentUploads
        .map((item) => item.storagePath)
        .filter(Boolean);

      if (paths.length > 0) {
        try {
          const { error } =
            await supabase.storage
              .from("event-documents")
              .remove(paths);

          if (error) {
            console.error(
              "Failed to delete document files:",
              error
            );
          }
        } catch (error) {
          console.error(
            "Document storage rollback error:",
            error
          );
        }
      }
    }

    // ----------------------------------------------
    // Delete event
    // ----------------------------------------------

    if (eventId) {
      try {
        const { error } =
          await supabase
            .from("events")
            .delete()
            .eq("id", eventId);

        if (error) {
          console.error(
            "Failed to delete event:",
            error
          );
        }
      } catch (error) {
        console.error(
          "Event rollback error:",
          error
        );
      }
    }

    console.log("Rollback completed.");
  };

  // --------------------------------------------------
  // Submit
  // --------------------------------------------------

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Prevent duplicate submission
    if (loading) {
      return;
    }

    setError("");
    setSuccess("");

    let createdEventId = null;
    let currentUserId = null;

    let mediaUploads = [];
    let documentUploads = [];

    // ----------------------------------------------
    // Validation
    // ----------------------------------------------

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

    if (!formData.location.trim()) {
      setError("Please enter the event location.");
      return;
    }

    // ----------------------------------------------
    // Social URL validation
    // ----------------------------------------------

    if (formData.socialNetworkUrl.trim()) {
      try {
        const url = new URL(
          formData.socialNetworkUrl.trim()
        );

        if (
          url.protocol !== "http:" &&
          url.protocol !== "https:"
        ) {
          setError(
            "Please enter a valid social network URL."
          );
          return;
        }
      } catch {
        setError(
          "Please enter a valid social network URL."
        );
        return;
      }
    }

    setLoading(true);

    try {
      // ----------------------------------------------
      // Get logged-in user
      // ----------------------------------------------

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        throw new Error(
          "Your session has expired. Please login again."
        );
      }

      currentUserId = user.id;

      // ----------------------------------------------
      // Get profile
      // ----------------------------------------------

      const {
        data: profile,
        error: profileError,
      } = await supabase
        .from("users")
        .select("id, name, email, role")
        .eq("id", user.id)
        .single();

      if (profileError || !profile) {
        throw new Error(
          "Unable to load your user profile."
        );
      }

      // ----------------------------------------------
      // Check teacher role
      // ----------------------------------------------

      if (
        profile.role?.toLowerCase() !== "teacher"
      ) {
        throw new Error(
          "Only teachers can create events."
        );
      }

      // ----------------------------------------------
      // Create Event
      // ----------------------------------------------

      const eventData = {
        teacher_id: user.id,
        event_name: formData.eventName.trim(),
        event_date: formData.eventDate,
        event_type: formData.eventType,
        location: formData.location.trim(),
        description:
          formData.description.trim() || null,

        // One optional social link
        social_network_url:
          formData.socialNetworkUrl.trim() || null,

        // Always pending initially
        status: "pending",
      };

      const {
        data: event,
        error: eventError,
      } = await supabase
        .from("events")
        .insert(eventData)
        .select()
        .single();

      if (eventError) {
        console.error(
          "Event creation error:",
          eventError
        );

        throw new Error(
          eventError.message ||
            "Failed to create event."
        );
      }

      createdEventId = event.id;

      // ----------------------------------------------
      // Upload Photos / Videos
      // ----------------------------------------------

      if (mediaFiles.length > 0) {
        mediaUploads = await uploadMediaFiles(
          currentUserId,
          createdEventId
        );
      }

      // ----------------------------------------------
      // Upload Documents
      // ----------------------------------------------

      if (documentFiles.length > 0) {
        documentUploads =
          await uploadDocumentFiles(
            currentUserId,
            createdEventId
          );
      }

      // ----------------------------------------------
      // EVERYTHING SUCCESSFUL
      // ----------------------------------------------

      setSuccess(
        "Event created successfully and submitted for Dean approval."
      );

      // Clear form
      setFormData({
        eventName: "",
        eventDate: "",
        eventType: "",
        location: "",
        description: "",
        socialNetworkUrl: "",
      });

      setMediaFiles([]);
      setDocumentFiles([]);

      // Redirect after success
      setTimeout(() => {
        navigate("/teacher/dashboard");
      }, 1500);

    } catch (err) {
      console.error(
        "Create event error:",
        err
      );

      // ----------------------------------------------
      // IMPORTANT:
      // If anything failed after event creation,
      // remove everything that was created.
      // ----------------------------------------------

      if (createdEventId) {
        await rollbackSubmission({
          eventId: createdEventId,
          mediaUploads,
          documentUploads,
        });
      }

      setError(
        err?.message ||
          "Something went wrong while creating the event."
      );

    } finally {
      setLoading(false);
    }
  };

  // --------------------------------------------------
  // Logout
  // --------------------------------------------------

  const handleLogout = async () => {
    await supabase.auth.signOut();

    navigate("/login", {
      replace: true,
    });
  };

  // --------------------------------------------------
  // UI
  // --------------------------------------------------

  return (
    <div className="min-h-screen bg-[#F3F5F9]">

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:wght@500;600;700&display=swap');
        .font-display { font-family: 'Fraunces', ui-serif, Georgia, 'Times New Roman', serif; }
        @keyframes ccFadeUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>

      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white">
        <div className="flex h-[68px] items-center justify-between px-6">

          <Link to="/teacher/dashboard" className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#101A33]">
              <span className="font-display text-sm font-semibold text-[#D4AF6A]">CC</span>
            </div>
            <div>
              <h1 className="font-display text-base font-semibold leading-tight text-[#101A33]">
                Campus Capture
              </h1>
              <p className="text-[11px] font-medium text-slate-400">
                Swami Rama Himalayan University
              </p>
            </div>
          </Link>

          <button
            type="button"
            onClick={handleLogout}
            className="inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium text-slate-500 transition hover:bg-slate-50 hover:text-slate-900"
          >
            <IconLogout />
            <span className="hidden sm:inline">Logout</span>
          </button>

        </div>
      </header>

      <div className="flex">

        {/* Sidebar */}
        <aside className="sticky top-[68px] hidden h-[calc(100vh-68px)] w-64 shrink-0 flex-col bg-gradient-to-b from-[#101A33] to-[#1B2748] px-4 py-6 md:flex">

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
              Events you submit are reviewed by the Dean before they're published.
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

            {/* Hero */}
            <div
              style={{ animation: "ccFadeUp 0.5s ease-out both" }}
              className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#101A33] via-[#182449] to-[#1B2748] p-7 sm:p-9"
            >
              <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full border border-white/10"></div>
              <div className="pointer-events-none absolute -right-6 -top-6 h-40 w-40 rounded-full border border-[#D4AF6A]/20"></div>

              <p className="relative text-xs font-semibold uppercase tracking-[0.14em] text-[#D4AF6A]">
                New Submission
              </p>
              <h2 className="font-display relative mt-2 text-3xl font-semibold text-white sm:text-4xl">
                Create Event
              </h2>
              <p className="relative mt-2 max-w-md text-sm text-slate-300">
                Submit your event details for Dean approval.
              </p>
            </div>

            {/* Success */}
            {success && (
              <div className="mt-6 flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                <IconCheckCircle className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" />
                <p className="text-sm font-medium text-emerald-700">
                  {success}
                </p>
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="mt-6 flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4">
                <IconAlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-rose-500" />
                <p className="text-sm font-medium text-rose-700">
                  {error}
                </p>
              </div>
            )}

            {/* Form */}
            <form
              onSubmit={handleSubmit}
              className="mt-6 overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-md"
            >

              {/* Event Information */}
              <div className="border-b border-slate-100 px-6 py-5 sm:px-8">
                <h3 className="font-display text-lg font-semibold text-slate-900">
                  Event Information
                </h3>
                <p className="mt-0.5 text-sm text-slate-500">
                  Enter the basic details of your event.
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
                    placeholder="Enter event name"
                    disabled={loading}
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
                      disabled={loading}
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
                      disabled={loading}
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

                {/* Location */}
                <div>
                  <label htmlFor="location" className="mb-2 block text-sm font-medium text-slate-700">
                    Location
                    <span className="ml-1 text-rose-500">*</span>
                  </label>
                  <input
                    id="location"
                    name="location"
                    type="text"
                    value={formData.location}
                    onChange={handleChange}
                    placeholder="Enter event location"
                    disabled={loading}
                    className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-[#101A33] focus:ring-2 focus:ring-[#101A33]/15 disabled:bg-slate-100"
                  />
                </div>

                {/* Description */}
                <div>
                  <label htmlFor="description" className="mb-2 block text-sm font-medium text-slate-700">
                    Description
                  </label>
                  <textarea
                    id="description"
                    name="description"
                    rows="5"
                    value={formData.description}
                    onChange={handleChange}
                    placeholder="Describe the event..."
                    disabled={loading}
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
                    placeholder="https://instagram.com/your-event"
                    disabled={loading}
                    className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-[#101A33] focus:ring-2 focus:ring-[#101A33]/15 disabled:bg-slate-100"
                  />
                  <p className="mt-2 text-xs text-slate-500">
                    You can add an Instagram, Facebook, YouTube, LinkedIn, X/Twitter, or any other social network link.
                  </p>
                </div>

              </div>

              {/* Photos & Videos */}
              <div className="border-t border-slate-100 px-6 py-7 sm:px-8">
                <h3 className="font-display text-lg font-semibold text-slate-900">
                  Photos & Videos
                </h3>
                <p className="mt-0.5 text-sm text-slate-500">
                  Upload photos or videos related to your event.
                </p>

                <div className="mt-5">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*,video/*"
                    multiple
                    onChange={handleMediaChange}
                    className="hidden"
                    disabled={loading}
                  />

                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={loading}
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
                          <p className="truncate text-sm font-medium text-slate-800">
                            {file.name}
                          </p>
                          <p className="mt-0.5 text-xs text-slate-500">
                            {file.type.startsWith("video/") ? "Video" : "Image"} • {formatFileSize(file.size)}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeMediaFile(index)}
                          disabled={loading}
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

              {/* Documents */}
              <div className="border-t border-slate-100 px-6 py-7 sm:px-8">
                <h3 className="font-display text-lg font-semibold text-slate-900">
                  Supporting Documents
                </h3>
                <p className="mt-0.5 text-sm text-slate-500">
                  Upload Word, Excel, PowerPoint, PDF, or other supporting documents.
                </p>

                <div className="mt-5">
                  <input
                    ref={documentInputRef}
                    type="file"
                    multiple
                    accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv"
                    onChange={handleDocumentChange}
                    className="hidden"
                    disabled={loading}
                  />

                  <button
                    type="button"
                    onClick={() => documentInputRef.current?.click()}
                    disabled={loading}
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
                            <p className="truncate text-sm font-medium text-slate-800">
                              {file.name}
                            </p>
                            <p className="mt-0.5 text-xs text-slate-500">
                              {formatFileSize(file.size)}
                            </p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeDocumentFile(index)}
                          disabled={loading}
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

              {/* Submission Info */}
              <div className="border-t border-slate-100 px-6 py-7 sm:px-8">
                <div className="flex items-start gap-3 rounded-xl border border-[#101A33]/10 bg-[#101A33]/5 p-4">
                  <IconInfo className="mt-0.5 h-5 w-5 shrink-0 text-[#101A33]" />
                  <p className="text-sm text-[#101A33]">
                    After submission, your event will be sent to the Dean for approval. You can track the event status from My Events.
                  </p>
                </div>
              </div>

              {/* Buttons */}
              <div className="flex flex-col-reverse gap-3 border-t border-slate-100 px-6 py-6 sm:flex-row sm:justify-end sm:px-8">
                <button
                  type="button"
                  onClick={() => navigate("/teacher/dashboard")}
                  disabled={loading}
                  className="w-full rounded-xl border border-slate-300 px-6 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:bg-slate-100 sm:w-auto"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={loading}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#101A33] px-6 py-3 text-sm font-semibold text-white shadow-md shadow-black/10 transition hover:bg-[#1B2748] disabled:cursor-not-allowed disabled:bg-slate-400 sm:w-auto"
                >
                  {loading ? (
                    <>
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white"></span>
                      Submitting...
                    </>
                  ) : (
                    "Submit Event"
                  )}
                </button>
              </div>

            </form>

          </div>

        </main>

      </div>
    </div>
  );
}

export default CreateEvent;