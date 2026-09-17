/**
 * Draft Storage & Event Metadata Utilities for Campus Capture
 * Enables teacher draft management and lossless metadata encoding/decoding.
 */

const STORAGE_PREFIX = "cc_teacher_drafts_";

/**
 * Retrieve all drafts for the given teacher
 * @param {string} userId
 * @returns {Array}
 */
export function getTeacherDrafts(userId) {
  if (!userId || typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${userId}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.error("Failed to read teacher drafts from storage:", err);
    return [];
  }
}

/**
 * Retrieve a specific draft by ID
 * @param {string} userId
 * @param {string} draftId
 * @returns {Object|null}
 */
export function getTeacherDraftById(userId, draftId) {
  if (!userId || !draftId) return null;
  const drafts = getTeacherDrafts(userId);
  return drafts.find((d) => d.id === draftId) || null;
}

/**
 * Save or update a draft for the given teacher
 * @param {string} userId
 * @param {Object} draftData
 * @returns {Object} Saved draft object
 */
export function saveTeacherDraft(userId, draftData) {
  if (!userId) throw new Error("User ID is required to save drafts");
  const drafts = getTeacherDrafts(userId);

  const now = new Date().toISOString();
  const draftId = draftData.id || `draft_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

  const cleanDraft = {
    id: draftId,
    teacher_id: userId,
    event_name: draftData.eventName?.trim() || draftData.event_name?.trim() || "Untitled Draft",
    event_date: draftData.eventDate || draftData.event_date || "",
    event_type: draftData.eventType || draftData.event_type || "",
    location: draftData.location?.trim() || "",
    start_time: draftData.startTime || draftData.start_time || "",
    end_time: draftData.endTime || draftData.end_time || "",
    department: draftData.department?.trim() || "",
    organizer: draftData.organizer?.trim() || "",
    expected_participants: draftData.expectedParticipants || draftData.expected_participants || "",
    contact_info: draftData.contactInfo?.trim() || draftData.contact_info?.trim() || "",
    description: draftData.description || "",
    social_network_url: draftData.socialNetworkUrl?.trim() || draftData.social_network_url?.trim() || "",
    mediaFilesCount: draftData.mediaFiles?.length || draftData.mediaFilesCount || 0,
    documentFilesCount: draftData.documentFiles?.length || draftData.documentFilesCount || 0,
    status: "draft",
    created_at: draftData.created_at || now,
    updated_at: now,
  };

  const existingIndex = drafts.findIndex((d) => d.id === draftId);
  if (existingIndex >= 0) {
    drafts[existingIndex] = { ...drafts[existingIndex], ...cleanDraft };
  } else {
    drafts.unshift(cleanDraft);
  }

  try {
    localStorage.setItem(`${STORAGE_PREFIX}${userId}`, JSON.stringify(drafts));
  } catch (err) {
    console.error("Failed to persist draft to localStorage:", err);
  }

  return cleanDraft;
}

/**
 * Delete a draft for the given teacher
 * @param {string} userId
 * @param {string} draftId
 * @returns {boolean}
 */
export function deleteTeacherDraft(userId, draftId) {
  if (!userId || !draftId) return false;
  const drafts = getTeacherDrafts(userId);
  const filtered = drafts.filter((d) => d.id !== draftId);
  try {
    localStorage.setItem(`${STORAGE_PREFIX}${userId}`, JSON.stringify(filtered));
    return true;
  } catch (err) {
    console.error("Failed to delete draft from storage:", err);
    return false;
  }
}

/**
 * Encode extended event metadata cleanly into the description string
 * Uses a safe HTML comment tag <!--CC_METADATA:{...}--> so standard renderers ignore it
 * @param {string} baseDescription
 * @param {Object} metadata
 * @returns {string}
 */
export function encodeEventMetadata(baseDescription = "", metadata = {}) {
  const cleanBase = (baseDescription || "")
    .replace(/\s*<!--CC_METADATA:[\s\S]*?-->/g, "")
    .trim();

  const payload = {
    startTime: metadata.startTime || metadata.start_time || "",
    endTime: metadata.endTime || metadata.end_time || "",
    department: metadata.department || "",
    organizer: metadata.organizer || "",
    expectedParticipants: metadata.expectedParticipants || metadata.expected_participants || "",
    contactInfo: metadata.contactInfo || metadata.contact_info || "",
  };

  const jsonStr = JSON.stringify(payload);
  return cleanBase ? `${cleanBase}\n\n<!--CC_METADATA:${jsonStr}-->` : `<!--CC_METADATA:${jsonStr}-->`;
}

/**
 * Decode extended event metadata from the description string
 * @param {string} rawDescription
 * @returns {{ description: string, meta: Object }}
 */
export function decodeEventMetadata(rawDescription = "") {
  if (!rawDescription || typeof rawDescription !== "string") {
    return {
      description: "",
      meta: {
        startTime: "",
        endTime: "",
        department: "",
        organizer: "",
        expectedParticipants: "",
        contactInfo: "",
      },
    };
  }

  const match = rawDescription.match(/<!--CC_METADATA:([\s\S]*?)-->/);
  let meta = {
    startTime: "",
    endTime: "",
    department: "",
    organizer: "",
    expectedParticipants: "",
    contactInfo: "",
  };

  if (match && match[1]) {
    try {
      meta = { ...meta, ...JSON.parse(match[1]) };
    } catch {
      // ignore JSON parse failures
    }
  }

  const cleanDescription = rawDescription
    .replace(/\s*<!--CC_METADATA:[\s\S]*?-->/g, "")
    .trim();

  return {
    description: cleanDescription,
    meta,
  };
}

/**
 * Duplicate an event (DB event or Draft) into a new Draft for the teacher
 * @param {string} userId
 * @param {Object} sourceEvent
 * @returns {Object} Newly created draft
 */
export function duplicateEventAsDraft(userId, sourceEvent) {
  if (!userId || !sourceEvent) {
    throw new Error("User ID and source event are required to duplicate an event");
  }

  const { description: cleanDesc, meta } = decodeEventMetadata(sourceEvent.description || "");

  const baseTitle = sourceEvent.event_name || sourceEvent.eventName || "Untitled Event";
  const newTitle = baseTitle.startsWith("Copy of ") ? `${baseTitle} (Copy)` : `Copy of ${baseTitle}`;

  const draftData = {
    eventName: newTitle,
    eventDate: sourceEvent.event_date || sourceEvent.eventDate || "",
    eventType: sourceEvent.event_type || sourceEvent.eventType || "",
    location: sourceEvent.location || "",
    startTime: meta.startTime || sourceEvent.start_time || sourceEvent.startTime || "",
    endTime: meta.endTime || sourceEvent.end_time || sourceEvent.endTime || "",
    department: meta.department || sourceEvent.department || "",
    organizer: meta.organizer || sourceEvent.organizer || "",
    expectedParticipants: meta.expectedParticipants || sourceEvent.expected_participants || sourceEvent.expectedParticipants || "",
    contactInfo: meta.contactInfo || sourceEvent.contact_info || sourceEvent.contactInfo || "",
    description: cleanDesc,
    socialNetworkUrl: sourceEvent.social_network_url || sourceEvent.socialNetworkUrl || "",
    status: "draft",
  };

  return saveTeacherDraft(userId, draftData);
}
