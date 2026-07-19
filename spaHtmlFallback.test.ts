import { describe, expect, it } from 'vitest'
import { shouldRewriteToIndexHtml } from './spaHtmlFallback.js'

describe('shouldRewriteToIndexHtml', () => {
    it('rewrites app shell routes for HTML navigations', () => {
        expect(shouldRewriteToIndexHtml('/crm', 'text/html')).toBe(true)
        expect(shouldRewriteToIndexHtml('/requests', 'text/html,application/xhtml+xml')).toBe(true)
        expect(shouldRewriteToIndexHtml('/hub/feed', 'text/html')).toBe(true)
    })

    it('does not rewrite module, asset, or API requests', () => {
        expect(shouldRewriteToIndexHtml('/CRM.tsx', 'text/html')).toBe(false)
        expect(shouldRewriteToIndexHtml('/main.tsx', '*/*')).toBe(false)
        expect(shouldRewriteToIndexHtml('/crm', '*/*')).toBe(false)
        expect(shouldRewriteToIndexHtml('/api/health', 'text/html')).toBe(false)
        expect(shouldRewriteToIndexHtml('/@vite/client', 'text/html')).toBe(false)
        expect(shouldRewriteToIndexHtml('/', 'text/html')).toBe(false)
    })
})
