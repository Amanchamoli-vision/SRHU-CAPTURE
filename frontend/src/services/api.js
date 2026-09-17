const configuredApiBaseUrl = import.meta.env.VITE_API_BASE_URL;

if (!configuredApiBaseUrl) {
  throw new Error(
    "VITE_API_BASE_URL must be set to the public FastAPI API URL."
  );
}
const resolveApiBaseUrl = () => {
  const url = configuredApiBaseUrl.replace(/\/+$/, "");
  if (typeof window !== "undefined" && window.location?.hostname) {
    const currentHost = window.location.hostname;
    // When accessed from another device on the same local network (e.g. 192.168.x.x, 172.16.x.x, 10.x.x.x),
    // map localhost/127.0.0.1 to the current host so other devices can reach the backend.
    if (currentHost !== "localhost" && currentHost !== "127.0.0.1") {
      try {
        const parsed = new URL(url);
        if (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1") {
          parsed.hostname = currentHost;
          return parsed.origin;
        }
      } catch {
        // Fallback to configured URL if parsing fails
      }
    }
  }
  return url;
};

export const API_BASE_URL = resolveApiBaseUrl();
