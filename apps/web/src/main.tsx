import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { AuthGate } from "@/components/AuthGate";
import { ErrorBoundary, ErrorFallback } from "@/components/ErrorBoundary";
import { AppearanceProvider } from "@/lib/appearance";
import { QueueProvider } from "@/lib/queue";
import { ToastProvider } from "@/lib/toast";
import "./index.css";
import { router } from "./router";

const queryClient = new QueryClient();

/**
 * Registers the service worker, so the app can be installed (§33).
 *
 * Production only. In dev the worker would sit in front of Vite's module
 * graph and serve a stale shell after every edit, which is a confusing way to
 * spend an afternoon.
 *
 * After load, so registering never competes with the first render for the
 * network. A failure is swallowed: an app that cannot be installed is a
 * missing convenience, not a broken library.
 */
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {/* The last resort. The router has its own error component, which keeps
        the shell alive and is what a broken page hits; this one catches what
        it cannot — a provider or the shell itself failing — and so must not
        depend on any of them. */}
    <ErrorBoundary fallback={(props) => <ErrorFallback {...props} />}>
      <QueryClientProvider client={queryClient}>
        {/* Outside AuthGate so a failed sign-in can report itself too. */}
        <ToastProvider>
          <AuthGate>
            <AppearanceProvider>
              <QueueProvider>
                <RouterProvider router={router} />
              </QueueProvider>
            </AppearanceProvider>
          </AuthGate>
        </ToastProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  </StrictMode>,
);
