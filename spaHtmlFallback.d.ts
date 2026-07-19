/** Ambient types for spaHtmlFallback.js (Vite middleware helper). */
export function shouldRewriteToIndexHtml(
  urlPath: string,
  acceptHeader: string | undefined,
  method?: string
): boolean;

export function spaHtmlFallback(): {
  name: string;
  configureServer: (server: { middlewares: { use: (fn: (...args: any[]) => void) => void } }) => void;
};
