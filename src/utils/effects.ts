import {
  EffectOverlayId,
  EffectPresetId,
  UserProfile,
  VideoEffectConfig,
} from '../types/shorts';

export const DEFAULT_EFFECT_CONFIG: VideoEffectConfig = {
  preset: 'normal',
  brightness: 100,
  contrast: 100,
  saturate: 100,
  vignette: 0,
  overlay: 'none',
  playbackRate: 1,
  textOverlay: '',
  textPosition: 'top',
};

export interface EffectPresetOption {
  id: EffectPresetId;
  label: string;
  filterCss: string;
  swatchGradient: string;
}

export const EFFECT_PRESETS: EffectPresetOption[] = [
  {
    id: 'normal',
    label: 'Asli',
    filterCss: '',
    swatchGradient: 'from-zinc-600 to-zinc-800',
  },
  {
    id: 'cinematic',
    label: 'Sinematik',
    filterCss: 'contrast(1.12) saturate(1.15) sepia(0.14) hue-rotate(-6deg)',
    swatchGradient: 'from-cyan-700 via-slate-800 to-amber-700',
  },
  {
    id: 'vintage',
    label: 'Vintage 90s',
    filterCss: 'sepia(0.35) contrast(0.95) brightness(1.03) saturate(0.85)',
    swatchGradient: 'from-amber-700 to-stone-800',
  },
  {
    id: 'noir',
    label: 'Noir B&W',
    filterCss: 'grayscale(1) contrast(1.28) brightness(0.95)',
    swatchGradient: 'from-zinc-200 to-zinc-900',
  },
  {
    id: 'golden',
    label: 'Senja Hangat',
    filterCss: 'sepia(0.24) saturate(1.38) brightness(1.05) hue-rotate(-8deg)',
    swatchGradient: 'from-orange-500 to-rose-700',
  },
  {
    id: 'neon',
    label: 'Malam Neon',
    filterCss: 'contrast(1.22) saturate(1.48) hue-rotate(14deg) brightness(0.96)',
    swatchGradient: 'from-indigo-600 to-fuchsia-600',
  },
  {
    id: 'pastel',
    label: 'Pastel Lembut',
    filterCss: 'brightness(1.08) contrast(0.88) saturate(0.92)',
    swatchGradient: 'from-rose-300 to-sky-300',
  },
  {
    id: 'vivid',
    label: 'Tajam Vivid',
    filterCss: 'contrast(1.18) saturate(1.42) brightness(1.04)',
    swatchGradient: 'from-emerald-500 to-sky-500',
  },
];

export interface OverlayOption {
  id: EffectOverlayId;
  label: string;
}

export const EFFECT_OVERLAYS: OverlayOption[] = [
  { id: 'none', label: 'Tanpa Overlay' },
  { id: 'letterbox', label: 'Bingkai Film 2.35:1' },
  { id: 'bokeh', label: 'Partikel Cahaya' },
  { id: 'vhs', label: 'Rekaman VHS' },
  { id: 'glitch', label: 'Glitch Retro' },
  { id: 'grain', label: 'Butiran Film' },
];

export function buildCssFilter(effect: VideoEffectConfig): string {
  const preset = EFFECT_PRESETS.find((p) => p.id === effect.preset);
  const parts: string[] = [];

  if (preset && preset.filterCss) {
    parts.push(preset.filterCss);
  }
  if (effect.brightness !== 100) {
    parts.push(`brightness(${(effect.brightness / 100).toFixed(2)})`);
  }
  if (effect.contrast !== 100) {
    parts.push(`contrast(${(effect.contrast / 100).toFixed(2)})`);
  }
  if (effect.saturate !== 100) {
    parts.push(`saturate(${(effect.saturate / 100).toFixed(2)})`);
  }

  return parts.join(' ') || 'none';
}

export function getPresetLabel(presetId: EffectPresetId): string {
  return EFFECT_PRESETS.find((p) => p.id === presetId)?.label ?? 'Asli';
}

export function formatCompactCount(count: number): string {
  if (count >= 1_000_000) {
    return `${(count / 1_000_000).toFixed(1).replace(/\.0$/, '')} jt`;
  }
  if (count >= 1_000) {
    return `${(count / 1_000).toFixed(1).replace(/\.0$/, '')} rb`;
  }
  return String(count);
}

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function formatFileSize(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 MB';
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatRelativeTime(timestamp: number): string {
  const diffSec = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (diffSec < 60) return 'Baru saja';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} mnt lalu`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr} jam lalu`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 30) return `${diffDay} hr lalu`;
  return new Date(timestamp).toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
  });
}

export function createSvgAvatar(initials: string, bgHex: string, accentHex: string): string {
  const cleanInitials = initials.slice(0, 2).toUpperCase() || 'KS';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${bgHex}"/>
        <stop offset="100%" stop-color="${accentHex}"/>
      </linearGradient>
    </defs>
    <rect width="160" height="160" rx="80" fill="url(#g)"/>
    <text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle" fill="#ffffff" font-family="system-ui, -apple-system, sans-serif" font-size="56" font-weight="700" letter-spacing="2">${cleanInitials}</text>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export const AVATAR_PRESETS = [
  createSvgAvatar('AK', '#FF2D55', '#8E1738'),
  createSvgAvatar('ST', '#1D4ED8', '#0F172A'),
  createSvgAvatar('KR', '#0F766E', '#111827'),
  createSvgAvatar('VD', '#B45309', '#27272A'),
];

export const DEFAULT_USER_PROFILE: UserProfile = {
  name: 'Kreator Pribadi',
  handle: '@kreator.lokal',
  bio: 'Koleksi video pendek pribadi tersimpan langsung di perangkat.',
  avatarDataUrl: AVATAR_PRESETS[0],
};

export const VIDEO_FILE_EXTENSIONS = new Set([
  'mp4',
  'webm',
  'mov',
  'm4v',
  'ogg',
  'ogv',
  'mkv',
]);

export function isSupportedVideoFile(file: File): boolean {
  if (file.type && file.type.startsWith('video/')) return true;
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  return VIDEO_FILE_EXTENSIONS.has(ext);
}

export const TRANSPARENT_POSTER =
  'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

export function inferVideoMimeType(file: File): string {
  if (file.type && file.type.startsWith('video/')) {
    return file.type;
  }
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  switch (ext) {
    case 'webm':
      return 'video/webm';
    case 'mov':
      return 'video/quicktime';
    case 'ogg':
    case 'ogv':
      return 'video/ogg';
    case 'mkv':
      return 'video/x-matroska';
    case 'mp4':
    case 'm4v':
    default:
      return 'video/mp4';
  }
}

export function cleanFileTitle(fileName: string): string {
  return fileName
    .replace(/\.[^/.]+$/, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
