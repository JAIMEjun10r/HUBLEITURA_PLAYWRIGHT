import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "node",
    include: ["server/**/*.test.ts", "client/**/*.test.{ts,tsx}"],
    coverage: { reporter: ["text", "html"] },
  },
});
