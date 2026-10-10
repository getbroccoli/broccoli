import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  // `pnpm dev` points the proxy at the api container; otherwise the API runs on this host.
  const { API_PROXY_TARGET: apiTarget = "http://localhost:3000" } = loadEnv(
    mode,
    ".",
    "API_PROXY_",
  );
  return {
    // The router plugin must run before the React plugin.
    plugins: [tanstackRouter({ target: "react", autoCodeSplitting: true }), react(), tailwindcss()],
    resolve: { tsconfigPaths: true },
    server: {
      host: true,
      port: 5173,
      strictPort: true,
      proxy: { "/healthz": apiTarget, "/readyz": apiTarget },
    },
  };
});
