import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { supabase } from "../../services/supabase";
import srhuLogo from "../../assets/logo.png";
import {
  decodeEventMetadata,
  duplicateEventAsDraft,
  deleteTeacherDraft,
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
const IconCalendar = ({ className = "h-[18px] w-[18px]" }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <rect x="3.5" y="5" width="17" height="16" rx="2" />
    <path d="M8 3v4M16 3v4M3.5 10h17" />
  </svg>
);
const IconClock = ({ className = "h-[18px] w-[18px]" }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 6v6l4 2" />
  </svg>
);
const IconTag = ({ className = "h-[18px] w-[18px]" }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M20.5 12.5 12.5 20.5a1.5 1.5 0 0 1-2.12 0l-6.88-6.88a1.5 1.5 0 0 1 0-2.12l8-8H18a2.5 2.5 0 0 1 2.5 2.5v6Z" />
    <circle cx="15.5" cy="8.5" r="1.25" />
  </svg>
);
const IconMapPin = ({ className = "h-[18px] w-[18px]" }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M12 21.5s-7-6.4-7-11.6a7 7 0 0 1 14 0c0 5.2-7 11.6-7 11.6Z" />
    <circle cx="12" cy="9.8" r="2.4" />
  </svg>
);
const IconBuilding = ({ className = "h-[18px] w-[18px]" }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <rect x="4" y="2" width="16" height="20" rx="2" />
    <path d="M9 22v-4h6v4M8 6h.01M16 6h.01M8 10h.01M16 10h.01M8 14h.01M16 14h.01" />
  </svg>
);
const IconUser = ({ className = "h-[18px] w-[18px]" }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>
);
const IconPhone = ({ className = "h-[18px] w-[18px]" }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
  </svg>
);
const IconUsers = ({ className = "h-[18px] w-[18px]" }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);
const IconAlertTriangle = ({ className = "h-5 w-5" }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M12 3.5 21.5 20h-19L12 3.5Z" />
    <path d="M12 9.5v4.5M12 17h.01" />
  </svg>
);
const IconImage = ({ className = "h-6 w-6" }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
    <circle cx="9" cy="10" r="1.75" />
    <path d="M20.5 15.5 15.5 11l-9 8" />
  </svg>
);
const IconFilm = ({ className = "h-4 w-4" }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
    <path d="M8 4.5v15M16 4.5v15M3.5 9h4.5M16 9h4.5M3.5 15h4.5M16 15h4.5" />
  </svg>
);
const IconPhoto = ({ className = "h-4 w-4" }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
    <circle cx="9" cy="10" r="1.75" />
    <path d="M20.5 15.5 15.5 11l-9 8" />
  </svg>
);
const IconFileText = ({ className = "h-4 w-4" }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="16" y1="13" x2="8" y2="13" />
    <line x1="16" y1="17" x2="8" y2="17" />
    <line x1="10" y1="9" x2="8" y2="9" />
  </svg>
);
const IconDownload = ({ className = "h-4 w-4" }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" y1="15" x2="12" y2="3" />
  </svg>
);
const IconCheck = ({ className = "h-4 w-4" }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <polyline points="20 6 9 17 4 12" />
  </svg>
);
const IconX = ({ className = "h-4 w-4" }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);
const IconCopy = ({ className = "h-4 w-4" }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
);
const IconTrash = ({ className = "h-4 w-4" }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
  </svg>
);
const IconActivity = ({ className = "h-4 w-4" }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
  </svg>
);
const IconRefresh = ({ className = "h-4 w-4" }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M23 4v6h-6" />
    <path d="M1 20v-6h6" />
    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
  </svg>
);

function formatTimestamp(isoStr) {
  if (!isoStr) return "N/A";
  try {
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return isoStr;
    return d.toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return isoStr;
  }
}

function formatFileSize(bytes) {
  if (!bytes) return "0 KB";
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

function getFileExt(fileName) {
  const parts = (fileName || "").split(".");
  return parts.length > 1 ? parts.pop().toUpperCase() : "DOC";
}

function EventDetails() {
  const { eventId } = useParams();
  const navigate = useNavigate();

  const [event, setEvent] = useState(null);
  const [media, setMedia] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionNotice, setActionNotice] = useState("");

  // Deletion modal state
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletingLoading, setDeletingLoading] = useState(false);

  const fetchEventDetails = async () => {
    try {
      setLoading(true);
      setError("");

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        navigate("/login");
        return;
      }

      const { data: userProfile, error: profileError } = await supabase
        .from("users")
        .select("id, name, email, role")
        .eq("id", user.id)
        .single();

      if (profileError) throw profileError;

      if (userProfile.role !== "teacher") {
        navigate("/");
        return;
      }

      setProfile(userProfile);

      // 1. Fetch Event
      const { data: eventData, error: eventError } = await supabase
        .from("events")
        .select("*")
        .eq("id", eventId)
        .eq("teacher_id", user.id)
        .single();

      if (eventError) throw eventError;
      setEvent(eventData);

      // 2. Fetch Event Media
      const { data: mediaData, error: mediaError } = await supabase
        .from("event_media")
        .select("*")
        .eq("event_id", eventId)
        .order("created_at", { ascending: true });

      if (!mediaError && mediaData) {
        setMedia(mediaData);
      }

      // 3. Fetch Supporting Documents
      const { data: docData, error: docError } = await supabase
        .from("event_documents")
        .select("*")
        .eq("event_id", eventId)
        .order("created_at", { ascending: true });

      if (!docError && docData) {
        setDocuments(docData);
      }
    } catch (err) {
      console.error("Event details error:", err);
      setError(err.message || "Unable to load event details.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEventDetails();
  }, [eventId]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/login");
  };

  const handleDuplicate = () => {
    if (!event || !profile) return;
    try {
      const newDraft = duplicateEventAsDraft(profile.id, event);
      setActionNotice("Event duplicated as new draft.");
      setTimeout(() => {
        navigate(`/teacher/create-event?draftId=${newDraft.id}`);
      }, 700);
    } catch (err) {
      console.error("Duplicate error:", err);
      alert("Failed to duplicate event.");
    }
  };

  const handleDeleteConfirm = async () => {
    if (!event || !profile) return;
    try {
      setDeletingLoading(true);
      const { error: delErr } = await supabase
        .from("events")
        .delete()
        .eq("id", event.id)
        .eq("teacher_id", profile.id);

      if (delErr) throw delErr;

      navigate("/teacher/my-events", { replace: true });
    } catch (err) {
      console.error("Delete error:", err);
      alert("Failed to delete event: " + (err.message || "Unknown error"));
    } finally {
      setDeletingLoading(false);
      setShowDeleteModal(false);
    }
  };

  const scrollToLifecycle = () => {
    const el = document.getElementById("approval-lifecycle-section");
    if (el) {
      el.scrollIntoView({ behavior: "smooth" });
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case "approved":
        return {
          label: "Approved",
          badgeClass: "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/20",
          dotClass: "bg-emerald-500",
        };
      case "rejected":
        return {
          label: "Rejected",
          badgeClass: "bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-600/20",
          dotClass: "bg-rose-500",
        };
      case "published":
        return {
          label: "Published",
          badgeClass: "bg-purple-50 text-purple-700 ring-1 ring-inset ring-purple-600/20",
          dotClass: "bg-purple-500",
        };
      case "under_review":
        return {
          label: "Under Review",
          badgeClass: "bg-sky-50 text-sky-700 ring-1 ring-inset ring-sky-600/20",
          dotClass: "bg-sky-500",
        };
      default:
        return {
          label: "Pending",
          badgeClass: "bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-600/20",
          dotClass: "bg-amber-500",
        };
    }
  };

  // Build Event History / Timeline Milestones
  const getEventHistoryMilestones = () => {
    if (!event) return [];
    const milestones = [];

    // Milestone 1: Submission / Creation
    milestones.push({
      title: "Submitted for Approval",
      date: event.created_at,
      description: "Proposal submitted by faculty coordinator for Dean review.",
      completed: true,
    });

    // Milestone 2: Under Review
    if (
      event.status === "under_review" ||
      event.status === "approved" ||
      event.status === "rejected" ||
      event.status === "published"
    ) {
      milestones.push({
        title: "Under Review",
        date: event.updated_at,
        description: "Event proposal is actively being reviewed by the Dean's Office.",
        completed: true,
      });
    }

    // Milestone 3: Decision (Approved or Rejected)
    if (event.status === "rejected") {
      milestones.push({
        title: "Rejected by Dean",
        date: event.updated_at,
        description: event.rejection_reason
          ? `Feedback: ${event.rejection_reason}`
          : "Event proposal rejected by Dean.",
        isRejected: true,
        completed: true,
      });
    } else if (event.status === "approved" || event.status === "published") {
      milestones.push({
        title: "Approved by Dean",
        date: event.reviewed_at || event.updated_at,
        description: "Dean approved the proposal for official campus scheduling.",
        completed: true,
      });
    }

    // Milestone 4: Published
    if (event.status === "published") {
      milestones.push({
        title: "Published",
        date: event.published_at || event.updated_at,
        description: "Event published to the public Campus Capture feed.",
        completed: true,
      });
    }

    return milestones;
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F3F5F9]">
        <div className="text-center">
          <div className="relative mx-auto mb-4 h-11 w-11">
            <div className="absolute inset-0 rounded-full border-4 border-slate-200"></div>
            <div className="absolute inset-0 animate-spin rounded-full border-4 border-transparent border-t-[#101A33]"></div>
          </div>
          <p className="text-sm text-slate-500">Loading event details...</p>
        </div>
      </div>
    );
  }

  if (error || !event) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F3F5F9] px-4">
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=Fraunces:wght@500;600;700&display=swap');
          .font-display { font-family: 'Fraunces', ui-serif, Georgia, 'Times New Roman', serif; }
        `}</style>
        <div className="w-full max-w-md rounded-2xl border border-slate-200/80 bg-white p-9 text-center shadow-md">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-rose-50 text-rose-500">
            <IconAlertTriangle className="h-6 w-6" />
          </div>
          <h2 className="font-display text-xl font-semibold text-slate-900">Event Not Found</h2>
          <p className="mt-2 text-sm text-slate-500">{error || "This event could not be found."}</p>
          <Link
            to="/teacher/my-events"
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-[#101A33] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#1B2748]"
          >
            <IconArrowLeft />
            Back to My Events
          </Link>
        </div>
      </div>
    );
  }

  const { description: cleanDescription, meta } = decodeEventMetadata(event.description);
  const badge = getStatusBadge(event.status);
  const milestones = getEventHistoryMilestones();

  const canDelete =
    event.status === "draft" ||
    event.status === "pending" ||
    event.status === "submitted" ||
    event.status === "rejected";

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
          <div className="flex items-center gap-3.5">
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
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#101A33] text-sm font-semibold text-white">
                {(profile?.name || "T").charAt(0).toUpperCase()}
              </div>
              <div className="hidden sm:block">
                <p className="text-sm font-semibold leading-tight text-slate-800">
                  {profile?.name || "Teacher"}
                </p>
                <p className="text-xs leading-tight text-slate-400">Teacher</p>
              </div>
            </div>

            <div className="relative">
              <NotificationBell currentUser={profile} />
            </div>

            <div className="hidden h-8 w-px bg-slate-200 sm:block"></div>

            <button
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
              className="flex items-center gap-3 rounded-lg border-l-[3px] border-transparent px-4 py-3 text-sm font-medium text-slate-300 transition hover:bg-white/5 hover:text-white"
            >
              <IconPlus className="h-[18px] w-[18px]" />
              Create Event
            </Link>

            <Link
              to="/teacher/my-events"
              className="flex items-center gap-3 rounded-lg border-l-[3px] border-[#D4AF6A] bg-white/10 px-4 py-3 text-sm font-semibold text-white"
            >
              <IconList />
              My Events
            </Link>
          </nav>

          <div className="mt-auto rounded-xl border border-white/10 bg-white/5 p-4">
            <p className="text-xs leading-relaxed text-slate-300">
              Complete review records, history, and uploaded assets.
            </p>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 px-5 py-8 lg:px-10">
          <div className="mx-auto max-w-5xl">
            {/* Action Notice */}
            {actionNotice && (
              <div className="mb-5 flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                <span className="h-2 w-2 rounded-full bg-emerald-500"></span>
                <p className="text-sm font-medium text-emerald-800">{actionNotice}</p>
              </div>
            )}

            {/* Navigation back and Action Buttons */}
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <Link
                to="/teacher/my-events"
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#101A33] transition hover:text-[#c79a54]"
              >
                <IconArrowLeft />
                Back to My Events
              </Link>

              {/* Action Suite (Edit, Duplicate, Delete, Track Status, Edit & Resubmit) */}
              <div className="flex flex-wrap items-center gap-2">
                {/* Track Status shortcut */}
                <button
                  type="button"
                  onClick={scrollToLifecycle}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  <IconActivity className="h-3.5 w-3.5 text-sky-600" />
                  Track Status
                </button>

                {/* Duplicate Action */}
                <button
                  type="button"
                  onClick={handleDuplicate}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 transition hover:border-[#D4AF6A] hover:bg-[#D4AF6A]/10 hover:text-[#101A33]"
                >
                  <IconCopy className="h-3.5 w-3.5" />
                  Duplicate
                </button>

                {/* Delete Action (if permitted) */}
                {canDelete && (
                  <button
                    type="button"
                    onClick={() => setShowDeleteModal(true)}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-rose-600 transition hover:border-rose-300 hover:bg-rose-50"
                  >
                    <IconTrash className="h-3.5 w-3.5" />
                    Delete
                  </button>
                )}

                {/* Edit & Resubmit button for Rejected Events */}
                {event.status === "rejected" && (
                  <Link
                    to={`/teacher/create-event?editEventId=${event.id}`}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-rose-600 px-4 py-2 text-xs font-semibold text-white shadow transition hover:bg-rose-700"
                  >
                    <IconRefresh className="h-3.5 w-3.5" />
                    Edit & Resubmit
                  </Link>
                )}
              </div>
            </div>

            {/* Hero Header */}
            <div
              style={{ animation: "ccFadeUp 0.5s ease-out both" }}
              className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#101A33] via-[#182449] to-[#1B2748] p-7 sm:p-9"
            >
              <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full border border-white/10"></div>
              <div className="pointer-events-none absolute -right-6 -top-6 h-40 w-40 rounded-full border border-[#D4AF6A]/20"></div>

              <div className="relative flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#D4AF6A]">
                    {event.event_type}
                  </p>
                  <h2 className="font-display mt-2 text-3xl font-semibold text-white sm:text-4xl">
                    {event.event_name}
                  </h2>
                  <p className="mt-2 text-sm text-slate-300">
                    Organized by {meta.organizer || profile?.name || "Teacher"}
                  </p>
                </div>

                <span
                  className={`inline-flex w-fit shrink-0 items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold ${badge.badgeClass}`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${badge.dotClass}`}></span>
                  {badge.label}
                </span>
              </div>

              {/* Quick Info Chips */}
              <div className="relative mt-7 grid gap-4 border-t border-white/10 pt-6 sm:grid-cols-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 text-[#D4AF6A]">
                    <IconCalendar />
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Date</p>
                    <p className="text-sm font-medium text-white">{event.event_date || "Not set"}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 text-[#D4AF6A]">
                    <IconClock />
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Timings</p>
                    <p className="text-sm font-medium text-white">
                      {meta.startTime && meta.endTime
                        ? `${meta.startTime} - ${meta.endTime}`
                        : "All Day"}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 text-[#D4AF6A]">
                    <IconMapPin />
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Venue</p>
                    <p className="text-sm font-medium text-white">{event.location || "Not set"}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Approval Lifecycle Section */}
            <div id="approval-lifecycle-section" className="mt-8 rounded-2xl border border-slate-200/80 bg-white p-6 shadow-md">
              <h3 className="font-display text-base font-semibold text-slate-900">
                Approval Lifecycle
              </h3>
              <p className="mt-0.5 text-xs text-slate-500">
                Real-time tracking of this event through the Dean approval workflow.
              </p>

              <div className="mt-6">
                {(() => {
                  const status = event.status || "pending";
                  const isRejected = status === "rejected";
                  const steps = [
                    { id: "draft", label: "Draft" },
                    { id: "submitted", label: "Submitted" },
                    { id: "under_review", label: "Under Review" },
                    { id: isRejected ? "rejected" : "approved", label: isRejected ? "Rejected" : "Approved" },
                    { id: "published", label: "Published" },
                  ];

                  let currentStepIndex = 1;
                  if (status === "under_review") currentStepIndex = 2;
                  if (status === "approved" || isRejected) currentStepIndex = 3;
                  if (status === "published") currentStepIndex = 4;

                  return (
                    <div className="relative flex items-center justify-between">
                      <div className="absolute left-0 top-1/2 h-0.5 w-full -translate-y-1/2 bg-slate-200"></div>

                      {steps.map((step, idx) => {
                        const isPast = idx < currentStepIndex;
                        const isCurrent = idx === currentStepIndex;

                        let icon = <span className="text-xs font-bold">{idx + 1}</span>;
                        let stepBg = "bg-slate-100 border-slate-300 text-slate-400";

                        if (isPast) {
                          stepBg = "bg-emerald-600 border-emerald-600 text-white";
                          icon = <IconCheck className="h-4 w-4" />;
                        } else if (isCurrent) {
                          if (step.id === "rejected") {
                            stepBg = "bg-rose-600 border-rose-600 text-white ring-4 ring-rose-100";
                            icon = <IconX className="h-4 w-4" />;
                          } else if (step.id === "approved" || step.id === "published") {
                            stepBg = "bg-emerald-600 border-emerald-600 text-white ring-4 ring-emerald-100";
                            icon = <IconCheck className="h-4 w-4" />;
                          } else {
                            stepBg = "bg-[#101A33] border-[#101A33] text-white ring-4 ring-slate-200";
                          }
                        }

                        return (
                          <div key={step.id} className="relative z-10 flex flex-col items-center">
                            <div className={`flex h-9 w-9 items-center justify-center rounded-full border-2 ${stepBg}`}>
                              {icon}
                            </div>
                            <span
                              className={`mt-2 text-xs font-semibold ${
                                isCurrent
                                  ? step.id === "rejected"
                                    ? "text-rose-600"
                                    : "text-[#101A33]"
                                  : isPast
                                  ? "text-slate-800"
                                  : "text-slate-400"
                              }`}
                            >
                              {step.label}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
            </div>

            {/* Section 8: Reviewer / Dean Remarks */}
            {event.rejection_reason && (
              <div className="mt-6 overflow-hidden rounded-2xl border border-rose-200 bg-rose-50 shadow-sm">
                <div className="flex items-center justify-between border-b border-rose-200/80 px-6 py-4">
                  <div className="flex items-center gap-2.5">
                    <IconAlertTriangle className="h-5 w-5 text-rose-600" />
                    <h3 className="text-sm font-semibold text-rose-900">
                      Reviewer / Dean Remarks
                    </h3>
                  </div>
                  <Link
                    to={`/teacher/create-event?editEventId=${event.id}`}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-3 py-1 text-xs font-semibold text-white transition hover:bg-rose-700"
                  >
                    <IconRefresh className="h-3 w-3" />
                    Edit & Resubmit
                  </Link>
                </div>
                <div className="px-6 py-5">
                  <p className="whitespace-pre-line text-sm leading-6 text-rose-800">
                    {event.rejection_reason}
                  </p>
                </div>
              </div>
            )}

            {/* Event Coordination Details */}
            <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-6 shadow-md">
              <h3 className="font-display text-lg font-semibold text-slate-900 border-b border-slate-100 pb-4">
                Event Information
              </h3>
              <div className="mt-4 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                    <IconBuilding />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-slate-400">Department / School</p>
                    <p className="mt-0.5 text-sm font-semibold text-slate-800">
                      {meta.department || "University-wide"}
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                    <IconUser />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-slate-400">Organizer / Coordinator</p>
                    <p className="mt-0.5 text-sm font-semibold text-slate-800">
                      {meta.organizer || profile?.name || "Not specified"}
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                    <IconPhone />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-slate-400">Contact Information</p>
                    <p className="mt-0.5 text-sm font-semibold text-slate-800">
                      {meta.contactInfo || profile?.email || "Not specified"}
                    </p>
                  </div>
                </div>

                {meta.expectedParticipants && (
                  <div className="flex items-start gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                      <IconUsers />
                    </div>
                    <div>
                      <p className="text-xs font-medium text-slate-400">Expected Participants</p>
                      <p className="mt-0.5 text-sm font-semibold text-slate-800">
                        {meta.expectedParticipants}
                      </p>
                    </div>
                  </div>
                )}

                {event.social_network_url && (
                  <div className="flex items-start gap-3 sm:col-span-2">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                      <IconTag />
                    </div>
                    <div>
                      <p className="text-xs font-medium text-slate-400">Social Network Link</p>
                      <a
                        href={event.social_network_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-0.5 inline-block text-sm font-semibold text-[#101A33] hover:underline"
                      >
                        {event.social_network_url}
                      </a>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Description */}
            <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-md">
              <div className="border-b border-slate-100 px-6 py-5">
                <h3 className="font-display text-lg font-semibold text-slate-900">
                  Event Description
                </h3>
              </div>
              <div className="px-6 py-5">
                <p className="whitespace-pre-line text-sm leading-7 text-slate-600">
                  {cleanDescription || "No description provided."}
                </p>
              </div>
            </div>

            {/* Section 8: Uploaded Files - Media Gallery & Documents */}
            <div className="mt-6 grid gap-6 md:grid-cols-2">
              {/* Supporting Documents */}
              <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-md">
                <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
                  <h3 className="font-display text-base font-semibold text-slate-900">
                    Supporting Documents
                  </h3>
                  <span className="rounded-full bg-[#101A33]/5 px-2.5 py-0.5 text-xs font-semibold text-[#101A33]">
                    {documents.length}
                  </span>
                </div>

                <div className="p-5">
                  {documents.length === 0 ? (
                    <p className="py-6 text-center text-xs text-slate-400">
                      No supporting documents uploaded.
                    </p>
                  ) : (
                    <div className="space-y-2.5">
                      {documents.map((doc) => (
                        <div
                          key={doc.id}
                          className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50/70 p-3"
                        >
                          <div className="flex min-w-0 items-center gap-3">
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#101A33]/5 text-xs font-bold text-[#101A33]">
                              {getFileExt(doc.file_name)}
                            </div>
                            <div className="min-w-0">
                              <p className="truncate text-xs font-semibold text-slate-800">
                                {doc.file_name}
                              </p>
                              <p className="text-[10px] text-slate-400">
                                {formatFileSize(doc.file_size)}
                              </p>
                            </div>
                          </div>

                          <a
                            href={doc.file_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            download
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                          >
                            <IconDownload className="h-3.5 w-3.5" />
                            View
                          </a>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Photos & Videos Media Count & List */}
              <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-md">
                <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
                  <h3 className="font-display text-base font-semibold text-slate-900">
                    Media Files
                  </h3>
                  <span className="rounded-full bg-[#101A33]/5 px-2.5 py-0.5 text-xs font-semibold text-[#101A33]">
                    {media.length}
                  </span>
                </div>

                <div className="p-5">
                  {media.length === 0 ? (
                    <p className="py-6 text-center text-xs text-slate-400">
                      No photos or videos attached.
                    </p>
                  ) : (
                    <div className="grid grid-cols-2 gap-3">
                      {media.slice(0, 4).map((item) => (
                        <div
                          key={item.id}
                          className="group relative overflow-hidden rounded-xl border border-slate-200 bg-slate-100"
                        >
                          {item.media_type === "video" ? (
                            <div className="flex h-24 items-center justify-center bg-black/80 text-white">
                              <IconFilm className="h-6 w-6 text-white/80" />
                            </div>
                          ) : (
                            <img
                              src={item.media_url}
                              alt={event.event_name}
                              className="h-24 w-full object-cover transition duration-200 group-hover:scale-105"
                            />
                          )}
                          <a
                            href={item.media_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition group-hover:opacity-100"
                          >
                            <span className="rounded bg-white/90 px-2 py-0.5 text-[10px] font-semibold text-slate-800">
                              Open
                            </span>
                          </a>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Section 8: Submission Information & Event History / Timeline */}
            <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-6 shadow-md">
              <div className="border-b border-slate-100 pb-4">
                <h3 className="font-display text-lg font-semibold text-slate-900">
                  Event History & Audit Trail
                </h3>
                <p className="mt-0.5 text-xs text-slate-500">
                  Milestones recorded across the event review lifecycle.
                </p>
              </div>

              {/* Submission Metadata Row */}
              <div className="mt-4 grid gap-4 border-b border-slate-100 pb-5 sm:grid-cols-3">
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
                    Submission Date
                  </p>
                  <p className="mt-0.5 text-xs font-semibold text-slate-800">
                    {formatTimestamp(event.created_at)}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
                    Last Updated / Reviewed
                  </p>
                  <p className="mt-0.5 text-xs font-semibold text-slate-800">
                    {formatTimestamp(event.reviewed_at || event.updated_at)}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
                    Publication Status
                  </p>
                  <p className="mt-0.5 text-xs font-semibold text-slate-800">
                    {event.status === "published" ? "Live on Campus Capture" : "Unpublished"}
                  </p>
                </div>
              </div>

              {/* Chronological Timeline */}
              <div className="mt-6 pl-2">
                <div className="relative border-l-2 border-slate-200 pl-6 space-y-6">
                  {milestones.map((m, idx) => (
                    <div key={idx} className="relative">
                      {/* Timeline dot */}
                      <span
                        className={`absolute -left-[31px] top-0 flex h-5 w-5 items-center justify-center rounded-full ring-4 ring-white ${
                          m.isRejected
                            ? "bg-rose-500 text-white"
                            : "bg-emerald-500 text-white"
                        }`}
                      >
                        {m.isRejected ? <IconX className="h-3 w-3" /> : <IconCheck className="h-3 w-3" />}
                      </span>

                      <div>
                        <div className="flex flex-wrap items-baseline gap-2">
                          <h4 className="text-sm font-semibold text-slate-900">
                            {m.title}
                          </h4>
                          <span className="text-[11px] text-slate-400">
                            {formatTimestamp(m.date)}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-slate-600">
                          {m.description}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-rose-50 text-rose-600">
                <IconAlertTriangle />
              </div>
              <div>
                <h4 className="font-display text-lg font-semibold text-slate-900">
                  Delete Event
                </h4>
                <p className="text-xs text-slate-500">Permanent Action</p>
              </div>
            </div>

            <p className="mt-3 text-sm text-slate-600">
              Are you sure you want to delete <strong className="text-slate-800">"{event.event_name}"</strong>? This will remove all event records, uploads, and history.
            </p>

            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowDeleteModal(false)}
                disabled={deletingLoading}
                className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteConfirm}
                disabled={deletingLoading}
                className="rounded-xl bg-rose-600 px-5 py-2 text-sm font-semibold text-white shadow hover:bg-rose-700"
              >
                {deletingLoading ? "Deleting..." : "Delete Event"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default EventDetails;