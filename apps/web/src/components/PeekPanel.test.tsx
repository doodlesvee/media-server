import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PeekPanel } from "./PeekPanel";
import { AppearanceProvider } from "@/lib/appearance";
import { QueueProvider } from "@/lib/queue";
import { ToastProvider } from "@/lib/toast";

const item = {
  id: 1,
  itemType: "video",
  title: "A video",
  description: null,
  performers: [],
  tags: [],
  isFavorite: false,
  watched: false,
  durationSeconds: 120,
  lastPositionSeconds: 0,
  studio: null,
  releaseDate: null,
  thumbnailFile: null,
};

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const body = /\/api\/media-items\/1$/.test(url)
        ? item
        : url.includes("/api/appearance")
          ? { appearance: {} }
          : { items: [], tags: [], performers: [], collections: [] };
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }),
  );
});

async function renderPanel() {
  const onClose = vi.fn();
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <AppearanceProvider>
          <QueueProvider>
            <button type="button">Something behind</button>
            <PeekPanel
              itemId={1}
              onClose={onClose}
              onOpenDetails={() => {}}
              onPlay={() => {}}
            />
          </QueueProvider>
        </AppearanceProvider>
      </ToastProvider>
    </QueryClientProvider>,
  );
  await screen.findByRole("dialog");
  return { onClose, user: userEvent.setup() };
}

describe("PeekPanel dismissal", () => {
  it("closes on its own button", async () => {
    const { onClose, user } = await renderPanel();
    await user.click(screen.getByRole("button", { name: "Close peek panel" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("closes on Escape", async () => {
    const { onClose, user } = await renderPanel();
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalled();
  });

  /**
   * The reported bug.
   *
   * Escape used to require focus to be inside the panel. Clicking anywhere
   * outside moved focus to <body> — and since clicking away did not close it
   * either, the panel became unclosable by every route except its own button.
   * The panel is non-modal by design, so focus leaving it is ordinary rather
   * than a signal to stop listening.
   */
  it("closes on Escape even when focus has left it", async () => {
    const { onClose, user } = await renderPanel();
    (document.activeElement as HTMLElement)?.blur();
    expect(document.activeElement).toBe(document.body);

    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalled();
  });

  it("closes when you click away", async () => {
    const { onClose, user } = await renderPanel();
    await user.click(screen.getByRole("button", { name: "Something behind" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("stays open when you click inside it", async () => {
    const { onClose, user } = await renderPanel();
    await user.click(screen.getByRole("heading", { name: /Tags/i }));
    expect(onClose).not.toHaveBeenCalled();
  });

  // A toast sits above the page too, and clicking its Undo is not "clicking
  // away" — losing the panel mid-correction would be its own small betrayal.
  it("stays open when you click a toast", async () => {
    const { onClose } = await renderPanel();

    const toast = document.createElement("div");
    toast.setAttribute("role", "status");
    const button = document.createElement("button");
    toast.append(button);
    document.body.append(toast);

    button.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    await waitFor(() => expect(onClose).not.toHaveBeenCalled());
    toast.remove();
  });

  // Escape belongs to whatever is on top. A modal opened over the peek must
  // not have its Escape stolen by the panel underneath.
  it("leaves Escape alone while a modal is open over it", async () => {
    const { onClose, user } = await renderPanel();

    const modal = document.createElement("div");
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    document.body.append(modal);

    await user.keyboard("{Escape}");
    expect(onClose).not.toHaveBeenCalled();
    modal.remove();
  });
});
