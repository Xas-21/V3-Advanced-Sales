/**
 * Windows FS is case-insensitive, so a browser refresh on /crm resolves to CRM.tsx
 * instead of the SPA shell. Rewrite document navigations to index.html.
 */
export function shouldRewriteToIndexHtml(urlPath, acceptHeader, method = 'GET') {
    if (String(method || 'GET').toUpperCase() !== 'GET') return false
    const accept = String(acceptHeader || '')
    if (!accept.includes('text/html')) return false
    const pathOnly = String(urlPath || '').split('?')[0].split('#')[0]
    if (!pathOnly || pathOnly === '/') return false
    // Keep Vite/module/asset URLs and API/WS proxies untouched.
    if (pathOnly.startsWith('/@') || pathOnly.startsWith('/api') || pathOnly.startsWith('/ws')) return false
    if (pathOnly.includes('.')) return false
    return true
}

export function spaHtmlFallback() {
    return {
        name: 'spa-html-fallback',
        configureServer(server) {
            server.middlewares.use((req, _res, next) => {
                if (shouldRewriteToIndexHtml(req.url, req.headers.accept, req.method)) {
                    req.url = '/index.html'
                }
                next()
            })
        },
        configurePreviewServer(server) {
            server.middlewares.use((req, _res, next) => {
                if (shouldRewriteToIndexHtml(req.url, req.headers.accept, req.method)) {
                    req.url = '/index.html'
                }
                next()
            })
        },
    }
}
