import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Konfigurasi minimal: cukup aktifkan Fast Refresh untuk React.
// Tidak mengubah struktur folder/proyek yang sudah ada.
export default defineConfig({
  plugins: [react()],
});
