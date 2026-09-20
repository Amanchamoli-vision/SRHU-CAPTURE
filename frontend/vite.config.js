import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  server: {
    host: true,
    port: 5173,
  },

  // Unit tests only. Playwright owns tests/*.spec.js and cannot be loaded by
  // vitest, so the two runners are kept apart by filename: *.test.js here,
  // *.spec.js there.
  test: {
    include: ["tests/unit/**/*.test.js"],
    environment: "node",
  },
})