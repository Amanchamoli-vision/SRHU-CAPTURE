import { ContourWash } from "./icons";

/**
 * The band that opens every teacher screen: eyebrow, title, one line of
 * context, and room for the page's primary action. The grid, vignette and
 * contour wash are the festival site's hero motifs, dialled down to a size
 * that suits a working screen rather than a landing page.
 */
export default function PageHero({ eyebrow, title, accent, subtitle, actions, children }) {
  return (
    <section className="hero-band reveal p-6 sm:p-8">
      <div className="hero-grid" aria-hidden="true" />
      <div className="hero-vignette" aria-hidden="true" />
      <ContourWash className="contour-bg opacity-40" />

      <div className="relative flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          {eyebrow && <p className="eyebrow">{eyebrow}</p>}
          <h1 className="hero-title mt-2">
            {title}
            {accent && <> <span className="hero-accent">{accent}</span></>}
          </h1>
          {subtitle && (
            <p className="prose-muted mt-2.5 max-w-xl text-sm">{subtitle}</p>
          )}
        </div>

        {actions && <div className="flex shrink-0 flex-wrap gap-2.5">{actions}</div>}
      </div>

      {children && <div className="relative mt-6">{children}</div>}
    </section>
  );
}
