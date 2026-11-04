import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  server: { host: "localhost", port: 8080 },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
      // Domain logic shared with the Edge Functions (filters, types).
      "@shared": path.resolve(import.meta.dirname, "./supabase/functions/_shared"),
    },
  },
});
