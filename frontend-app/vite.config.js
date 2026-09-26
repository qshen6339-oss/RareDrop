import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

// RareDrop is meant to be opened from phones and other computers on the same
// network, so both the dev server and the preview server listen on every
// interface instead of 127.0.0.1 only. `allowedHosts: true` keeps hostnames
// such as my-laptop.local reachable; plain IP addresses are always allowed.
const shared = {
  host: true,
  allowedHosts: true,
  proxy: {
    "/api": {
      target: "http://127.0.0.1:3333",
      changeOrigin: true,
      rewrite: (path) => path.replace(/^\/api/, ""),
    },
  },
};

export default defineConfig({
  plugins: [vue()],
  server: shared,
  preview: shared,
});
