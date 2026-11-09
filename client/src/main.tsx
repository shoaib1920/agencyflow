import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { queryClient } from '@/lib/queryClient';
import { ErrorBoundary } from '@/components/shared/ErrorBoundary';
import { applyTheme, useUI } from '@/stores/ui';
import App from './App';
import './index.css';

applyTheme(useUI.getState().theme);
window
  .matchMedia('(prefers-color-scheme: dark)')
  .addEventListener('change', () => applyTheme(useUI.getState().theme));

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <App />
        </BrowserRouter>
        <Toaster richColors closeButton position="bottom-right" />
      </QueryClientProvider>
    </ErrorBoundary>
  </React.StrictMode>,
);
