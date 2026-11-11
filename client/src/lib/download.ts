import { api } from './api';

/**
 * Downloads a protected file (PDF, CSV). A plain <a href> can't send the in-memory access
 * token, so we fetch it as a blob through the authenticated Axios instance.
 */
export async function downloadFile(url: string, fallbackName: string, { open = false } = {}) {
  const res = await api.get<Blob>(url, { responseType: 'blob' });
  const disposition = String(res.headers['content-disposition'] ?? '');
  const name = /filename="?([^";]+)"?/.exec(disposition)?.[1] ?? fallbackName;
  const href = URL.createObjectURL(res.data);
  if (open) {
    window.open(href, '_blank', 'noopener');
  } else {
    const a = document.createElement('a');
    a.href = href;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
  setTimeout(() => URL.revokeObjectURL(href), 60_000);
}

export function formatMinutes(min: number) {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  if (!h) return `${m}m`;
  return m ? `${h}h ${m}m` : `${h}h`;
}
