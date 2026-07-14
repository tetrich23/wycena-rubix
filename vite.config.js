import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// WAŻNE: zmień "wycena-rubix" na dokładną nazwę swojego repozytorium na GitHubie.
// Jeśli repo nazywa się np. "moj-projekt", ustaw base: "/moj-projekt/".
export default defineConfig({
  plugins: [react()],
  base: "/wycena-rubix/",
});
