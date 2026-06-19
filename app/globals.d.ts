declare module "*.css";

// Web components do Shopify App Bridge / Polaris (s-app-nav, s-link, s-card, ...).
// Declaração ampla para o TS não reclamar dos elementos custom no app embedded.
declare namespace JSX {
  interface IntrinsicElements {
    [elemName: `s-${string}`]: any;
  }
}
