import { useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../../services/supabase";

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
    <div className="min-h-screen bg-gray-100">

      {/* =================================================
          Navbar
      ================================================= */}

      <nav className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

          <div className="flex items-center justify-between h-16">

            <div>
              <Link
                to="/teacher/dashboard"
                className="text-xl font-bold text-gray-900"
              >
                Campus Capture
              </Link>

              <p className="text-xs text-gray-500">
                SRHU Event Management
              </p>
            </div>

            <div className="flex items-center gap-4">

              <Link
                to="/teacher/dashboard"
                className="text-sm text-gray-600 hover:text-gray-900"
              >
                Dashboard
              </Link>

              <Link
                to="/teacher/my-events"
                className="text-sm text-gray-600 hover:text-gray-900"
              >
                My Events
              </Link>

              <button
                type="button"
                onClick={handleLogout}
                className="text-sm text-red-600 hover:text-red-700"
              >
                Logout
              </button>

            </div>

          </div>

        </div>
      </nav>

      {/* =================================================
          Main
      ================================================= */}

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

        {/* Header */}

        <div className="mb-8">

          <Link
            to="/teacher/dashboard"
            className="text-sm text-blue-600 hover:text-blue-700"
          >
            ← Back to Dashboard
          </Link>

          <h1 className="text-3xl font-bold text-gray-900 mt-4">
            Create Event
          </h1>

          <p className="text-gray-500 mt-2">
            Submit your event details for Dean approval.
          </p>

        </div>

        {/* Success */}

        {success && (
          <div className="mb-6 rounded-lg bg-green-50 border border-green-200 px-4 py-3">

            <p className="text-sm text-green-700">
              {success}
            </p>

          </div>
        )}

        {/* Error */}

        {error && (
          <div className="mb-6 rounded-lg bg-red-50 border border-red-200 px-4 py-3">

            <p className="text-sm text-red-700">
              {error}
            </p>

          </div>
        )}

        {/* =================================================
            Form
        ================================================= */}

        <form
          onSubmit={handleSubmit}
          className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 sm:p-8"
        >

          {/* =================================================
              Event Information
          ================================================= */}

          <div className="mb-8">

            <h2 className="text-xl font-semibold text-gray-900">
              Event Information
            </h2>

            <p className="text-sm text-gray-500 mt-1">
              Enter the basic details of your event.
            </p>

          </div>

          <div className="space-y-6">

            {/* Event Name */}

            <div>

              <label
                htmlFor="eventName"
                className="block text-sm font-medium text-gray-700 mb-2"
              >
                Event Name
                <span className="text-red-500 ml-1">
                  *
                </span>
              </label>

              <input
                id="eventName"
                name="eventName"
                type="text"
                value={formData.eventName}
                onChange={handleChange}
                placeholder="Enter event name"
                disabled={loading}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
              />

            </div>

            {/* Date + Type */}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

              {/* Date */}

              <div>

                <label
                  htmlFor="eventDate"
                  className="block text-sm font-medium text-gray-700 mb-2"
                >
                  Event Date
                  <span className="text-red-500 ml-1">
                    *
                  </span>
                </label>

                <input
                  id="eventDate"
                  name="eventDate"
                  type="date"
                  value={formData.eventDate}
                  onChange={handleChange}
                  disabled={loading}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
                />

              </div>

              {/* Type */}

              <div>

                <label
                  htmlFor="eventType"
                  className="block text-sm font-medium text-gray-700 mb-2"
                >
                  Event Type
                  <span className="text-red-500 ml-1">
                    *
                  </span>
                </label>

                <select
                  id="eventType"
                  name="eventType"
                  value={formData.eventType}
                  onChange={handleChange}
                  disabled={loading}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
                >

                  <option value="">
                    Select event type
                  </option>

                  <option value="Academic">
                    Academic
                  </option>

                  <option value="Cultural">
                    Cultural
                  </option>

                  <option value="Sports">
                    Sports
                  </option>

                  <option value="Workshop">
                    Workshop
                  </option>

                  <option value="Seminar">
                    Seminar
                  </option>

                  <option value="Conference">
                    Conference
                  </option>

                  <option value="Celebration">
                    Celebration
                  </option>

                  <option value="Other">
                    Other
                  </option>

                </select>

              </div>

            </div>

            {/* Location */}

            <div>

              <label
                htmlFor="location"
                className="block text-sm font-medium text-gray-700 mb-2"
              >
                Location
                <span className="text-red-500 ml-1">
                  *
                </span>
              </label>

              <input
                id="location"
                name="location"
                type="text"
                value={formData.location}
                onChange={handleChange}
                placeholder="Enter event location"
                disabled={loading}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
              />

            </div>

            {/* Description */}

            <div>

              <label
                htmlFor="description"
                className="block text-sm font-medium text-gray-700 mb-2"
              >
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
                className="w-full px-4 py-3 border border-gray-300 rounded-lg outline-none resize-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
              />

            </div>

            {/* =================================================
                Social Network Link
            ================================================= */}

            <div>

              <label
                htmlFor="socialNetworkUrl"
                className="block text-sm font-medium text-gray-700 mb-2"
              >
                Social Network Link
                <span className="text-gray-400 ml-2 font-normal">
                  (Optional)
                </span>
              </label>

              <input
                id="socialNetworkUrl"
                name="socialNetworkUrl"
                type="url"
                value={formData.socialNetworkUrl}
                onChange={handleChange}
                placeholder="https://instagram.com/your-event"
                disabled={loading}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
              />

              <p className="text-xs text-gray-500 mt-2">
                You can add an Instagram, Facebook,
                YouTube, LinkedIn, X/Twitter, or any
                other social network link.
              </p>

            </div>

          </div>

          {/* =================================================
              Photos & Videos
          ================================================= */}

          <div className="mt-10 pt-8 border-t border-gray-200">

            <h2 className="text-xl font-semibold text-gray-900">
              Photos & Videos
            </h2>

            <p className="text-sm text-gray-500 mt-1">
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
                onClick={() =>
                  fileInputRef.current?.click()
                }
                disabled={loading}
                className="w-full sm:w-auto px-5 py-3 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50 disabled:bg-gray-100 disabled:cursor-not-allowed transition"
              >
                + Add Photos / Videos
              </button>

            </div>

            {mediaFiles.length > 0 && (
              <div className="mt-5 space-y-3">

                {mediaFiles.map((file, index) => (

                  <div
                    key={`${file.name}-${index}`}
                    className="flex items-center justify-between gap-4 bg-gray-50 border border-gray-200 rounded-lg px-4 py-3"
                  >

                    <div className="min-w-0">

                      <p className="text-sm font-medium text-gray-800 truncate">
                        {file.name}
                      </p>

                      <p className="text-xs text-gray-500 mt-1">
                        {file.type.startsWith("video/")
                          ? "Video"
                          : "Image"}{" "}
                        •{" "}
                        {formatFileSize(file.size)}
                      </p>

                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        removeMediaFile(index)
                      }
                      disabled={loading}
                      className="text-sm text-red-600 hover:text-red-700 flex-shrink-0"
                    >
                      Remove
                    </button>

                  </div>

                ))}

              </div>
            )}

          </div>

          {/* =================================================
              Documents
          ================================================= */}

          <div className="mt-10 pt-8 border-t border-gray-200">

            <h2 className="text-xl font-semibold text-gray-900">
              Supporting Documents
            </h2>

            <p className="text-sm text-gray-500 mt-1">
              Upload Word, Excel, PowerPoint, PDF, or
              other supporting documents.
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
                onClick={() =>
                  documentInputRef.current?.click()
                }
                disabled={loading}
                className="w-full sm:w-auto px-5 py-3 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50 disabled:bg-gray-100 disabled:cursor-not-allowed transition"
              >
                + Add Documents
              </button>

            </div>

            {documentFiles.length > 0 && (
              <div className="mt-5 space-y-3">

                {documentFiles.map((file, index) => (

                  <div
                    key={`${file.name}-${index}`}
                    className="flex items-center justify-between gap-4 bg-gray-50 border border-gray-200 rounded-lg px-4 py-3"
                  >

                    <div className="flex items-center gap-3 min-w-0">

                      <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">

                        <span className="text-xs font-bold text-blue-600">
                          {getFileExtension(file.name)}
                        </span>

                      </div>

                      <div className="min-w-0">

                        <p className="text-sm font-medium text-gray-800 truncate">
                          {file.name}
                        </p>

                        <p className="text-xs text-gray-500 mt-1">
                          {formatFileSize(file.size)}
                        </p>

                      </div>

                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        removeDocumentFile(index)
                      }
                      disabled={loading}
                      className="text-sm text-red-600 hover:text-red-700 flex-shrink-0"
                    >
                      Remove
                    </button>

                  </div>

                ))}

              </div>
            )}

          </div>

          {/* =================================================
              Submission Info
          ================================================= */}

          <div className="mt-10 pt-8 border-t border-gray-200">

            <div className="rounded-lg bg-blue-50 border border-blue-100 p-4">

              <p className="text-sm text-blue-800">
                After submission, your event will be
                sent to the Dean for approval. You can
                track the event status from My Events.
              </p>

            </div>

          </div>

          {/* =================================================
              Buttons
          ================================================= */}

          <div className="mt-8 flex flex-col-reverse sm:flex-row sm:justify-end gap-3">

            <button
              type="button"
              onClick={() =>
                navigate("/teacher/dashboard")
              }
              disabled={loading}
              className="w-full sm:w-auto px-6 py-3 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50 disabled:bg-gray-100 disabled:cursor-not-allowed transition"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={loading}
              className="w-full sm:w-auto px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:bg-blue-400 disabled:cursor-not-allowed transition"
            >
              {loading
                ? "Submitting..."
                : "Submit Event"}
            </button>

          </div>

        </form>

      </main>
    </div>
  );
}

export default CreateEvent;