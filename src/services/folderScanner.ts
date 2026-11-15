import { ShortVideoItem, StoredVideoMeta, UserProfile } from '../types/shorts';
import {
  cleanFileTitle,
  DEFAULT_EFFECT_CONFIG,
  inferVideoMimeType,
  isSupportedVideoFile,
} from '../utils/effects';
import { cacheBlobToNativeServer, isNativeAndroid } from './nativeMedia';

export interface LocalFileEntry {
  file: File;
  relativePath: string;
}

async function readDirectoryHandleRecursively(
  dirHandle: FileSystemDirectoryHandle,
  prefix = '',
): Promise<LocalFileEntry[]> {
  const entries: LocalFileEntry[] = [];
  for await (const [name, handle] of dirHandle.entries()) {
    const currentPath = prefix ? `${prefix}/${name}` : name;
    if (handle.kind === 'file') {
      const fileHandle = handle as FileSystemFileHandle;
      const file = await fileHandle.getFile();
      if (isSupportedVideoFile(file)) {
        entries.push({ file, relativePath: currentPath });
      }
    } else if (handle.kind === 'directory') {
      const subEntries = await readDirectoryHandleRecursively(
        handle as FileSystemDirectoryHandle,
        currentPath,
      );
      entries.push(...subEntries);
    }
  }
  return entries;
}

export async function verifyDirectoryPermission(
  handle: FileSystemDirectoryHandle,
): Promise<boolean> {
  try {
    // @ts-expect-error queryPermission exists in File System Access API
    const current = await handle.queryPermission({ mode: 'read' });
    if (current === 'granted') return true;
    // @ts-expect-error requestPermission exists in File System Access API
    const requested = await handle.requestPermission({ mode: 'read' });
    return requested === 'granted';
  } catch {
    return false;
  }
}

export async function scanDirectoryHandle(
  handle: FileSystemDirectoryHandle,
): Promise<LocalFileEntry[]> {
  const granted = await verifyDirectoryPermission(handle);
  if (!granted) {
    throw new Error('Izin akses folder ditolak atau belum diberikan.');
  }
  const files = await readDirectoryHandleRecursively(handle);
  files.sort((a, b) => b.file.lastModified - a.file.lastModified);
  return files;
}

export function scanFileList(fileList: FileList | File[]): LocalFileEntry[] {
  const entries: LocalFileEntry[] = [];
  const arr = Array.from(fileList);
  for (const file of arr) {
    if (isSupportedVideoFile(file)) {
      const rel =
        (file as File & { webkitRelativePath?: string }).webkitRelativePath ||
        file.name;
      entries.push({ file, relativePath: rel });
    }
  }
  entries.sort((a, b) => b.file.lastModified - a.file.lastModified);
  return entries;
}

async function readWebkitEntryRecursively(
  entry: FileSystemEntry,
  prefix = '',
): Promise<LocalFileEntry[]> {
  if (entry.isFile) {
    const fileEntry = entry as FileSystemFileEntry;
    return new Promise((resolve) => {
      fileEntry.file(
        (file) => {
          const rel = prefix ? `${prefix}/${file.name}` : file.name;
          if (isSupportedVideoFile(file)) {
            resolve([{ file, relativePath: rel }]);
          } else {
            resolve([]);
          }
        },
        () => resolve([]),
      );
    });
  }
  if (entry.isDirectory) {
    const dirEntry = entry as FileSystemDirectoryEntry;
    const reader = dirEntry.createReader();
    const allEntries: FileSystemEntry[] = [];

    const readBatch = (): Promise<FileSystemEntry[]> =>
      new Promise((resolve) => {
        reader.readEntries(
          (batch) => resolve(batch),
          () => resolve([]),
        );
      });

    let batch = await readBatch();
    while (batch.length > 0) {
      allEntries.push(...batch);
      batch = await readBatch();
    }

    const nextPrefix = prefix ? `${prefix}/${entry.name}` : entry.name;
    const nested = await Promise.all(
      allEntries.map((child) => readWebkitEntryRecursively(child, nextPrefix)),
    );
    return nested.flat();
  }
  return [];
}

export async function scanDroppedItems(
  dataTransfer: DataTransfer,
): Promise<LocalFileEntry[]> {
  const items = Array.from(dataTransfer.items || []);
  const entries: LocalFileEntry[] = [];

  const webkitEntries = items
    .map((item) => item.webkitGetAsEntry?.())
    .filter((entry): entry is FileSystemEntry => Boolean(entry));

  if (webkitEntries.length > 0) {
    const results = await Promise.all(
      webkitEntries.map((entry) => readWebkitEntryRecursively(entry)),
    );
    entries.push(...results.flat());
  } else if (dataTransfer.files?.length) {
    entries.push(...scanFileList(dataTransfer.files));
  }

  entries.sort((a, b) => b.file.lastModified - a.file.lastModified);
  return entries;
}

export function probeVideoDuration(url: string): Promise<number> {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    const timeout = window.setTimeout(() => {
      cleanup();
      resolve(0);
    }, 3500);

    const cleanup = () => {
      window.clearTimeout(timeout);
      video.onloadedmetadata = null;
      video.onerror = null;
      video.src = '';
    };

    video.onloadedmetadata = () => {
      const dur = Number.isFinite(video.duration) ? video.duration : 0;
      cleanup();
      resolve(dur);
    };
    video.onerror = () => {
      cleanup();
      resolve(0);
    };
    video.src = url;
  });
}

export async function materializeFileToBlobUrl(
  file: Blob,
): Promise<{ url: string; blob: Blob }> {
  const mime =
    file instanceof File
      ? inferVideoMimeType(file)
      : file.type && file.type.startsWith('video/')
        ? file.type
        : 'video/mp4';
  const buffer = await file.arrayBuffer();
  const concreteBlob = new Blob([buffer], { type: mime });
  return { url: URL.createObjectURL(concreteBlob), blob: concreteBlob };
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error || new Error('FileReader error'));
    reader.readAsDataURL(blob);
  });
}

const MAX_AUTO_MATERIALIZE_BYTES = 150 * 1024 * 1024;

export async function buildShortItemsFromLocalEntriesAsync(
  entries: LocalFileEntry[],
  metaMap: Record<string, StoredVideoMeta>,
  profile: UserProfile,
  folderName: string,
): Promise<ShortVideoItem[]> {
  const nativeAndroid = isNativeAndroid();

  return Promise.all(
    entries.map(async ({ file, relativePath }) => {
      const id = `folder:${relativePath}:${file.size}`;
      const saved = metaMap[id];
      const mime = inferVideoMimeType(file);
      let videoUrl = '';
      let posterUrl: string | undefined;
      let detectedDuration = saved?.duration ?? 0;
      let sourceBlob: Blob = file;

      if (nativeAndroid) {
        const nativeMedia = await cacheBlobToNativeServer(id, file, mime);
        if (nativeMedia?.url) {
          videoUrl = nativeMedia.url;
          posterUrl = nativeMedia.thumbUrl;
          if (!detectedDuration && nativeMedia.duration) {
            detectedDuration = nativeMedia.duration;
          }
        }
      }

      if (!videoUrl) {
        try {
          if (file.size <= MAX_AUTO_MATERIALIZE_BYTES) {
            const buffer = await file.arrayBuffer();
            sourceBlob = new Blob([buffer], { type: mime });
            videoUrl = URL.createObjectURL(sourceBlob);
          } else {
            sourceBlob = file.type ? file : new Blob([file], { type: mime });
            videoUrl = URL.createObjectURL(sourceBlob);
          }
        } catch {
          videoUrl = URL.createObjectURL(file);
        }
      }

      return {
        id,
        sourceType: 'folder',
        title: saved?.title || cleanFileTitle(file.name) || 'Video Pribadi',
        description:
          saved?.description ||
          `Sumber lokal dari ${folderName} (${relativePath})`,
        fileName: file.name,
        relativePath,
        fileSize: file.size,
        duration: detectedDuration,
        videoUrl,
        posterUrl,
        sourceFile: file,
        sourceBlob,
        createdAt: file.lastModified || Date.now(),
        likesCount: saved?.likesCount ?? 0,
        likedByMe: saved?.likedByMe ?? false,
        bookmarkedByMe: saved?.bookmarkedByMe ?? false,
        comments: saved?.comments ?? [],
        effect: saved?.effect
          ? { ...DEFAULT_EFFECT_CONFIG, ...saved.effect }
          : { ...DEFAULT_EFFECT_CONFIG },
        creatorName: profile.name,
        creatorHandle: profile.handle,
        creatorAvatar: profile.avatarDataUrl,
        isOwnVideo: true,
      };
    }),
  );
}
