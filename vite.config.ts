import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ command }) => ({
  plugins: [react()],
  base: command === 'serve' ? '/' : '/vast_upi/',
  build: {
    outDir: 'dist',
    sourcemap: true,
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/firebase')) {
            if (id.includes('firebase/app')) return 'firebase-app';
            if (id.includes('firebase/auth')) return 'firebase-auth';
            if (id.includes('firebase/firestore')) return 'firebase-firestore';
            if (id.includes('firebase/functions')) return 'firebase-functions';
            return 'firebase-core';
          }

          if (id.includes('node_modules/react')) return 'react-vendor';
          if (id.includes('node_modules/react-router-dom')) return 'router-vendor';
        },
      }
    }
  }
}))
