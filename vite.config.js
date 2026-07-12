import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [
        react({
            include: '**/*.{jsx,tsx}',
        }),
    ],
    server: {
        // Listen on all interfaces so http://127.0.0.1:5173 works (default [::1]-only breaks IPv4 on Windows).
        host: true,
        port: 5173,
        strictPort: true,
        allowedHosts: ['app.as-saas.com'],
        proxy: {
            '/api': {
                target: 'http://as-backend:8000',
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
        },
    },
    test: {
        environment: 'node',
    },
    build: {
        rollupOptions: {
            output: {
                manualChunks: {
                    'vendor-react': ['react', 'react-dom'],
                    'vendor-recharts': ['recharts'],
                    'vendor-lucide': ['lucide-react'],
                },
            },
        },
    },
})
