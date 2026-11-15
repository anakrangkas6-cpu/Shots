import { Capacitor, registerPlugin } from '@capacitor/core';

export interface NativePickedVideo {
  id: string;
  name: string;
  size: number;
  mimeType: string;
  duration: number;
  url: string;
  thumbUrl: string;
}

interface KilasMediaPluginContract {
  getServerInfo(): Promise<{ baseUrl: string; port: number }>;
  pickVideos(options?: {
    multiple?: boolean;
  }): Promise<{ cancelled?: boolean; videos: NativePickedVideo[] }>;
  pickFolderVideos(): Promise<{
    cancelled?: boolean;
    folderName?: string;
    videos: NativePickedVideo[];
  }>;
  deleteMedia(options: { id: string }): Promise<void>;
  openNativePlayer(options: {
    url: string;
    title?: string;
    muted?: boolean;
  }): Promise<void>;
}

const KilasMedia = registerPlugin<KilasMediaPluginContract>('KilasMedia');

let cachedBaseUrlPromise: Promise<string | null> | null = null;

export interface CachedNativeMediaResult {
  id?: string;
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

export function buildNativeMediaUrls(
  baseUrl: string,
  nativeMediaId: string,
): { url: string; thumbUrl: string } {
  return {
    url: `${baseUrl}/media/${encodeURIComponent(nativeMediaId)}`,
    thumbUrl: `${baseUrl}/thumb/${encodeURIComponent(nativeMediaId)}.jpg`,
  };
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
      id?: string;
      url?: string;
      thumbUrl?: string;
      duration?: number;
    };
    if (!data?.ok || !data.url) return null;
    return {
      id: data.id || key,
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

export async function pickNativeVideos(
  multiple = true,
): Promise<{ cancelled: boolean; videos: NativePickedVideo[] } | null> {
  if (!isNativeAndroid()) return null;
  try {
    const res = await KilasMedia.pickVideos({ multiple });
    return {
      cancelled: Boolean(res?.cancelled),
      videos: Array.isArray(res?.videos) ? res.videos : [],
    };
  } catch {
    return null;
  }
}

export async function pickNativeFolder(): Promise<{
  cancelled: boolean;
  folderName: string;
  videos: NativePickedVideo[];
} | null> {
  if (!isNativeAndroid()) return null;
  try {
    const res = await KilasMedia.pickFolderVideos();
    return {
      cancelled: Boolean(res?.cancelled),
      folderName: res?.folderName || 'Folder Pribadi',
      videos: Array.isArray(res?.videos) ? res.videos : [],
    };
  } catch {
    return null;
  }
}

export async function deleteNativeMedia(nativeMediaId: string): Promise<void> {
  if (!isNativeAndroid() || !nativeMediaId) return;
  try {
    await KilasMedia.deleteMedia({ id: nativeMediaId });
  } catch {
    // ignore cleanup error
  }
}

export async function openNativeAndroidPlayer(options: {
  url: string;
  title?: string;
  muted?: boolean;
}): Promise<boolean> {
  if (!isNativeAndroid()) return false;
  await KilasMedia.openNativePlayer(options);
  return true;
}
