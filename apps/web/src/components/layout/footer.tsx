import Image from 'next/image';
import Link from 'next/link';
import { BRAND, PRIMARY_NAV } from '@apteez/config';

/** Rich persistent footer with gradient hairline, brand and section links. */
export function SiteFooter(): React.JSX.Element {
  const year = new Date().getFullYear();
  return (
    <footer className="relative border-t border-border/70">
      <span
        className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent"
        aria-hidden
      />
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-6 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
        <div className="group flex items-center gap-2.5">
          <span className="relative">
            <Image
              src="/logo.svg"
              alt=""
              width={28}
              height={28}
              loading="lazy"
              className="size-7 rounded-lg transition-transform duration-300 group-hover:rotate-6 group-hover:scale-110"
            />
            <span
              className="absolute inset-0 -z-10 rounded-lg bg-primary/30 blur-md opacity-0 transition-opacity duration-300 group-hover:opacity-100"
              aria-hidden
            />
          </span>
          <div>
            <p className="text-sm font-semibold text-foreground">{BRAND.name}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{BRAND.tagline}</p>
          </div>
        </div>
        <nav aria-label="Footer" className="flex flex-wrap gap-x-4 gap-y-1">
          {PRIMARY_NAV.slice(1).map((item) => (
            <Link
              key={item.key}
              href={item.href}
              className="group relative text-xs text-muted-foreground transition-colors hover:text-primary"
            >
              {item.label}
              <span
                className="absolute -bottom-0.5 left-0 h-px w-0 bg-gradient-to-r from-primary to-accent-foreground transition-all duration-300 group-hover:w-full"
                aria-hidden
              />
            </Link>
          ))}
        </nav>
        <p className="text-xs text-muted-foreground">
          © {year} {BRAND.name} · <span className="gradient-text-cool font-semibold">crafted for achievers</span>
        </p>
      </div>
    </footer>
  );
}
