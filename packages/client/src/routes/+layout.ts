// Disable SSR and prerendering globally — this app is a pure client-side SPA.
// adapter-static generates a static shell; all routing is done in the browser.
export const ssr = false;
export const prerender = false;
