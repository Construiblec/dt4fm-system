import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "react-router-dom";
import { router } from "./app/router/router";
// Debe evaluarse antes del primer render para no perder `beforeinstallprompt`.
import "@/shared/pwa/installPromptStore";
// Antes del primer render: la PWA que se abre con una sesión caducada debe ir
// al login, no pintar pantallas vacías esperando a la primera llamada.
import "@/shared/auth/sessionWatch";
import { AutoUpdate } from "@/shared/components/AutoUpdate";
import "./index.css";

const queryClient = new QueryClient();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
      {/* Fuera del router: es quien registra el service worker y no puede
          depender de que una pagina use AppLayout. Aplica sola cada versión
          nueva en un momento seguro (ver AutoUpdate). */}
      <AutoUpdate />
    </QueryClientProvider>
  </StrictMode>,
);
