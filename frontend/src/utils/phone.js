/**
 * Mobile-number input handling, mirroring `normalize_phone` in
 * backend/app/schemas/common.py.
 *
 * PRD 6 asks for ten digits, numeric only. The two rules have to agree or a
 * number the form accepts is rejected on submit, with the teacher shown an
 * error about a field that looks correct.
 */

/**
 * What the field should hold after this keystroke or paste.
 *
 * Strips separators, then a leading country code — but only once there are
 * more digits than a local number can hold, so a number being typed one digit
 * at a time is never mangled halfway through.
 */
export function normalizePhoneInput(value) {
  let digits = String(value || "").replace(/\D/g, "");

  if (digits.length > 10) {
    if (digits.startsWith("91") && digits.length >= 12) {
      digits = digits.slice(2);
    } else if (digits.startsWith("0")) {
      digits = digits.slice(1);
    }
  }

  return digits.slice(0, 10);
}

/** PRD 6: exactly ten digits. Blank is valid — the field is optional. */
export function isValidPhone(value) {
  const text = String(value || "").trim();
  return text === "" || /^\d{10}$/.test(text);
}
