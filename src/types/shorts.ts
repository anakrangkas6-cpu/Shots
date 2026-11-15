export type EffectPresetId =
  | 'normal'
  | 'cinematic'
  | 'vintage'
  | 'noir'
  | 'golden'
  | 'neon'
  | 'pastel'
  | 'vivid';

export type EffectOverlayId =
  | 'none'
  | 'letterbox'
  | 'bokeh'
  | 'vhs'
  | 'glitch'
  | 'grain';

export type TextOverlayPosition = 'top' | 'center' | 'bottom';

export interface VideoEffectConfig {
  preset: EffectPresetId;
  brightness: number; // 60 - 140
  contrast: number; // 60 - 150
  saturate: number; // 0 - 200
  vignette: number; // 0 - 100
  overlay: EffectOverlayId;
  playbackRate: number; // 0.5 | 1 | 1.25 | 1.5 | 2
  textOverlay: string;
  textPosition: TextOverlayPosition;
}

export interface UserProfile {
  name: string;
  handle: string;
  bio: string;
  avatarDataUrl: string;
}

export interface CommentReply {
  id: string;
  authorName: string;
  authorHandle: string;
  authorAvatar: string;
  text: string;
  createdAt: number;
  likes: number;
  likedByMe: boolean;
}

export interface CommentItem {
  id: string;
  authorName: string;
  authorHandle: string;
  authorAvatar: string;
  text: string;
  createdAt: number;
  likes: number;
  likedByMe: boolean;
  isPinned?: boolean;
  replies: CommentReply[];
}

export type VideoSourceType = 'folder' | 'uploaded' | 'sample';

export interface ShortVideoItem {
  id: string;
  sourceType: VideoSourceType;
  title: string;
  description: string;
  fileName: string;
  relativePath: string;
  fileSize: number;
  duration: number;
  videoUrl?: string;
  posterUrl?: string;
  sourceFile?: File;
  sourceBlob?: Blob;
  sampleTheme?: 'aurora' | 'sunset' | 'kinetic';
  createdAt: number;
  likesCount: number;
  likedByMe: boolean;
  bookmarkedByMe: boolean;
  comments: CommentItem[];
  effect: VideoEffectConfig;
  creatorName: string;
  creatorHandle: string;
  creatorAvatar: string;
  isOwnVideo: boolean;
}

export interface StoredVideoMeta {
  id: string;
  title?: string;
  description?: string;
  likesCount: number;
  likedByMe: boolean;
  bookmarkedByMe: boolean;
  comments: CommentItem[];
  effect: VideoEffectConfig;
  duration?: number;
  isOwnVideo?: boolean;
}

export interface FolderSyncStatus {
  folderName: string;
  lastSyncedAt: number;
  videoCount: number;
  hasDirectoryHandle: boolean;
}
