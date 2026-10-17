import { RouterProvider, createRouter } from '@tanstack/react-router';
import { parseSearch } from './searchParams';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { routeTree } from './routeTree.gen';
import './ui/tokens.css';
import './ui/ui.css';

const router = createRouter({ routeTree, parseSearch });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
