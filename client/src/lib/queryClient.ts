import { QueryClient } from '@tanstack/react-query';
import axios from 'axios';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      retry: (count, err) => {
        const status = axios.isAxiosError(err) ? err.response?.status : undefined;
        if (status && status >= 400 && status < 500) return false;
        return count < 2;
      },
    },
  },
});

/** Central query keys so invalidation is consistent across features. */
export const qk = {
  me: ['me'] as const,
  dashboard: ['dashboard'] as const,
  activity: ['activity'] as const,
  notifications: ['notifications'] as const,
  users: ['users'] as const,
  clients: (params?: object) => (params ? (['clients', params] as const) : (['clients'] as const)),
  client: (id: string) => ['client', id] as const,
  leads: ['leads'] as const,
  projects: (params?: object) => (params ? (['projects', params] as const) : (['projects'] as const)),
  project: (id: string) => ['project', id] as const,
  tasks: (projectId: string) => ['tasks', projectId] as const,
  projectActivity: (id: string) => ['project-activity', id] as const,
};
