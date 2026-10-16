import React from 'react';
import { render, screen } from '@testing-library/react';
import { afterEach, test, vi } from 'vitest';
import App from './App';

afterEach(() => {
  vi.restoreAllMocks();
});

test('shows the sign-in screen when there is no active session', async () => {
  vi.spyOn(global, 'fetch').mockResolvedValue({ status: 401, ok: false } as Response);

  render(<App />);

  expect(await screen.findByRole('heading', { name: /expensely/i })).toBeInTheDocument();
  expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
  expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
});
