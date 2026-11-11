import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StatusBadge } from '@/components/shared/common';
import LoginPage from '@/pages/LoginPage';
import { previewTotals } from '@/features/invoices/InvoiceEditor';

describe('StatusBadge', () => {
  it('renders a readable label with the right tone', () => {
    render(<StatusBadge value="in-progress" />);
    expect(screen.getByText('in progress')).toBeInTheDocument();
    render(<StatusBadge value="overdue" />);
    expect(screen.getByText('overdue').className).toContain('text-destructive');
  });
});

describe('LoginPage', () => {
  const renderLogin = () =>
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <LoginPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

  it('validates the form before calling the API', async () => {
    renderLogin();
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('Enter a valid email')).toBeInTheDocument();
    expect(screen.getByText('Password is required')).toBeInTheDocument();
  });

  it('fills credentials from the demo buttons', async () => {
    renderLogin();
    await userEvent.click(screen.getByRole('button', { name: 'Client portal' }));
    expect(screen.getByLabelText('Email')).toHaveValue('client@agencyflow.dev');
  });
});

describe('sanity', () => {
  it('shares invoice math with the editor', () => {
    expect(previewTotals([{ quantity: 3, unitPrice: 33.333 }], 10, 0).total).toBe(110);
  });
});
