import { useAuthStore } from './auth';

export const apiFetch = async (input: RequestInfo | URL, init: RequestInit = {}) => {
  const token = useAuthStore.getState().token;

  const headers = new Headers(init.headers || {});
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');

  const resp = await fetch(input, { ...init, headers });
  if (resp.status === 401) {
    useAuthStore.getState().logout();
  }
  return resp;
};

