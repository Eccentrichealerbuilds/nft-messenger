import { defineConfig } from "vite";
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      util: 'util',
    },
  },
  server: {
    host: true,
    port: 5173,
    strictPort: true
   }
});
