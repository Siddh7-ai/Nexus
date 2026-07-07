import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    allowedHosts: true
  },
  optimizeDeps: {
    exclude: ['@xenova/transformers']
  },
  resolve: {
    alias: {
      'onnxruntime-web/webgpu': 'onnxruntime-web'
    }
  },
  worker: {
    format: 'es'
  },
  build: {
    minify: 'esbuild',
    sourcemap: false,
    cssCodeSplit: true,
    chunkSizeWarningLimit: 250, // Flag chunk sizes over 250KB for budget tracking
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('emoji-picker-react')) {
              return 'emoji-picker';
            }
            if (id.includes('framer-motion')) {
              return 'framer-motion';
            }
            if (id.includes('libsodium-wrappers-sumo') || id.includes('double-ratchet-ts')) {
              return 'crypto-libs';
            }
            if (id.includes('gsap')) {
              return 'gsap';
            }
            if (id.includes('react-router-dom') || id.includes('react-router') || id.includes('@remix-run')) {
              return 'routing-libs';
            }
            if (id.includes('@tanstack')) {
              return 'react-query';
            }
            return 'vendor';
          }
        }
      }
    }
  }
})