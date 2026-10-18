import { RouterProvider, createRouter } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { routeTree } from "./routeTree.gen";
import "./ui/tokens.css";
import "./ui/ui.css";

const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

const root = createRoot(document.getElementById("root")!);
if (import.meta.env.DEV && location.pathname === "/__screens") {
  // 開発用の画面の一覧。本番のビルドではこの分岐ごと消える。
  void import("./dev/ScreenGallery").then(({ ScreenGallery }) =>
    root.render(
      <StrictMode>
        <ScreenGallery />
      </StrictMode>,
    ),
  );
} else {
  root.render(
    <StrictMode>
      <RouterProvider router={router} />
    </StrictMode>,
  );
}
