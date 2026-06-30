import { useAuthStore } from '../stores/auth';

const API_URL = (import.meta.env.VITE_API_URL ?? 'http://localhost:3000').replace(/\/$/, '');

export class ApiError extends Error {
  status: number;
  fieldErrors?: Record<string, string[]>;
  constructor(status: number, message: string, fieldErrors?: Record<string, string[]>) {
    super(message);
    this.status = status;
    this.fieldErrors = fieldErrors;
  }
}

type RequestOptions = Omit<RequestInit, 'body'> & { body?: unknown; auth?: boolean };

export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { body, auth = true, headers, ...rest } = options;
  const token = useAuthStore.getState().token;

  const finalHeaders: Record<string, string> = {
    ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    ...(headers as Record<string, string>),
  };
  if (auth && token) finalHeaders.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_URL}/api${path}`, {
    ...rest,
    headers: finalHeaders,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401) {
    useAuthStore.getState().logout();
  }

  if (!res.ok) {
    let message = `İstek başarısız (${res.status})`;
    let fieldErrors: Record<string, string[]> | undefined;
    try {
      const data = await res.json();
      message = data.message ?? message;
      fieldErrors = data.errors;
    } catch {
      /* gövde JSON değil */
    }
    throw new ApiError(res.status, message, fieldErrors);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  get: <T>(path: string) => apiFetch<T>(path),
  post: <T>(path: string, body?: unknown) => apiFetch<T>(path, { method: 'POST', body }),
  patch: <T>(path: string, body?: unknown) => apiFetch<T>(path, { method: 'PATCH', body }),
  delete: <T>(path: string) => apiFetch<T>(path, { method: 'DELETE' }),
};

/** Sunucudaki dosya yolunu (ör. /uploads/x.jpg) tam URL'ye çevirir. */
export function assetUrl(path: string): string {
  return path.startsWith('http') ? path : `${API_URL}${path}`;
}

/** Tek dosyayı belirtilen alan adıyla yükler — multipart/form-data. */
export async function uploadSingle<T>(
  path: string,
  file: File,
  field = 'file',
): Promise<T> {
  const token = useAuthStore.getState().token;
  const fd = new FormData();
  fd.append(field, file);

  const res = await fetch(`${API_URL}/api${path}`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: fd,
  });

  if (res.status === 401) useAuthStore.getState().logout();
  if (!res.ok) {
    let message = `Yükleme başarısız (${res.status})`;
    try {
      const data = await res.json();
      message = data.message ?? message;
    } catch {
      /* yoksay */
    }
    throw new ApiError(res.status, message);
  }
  return (await res.json()) as T;
}

/** Çoklu dosya (foto) yükler — multipart/form-data. */
export async function uploadFiles<T>(path: string, files: File[]): Promise<T> {
  const token = useAuthStore.getState().token;
  const fd = new FormData();
  files.forEach((f) => fd.append('files', f));

  const res = await fetch(`${API_URL}/api${path}`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: fd,
  });

  if (res.status === 401) useAuthStore.getState().logout();
  if (!res.ok) {
    let message = `Yükleme başarısız (${res.status})`;
    try {
      const data = await res.json();
      message = data.message ?? message;
    } catch {
      /* yoksay */
    }
    throw new ApiError(res.status, message);
  }
  return (await res.json()) as T;
}
