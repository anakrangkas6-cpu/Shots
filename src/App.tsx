import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Clapperboard,
  FolderOpen,
  Heart,
  Plus,
  RefreshCw,
} from 'lucide-react';
import { CommentsSheet } from './components/CommentsSheet';
import { EffectStudioModal } from './components/EffectStudioModal';
import { FolderLibraryView, LibraryFilter } from './components/FolderLibraryView';
import { PWAInstallButton } from './components/PWAInstallButton';
import { ProfileModal } from './components/ProfileModal';
import { ShortPlayerCard } from './components/ShortPlayerCard';
import {
  buildShortItemsFromLocalEntriesAsync,
  LocalFileEntry,
  scanDirectoryHandle,
  scanDroppedItems,
  scanFileList,
} from './services/folderScanner';
import {
  buildNativeMediaUrls,
  cacheBlobToNativeServer,
  deleteNativeMedia,
  getNativeMediaServerUrl,
  isNativeAndroid,
  NativePickedVideo,
  pickNativeFolder,
  pickNativeVideos,
} from './services/nativeMedia';
import {
  buildInitialSamples,
  deleteUploadedVideo,
  extractMetaFromShort,
  loadAllVideoMeta,
  loadDirectoryHandle,
  loadFolderStatus,
  loadUploadedVideos,
  loadUserProfile,
  PersistedUploadedVideo,
  saveDirectoryHandle,
  saveFolderStatus,
  saveUploadedVideo,
  saveUserProfile,
  saveVideoMeta,
} from './services/offlineDb';
import {
  CommentItem,
  FolderSyncStatus,
  ShortVideoItem,
  StoredVideoMeta,
  UserProfile,
  VideoEffectConfig,
} from './types/shorts';
import {
  cleanFileTitle,
  DEFAULT_EFFECT_CONFIG,
  DEFAULT_USER_PROFILE,
  inferVideoMimeType,
} from './utils/effects';

type ActiveSection = 'feed' | 'library' | 'liked';

export function App() {
  const feedContainerRef = useRef<HTMLDivElement | null>(null);
  const fallbackFolderInputRef = useRef<HTMLInputElement | null>(null);
  const objectUrlsRef = useRef<string[]>([]);

  const [isReady, setIsReady] = useState(false);
  const [profile, setProfile] = useState<UserProfile>(DEFAULT_USER_PROFILE);
  const [videos, setVideos] = useState<ShortVideoItem[]>([]);
  const [activeSection, setActiveSection] = useState<ActiveSection>('feed');
  const [libraryFilter, setLibraryFilter] = useState<LibraryFilter>('all');
  const [activeIndex, setActiveIndex] = useState(0);
  const [isMuted, setIsMuted] = useState(true);

  const [folderStatus, setFolderStatus] = useState<FolderSyncStatus | null>(null);
  const [savedDirHandle, setSavedDirHandle] =
    useState<FileSystemDirectoryHandle | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [statusNotice, setStatusNotice] = useState<string | null>(null);

  const [openCommentsVideoId, setOpenCommentsVideoId] = useState<string | null>(
    null,
  );
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [studioState, setStudioState] = useState<{
    isOpen: boolean;
    mode: 'create' | 'edit';
    videoId: string | null;
  }>({ isOpen: false, mode: 'create', videoId: null });

  const showNotice = useCallback((msg: string) => {
    setStatusNotice(msg);
    window.setTimeout(() => {
      setStatusNotice((prev) => (prev === msg ? null : prev));
    }, 3600);
  }, []);

  // Hydrate profile, uploaded videos, samples, and metadata from IndexedDB
  useEffect(() => {
    let cancelled = false;

    async function hydrate() {
      const [loadedProfile, metaMap, uploadedList, dirHandle, lastFolder] =
        await Promise.all([
          loadUserProfile(),
          loadAllVideoMeta(),
          loadUploadedVideos(),
          loadDirectoryHandle(),
          loadFolderStatus(),
        ]);

      if (cancelled) return;

      const nativeAndroid = isNativeAndroid();
      const nativeBaseUrl = nativeAndroid ? await getNativeMediaServerUrl() : null;
      const sortedUploads = [...uploadedList].sort(
        (a, b) => b.createdAt - a.createdAt,
      );

      const uploadedShorts: ShortVideoItem[] = await Promise.all(
        sortedUploads.map(async (item) => {
          let url = '';
          let posterUrl: string | undefined;
          let detectedDur = 0;

          if (nativeAndroid && item.nativeMediaId && nativeBaseUrl) {
            const urls = buildNativeMediaUrls(nativeBaseUrl, item.nativeMediaId);
            url = urls.url;
            posterUrl = urls.thumbUrl;
          } else if (nativeAndroid && item.blob) {
            const nativeRes = await cacheBlobToNativeServer(
              item.id,
              item.blob,
              item.blob.type || 'video/mp4',
            );
            if (nativeRes?.url) {
              url = nativeRes.url;
              posterUrl = nativeRes.thumbUrl;
              detectedDur = nativeRes.duration ?? 0;
            }
          }

          if (!url && item.blob) {
            url = URL.createObjectURL(item.blob);
            objectUrlsRef.current.push(url);
          }

          const saved = metaMap[item.id];
          return {
            id: item.id,
            sourceType: (item.sourceType || 'uploaded') as 'uploaded' | 'folder',
            title: saved?.title || item.title,
            description: saved?.description ?? item.description,
            fileName: item.fileName,
            relativePath: item.relativePath || 'Studio Lokal',
            fileSize: item.fileSize,
            duration: saved?.duration || item.duration || detectedDur,
            videoUrl: url,
            posterUrl,
            nativeMediaId: item.nativeMediaId,
            sourceBlob: item.blob,
            createdAt: item.createdAt,
            likesCount: saved?.likesCount ?? 0,
            likedByMe: saved?.likedByMe ?? false,
            bookmarkedByMe: saved?.bookmarkedByMe ?? false,
            comments: saved?.comments ?? [],
            effect: saved?.effect
              ? { ...DEFAULT_EFFECT_CONFIG, ...saved.effect }
              : item.effect,
            creatorName: loadedProfile.name,
            creatorHandle: loadedProfile.handle,
            creatorAvatar: loadedProfile.avatarDataUrl,
            isOwnVideo: true,
          };
        }),
      );

      const sampleShorts = buildInitialSamples(loadedProfile).map((sample) => {
        const saved = metaMap[sample.id];
        if (!saved) return sample;
        return {
          ...sample,
          title: saved.title || sample.title,
          description: saved.description ?? sample.description,
          likesCount: saved.likesCount,
          likedByMe: saved.likedByMe,
          bookmarkedByMe: saved.bookmarkedByMe,
          comments: saved.comments,
          effect: { ...DEFAULT_EFFECT_CONFIG, ...saved.effect },
        };
      });

      setProfile(loadedProfile);
      setSavedDirHandle(dirHandle);
      setFolderStatus(lastFolder);
      setVideos([...uploadedShorts, ...sampleShorts]);
      setIsReady(true);
    }

    hydrate();

    return () => {
      cancelled = true;
      for (const url of objectUrlsRef.current) {
        URL.revokeObjectURL(url);
      }
      objectUrlsRef.current = [];
    };
  }, []);

  const applyScannedEntries = useCallback(
    async (
      entries: LocalFileEntry[],
      folderName: string,
      hasDirectoryHandle: boolean,
    ) => {
      if (entries.length === 0) {
        showNotice(
          `Tidak ditemukan berkas video (MP4/WebM/MOV) di folder "${folderName}".`,
        );
        return;
      }

      const metaMap: Record<string, StoredVideoMeta> = await loadAllVideoMeta();
      const folderShorts = await buildShortItemsFromLocalEntriesAsync(
        entries,
        metaMap,
        profile,
        folderName,
      );

      for (const item of folderShorts) {
        if (item.videoUrl && item.videoUrl.startsWith('blob:')) {
          objectUrlsRef.current.push(item.videoUrl);
        }
      }

      // Also persist reasonably-sized local picks into IndexedDB on Web/PWA so they survive reloads
      for (const item of folderShorts) {
        if (item.sourceBlob && item.sourceBlob.size <= 100 * 1024 * 1024) {
          void saveUploadedVideo({
            id: item.id,
            sourceType: 'folder',
            relativePath: item.relativePath,
            title: item.title,
            description: item.description,
            fileName: item.fileName,
            fileSize: item.fileSize,
            duration: item.duration,
            blob: item.sourceBlob,
            createdAt: item.createdAt,
            effect: item.effect,
          });
        }
      }

      const nextStatus: FolderSyncStatus = {
        folderName,
        lastSyncedAt: Date.now(),
        videoCount: folderShorts.length,
        hasDirectoryHandle,
      };
      setFolderStatus(nextStatus);
      await saveFolderStatus(nextStatus);

      setVideos((prev) => {
        const incomingIds = new Set(folderShorts.map((v) => v.id));
        const kept = prev.filter((v) => !incomingIds.has(v.id));
        return [...folderShorts, ...kept];
      });

      setActiveIndex(0);
      setActiveSection('feed');
      feedContainerRef.current?.scrollTo({ top: 0, behavior: 'auto' });
      showNotice(
        `${folderShorts.length} video ditambahkan dari "${folderName}". Video lama tetap tersimpan.`,
      );
    },
    [profile, showNotice],
  );

  const applyNativePickedVideos = useCallback(
    async (
      nativeVideos: NativePickedVideo[],
      folderName: string,
    ) => {
      if (nativeVideos.length === 0) {
        showNotice(`Tidak ditemukan berkas video di "${folderName}".`);
        return;
      }

      const metaMap: Record<string, StoredVideoMeta> = await loadAllVideoMeta();
      const now = Date.now();

      const addedItems: ShortVideoItem[] = await Promise.all(
        nativeVideos.map(async (nv, idx) => {
          const id = `native:${nv.id}`;
          const saved = metaMap[id];
          const title =
            saved?.title || cleanFileTitle(nv.name) || 'Video Pribadi';
          const description =
            saved?.description || `Sumber lokal dari ${folderName} (${nv.name})`;
          const effect = saved?.effect
            ? { ...DEFAULT_EFFECT_CONFIG, ...saved.effect }
            : { ...DEFAULT_EFFECT_CONFIG };

          const shortItem: ShortVideoItem = {
            id,
            sourceType: 'folder',
            title,
            description,
            fileName: nv.name,
            relativePath: folderName,
            fileSize: nv.size,
            duration: saved?.duration || nv.duration || 0,
            videoUrl: nv.url,
            posterUrl: nv.thumbUrl || undefined,
            nativeMediaId: nv.id,
            createdAt: now - idx,
            likesCount: saved?.likesCount ?? 0,
            likedByMe: saved?.likedByMe ?? false,
            bookmarkedByMe: saved?.bookmarkedByMe ?? false,
            comments: saved?.comments ?? [],
            effect,
            creatorName: profile.name,
            creatorHandle: profile.handle,
            creatorAvatar: profile.avatarDataUrl,
            isOwnVideo: true,
          };

          await saveUploadedVideo({
            id,
            sourceType: 'folder',
            relativePath: folderName,
            title,
            description,
            fileName: nv.name,
            fileSize: nv.size,
            duration: shortItem.duration,
            nativeMediaId: nv.id,
            createdAt: shortItem.createdAt,
            effect,
          });

          return shortItem;
        }),
      );

      const nextStatus: FolderSyncStatus = {
        folderName,
        lastSyncedAt: Date.now(),
        videoCount: addedItems.length,
        hasDirectoryHandle: false,
      };
      setFolderStatus(nextStatus);
      await saveFolderStatus(nextStatus);

      setVideos((prev) => {
        const incomingIds = new Set(addedItems.map((v) => v.id));
        const kept = prev.filter((v) => !incomingIds.has(v.id));
        return [...addedItems, ...kept];
      });

      setActiveIndex(0);
      setActiveSection('feed');
      feedContainerRef.current?.scrollTo({ top: 0, behavior: 'auto' });
      showNotice(
        `${addedItems.length} video ditambahkan dari "${folderName}". Video lama tetap aman.`,
      );
    },
    [profile, showNotice],
  );

  const handlePickFiles = useCallback(async () => {
    if (isNativeAndroid()) {
      setIsScanning(true);
      try {
        const picked = await pickNativeVideos(true);
        if (picked && !picked.cancelled) {
          await applyNativePickedVideos(picked.videos, 'Galeri & Berkas');
          return;
        }
        if (picked?.cancelled) {
          return;
        }
      } finally {
        setIsScanning(false);
      }
    }
    fallbackFolderInputRef.current?.click();
  }, [applyNativePickedVideos]);

  const handlePickFolder = useCallback(async () => {
    if (isNativeAndroid()) {
      setIsScanning(true);
      try {
        const treeRes = await pickNativeFolder();
        if (treeRes && !treeRes.cancelled) {
          await applyNativePickedVideos(treeRes.videos, treeRes.folderName);
          return;
        }
        if (treeRes?.cancelled) {
          return;
        }
        // If device lacks document tree UI, fall back cleanly to multi-file native picker
        const picked = await pickNativeVideos(true);
        if (picked && !picked.cancelled) {
          await applyNativePickedVideos(picked.videos, 'Folder Pribadi');
          return;
        }
        if (picked?.cancelled) {
          return;
        }
      } finally {
        setIsScanning(false);
      }
    }

    const pickerFn = (
      window as Window & {
        showDirectoryPicker?: (opts?: {
          mode?: 'read' | 'readwrite';
        }) => Promise<FileSystemDirectoryHandle>;
      }
    ).showDirectoryPicker;

    if (typeof pickerFn === 'function') {
      try {
        setIsScanning(true);
        const dirHandle = await pickerFn({ mode: 'read' });
        await saveDirectoryHandle(dirHandle);
        setSavedDirHandle(dirHandle);
        const entries = await scanDirectoryHandle(dirHandle);
        await applyScannedEntries(entries, dirHandle.name, true);
        return;
      } catch (err) {
        const errorName = err instanceof DOMException ? err.name : '';
        if (errorName === 'AbortError') {
          return;
        }
        // In sandboxed iframes or unsupported contexts, seamlessly fall back to webkitdirectory
      } finally {
        setIsScanning(false);
      }
    }

    fallbackFolderInputRef.current?.click();
  }, [applyScannedEntries, applyNativePickedVideos]);

  const handleFallbackFolderSelected = useCallback(
    async (fileList: FileList) => {
      setIsScanning(true);
      try {
        const entries = scanFileList(fileList);
        const firstRel = entries[0]?.relativePath || '';
        const folderName = firstRel.includes('/')
          ? firstRel.split('/')[0]
          : 'Folder Pribadi';
        await applyScannedEntries(entries, folderName, false);
      } finally {
        setIsScanning(false);
      }
    },
    [applyScannedEntries],
  );

  const handleDropDataTransfer = useCallback(
    async (dataTransfer: DataTransfer) => {
      setIsScanning(true);
      try {
        const entries = await scanDroppedItems(dataTransfer);
        const firstRel = entries[0]?.relativePath || '';
        const folderName = firstRel.includes('/')
          ? firstRel.split('/')[0]
          : 'Folder Tarik & Lepas';
        await applyScannedEntries(entries, folderName, false);
      } finally {
        setIsScanning(false);
      }
    },
    [applyScannedEntries],
  );

  const handleResyncSavedFolder = useCallback(async () => {
    if (!savedDirHandle) {
      handlePickFolder();
      return;
    }
    setIsScanning(true);
    try {
      const entries = await scanDirectoryHandle(savedDirHandle);
      await applyScannedEntries(entries, savedDirHandle.name, true);
    } catch {
      showNotice(
        'Izin folder perlu dipilih ulang. Membuka pemilih folder...',
      );
      handlePickFolder();
    } finally {
      setIsScanning(false);
    }
  }, [savedDirHandle, applyScannedEntries, handlePickFolder, showNotice]);

  // Visible Shorts list based on feed mode (all vs liked)
  const feedVideos = useMemo(() => {
    if (activeSection === 'liked') {
      return videos.filter((v) => v.likedByMe);
    }
    return videos;
  }, [videos, activeSection]);

  // Keep activeIndex in bounds when feedVideos shrinks
  useEffect(() => {
    if (activeIndex >= feedVideos.length && feedVideos.length > 0) {
      setActiveIndex(feedVideos.length - 1);
    }
  }, [feedVideos.length, activeIndex]);

  // Smooth vertical IntersectionObserver for active Short detection
  useEffect(() => {
    if (activeSection === 'library') return;
    const container = feedContainerRef.current;
    if (!container) return;

    const children = Array.from(container.children);
    if (children.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.65) {
            const idx = Number((entry.target as HTMLElement).dataset.index);
            if (!Number.isNaN(idx)) {
              setActiveIndex(idx);
            }
          }
        }
      },
      {
        root: container,
        threshold: 0.65,
      },
    );

    children.forEach((child) => observer.observe(child));
    return () => observer.disconnect();
  }, [feedVideos, activeSection]);

  const scrollToIndex = useCallback(
    (targetIdx: number) => {
      const container = feedContainerRef.current;
      if (!container) return;
      const clamped = Math.max(0, Math.min(feedVideos.length - 1, targetIdx));
      const targetEl = container.children[clamped] as HTMLElement | undefined;
      if (targetEl) {
        targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    },
    [feedVideos.length],
  );

  // Keyboard navigation (Up/Down/J/K/M)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (activeSection === 'library') return;
      if (
        isProfileModalOpen ||
        studioState.isOpen ||
        ['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)
      ) {
        return;
      }

      if (e.key === 'ArrowDown' || e.key === 'j' || e.key === 'J') {
        e.preventDefault();
        scrollToIndex(activeIndex + 1);
      } else if (e.key === 'ArrowUp' || e.key === 'k' || e.key === 'K') {
        e.preventDefault();
        scrollToIndex(activeIndex - 1);
      } else if (e.key === 'm' || e.key === 'M') {
        setIsMuted((prev) => !prev);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    activeSection,
    activeIndex,
    isProfileModalOpen,
    studioState.isOpen,
    scrollToIndex,
  ]);

  const updateVideoAndPersist = useCallback(
    (videoId: string, updater: (item: ShortVideoItem) => ShortVideoItem) => {
      setVideos((prev) =>
        prev.map((item) => {
          if (item.id !== videoId) return item;
          const updated = updater(item);
          void saveVideoMeta(extractMetaFromShort(updated));
          return updated;
        }),
      );
    },
    [],
  );

  const handleToggleLike = useCallback(
    (videoId: string, forceLike?: boolean) => {
      updateVideoAndPersist(videoId, (item) => {
        if (forceLike && item.likedByMe) return item;
        const nextLiked = forceLike ? true : !item.likedByMe;
        const nextCount = Math.max(0, item.likesCount + (nextLiked ? 1 : -1));
        return {
          ...item,
          likedByMe: nextLiked,
          likesCount: nextCount,
        };
      });
    },
    [updateVideoAndPersist],
  );

  const handleToggleBookmark = useCallback(
    (videoId: string) => {
      updateVideoAndPersist(videoId, (item) => ({
        ...item,
        bookmarkedByMe: !item.bookmarkedByMe,
      }));
    },
    [updateVideoAndPersist],
  );

  const handleDurationDetected = useCallback(
    (videoId: string, dur: number) => {
      setVideos((prev) =>
        prev.map((item) => {
          if (item.id !== videoId || Math.abs(item.duration - dur) < 0.5) {
            return item;
          }
          const updated = { ...item, duration: dur };
          void saveVideoMeta(extractMetaFromShort(updated));
          return updated;
        }),
      );
    },
    [],
  );

  // Comments handlers
  const handleAddComment = useCallback(
    (videoId: string, text: string, parentCommentId?: string) => {
      updateVideoAndPersist(videoId, (item) => {
        if (parentCommentId) {
          return {
            ...item,
            comments: item.comments.map((c) => {
              if (c.id !== parentCommentId) return c;
              return {
                ...c,
                replies: [
                  ...c.replies,
                  {
                    id: `rep-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                    authorName: profile.name,
                    authorHandle: profile.handle,
                    authorAvatar: profile.avatarDataUrl,
                    text,
                    createdAt: Date.now(),
                    likes: 0,
                    likedByMe: false,
                  },
                ],
              };
            }),
          };
        }

        const newComment: CommentItem = {
          id: `cmt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          authorName: profile.name,
          authorHandle: profile.handle,
          authorAvatar: profile.avatarDataUrl,
          text,
          createdAt: Date.now(),
          likes: 0,
          likedByMe: false,
          replies: [],
        };

        return {
          ...item,
          comments: [newComment, ...item.comments],
        };
      });
    },
    [profile, updateVideoAndPersist],
  );

  const handleToggleCommentLike = useCallback(
    (videoId: string, commentId: string, replyId?: string) => {
      updateVideoAndPersist(videoId, (item) => ({
        ...item,
        comments: item.comments.map((c) => {
          if (c.id !== commentId) return c;
          if (replyId) {
            return {
              ...c,
              replies: c.replies.map((r) =>
                r.id === replyId
                  ? {
                      ...r,
                      likedByMe: !r.likedByMe,
                      likes: Math.max(0, r.likes + (r.likedByMe ? -1 : 1)),
                    }
                  : r,
              ),
            };
          }
          return {
            ...c,
            likedByMe: !c.likedByMe,
            likes: Math.max(0, c.likes + (c.likedByMe ? -1 : 1)),
          };
        }),
      }));
    },
    [updateVideoAndPersist],
  );

  const handleTogglePinComment = useCallback(
    (videoId: string, commentId: string) => {
      updateVideoAndPersist(videoId, (item) => ({
        ...item,
        comments: item.comments.map((c) =>
          c.id === commentId ? { ...c, isPinned: !c.isPinned } : c,
        ),
      }));
    },
    [updateVideoAndPersist],
  );

  const handleDeleteComment = useCallback(
    (videoId: string, commentId: string, replyId?: string) => {
      updateVideoAndPersist(videoId, (item) => ({
        ...item,
        comments: replyId
          ? item.comments.map((c) =>
              c.id === commentId
                ? { ...c, replies: c.replies.filter((r) => r.id !== replyId) }
                : c,
            )
          : item.comments.filter((c) => c.id !== commentId),
      }));
    },
    [updateVideoAndPersist],
  );

  // Profile update handler
  const handleSaveProfile = useCallback(
    async (nextProfile: UserProfile) => {
      setProfile(nextProfile);
      await saveUserProfile(nextProfile);
      setVideos((prev) =>
        prev.map((v) =>
          v.isOwnVideo
            ? {
                ...v,
                creatorName: nextProfile.name,
                creatorHandle: nextProfile.handle,
                creatorAvatar: nextProfile.avatarDataUrl,
              }
            : v,
        ),
      );
      showNotice('Profil dan foto berhasil diperbarui.');
    },
    [showNotice],
  );

  // Create new video with effects handler
  const handleCreateVideo = useCallback(
    async (payload: {
      file?: File;
      nativeVideo?: NativePickedVideo;
      title: string;
      description: string;
      effect: VideoEffectConfig;
      duration: number;
    }) => {
      if (payload.nativeVideo) {
        const nv = payload.nativeVideo;
        const id = `uploaded:native:${nv.id}`;
        const persisted: PersistedUploadedVideo = {
          id,
          sourceType: 'uploaded',
          relativePath: 'Studio Lokal',
          title: payload.title,
          description: payload.description,
          fileName: nv.name,
          fileSize: nv.size,
          duration: payload.duration || nv.duration || 0,
          nativeMediaId: nv.id,
          createdAt: Date.now(),
          effect: payload.effect,
        };
        await saveUploadedVideo(persisted);

        const newShort: ShortVideoItem = {
          id,
          sourceType: 'uploaded',
          title: payload.title || cleanFileTitle(nv.name),
          description: payload.description,
          fileName: nv.name,
          relativePath: 'Studio Lokal',
          fileSize: nv.size,
          duration: persisted.duration,
          videoUrl: nv.url,
          posterUrl: nv.thumbUrl || undefined,
          nativeMediaId: nv.id,
          createdAt: persisted.createdAt,
          likesCount: 0,
          likedByMe: false,
          bookmarkedByMe: false,
          comments: [],
          effect: payload.effect,
          creatorName: profile.name,
          creatorHandle: profile.handle,
          creatorAvatar: profile.avatarDataUrl,
          isOwnVideo: true,
        };

        await saveVideoMeta(extractMetaFromShort(newShort));
        setVideos((prev) => [newShort, ...prev.filter((v) => v.id !== id)]);
        setActiveSection('feed');
        setActiveIndex(0);
        window.setTimeout(() => {
          feedContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
        }, 60);
        showNotice('Video baru dan efeknya berhasil ditambahkan.');
        return;
      }

      if (!payload.file) {
        throw new Error('Tidak ada berkas video.');
      }

      const id = `uploaded:${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const mime = inferVideoMimeType(payload.file);
      let concreteBlob: Blob = payload.file;
      try {
        const buf = await payload.file.arrayBuffer();
        concreteBlob = new Blob([buf], { type: mime });
      } catch {
        concreteBlob = payload.file;
      }

      const persisted: PersistedUploadedVideo = {
        id,
        sourceType: 'uploaded',
        relativePath: 'Studio Lokal',
        title: payload.title,
        description: payload.description,
        fileName: payload.file.name,
        fileSize: payload.file.size,
        duration: payload.duration,
        blob: concreteBlob,
        createdAt: Date.now(),
        effect: payload.effect,
      };
      await saveUploadedVideo(persisted);

      let url = '';
      let posterUrl: string | undefined;
      let nativeDur = 0;

      if (isNativeAndroid()) {
        const nativeRes = await cacheBlobToNativeServer(id, concreteBlob, mime);
        if (nativeRes?.url) {
          url = nativeRes.url;
          posterUrl = nativeRes.thumbUrl;
          nativeDur = nativeRes.duration ?? 0;
        }
      }

      if (!url) {
        url = URL.createObjectURL(concreteBlob);
        objectUrlsRef.current.push(url);
      }

      const newShort: ShortVideoItem = {
        id,
        sourceType: 'uploaded',
        title: payload.title || cleanFileTitle(payload.file.name),
        description: payload.description,
        fileName: payload.file.name,
        relativePath: 'Studio Lokal',
        fileSize: payload.file.size,
        duration: payload.duration || nativeDur,
        videoUrl: url,
        posterUrl,
        sourceFile: payload.file,
        sourceBlob: concreteBlob,
        createdAt: persisted.createdAt,
        likesCount: 0,
        likedByMe: false,
        bookmarkedByMe: false,
        comments: [],
        effect: payload.effect,
        creatorName: profile.name,
        creatorHandle: profile.handle,
        creatorAvatar: profile.avatarDataUrl,
        isOwnVideo: true,
      };

      await saveVideoMeta(extractMetaFromShort(newShort));

      setVideos((prev) => [newShort, ...prev]);
      setActiveSection('feed');
      setActiveIndex(0);
      window.setTimeout(() => {
        feedContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
      }, 60);
      showNotice('Video baru dan efeknya berhasil ditambahkan.');
    },
    [profile, showNotice],
  );

  const handleUpdateVideoEffects = useCallback(
    (
      videoId: string,
      payload: { title: string; description: string; effect: VideoEffectConfig },
    ) => {
      updateVideoAndPersist(videoId, (item) => ({
        ...item,
        title: payload.title,
        description: payload.description,
        effect: payload.effect,
      }));
      showNotice('Efek video diperbarui.');
    },
    [updateVideoAndPersist, showNotice],
  );

  const handleDeleteUploadedVideo = useCallback(
    async (videoId: string) => {
      const target = videos.find((v) => v.id === videoId);
      await deleteUploadedVideo(videoId);
      if (target?.nativeMediaId) {
        await deleteNativeMedia(target.nativeMediaId);
      }
      setVideos((prev) => {
        if (target?.videoUrl && target.videoUrl.startsWith('blob:')) {
          URL.revokeObjectURL(target.videoUrl);
        }
        return prev.filter((v) => v.id !== videoId);
      });
      showNotice('Video dihapus.');
    },
    [videos, showNotice],
  );

  const handleSelectVideoFromLibrary = useCallback(
    (videoId: string) => {
      const idx = videos.findIndex((v) => v.id === videoId);
      if (idx === -1) return;
      setActiveSection('feed');
      setActiveIndex(idx);
      window.setTimeout(() => {
        const container = feedContainerRef.current;
        const targetEl = container?.children[idx] as HTMLElement | undefined;
        targetEl?.scrollIntoView({ behavior: 'auto', block: 'start' });
      }, 40);
    },
    [videos],
  );

  const activeCommentVideo = useMemo(
    () => videos.find((v) => v.id === openCommentsVideoId) ?? null,
    [videos, openCommentsVideoId],
  );

  const editingStudioVideo = useMemo(
    () => videos.find((v) => v.id === studioState.videoId) ?? null,
    [videos, studioState.videoId],
  );

  if (!isReady) {
    return (
      <div className="flex h-dvh w-screen items-center justify-center bg-[#0B0B0E] text-zinc-400">
        <p className="text-sm font-medium">Memuat koleksi Shorts lokal...</p>
      </div>
    );
  }

  return (
    <div className="flex h-dvh w-screen overflow-hidden bg-[#0B0B0E] text-zinc-100">
      {/* Hidden universal folder picker fallback */}
      <input
        ref={fallbackFolderInputRef}
        type="file"
        // @ts-expect-error webkitdirectory enables personal folder selection across browsers and iframes
        webkitdirectory=""
        multiple
        accept="video/*"
        onChange={(e) => {
          if (e.target.files?.length) {
            handleFallbackFolderSelected(e.target.files);
          }
          e.target.value = '';
        }}
        className="hidden"
      />

      {/* Desktop Left Navigation Rail */}
      <aside className="hidden lg:flex lg:w-20 xl:w-64 lg:shrink-0 lg:flex-col lg:justify-between lg:border-r lg:border-white/10 lg:bg-[#0E0E12] lg:p-4">
        <div className="space-y-6">
          {/* Brand */}
          <div className="flex items-center gap-3 px-2 pt-1">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FF2D55] text-white shadow-lg shadow-[#FF2D55]/25">
              <Clapperboard className="h-5 w-5" />
            </div>
            <span className="hidden text-xl font-extrabold tracking-tight text-white xl:inline">
              Kilas
            </span>
          </div>

          {/* Primary Nav */}
          <nav className="space-y-1.5" aria-label="Navigasi utama">
            <SidebarNavButton
              active={activeSection === 'feed'}
              icon={<Clapperboard className="h-5 w-5" />}
              label="Shorts"
              onClick={() => {
                setActiveSection('feed');
                setOpenCommentsVideoId(null);
              }}
            />
            <SidebarNavButton
              active={activeSection === 'library'}
              icon={<FolderOpen className="h-5 w-5" />}
              label="Folder Pribadi"
              onClick={() => {
                setActiveSection('library');
                setOpenCommentsVideoId(null);
              }}
            />
            <SidebarNavButton
              active={activeSection === 'liked'}
              icon={<Heart className="h-5 w-5" />}
              label="Video Disukai"
              onClick={() => {
                setActiveSection('liked');
                setActiveIndex(0);
                setOpenCommentsVideoId(null);
              }}
            />
            <button
              type="button"
              onClick={() => setIsProfileModalOpen(true)}
              className="flex h-12 w-full items-center gap-3.5 rounded-xl px-3 text-sm font-medium text-zinc-300 transition hover:bg-white/5 hover:text-white"
            >
              <img
                src={profile.avatarDataUrl}
                alt={profile.name}
                referrerPolicy="no-referrer"
                className="h-6 w-6 shrink-0 rounded-full object-cover border border-white/25"
              />
              <span className="hidden truncate xl:inline">{profile.name}</span>
            </button>
          </nav>

          {/* Primary Studio Create CTA */}
          <button
            type="button"
            onClick={() =>
              setStudioState({ isOpen: true, mode: 'create', videoId: null })
            }
            className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#FF2D55] px-3 text-sm font-semibold text-white transition hover:bg-[#e6244a] xl:justify-start xl:px-4"
          >
            <Plus className="h-5 w-5 shrink-0" />
            <span className="hidden whitespace-nowrap xl:inline">
              Tambah Video &amp; Efek
            </span>
          </button>
        </div>

        {/* Bottom Personal Folder Quick Controls */}
        <div className="space-y-2 border-t border-white/10 pt-4">
          <button
            type="button"
            onClick={handlePickFolder}
            disabled={isScanning}
            className="flex h-11 w-full items-center justify-center gap-2.5 rounded-xl border border-white/10 bg-white/5 px-3 text-xs font-semibold text-zinc-200 transition hover:bg-white/10 xl:justify-start"
          >
            <FolderOpen className="h-4 w-4 shrink-0 text-[#FF2D55]" />
            <span className="hidden truncate xl:inline">
              {folderStatus ? folderStatus.folderName : 'Pilih Folder Video'}
            </span>
          </button>

          {savedDirHandle &&
            videos.every((v) => v.sourceType !== 'folder') && (
              <button
                type="button"
                onClick={handleResyncSavedFolder}
                className="flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-white/10 px-3 text-xs font-semibold text-white transition hover:bg-white/15 xl:justify-start"
              >
                <RefreshCw className="h-3.5 w-3.5 shrink-0" />
                <span className="hidden truncate xl:inline">
                  Hubungkan Ulang
                </span>
              </button>
            )}

          <PWAInstallButton compact />
        </div>
      </aside>

      {/* Main Content Stage */}
      <main className="relative flex flex-1 flex-col overflow-hidden">
        {/* Transient Feedback Toast */}
        {statusNotice && (
          <div className="pointer-events-none fixed left-1/2 top-4 z-50 -translate-x-1/2 rounded-xl border border-white/15 bg-zinc-900/95 px-4 py-2.5 text-xs font-medium text-white shadow-xl backdrop-blur-md">
            {statusNotice}
          </div>
        )}

        {activeSection === 'library' ? (
          <FolderLibraryView
            videos={videos}
            profile={profile}
            folderStatus={folderStatus}
            hasSavedHandle={Boolean(savedDirHandle)}
            isScanning={isScanning}
            activeFilter={libraryFilter}
            onFilterChange={setLibraryFilter}
            onPickFolder={handlePickFolder}
            onPickFiles={handlePickFiles}
            onFallbackFolderSelected={handleFallbackFolderSelected}
            onDropDataTransfer={handleDropDataTransfer}
            onResyncSavedFolder={handleResyncSavedFolder}
            onOpenCreateVideo={() =>
              setStudioState({ isOpen: true, mode: 'create', videoId: null })
            }
            onOpenProfile={() => setIsProfileModalOpen(true)}
            onSelectVideo={handleSelectVideoFromLibrary}
            onDeleteUploadedVideo={handleDeleteUploadedVideo}
          />
        ) : (
          <div className="relative flex flex-1 items-center justify-center overflow-hidden">
            {feedVideos.length === 0 ? (
              <div className="flex max-w-sm flex-col items-center px-6 text-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/5 text-zinc-300">
                  <Heart className="h-7 w-7" />
                </div>
                <h2 className="mt-4 text-lg font-bold text-white">
                  {activeSection === 'liked'
                    ? 'Belum ada video yang disukai'
                    : 'Belum ada video'}
                </h2>
                <p className="mt-1.5 text-sm leading-relaxed text-zinc-400">
                  {activeSection === 'liked'
                    ? 'Ketuk dua kali pada video atau tekan tombol Suka di feed Shorts untuk menyimpannya di sini.'
                    : 'Hubungkan folder video pribadimu atau tambahkan video baru.'}
                </p>
                <div className="mt-5 flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setActiveSection('feed')}
                    className="h-11 rounded-xl bg-white px-5 text-sm font-semibold text-zinc-950 transition hover:bg-zinc-200"
                  >
                    Kembali ke Shorts
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex h-full w-full items-center justify-center gap-4 lg:px-6">
                {/* Vertical Smooth Scroll-Snap Shorts Feed */}
                <div className="relative flex h-full flex-1 items-center justify-center">
                  <div
                    ref={feedContainerRef}
                    className="shorts-snap-container h-full w-full overflow-y-scroll pb-16 lg:pb-0"
                  >
                    {feedVideos.map((video, index) => (
                      <div
                        key={video.id}
                        data-index={index}
                        className="shorts-snap-item h-full w-full"
                      >
                        <ShortPlayerCard
                          video={video}
                          isActive={index === activeIndex}
                          isAdjacent={Math.abs(index - activeIndex) <= 1}
                          isMuted={isMuted}
                          onToggleMute={() => setIsMuted((prev) => !prev)}
                          onToggleLike={handleToggleLike}
                          onToggleBookmark={handleToggleBookmark}
                          onOpenComments={(id) =>
                            setOpenCommentsVideoId((prev) =>
                              prev === id ? null : id,
                            )
                          }
                          onOpenEffects={(id) =>
                            setStudioState({
                              isOpen: true,
                              mode: 'edit',
                              videoId: id,
                            })
                          }
                          onOpenProfile={() => setIsProfileModalOpen(true)}
                          onDurationDetected={handleDurationDetected}
                        />
                      </div>
                    ))}
                  </div>

                  {/* Desktop Floating Vertical Navigation Arrows (YouTube Shorts Style) */}
                  <div className="hidden lg:flex lg:flex-col lg:gap-3 lg:ml-3">
                    <button
                      type="button"
                      disabled={activeIndex <= 0}
                      onClick={() => scrollToIndex(activeIndex - 1)}
                      aria-label="Video sebelumnya"
                      className="flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-[#141419] text-white shadow-lg transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-30"
                    >
                      <ChevronUp className="h-5 w-5" />
                    </button>
                    <button
                      type="button"
                      disabled={activeIndex >= feedVideos.length - 1}
                      onClick={() => scrollToIndex(activeIndex + 1)}
                      aria-label="Video berikutnya"
                      className="flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-[#141419] text-white shadow-lg transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-30"
                    >
                      <ChevronDown className="h-5 w-5" />
                    </button>
                  </div>
                </div>

                {/* Docked Comments Panel (Desktop) / Bottom Sheet (Mobile) */}
                {activeCommentVideo && (
                  <CommentsSheet
                    video={activeCommentVideo}
                    profile={profile}
                    onClose={() => setOpenCommentsVideoId(null)}
                    onAddComment={handleAddComment}
                    onToggleCommentLike={handleToggleCommentLike}
                    onTogglePinComment={handleTogglePinComment}
                    onDeleteComment={handleDeleteComment}
                  />
                )}
              </div>
            )}
          </div>
        )}

        {/* Mobile Fixed Bottom Navigation Bar (<= 15% viewport height cap) */}
        {!openCommentsVideoId && (
          <nav
            aria-label="Navigasi seluler"
            className="fixed inset-x-0 bottom-0 z-30 grid h-16 grid-cols-5 items-center border-t border-white/10 bg-[#0B0B0E]/92 backdrop-blur-md lg:hidden"
          >
            <button
              type="button"
              onClick={() => setActiveSection('feed')}
              className={`flex h-full flex-col items-center justify-center gap-0.5 transition ${
                activeSection === 'feed' ? 'text-white' : 'text-zinc-400'
              }`}
            >
              <Clapperboard
                className={`h-5 w-5 ${
                  activeSection === 'feed' ? 'text-[#FF2D55]' : ''
                }`}
              />
              <span className="text-[10px] font-medium">Shorts</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveSection('library')}
              className={`flex h-full flex-col items-center justify-center gap-0.5 transition ${
                activeSection === 'library' ? 'text-white' : 'text-zinc-400'
              }`}
            >
              <FolderOpen
                className={`h-5 w-5 ${
                  activeSection === 'library' ? 'text-[#FF2D55]' : ''
                }`}
              />
              <span className="text-[10px] font-medium">Folder</span>
            </button>

            <div className="flex items-center justify-center">
              <button
                type="button"
                onClick={() =>
                  setStudioState({ isOpen: true, mode: 'create', videoId: null })
                }
                aria-label="Tambah video dan efek"
                className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#FF2D55] text-white shadow-lg shadow-[#FF2D55]/30 transition active:scale-95"
              >
                <Plus className="h-5 w-5" />
              </button>
            </div>

            <button
              type="button"
              onClick={() => {
                setActiveSection('liked');
                setActiveIndex(0);
              }}
              className={`flex h-full flex-col items-center justify-center gap-0.5 transition ${
                activeSection === 'liked' ? 'text-white' : 'text-zinc-400'
              }`}
            >
              <Heart
                className={`h-5 w-5 ${
                  activeSection === 'liked' ? 'fill-[#FF2D55] text-[#FF2D55]' : ''
                }`}
              />
              <span className="text-[10px] font-medium">Disukai</span>
            </button>

            <button
              type="button"
              onClick={() => setIsProfileModalOpen(true)}
              className="flex h-full flex-col items-center justify-center gap-0.5 text-zinc-300 transition"
            >
              <img
                src={profile.avatarDataUrl}
                alt={profile.name}
                referrerPolicy="no-referrer"
                className="h-5 w-5 rounded-full object-cover border border-white/30"
              />
              <span className="text-[10px] font-medium">Profil</span>
            </button>
          </nav>
        )}
      </main>

      {/* Profile & Photo Editor Modal */}
      <ProfileModal
        key={isProfileModalOpen ? 'open' : 'closed'}
        profile={profile}
        isOpen={isProfileModalOpen}
        onClose={() => setIsProfileModalOpen(false)}
        onSave={handleSaveProfile}
      />

      {/* Video & Effects Studio Modal */}
      <EffectStudioModal
        isOpen={studioState.isOpen}
        mode={studioState.mode}
        editingVideo={editingStudioVideo}
        onClose={() =>
          setStudioState({ isOpen: false, mode: 'create', videoId: null })
        }
        onCreateVideo={handleCreateVideo}
        onUpdateVideo={handleUpdateVideoEffects}
      />
    </div>
  );
}

interface SidebarNavButtonProps {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}

const SidebarNavButton: React.FC<SidebarNavButtonProps> = ({
  active,
  icon,
  label,
  onClick,
}) => (
  <button
    type="button"
    onClick={onClick}
    className={`flex h-12 w-full items-center justify-center gap-3.5 rounded-xl px-3 text-sm font-semibold transition xl:justify-start ${
      active
        ? 'bg-white/10 text-white'
        : 'text-zinc-400 hover:bg-white/5 hover:text-zinc-100'
    }`}
  >
    <span className={active ? 'text-[#FF2D55]' : ''}>{icon}</span>
    <span className="hidden whitespace-nowrap xl:inline">{label}</span>
  </button>
);

export default App;
