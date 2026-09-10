const configuredApiBaseUrl = import.meta.env.VITE_API_BASE_URL;

if (!configuredApiBaseUrl) {
  throw new Error(
    "VITE_API_BASE_URL must be set to the public FastAPI API URL."
  );
}

export const API_BASE_URL = configuredApiBaseUrl.replace(/\/+$/, "");
