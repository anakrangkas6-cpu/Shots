import {
  FolderSyncStatus,
  ShortVideoItem,
  StoredVideoMeta,
  UserProfile,
  VideoEffectConfig,
} from '../types/shorts';
import { DEFAULT_EFFECT_CONFIG, DEFAULT_USER_PROFILE } from '../utils/effects';

const DB_NAME = 'kilas_offline_shorts_db';
const DB_VERSION = 1;

const STORE_PROFILE = 'profile';
const STORE_HANDLES = 'directoryHandles';
const STORE_UPLOADED_VIDEOS = 'uploadedVideos';
const STORE_VIDEO_META = 'videoMeta';
const STORE_SETTINGS = 'settings';

export interface PersistedUploadedVideo {
  id: string;
  sourceType?: 'uploaded' | 'folder';
  relativePath?: string;
  title: string;
  description: string;
  fileName: string;
  fileSize: number;
  duration: number;
  blob?: Blob;
  nativeMediaId?: string;
  createdAt: number;
  effect: VideoEffectConfig;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_PROFILE)) {
        db.createObjectStore(STORE_PROFILE, { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains(STORE_HANDLES)) {
        db.createObjectStore(STORE_HANDLES, { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains(STORE_UPLOADED_VIDEOS)) {
        db.createObjectStore(STORE_UPLOADED_VIDEOS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_VIDEO_META)) {
        db.createObjectStore(STORE_VIDEO_META, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_SETTINGS)) {
        db.createObjectStore(STORE_SETTINGS, { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet<T>(storeName: string, key: string): Promise<T | undefined> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const req = store.get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error);
  });
}

async function idbPut<T>(storeName: string, value: T): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const req = store.put(value);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

async function idbDelete(storeName: string, key: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const req = store.delete(key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

async function idbGetAll<T>(storeName: string): Promise<T[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const req = store.getAll();
    req.onsuccess = () => resolve((req.result as T[]) ?? []);
    req.onerror = () => reject(req.error);
  });
}

export async function loadUserProfile(): Promise<UserProfile> {
  try {
    const record = await idbGet<{ key: string; profile: UserProfile }>(
      STORE_PROFILE,
      'currentUser',
    );
    return record?.profile ?? DEFAULT_USER_PROFILE;
  } catch {
    return DEFAULT_USER_PROFILE;
  }
}

export async function saveUserProfile(profile: UserProfile): Promise<void> {
  await idbPut(STORE_PROFILE, { key: 'currentUser', profile });
}

export async function saveDirectoryHandle(
  handle: FileSystemDirectoryHandle,
): Promise<void> {
  await idbPut(STORE_HANDLES, { key: 'primaryFolder', handle });
}

export async function loadDirectoryHandle(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const record = await idbGet<{ key: string; handle: FileSystemDirectoryHandle }>(
      STORE_HANDLES,
      'primaryFolder',
    );
    return record?.handle ?? null;
  } catch {
    return null;
  }
}

export async function clearDirectoryHandle(): Promise<void> {
  await idbDelete(STORE_HANDLES, 'primaryFolder');
}

export async function saveFolderStatus(status: FolderSyncStatus): Promise<void> {
  await idbPut(STORE_SETTINGS, { key: 'folderStatus', status });
}

export async function loadFolderStatus(): Promise<FolderSyncStatus | null> {
  try {
    const record = await idbGet<{ key: string; status: FolderSyncStatus }>(
      STORE_SETTINGS,
      'folderStatus',
    );
    return record?.status ?? null;
  } catch {
    return null;
  }
}

export async function saveUploadedVideo(video: PersistedUploadedVideo): Promise<void> {
  await idbPut(STORE_UPLOADED_VIDEOS, video);
}

export async function loadUploadedVideos(): Promise<PersistedUploadedVideo[]> {
  try {
    return await idbGetAll<PersistedUploadedVideo>(STORE_UPLOADED_VIDEOS);
  } catch {
    return [];
  }
}

export async function deleteUploadedVideo(id: string): Promise<void> {
  await idbDelete(STORE_UPLOADED_VIDEOS, id);
  await idbDelete(STORE_VIDEO_META, id);
}

export async function saveVideoMeta(meta: StoredVideoMeta): Promise<void> {
  await idbPut(STORE_VIDEO_META, meta);
}

export async function loadAllVideoMeta(): Promise<Record<string, StoredVideoMeta>> {
  try {
    const list = await idbGetAll<StoredVideoMeta>(STORE_VIDEO_META);
    const map: Record<string, StoredVideoMeta> = {};
    for (const item of list) {
      map[item.id] = item;
    }
    return map;
  } catch {
    return {};
  }
}

export function extractMetaFromShort(item: ShortVideoItem): StoredVideoMeta {
  return {
    id: item.id,
    title: item.title,
    description: item.description,
    likesCount: item.likesCount,
    likedByMe: item.likedByMe,
    bookmarkedByMe: item.bookmarkedByMe,
    comments: item.comments,
    effect: item.effect,
    duration: item.duration,
    isOwnVideo: item.isOwnVideo,
  };
}

export function buildInitialSamples(profile: UserProfile): ShortVideoItem[] {
  const now = Date.now();
  return [
    {
      id: 'sample:aurora',
      sourceType: 'sample',
      title: 'Pratinjau Studio · Cahaya Utara Malam',
      description:
        'Contoh reel offline bawaan. Hubungkan folder pribadimu atau tambah video baru lengkap dengan efek di menu samping.',
      fileName: 'aurora-preview.canvas',
      relativePath: 'Contoh Bawaan',
      fileSize: 0,
      duration: 15,
      sampleTheme: 'aurora',
      createdAt: now - 3600_000 * 5,
      likesCount: 24,
      likedByMe: false,
      bookmarkedByMe: false,
      comments: [
        {
          id: 'c-sample-1',
          authorName: profile.name,
          authorHandle: profile.handle,
          authorAvatar: profile.avatarDataUrl,
          text: 'Geser ke atas untuk scroll halus, atau klik ikon folder untuk memutar koleksi videomu sendiri.',
          createdAt: now - 1800_000,
          likes: 3,
          likedByMe: false,
          isPinned: true,
          replies: [],
        },
      ],
      effect: { ...DEFAULT_EFFECT_CONFIG, preset: 'cinematic', vignette: 25 },
      creatorName: profile.name,
      creatorHandle: profile.handle,
      creatorAvatar: profile.avatarDataUrl,
      isOwnVideo: true,
    },
    {
      id: 'sample:sunset',
      sourceType: 'sample',
      title: 'Senja di Horizon · Mode Vertikal',
      description:
        'Ketuk dua kali di layar untuk Like cepat, dan buka tombol Efek untuk mengubah warna serta overlay film secara langsung.',
      fileName: 'sunset-horizon.canvas',
      relativePath: 'Contoh Bawaan',
      fileSize: 0,
      duration: 15,
      sampleTheme: 'sunset',
      createdAt: now - 3600_000 * 3,
      likesCount: 18,
      likedByMe: false,
      bookmarkedByMe: false,
      comments: [],
      effect: { ...DEFAULT_EFFECT_CONFIG, preset: 'golden', overlay: 'bokeh' },
      creatorName: profile.name,
      creatorHandle: profile.handle,
      creatorAvatar: profile.avatarDataUrl,
      isOwnVideo: true,
    },
    {
      id: 'sample:kinetic',
      sourceType: 'sample',
      title: 'Gerak Kinetik · Arsip Offline 60fps',
      description:
        'Semua foto profil, like, komentar, dan efek tersimpan lokal di peramban tanpa koneksi internet.',
      fileName: 'kinetic-archive.canvas',
      relativePath: 'Contoh Bawaan',
      fileSize: 0,
      duration: 15,
      sampleTheme: 'kinetic',
      createdAt: now - 3600_000,
      likesCount: 31,
      likedByMe: false,
      bookmarkedByMe: false,
      comments: [],
      effect: { ...DEFAULT_EFFECT_CONFIG, preset: 'vivid', overlay: 'letterbox' },
      creatorName: profile.name,
      creatorHandle: profile.handle,
      creatorAvatar: profile.avatarDataUrl,
      isOwnVideo: true,
    },
  ];
}
