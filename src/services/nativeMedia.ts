import { Capacitor, registerPlugin } from '@capacitor/core';

interface KilasMediaPluginContract {
  getServerInfo(): Promise<{ baseUrl: string; port: number }>;
  openNativePlayer(options: {
    url: string;
    title?: string;
    muted?: boolean;
  }): Promise<void>;
}

const KilasMedia = registerPlugin<KilasMediaPluginContract>('KilasMedia');

let cachedBaseUrlPromise: Promise<string | null> | null = null;

export interface CachedNativeMediaResult {
  url: string;
  thumbUrl?: string;
  duration?: number;
}

export function isNativeAndroid(): boolean {
  try {
    return (
      Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android'
    );
  } catch {
    return false;
  }
}

export async function getNativeMediaServerUrl(): Promise<string | null> {
  if (!isNativeAndroid()) return null;
  if (!cachedBaseUrlPromise) {
    cachedBaseUrlPromise = KilasMedia.getServerInfo()
      .then((res) => res?.baseUrl || null)
      .catch(() => null);
  }
  return cachedBaseUrlPromise;
}

function makeStableKey(id: string): string {
  const clean = id.replace(/[^a-zA-Z0-9._-]/g, '_');
  if (clean.length <= 72) return clean;
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) | 0;
  }
  return `${clean.slice(0, 48)}_${(hash >>> 0).toString(16)}`;
}

export async function cacheBlobToNativeServer(
  id: string,
  blob: Blob,
  mimeType = 'video/mp4',
): Promise<CachedNativeMediaResult | null> {
  const baseUrl = await getNativeMediaServerUrl();
  if (!baseUrl) return null;

  const key = makeStableKey(id);
  const uploadUrl = `${baseUrl}/upload?id=${encodeURIComponent(key)}&mime=${encodeURIComponent(mimeType || 'video/mp4')}`;

  const tryUpload = async (payload: BodyInit) => {
    const response = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        'Content-Type': mimeType || 'video/mp4',
      },
      body: payload,
    });
    if (!response.ok) return null;
    const data = (await response.json()) as {
      ok?: boolean;
      url?: string;
      thumbUrl?: string;
      duration?: number;
    };
    if (!data?.ok || !data.url) return null;
    return {
      url: data.url,
      thumbUrl: data.thumbUrl || undefined,
      duration:
        typeof data.duration === 'number' && data.duration > 0
          ? data.duration
          : undefined,
    };
  };

  try {
    const direct = await tryUpload(blob);
    if (direct) return direct;
  } catch {
    // Fallback to materialized ArrayBuffer below
  }

  try {
    const buf = await blob.arrayBuffer();
    return await tryUpload(buf);
  } catch {
    return null;
  }
}

export async function openNativeAndroidPlayer(options: {
  url: string;
  title?: string;
  muted?: boolean;
}): Promise<boolean> {
  if (!isNativeAndroid()) return false;
  try {
    await KilasMedia.openNativePlayer(options);
    return true;
  } catch {
    return false;
  }
}
