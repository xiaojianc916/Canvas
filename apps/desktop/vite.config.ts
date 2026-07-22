import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    hmr: {
      // 使用 Hybrid Canvas 自己的错误界面，禁止显示 Vite 默认 Overlay。
      overlay: false,
    },
  },
  // Do not expose the complete TAURI_* environment namespace to WebView code.
  // Build-time Tauri variables remain available here through process.env.
  envPrefix: ['VITE_'],
  build: {
    manifest: true,
    target: process.env.TAURI_PLATFORM === 'windows' ? 'chrome105' : 'safari13',
    minify: !process.env.TAURI_DEBUG ? 'esbuild' : false,
    sourcemap: !!process.env.TAURI_DEBUG,
  },
})
