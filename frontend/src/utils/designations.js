/**
 * Academic designations offered on the registration form.
 *
 * Suggestions, not a whitelist: the field is a Combobox with `allowCustom`
 * behaviour, and the server validates only the shape (non-blank, at most 120
 * characters). Visiting, emeritus and administrative titles are real and a
 * closed list would lock those people out of registering, so anything typed is
 * kept. There is therefore nothing here the backend must be kept in step with.
 *
 * Ordered by how often faculty pick them rather than alphabetically, so the
 * three teaching ranks sit at the top of the list where they are reached
 * without scrolling.
 */
export const DESIGNATION_SUGGESTIONS = [
  "Assistant Professor",
  "Associate Professor",
  "Professor",
  "Senior Lecturer",
  "Lecturer",
  "Head of Department",
  "Dean",
  "Principal",
  "Director",
  "Registrar",
  "Research Scholar",
  "Visiting Faculty",
  "Guest Faculty",
  "Lab Instructor",
  "Teaching Assistant",
];

/** Shape the Combobox expects: `{ id, name }`. */
export const DESIGNATION_OPTIONS = DESIGNATION_SUGGESTIONS.map((name) => ({
  id: name,
  name,
}));

/** Collapse runs of whitespace, mirroring the server's normalizer. */
export const normalizeDesignation = (value) => (value || "").trim().replace(/\s+/g, " ");

/** The server's own cap, so the form rejects an over-long value before sending it. */
export const MAX_DESIGNATION_LENGTH = 120;
