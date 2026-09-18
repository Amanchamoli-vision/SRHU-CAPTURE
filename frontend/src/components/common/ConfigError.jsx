/**
 * Shown instead of the app when the build has no API URL (VITE_API_BASE_URL),
 * so a misconfigured deployment explains itself instead of a blank page.
 */
export default function ConfigError({ message }) {
  return (
    <div className="hv-root flex min-h-screen items-center justify-center p-6">
      <div className="glass max-w-lg p-8 text-center" role="alert">
        <h1 className="font-display text-xl font-bold text-ink">Campus Capture is not configured</h1>
        <p className="prose-muted mt-3 text-sm">{message}</p>
      </div>
    </div>
  );
}
