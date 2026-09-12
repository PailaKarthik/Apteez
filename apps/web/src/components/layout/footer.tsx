import Link from 'next/link';
import { BRAND, PRIMARY_NAV } from '@apteez/config';

/** Slim persistent footer with brand and section links. */
export function SiteFooter(): React.JSX.Element {
  const year = new Date().getFullYear();
  return (
    <footer className="border-t">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-6 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
        <div>
          <p className="text-sm font-semibold text-foreground">{BRAND.name}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{BRAND.tagline}</p>
        </div>
        <nav aria-label="Footer" className="flex flex-wrap gap-x-4 gap-y-1">
          {PRIMARY_NAV.slice(1).map((item) => (
            <Link
              key={item.key}
              href={item.href}
              className="text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <p className="text-xs text-muted-foreground">
          © {year} {BRAND.name}
        </p>
      </div>
    </footer>
  );
}
