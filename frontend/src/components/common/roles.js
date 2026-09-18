/**
 * Account roles, expressed the Himovation way: one mid-tone hex per role,
 * handed to CSS as `--track`, from which the chip fill, border, dot, icon
 * tile and stat glow are all derived with `color-mix()`.
 *
 * Teacher takes the sky hue and Dean the violet, matching the event-status
 * palette in components/teacher/status.js so a user's role and their events
 * never fight for the same colour.
 */

export const ROLE_TRACK = {
  teacher: "#0EA5E9", // sky
  dean: "#8B5CF6",    // violet
  superadmin: "#F59E0B", // amber
};

export const ROLE_LABEL = {
  teacher: "Teacher",
  dean: "Dean",
  superadmin: "Super Admin",
};

const NEUTRAL_TRACK = "#64748B"; // slate, for an unrecognised role

export const normalizeRole = (role) => String(role ?? "").trim().toLowerCase();

export const trackOfRole = (role) => ROLE_TRACK[normalizeRole(role)] || NEUTRAL_TRACK;

export const labelOfRole = (role) => ROLE_LABEL[normalizeRole(role)] || "Unknown";

/** Initials for the avatar disc: "Aparna Sharma" → "AS", "dean@x" → "DE". */
export const initialsOf = (name, email) => {
  const source = String(name || "").trim() || String(email || "").trim();
  if (!source) return "?";
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return source.slice(0, 2).toUpperCase();
};

/** Where each role lands after signing in. */
export const ROLE_HOME = {
  teacher: "/teacher/dashboard",
  dean: "/dean/dashboard",
  superadmin: "/superadmin/dashboard",
};

/** The screen where a Dean with a temporary password must set a new one. */
export const DEAN_PASSWORD_PATH = "/dean/profile";

/** True when this user must replace a temporary password before anything else. */
export const mustChangePassword = (user) =>
  normalizeRole(user?.role) === "dean" && user?.must_change_password === true;

/**
 * Where to send a user after sign-in.
 *
 * `from` is the location ProtectedRoute stored when it bounced them to /login
 * (a location object or a path string). It is honoured only for a same-app
 * path ("/..." but not "//...") inside the user's own role area; anything
 * else falls back to the role's dashboard.
 */
export const postLoginPath = (user, from) => {
  const role = normalizeRole(user?.role);
  if (mustChangePassword(user)) return DEAN_PASSWORD_PATH;
  const home = ROLE_HOME[role] || null;
  if (!home) return null;

  const target =
    typeof from === "string"
      ? from
      : from && typeof from.pathname === "string"
        ? `${from.pathname}${from.search || ""}${from.hash || ""}`
        : "";

  const safe =
    target.startsWith("/") &&
    !target.startsWith("//") &&
    !target.includes("\\") &&
    target.startsWith(`/${role}/`);

  return safe ? target : home;
};
