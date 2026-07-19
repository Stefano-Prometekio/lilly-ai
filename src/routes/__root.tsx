import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import lillyCss from "../lilly.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";

function NotFoundComponent() {
  return (
    <div className="app-error-shell">
      <div className="app-error-card">
        <span className="brand-mark">L</span>
        <span className="app-error-code">404</span>
        <h1>That page isn&apos;t part of this plan.</h1>
        <p>The link may be outdated, or the page may have moved.</p>
        <Link to="/" className="home-btn home-btn--primary">
          Return to Lilly
        </Link>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="app-error-shell">
      <div className="app-error-card">
        <span className="brand-mark">L</span>
        <span className="app-error-code">A small detour</span>
        <h1>This page didn&apos;t load.</h1>
        <p>Your event work is still safe. Try loading the page again or return to Lilly.</p>
        <div className="app-error-actions">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="home-btn home-btn--primary"
          >
            Try again
          </button>
          <a href="/" className="home-btn home-btn--ghost">
            Return to Lilly
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Lilly — Your AI Vendor Sourcing Assistant" },
      {
        name: "description",
        content:
          "Find, compare, and improve catering offers with Lilly, your AI event sourcing assistant.",
      },
      { name: "author", content: "Lilly AI" },
      { property: "og:title", content: "Lilly — Your AI Vendor Sourcing Assistant" },
      {
        property: "og:description",
        content:
          "Find, compare, and improve catering offers with Lilly, your AI event sourcing assistant.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:site", content: "@Lovable" },
      { name: "twitter:title", content: "Lilly — Your AI Vendor Sourcing Assistant" },
      { name: "twitter:description", content: "Find, compare, and improve catering offers with Lilly, your AI event sourcing assistant." },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/26eef755-4c1b-44ad-8181-41bf23e64660/id-preview-61ccd530--27afb7cb-a4a0-4882-a588-4c8e5567f061.lovable.app-1784438107475.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/26eef755-4c1b-44ad-8181-41bf23e64660/id-preview-61ccd530--27afb7cb-a4a0-4882-a588-4c8e5567f061.lovable.app-1784438107475.png" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      {
        rel: "stylesheet",
        href: lillyCss,
      },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Manrope:wght@600;700;800&display=swap",
      },
      { rel: "icon", href: "/favicon.ico", type: "image/x-icon" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
      <Outlet />
    </QueryClientProvider>
  );
}
