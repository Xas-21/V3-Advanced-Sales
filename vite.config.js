import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [
        react({
            include: '**/*.{jsx,tsx}',
        }),
    ],
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
        },
    },
    server: {
        // Listen on all interfaces so http://127.0.0.1:5173 works (default [::1]-only breaks IPv4 on Windows).
        host: true,
        port: 5173,
        strictPort: true,
        allowedHosts: ['app.as-saas.com'],
        // Windows + Docker bind mounts: enable only when CHOKIDAR_USEPOLLING=true
        // (set on as-frontend in docker-compose). Host `npm run dev` stays on native watch.
        watch: {
            usePolling: process.env.CHOKIDAR_USEPOLLING === 'true',
            interval: 1000,
        },
        proxy: {
            '/api': {
                target: 'http://as-backend:8000',
                changeOrigin: true,
            },
            '/ws': {
                target: 'ws://as-backend:8000',
                ws: true,
                changeOrigin: true,
            },
        },
    },
    preview: {
        host: true,
        port: 4173,
        strictPort: true,
        proxy: {
            '/api': {
                target: 'http://as-backend:8000',
                changeOrigin: true,
            },
            '/ws': {
                target: 'ws://as-backend:8000',
                ws: true,
                changeOrigin: true,
            },
        },
    },
    test: {
        environment: 'node',
    },
    build: {
        rollupOptions: {
            output: {
                manualChunks: {
                    'vendor-react': ['react', 'react-dom', 'react-router-dom'],
                    'vendor-recharts': ['recharts'],
                    'vendor-lucide': ['lucide-react'],
                },
            },
        },
    },
})
