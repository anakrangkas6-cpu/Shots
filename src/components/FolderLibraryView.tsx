import React, { useRef, useState } from 'react';
import {
  Bookmark,
  FolderOpen,
  Heart,
  Play,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  UploadCloud,
} from 'lucide-react';
import {
  FolderSyncStatus,
  ShortVideoItem,
  UserProfile,
} from '../types/shorts';
import {
  buildCssFilter,
  formatCompactCount,
  formatDuration,
  formatFileSize,
  getPresetLabel,
  TRANSPARENT_POSTER,
} from '../utils/effects';
import { isNativeAndroid } from '../services/nativeMedia';
import { PWAInstallButton } from './PWAInstallButton';

export type LibraryFilter = 'all' | 'folder' | 'uploaded' | 'liked' | 'saved';

interface FolderLibraryViewProps {
  videos: ShortVideoItem[];
  profile: UserProfile;
  folderStatus: FolderSyncStatus | null;
  hasSavedHandle: boolean;
  isScanning: boolean;
  activeFilter: LibraryFilter;
  onFilterChange: (filter: LibraryFilter) => void;
  onPickFolder: () => void;
  onPickFiles: () => void;
  onFallbackFolderSelected: (files: FileList) => void;
  onDropDataTransfer: (dataTransfer: DataTransfer) => void;
  onResyncSavedFolder: () => void;
  onOpenCreateVideo: () => void;
  onOpenProfile: () => void;
  onSelectVideo: (videoId: string) => void;
  onDeleteUploadedVideo: (videoId: string) => void;
}

export const FolderLibraryView: React.FC<FolderLibraryViewProps> = ({
  videos,
  profile,
  folderStatus,
  hasSavedHandle,
  isScanning,
  activeFilter,
  onFilterChange,
  onPickFolder,
  onPickFiles,
  onFallbackFolderSelected,
  onDropDataTransfer,
  onResyncSavedFolder,
  onOpenCreateVideo,
  onOpenProfile,
  onSelectVideo,
  onDeleteUploadedVideo,
}) => {
  const folderInputRef = useRef<HTMLInputElement | null>(null);
  const multiFileInputRef = useRef<HTMLInputElement | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isDragging, setIsDragging] = useState(false);

  const filteredVideos = videos.filter((v) => {
    if (activeFilter === 'folder' && v.sourceType !== 'folder') return false;
    if (activeFilter === 'uploaded' && v.sourceType !== 'uploaded') return false;
    if (activeFilter === 'liked' && !v.likedByMe) return false;
    if (activeFilter === 'saved' && !v.bookmarkedByMe) return false;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        v.title.toLowerCase().includes(q) ||
        v.fileName.toLowerCase().includes(q) ||
        v.description.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const folderVideosCount = videos.filter((v) => v.sourceType === 'folder').length;
  const uploadedVideosCount = videos.filter((v) => v.sourceType === 'uploaded').length;
  const likedCount = videos.filter((v) => v.likedByMe).length;

  return (
    <div className="h-full overflow-y-auto px-4 pt-4 pb-24 sm:px-8 sm:py-8">
      <div className="mx-auto max-w-6xl space-y-8">
        {/* Profile & Folder Source Header */}
        <section className="flex flex-col justify-between gap-6 border-b border-white/10 pb-8 md:flex-row md:items-center">
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={onOpenProfile}
              className="group relative shrink-0 focus-visible:outline-none"
              title="Ubah foto profil"
            >
              <img
                src={profile.avatarDataUrl}
                alt={profile.name}
                referrerPolicy="no-referrer"
                className="h-18 w-18 rounded-full border-2 border-white/20 object-cover transition group-hover:border-[#FF2D55] sm:h-20 sm:w-20"
              />
            </button>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="truncate text-xl font-bold tracking-tight text-white sm:text-2xl">
                  {profile.name}
                </h1>
                <button
                  type="button"
                  onClick={onOpenProfile}
                  className="h-8 rounded-lg border border-white/15 bg-white/5 px-3 text-xs font-medium text-zinc-200 transition hover:bg-white/10"
                >
                  Edit Profil
                </button>
              </div>
              <p className="mt-0.5 text-sm text-zinc-400">{profile.handle}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-zinc-400">
                <span className="tabular-nums">
                  {folderVideosCount} video folder
                </span>
                <span aria-hidden="true">·</span>
                <span className="tabular-nums">
                  {uploadedVideosCount} video studio
                </span>
                <span aria-hidden="true">·</span>
                <span className="tabular-nums">{likedCount} disukai</span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={onPickFolder}
              disabled={isScanning}
              className="inline-flex h-11 items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 text-sm font-semibold text-white transition hover:bg-white/10 disabled:opacity-60 whitespace-nowrap shrink-0"
            >
              <FolderOpen className="h-4 w-4 text-[#FF2D55]" />
              <span>{isScanning ? 'Memindai...' : 'Pilih Folder Video'}</span>
            </button>

            <button
              type="button"
              onClick={onOpenCreateVideo}
              className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#FF2D55] px-4 text-sm font-semibold text-white transition hover:bg-[#e6244a] whitespace-nowrap shrink-0"
            >
              <Plus className="h-4 w-4" />
              <span>Tambah Video + Efek</span>
            </button>

            <PWAInstallButton />
          </div>
        </section>

        {/* Personal Folder Dropzone & Reconnect Strip */}
        <section
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragging(false);
            if (e.dataTransfer) {
              onDropDataTransfer(e.dataTransfer);
            }
          }}
          className={`flex flex-col justify-between gap-4 rounded-2xl border p-5 transition sm:flex-row sm:items-center ${
            isDragging
              ? 'border-[#FF2D55] bg-[#FF2D55]/10'
              : 'border-white/10 bg-[#141419]'
          }`}
        >
          <div className="flex items-start gap-3.5">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/5 text-zinc-200">
              <UploadCloud className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-white">
                {folderStatus
                  ? `Folder Terhubung: ${folderStatus.folderName}`
                  : 'Sumber Penyimpanan Folder Pribadi'}
              </h2>
              <p className="mt-1 text-xs leading-relaxed text-zinc-400">
                {folderStatus
                  ? `${folderStatus.videoCount} video terdeteksi. Tarik & lepas folder baru atau pilih folder lain kapan saja.`
                  : 'Pilih folder lokal di perangkatmu atau tarik folder video langsung ke area ini untuk diputar offline.'}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {hasSavedHandle && folderVideosCount === 0 && (
              <button
                type="button"
                onClick={onResyncSavedFolder}
                className="inline-flex h-10 items-center gap-2 rounded-xl bg-white px-4 text-xs font-semibold text-zinc-950 transition hover:bg-zinc-200"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                <span>Hubungkan Ulang Folder</span>
              </button>
            )}

            <input
              ref={folderInputRef}
              type="file"
              // @ts-expect-error webkitdirectory is supported in major desktop & mobile browsers
              webkitdirectory=""
              multiple
              accept="video/*"
              onChange={(e) => {
                if (e.target.files?.length) {
                  onFallbackFolderSelected(e.target.files);
                }
                e.target.value = '';
              }}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => {
                if (isNativeAndroid()) {
                  onPickFolder();
                } else {
                  folderInputRef.current?.click();
                }
              }}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/15 bg-zinc-900 px-3.5 text-xs font-medium text-zinc-200 transition hover:bg-zinc-800"
            >
              <span>Telusuri Direktori</span>
            </button>

            <input
              ref={multiFileInputRef}
              type="file"
              multiple
              accept="video/*"
              onChange={(e) => {
                if (e.target.files?.length) {
                  onFallbackFolderSelected(e.target.files);
                }
                e.target.value = '';
              }}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => {
                if (isNativeAndroid()) {
                  onPickFiles();
                } else {
                  multiFileInputRef.current?.click();
                }
              }}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/15 bg-zinc-900 px-3.5 text-xs font-medium text-zinc-200 transition hover:bg-zinc-800"
            >
              <span>Pilih File Video</span>
            </button>
          </div>
        </section>

        {/* Filter Tabs & Search */}
        <section className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <div className="flex items-center gap-1 overflow-x-auto rounded-xl bg-[#141419] p-1 border border-white/10 no-scrollbar">
            {(
              [
                { id: 'all', label: 'Semua' },
                { id: 'folder', label: 'Folder Pribadi' },
                { id: 'uploaded', label: 'Video Studio' },
                { id: 'liked', label: 'Disukai' },
                { id: 'saved', label: 'Tersimpan' },
              ] as { id: LibraryFilter; label: string }[]
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => onFilterChange(tab.id)}
                className={`h-9 rounded-lg px-3.5 text-xs font-semibold transition whitespace-nowrap shrink-0 ${
                  activeFilter === tab.id
                    ? 'bg-zinc-800 text-white'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari judul atau nama berkas..."
              className="h-10 w-full rounded-xl border border-white/10 bg-[#141419] pl-10 pr-3.5 text-xs text-white placeholder:text-zinc-500 focus:border-white/25 focus:outline-none"
            />
          </div>
        </section>

        {/* 9:16 Video Grid */}
        {filteredVideos.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-white/10 bg-[#141419] px-6 py-16 text-center">
            <p className="text-base font-semibold text-zinc-200">
              Belum ada video di kategori ini
            </p>
            <p className="mt-1.5 max-w-md text-xs leading-relaxed text-zinc-400">
              Pilih folder penyimpanan pribadimu atau tambahkan video baru dengan efek untuk mulai menonton.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {filteredVideos.map((item) => (
              <div
                key={item.id}
                className="group relative flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#141419]"
              >
                <button
                  type="button"
                  onClick={() => onSelectVideo(item.id)}
                  className="relative aspect-[9/16] w-full overflow-hidden bg-black text-left focus-visible:outline-2 focus-visible:outline-[#FF2D55]"
                >
                  {item.posterUrl ? (
                    <>
                      <img
                        src={item.posterUrl}
                        alt={item.title}
                        style={{ filter: buildCssFilter(item.effect) }}
                        className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                      />
                      <span className="pointer-events-none absolute left-1/2 top-1/2 flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm transition group-hover:scale-110">
                        <Play className="ml-0.5 h-5 w-5 fill-white" />
                      </span>
                    </>
                  ) : item.videoUrl ? (
                    <>
                      <video
                        src={item.videoUrl}
                        poster={TRANSPARENT_POSTER}
                        muted
                        playsInline
                        preload="metadata"
                        style={{ filter: buildCssFilter(item.effect) }}
                        className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                      />
                      <span className="pointer-events-none absolute left-1/2 top-1/2 flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm transition group-hover:scale-110">
                        <Play className="ml-0.5 h-5 w-5 fill-white" />
                      </span>
                    </>
                  ) : (
                    <div className="flex h-full w-full flex-col items-center justify-center bg-gradient-to-br from-zinc-800 to-zinc-950 p-4 text-center">
                      <Play className="h-8 w-8 text-white/80" />
                      <span className="mt-2 text-xs font-medium text-zinc-300">
                        {getPresetLabel(item.effect.preset)}
                      </span>
                    </div>
                  )}

                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/85 via-transparent to-black/20" />

                  {/* Play hover indicator */}
                  <div className="pointer-events-none absolute right-2.5 top-2.5 flex items-center gap-1.5 text-white/90">
                    {item.likedByMe && (
                      <Heart className="h-4 w-4 fill-[#FF2D55] text-[#FF2D55]" />
                    )}
                    {item.bookmarkedByMe && (
                      <Bookmark className="h-4 w-4 fill-white text-white" />
                    )}
                  </div>

                  <div className="absolute inset-x-2.5 bottom-2.5">
                    <p className="line-clamp-2 text-xs font-semibold leading-snug text-white">
                      {item.title}
                    </p>
                    <div className="mt-1 flex items-center gap-1.5 text-[11px] text-zinc-300">
                      <span className="tabular-nums">
                        {formatCompactCount(item.likesCount)} suka
                      </span>
                      {item.duration > 0 && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono-tabular">
                            {formatDuration(item.duration)}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </button>

                {item.sourceType !== 'sample' && (
                  <div className="flex items-center justify-between border-t border-white/10 px-2.5 py-2 text-[11px] text-zinc-400">
                    <span className="truncate">{formatFileSize(item.fileSize)}</span>
                    <button
                      type="button"
                      onClick={() => onDeleteUploadedVideo(item.id)}
                      aria-label={`Hapus ${item.title}`}
                      className="flex h-7 w-7 items-center justify-center rounded-lg text-zinc-400 transition hover:bg-rose-500/15 hover:text-rose-400"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
