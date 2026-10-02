import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Configuracion de Vite. En desarrollo local (npm run dev, fuera de Docker)
// se proxean las llamadas /api hacia el backend en localhost:4000 para
// poder trabajar sin depender del reverse proxy de Nginx.
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:4000",
        changeOrigin: true,
      },
    },
  },
});
