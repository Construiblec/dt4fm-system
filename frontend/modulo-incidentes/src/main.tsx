import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "react-router-dom";
import { router } from "./app/router/router";
// Debe evaluarse antes del primer render para no perder `beforeinstallprompt`.
import "@/shared/pwa/installPromptStore";
import { UpdateAppToast } from "@/shared/components/UpdateAppToast";
import "./index.css";

const queryClient = new QueryClient();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
      {/* Fuera del router: es quien registra el service worker y no puede
          depender de que una pagina use AppLayout. */}
      <UpdateAppToast />
    </QueryClientProvider>
  </StrictMode>,
);
