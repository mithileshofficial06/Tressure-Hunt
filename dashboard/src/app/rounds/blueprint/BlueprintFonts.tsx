/**
 * The round's typefaces.
 *
 * Rendered as `<link>` elements rather than `@import`ed from `blueprint.css`,
 * because the `@import` silently did nothing: this app's CSS pipeline
 * (Tailwind v4 / Lightning CSS under Turbopack) rewrites imports for bundling,
 * and the remote stylesheet never reached the browser. The symptom was the
 * whole round rendering in fallback faces with icon names — "terminal",
 * "settings_input_component" — printed as body text.
 *
 * React 19 hoists `<link rel="stylesheet">` into <head> wherever it is
 * rendered, so this component can live inside the route and the fonts load
 * ONLY on the two blueprint pages rather than on every page of the hunt.
 *
 * WHY NOT `next/font/google`? It is the better tool in general — self-hosted,
 * no runtime request, no layout shift — but it resolves fonts at BUILD time,
 * and this is going out today from a network that has already proved
 * unreliable. `<link>` degrades to a fallback face if fonts.googleapis.com is
 * slow; a failed `next/font` fetch fails the build. Worth revisiting after the
 * event.
 *
 * The families, per the style brief:
 *   Anton         — titles, buttons, headers
 *   Space Mono    — badges, technical labels, tags
 *   Courier Prime — body copy
 *   Bebas Neue    — referenced by one rule in blueprint.css
 *   Material Symbols Outlined — the icon font
 *
 * `display=swap` everywhere: text paints immediately in a fallback and swaps
 * when the real face lands, rather than a venue on slow wifi staring at
 * invisible headings.
 */
export default function BlueprintFonts() {
  return (
    <>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Anton&family=Bebas+Neue&family=Courier+Prime:ital,wght@0,400;0,700;1,400;1,700&family=Space+Mono:ital,wght@0,400;0,700;1,400;1,700&family=JetBrains+Mono:wght@400;700&display=swap"
      />
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@24,400,0,0&display=swap"
      />
    </>
  );
}
