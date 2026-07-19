import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { fileURLToPath } from 'url'
import { spaHtmlFallback } from './spaHtmlFallback.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [
        // Before react(): Windows case-insensitive FS maps /crm → CRM.tsx on refresh.
        spaHtmlFallback(),
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
            // Host `npx vite` cannot resolve Docker DNS `as-backend`; use localhost.
            // Docker Compose frontend still sets CHOKIDAR_USEPOLLING and runs on the compose network.
            '/api': {
                target: process.env.VITE_DEV_API_PROXY || (process.env.CHOKIDAR_USEPOLLING === 'true' ? 'http://as-backend:8000' : 'http://127.0.0.1:8000'),
                changeOrigin: true,
            },
            '/ws': {
                target: process.env.VITE_DEV_WS_PROXY || (process.env.CHOKIDAR_USEPOLLING === 'true' ? 'ws://as-backend:8000' : 'ws://127.0.0.1:8000'),
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
                target: process.env.VITE_DEV_API_PROXY || (process.env.CHOKIDAR_USEPOLLING === 'true' ? 'http://as-backend:8000' : 'http://127.0.0.1:8000'),
                changeOrigin: true,
            },
            '/ws': {
                target: process.env.VITE_DEV_WS_PROXY || (process.env.CHOKIDAR_USEPOLLING === 'true' ? 'ws://as-backend:8000' : 'ws://127.0.0.1:8000'),
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
