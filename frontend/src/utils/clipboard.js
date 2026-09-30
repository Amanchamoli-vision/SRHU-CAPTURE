/**
 * Copy text, and say whether it worked.
 *
 * `navigator.clipboard` exists only on secure origins (https, localhost), so on
 * the LAN address the app is often opened from it is undefined and calling it
 * threw -- after the button had already said "Copied". The fallback selects a
 * hidden textarea and uses the older copy command, which still works there.
 */
export async function copyText(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through to the older path */
  }
  try {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    return ok;
  } catch {
    return false;
  }
}
