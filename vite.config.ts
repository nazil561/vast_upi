import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Configure base path for GitHub Pages deployment
// Replace 'Offline_UPI_Simulator' with your actual repository name if different
const BASE_PATH = process.env.GITHUB_PAGES ? '/Offline_UPI_Simulator/' : '/'

export default defineConfig({
  plugins: [react()],
  base: BASE_PATH,
  build: {
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
          firebase: ['firebase/app', 'firebase/auth', 'firebase/firestore']
        }
      }
    }
  }
})
