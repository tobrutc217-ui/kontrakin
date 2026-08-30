import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Konfigurasi minimal: cukup aktifkan Fast Refresh untuk React.
// Tidak mengubah struktur folder/proyek yang sudah ada.
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 3000,
    strictPort: true,
    allowedHosts: 'all',
  },
});
