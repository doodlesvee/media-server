import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { AuthGate } from "@/components/AuthGate";
import { AppearanceProvider } from "@/lib/appearance";
import { QueueProvider } from "@/lib/queue";
import { ToastProvider } from "@/lib/toast";
import "./index.css";
import { router } from "./router";

const queryClient = new QueryClient();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
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
  </StrictMode>,
);
