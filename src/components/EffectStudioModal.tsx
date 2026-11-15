import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  Film,
  Play,
  RotateCcw,
  SlidersHorizontal,
  Sparkles,
  Type,
  Upload,
  X,
} from 'lucide-react';
import {
  blobToDataUrl,
  materializeFileToBlobUrl,
} from '../services/folderScanner';
import {
  cacheBlobToNativeServer,
  isNativeAndroid,
  openNativeAndroidPlayer,
} from '../services/nativeMedia';
import {
  ShortVideoItem,
  TextOverlayPosition,
  VideoEffectConfig,
} from '../types/shorts';
import {
  buildCssFilter,
  cleanFileTitle,
  DEFAULT_EFFECT_CONFIG,
  EFFECT_OVERLAYS,
  EFFECT_PRESETS,
  formatFileSize,
  inferVideoMimeType,
  isSupportedVideoFile,
  TRANSPARENT_POSTER,
} from '../utils/effects';
import { probeVideoCodec } from '../utils/mp4Probe';
import { ProceduralCanvasReel } from './ProceduralCanvasReel';
import { VideoEffectOverlays } from './VideoEffectOverlays';

interface EffectStudioModalProps {
  isOpen: boolean;
  mode: 'create' | 'edit';
  editingVideo: ShortVideoItem | null;
  onClose: () => void;
  onCreateVideo: (payload: {
    file: File;
    title: string;
    description: string;
    effect: VideoEffectConfig;
    duration: number;
  }) => Promise<void>;
  onUpdateVideo: (
    videoId: string,
    payload: {
      title: string;
      description: string;
      effect: VideoEffectConfig;
    },
  ) => void;
}

type StudioTab = 'color' | 'overlay' | 'details';

const PLAYBACK_SPEEDS = [0.5, 1, 1.25, 1.5, 2];

export const EffectStudioModal: React.FC<EffectStudioModalProps> = ({
  isOpen,
  mode,
  editingVideo,
  onClose,
  onCreateVideo,
  onUpdateVideo,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const previewVideoRef = useRef<HTMLVideoElement | null>(null);

  const [activeTab, setActiveTab] = useState<StudioTab>('color');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>('');
  const [detectedDuration, setDetectedDuration] = useState<number>(0);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [effect, setEffect] = useState<VideoEffectConfig>({
    ...DEFAULT_EFFECT_CONFIG,
  });
  const [sampleTime, setSampleTime] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Initialize state when opened
  useEffect(() => {
    if (!isOpen) return;
    setErrorMsg('');
    setActiveTab('color');

    if (mode === 'edit' && editingVideo) {
      setSelectedFile(null);
      setPreviewUrl(editingVideo.videoUrl || '');
      setDetectedDuration(editingVideo.duration || 15);
      setTitle(editingVideo.title);
      setDescription(editingVideo.description);
      setEffect({ ...DEFAULT_EFFECT_CONFIG, ...editingVideo.effect });
    } else {
      setSelectedFile(null);
      setPreviewUrl('');
      setDetectedDuration(0);
      setTitle('');
      setDescription('');
      setEffect({ ...DEFAULT_EFFECT_CONFIG });
    }
  }, [isOpen, mode, editingVideo]);

  // Clean up local object URL created for create mode
  useEffect(() => {
    return () => {
      if (mode === 'create' && previewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [mode, previewUrl]);

  // Keep preview playbackRate synced
  useEffect(() => {
    if (previewVideoRef.current) {
      previewVideoRef.current.playbackRate = effect.playbackRate || 1;
    }
  }, [effect.playbackRate]);

  const cssFilter = useMemo(() => buildCssFilter(effect), [effect]);

  if (!isOpen) return null;

  const handlePickedFile = async (file: File) => {
    if (!isSupportedVideoFile(file)) {
      setErrorMsg('Pilih berkas video yang didukung (MP4, WebM, MOV, M4V).');
      return;
    }
    if (previewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(previewUrl);
    }
    let url = '';
    if (isNativeAndroid()) {
      const nativeRes = await cacheBlobToNativeServer(
        `studio_preview_${file.name}_${file.size}`,
        file,
        inferVideoMimeType(file),
      );
      if (nativeRes?.url) {
        url = nativeRes.url;
        if (nativeRes.duration) {
          setDetectedDuration(nativeRes.duration);
        }
      }
    }
    if (!url) {
      try {
        const res = await materializeFileToBlobUrl(file);
        url = res.url;
      } catch {
        url = URL.createObjectURL(file);
      }
    }
    setSelectedFile(file);
    setPreviewUrl(url);
    setTitle((prev) => prev.trim() || cleanFileTitle(file.name) || 'Video Baru');
    setErrorMsg('');
  };

  const handleSave = async () => {
    if (mode === 'create') {
      if (!selectedFile) {
        setErrorMsg('Pilih berkas video terlebih dahulu sebelum menyimpan.');
        return;
      }
      setIsSaving(true);
      try {
        await onCreateVideo({
          file: selectedFile,
          title: title.trim() || cleanFileTitle(selectedFile.name) || 'Video Baru',
          description: description.trim(),
          effect,
          duration: detectedDuration,
        });
        onClose();
      } catch {
        setErrorMsg('Gagal menyimpan video ke penyimpanan lokal.');
      } finally {
        setIsSaving(false);
      }
    } else if (editingVideo) {
      onUpdateVideo(editingVideo.id, {
        title: title.trim() || editingVideo.title,
        description: description.trim(),
        effect,
      });
      onClose();
    }
  };

  const isSampleEdit = mode === 'edit' && editingVideo?.sourceType === 'sample';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm sm:p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={mode === 'create' ? 'Tambah video dan efek' : 'Edit efek video'}
        className="flex h-full w-full max-w-4xl flex-col overflow-hidden bg-[#141419] sm:h-[min(860px,92dvh)] sm:rounded-2xl sm:border sm:border-white/10 sm:shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            <Sparkles className="h-5 w-5 text-[#FF2D55]" />
            <h2 className="text-base font-bold text-white sm:text-lg">
              {mode === 'create' ? 'Tambah Video & Efek' : 'Studio Efek Video'}
            </h2>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setEffect({ ...DEFAULT_EFFECT_CONFIG })}
              className="inline-flex h-10 items-center gap-1.5 rounded-xl px-3 text-xs font-medium text-zinc-300 transition hover:bg-white/10 hover:text-white"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Atur Ulang</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Tutup studio efek"
              className="flex h-10 w-10 items-center justify-center rounded-full text-zinc-400 transition hover:bg-white/10 hover:text-white"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Body: 2-Column Studio on Desktop, Stacked on Mobile */}
        <div className="grid flex-1 grid-cols-1 overflow-y-auto lg:grid-cols-[340px_1fr] lg:overflow-hidden">
          {/* Left: Live 9:16 Preview Stage */}
          <div className="flex flex-col items-center justify-center border-b border-white/10 bg-[#0B0B0E] p-5 lg:border-b-0 lg:border-r">
            <div className="relative aspect-[9/16] w-full max-w-[230px] overflow-hidden rounded-2xl border border-white/10 bg-black shadow-xl sm:max-w-[260px]">
              {isSampleEdit && editingVideo?.sampleTheme ? (
                <div className="h-full w-full" style={{ filter: cssFilter }}>
                  <ProceduralCanvasReel
                    theme={editingVideo.sampleTheme}
                    isPlaying={true}
                    playbackRate={effect.playbackRate}
                    currentTime={sampleTime}
                    duration={15}
                    onTimeUpdate={setSampleTime}
                  />
                </div>
              ) : previewUrl ? (
                <video
                  key={previewUrl}
                  ref={previewVideoRef}
                  src={previewUrl}
                  poster={TRANSPARENT_POSTER}
                  autoPlay
                  loop
                  muted
                  playsInline
                  onLoadedMetadata={(e) => {
                    if (Number.isFinite(e.currentTarget.duration)) {
                      setDetectedDuration(e.currentTarget.duration);
                    }
                  }}
                  onError={async () => {
                    if (
                      selectedFile &&
                      !isNativeAndroid() &&
                      previewUrl.startsWith('blob:') &&
                      selectedFile.size <= 35 * 1024 * 1024
                    ) {
                      try {
                        const dataUrl = await blobToDataUrl(selectedFile);
                        URL.revokeObjectURL(previewUrl);
                        setPreviewUrl(dataUrl);
                        return;
                      } catch {
                        // ignore
                      }
                    }
                    const sourceBlob =
                      selectedFile ??
                      editingVideo?.sourceBlob ??
                      editingVideo?.sourceFile;
                    const probe = sourceBlob
                      ? await probeVideoCodec(sourceBlob)
                      : null;
                    setErrorMsg(
                      probe
                        ? `Pratinjau WebView tidak mendukung codec ${probe.codec} (${probe.container}). Kamu tetap bisa menyimpan atau putar dengan Pemutar Native Android.`
                        : 'Pratinjau tidak dapat didekode oleh WebView perangkat.',
                    );
                  }}
                  style={{ filter: cssFilter }}
                  className="h-full w-full object-cover"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex h-full w-full flex-col items-center justify-center gap-3 px-6 text-center text-zinc-400 transition hover:bg-white/5 hover:text-zinc-200"
                >
                  <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white/10 text-white">
                    <Upload className="h-6 w-6" />
                  </span>
                  <span className="text-sm font-semibold text-white">
                    Pilih Video dari Perangkat
                  </span>
                  <span className="text-xs text-zinc-500">
                    Mendukung MP4, WebM, MOV untuk diputar offline
                  </span>
                </button>
              )}

              <VideoEffectOverlays effect={effect} />
            </div>

            {mode === 'create' && (
              <div className="mt-4 flex flex-col items-center gap-1.5">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="video/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handlePickedFile(file);
                    e.target.value = '';
                  }}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 text-xs font-semibold text-white transition hover:bg-white/10"
                >
                  <Film className="h-4 w-4" />
                  <span>{selectedFile ? 'Ganti Video' : 'Pilih Berkas Video'}</span>
                </button>
                {selectedFile && (
                  <p className="max-w-[260px] truncate text-xs text-zinc-400">
                    {selectedFile.name} · {formatFileSize(selectedFile.size)}
                  </p>
                )}
              </div>
            )}

            {isNativeAndroid() && previewUrl && errorMsg && (
              <button
                type="button"
                onClick={() =>
                  void openNativeAndroidPlayer({
                    url: previewUrl,
                    title: title || selectedFile?.name || 'Pratinjau Video',
                    muted: false,
                  })
                }
                className="mt-3 inline-flex h-10 items-center gap-2 rounded-xl bg-[#FF2D55] px-4 text-xs font-semibold text-white transition hover:bg-[#e6244a]"
              >
                <Play className="h-3.5 w-3.5 fill-white" />
                <span>Pratinjau di Pemutar Android</span>
              </button>
            )}
          </div>

          {/* Right: Controls */}
          <div className="flex flex-col overflow-hidden">
            {/* Segmented Control Tabs */}
            <div className="border-b border-white/10 px-5 py-3">
              <div className="grid grid-cols-3 gap-1 rounded-xl bg-zinc-900 p-1">
                <button
                  type="button"
                  onClick={() => setActiveTab('color')}
                  className={`flex h-9 items-center justify-center gap-1.5 rounded-lg text-xs font-semibold transition whitespace-nowrap ${
                    activeTab === 'color'
                      ? 'bg-zinc-800 text-white shadow-sm'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  <SlidersHorizontal className="h-3.5 w-3.5" />
                  <span>Filter</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('overlay')}
                  className={`flex h-9 items-center justify-center gap-1.5 rounded-lg text-xs font-semibold transition whitespace-nowrap ${
                    activeTab === 'overlay'
                      ? 'bg-zinc-800 text-white shadow-sm'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  <Type className="h-3.5 w-3.5" />
                  <span>Overlay &amp; Teks</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('details')}
                  className={`flex h-9 items-center justify-center gap-1.5 rounded-lg text-xs font-semibold transition whitespace-nowrap ${
                    activeTab === 'details'
                      ? 'bg-zinc-800 text-white shadow-sm'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  <Film className="h-3.5 w-3.5" />
                  <span>Info &amp; Tempo</span>
                </button>
              </div>
            </div>

            {/* Tab Panel */}
            <div className="flex-1 space-y-6 overflow-y-auto p-5">
              {activeTab === 'color' && (
                <>
                  <div>
                    <h3 className="mb-3 text-xs font-semibold text-zinc-400">
                      Preset Warna
                    </h3>
                    <div className="grid grid-cols-4 gap-2.5">
                      {EFFECT_PRESETS.map((preset) => {
                        const selected = effect.preset === preset.id;
                        return (
                          <button
                            key={preset.id}
                            type="button"
                            onClick={() =>
                              setEffect((prev) => ({ ...prev, preset: preset.id }))
                            }
                            className={`flex flex-col items-center gap-1.5 rounded-xl border p-2 transition ${
                              selected
                                ? 'border-[#FF2D55] bg-[#FF2D55]/10 text-white'
                                : 'border-white/10 bg-zinc-900/70 text-zinc-400 hover:border-white/25 hover:text-zinc-200'
                            }`}
                          >
                            <span
                              className={`h-9 w-full rounded-lg bg-gradient-to-br ${preset.swatchGradient}`}
                            />
                            <span className="truncate w-full text-center text-[11px] font-medium">
                              {preset.label}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h3 className="text-xs font-semibold text-zinc-400">
                      Penyesuaian Halus
                    </h3>

                    <SliderControl
                      label="Kecerahan"
                      value={effect.brightness}
                      min={60}
                      max={140}
                      unit="%"
                      onChange={(val) =>
                        setEffect((prev) => ({ ...prev, brightness: val }))
                      }
                    />
                    <SliderControl
                      label="Kontras"
                      value={effect.contrast}
                      min={60}
                      max={150}
                      unit="%"
                      onChange={(val) =>
                        setEffect((prev) => ({ ...prev, contrast: val }))
                      }
                    />
                    <SliderControl
                      label="Saturasi"
                      value={effect.saturate}
                      min={0}
                      max={200}
                      unit="%"
                      onChange={(val) =>
                        setEffect((prev) => ({ ...prev, saturate: val }))
                      }
                    />
                    <SliderControl
                      label="Vignette Gelap"
                      value={effect.vignette}
                      min={0}
                      max={100}
                      unit="%"
                      onChange={(val) =>
                        setEffect((prev) => ({ ...prev, vignette: val }))
                      }
                    />
                  </div>
                </>
              )}

              {activeTab === 'overlay' && (
                <>
                  <div>
                    <h3 className="mb-3 text-xs font-semibold text-zinc-400">
                      Efek Overlay Visual
                    </h3>
                    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                      {EFFECT_OVERLAYS.map((item) => {
                        const active = effect.overlay === item.id;
                        return (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() =>
                              setEffect((prev) => ({ ...prev, overlay: item.id }))
                            }
                            className={`flex h-11 items-center justify-center rounded-xl border px-3 text-xs font-semibold transition ${
                              active
                                ? 'border-[#FF2D55] bg-[#FF2D55]/15 text-white'
                                : 'border-white/10 bg-zinc-900/70 text-zinc-300 hover:border-white/25'
                            }`}
                          >
                            {item.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="space-y-3">
                    <label
                      htmlFor="effect-text-overlay"
                      className="block text-xs font-semibold text-zinc-400"
                    >
                      Teks di Dalam Video
                    </label>
                    <input
                      id="effect-text-overlay"
                      type="text"
                      value={effect.textOverlay}
                      onChange={(e) =>
                        setEffect((prev) => ({
                          ...prev,
                          textOverlay: e.target.value,
                        }))
                      }
                      maxLength={70}
                      placeholder="Contoh: Liburan Sore Hari..."
                      className="h-11 w-full rounded-xl border border-white/10 bg-zinc-900 px-3.5 text-sm text-white placeholder:text-zinc-500 focus:border-white/30 focus:outline-none"
                    />

                    <div className="flex items-center gap-2">
                      {(
                        [
                          { id: 'top', label: 'Atas' },
                          { id: 'center', label: 'Tengah' },
                          { id: 'bottom', label: 'Bawah' },
                        ] as { id: TextOverlayPosition; label: string }[]
                      ).map((pos) => (
                        <button
                          key={pos.id}
                          type="button"
                          onClick={() =>
                            setEffect((prev) => ({ ...prev, textPosition: pos.id }))
                          }
                          className={`h-9 flex-1 rounded-xl border text-xs font-medium transition ${
                            effect.textPosition === pos.id
                              ? 'border-white bg-white text-zinc-950'
                              : 'border-white/10 bg-zinc-900 text-zinc-300 hover:border-white/25'
                          }`}
                        >
                          {pos.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {activeTab === 'details' && (
                <>
                  <div>
                    <h3 className="mb-3 text-xs font-semibold text-zinc-400">
                      Kecepatan Putar
                    </h3>
                    <div className="grid grid-cols-5 gap-2">
                      {PLAYBACK_SPEEDS.map((speed) => (
                        <button
                          key={speed}
                          type="button"
                          onClick={() =>
                            setEffect((prev) => ({ ...prev, playbackRate: speed }))
                          }
                          className={`h-11 rounded-xl border font-mono-tabular text-xs font-semibold transition ${
                            effect.playbackRate === speed
                              ? 'border-[#FF2D55] bg-[#FF2D55]/15 text-white'
                              : 'border-white/10 bg-zinc-900 text-zinc-300 hover:border-white/25'
                          }`}
                        >
                          {speed}x
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-3.5">
                    <div>
                      <label
                        htmlFor="video-title-input"
                        className="mb-1.5 block text-xs font-semibold text-zinc-400"
                      >
                        Judul Video
                      </label>
                      <input
                        id="video-title-input"
                        type="text"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        maxLength={90}
                        placeholder="Masukkan judul video..."
                        className="h-11 w-full rounded-xl border border-white/10 bg-zinc-900 px-3.5 text-sm text-white placeholder:text-zinc-500 focus:border-white/30 focus:outline-none"
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="video-desc-input"
                        className="mb-1.5 block text-xs font-semibold text-zinc-400"
                      >
                        Deskripsi / Tagar
                      </label>
                      <textarea
                        id="video-desc-input"
                        rows={3}
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        maxLength={240}
                        placeholder="Ceritakan momen singkat atau tambahkan #tagar..."
                        className="w-full resize-none rounded-xl border border-white/10 bg-zinc-900 px-3.5 py-2.5 text-sm text-white placeholder:text-zinc-500 focus:border-white/30 focus:outline-none"
                      />
                    </div>
                  </div>
                </>
              )}

              {errorMsg && (
                <p className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3.5 py-2.5 text-xs font-medium text-rose-300">
                  {errorMsg}
                </p>
              )}
            </div>

            {/* Footer Actions */}
            <div className="flex items-center justify-end gap-3 border-t border-white/10 bg-[#141419] px-5 py-3.5">
              <button
                type="button"
                onClick={onClose}
                className="h-11 rounded-xl px-4 text-sm font-medium text-zinc-300 transition hover:bg-white/10"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={isSaving}
                onClick={handleSave}
                className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#FF2D55] px-5 text-sm font-semibold text-white transition hover:bg-[#e6244a] disabled:opacity-60"
              >
                <Check className="h-4 w-4" />
                <span>
                  {isSaving
                    ? 'Menyimpan...'
                    : mode === 'create'
                      ? 'Terbitkan ke Shorts'
                      : 'Simpan Efek'}
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

interface SliderControlProps {
  label: string;
  value: number;
  min: number;
  max: number;
  unit: string;
  onChange: (value: number) => void;
}

const SliderControl: React.FC<SliderControlProps> = ({
  label,
  value,
  min,
  max,
  unit,
  onChange,
}) => (
  <div className="space-y-1.5">
    <div className="flex items-center justify-between text-xs">
      <span className="font-medium text-zinc-300">{label}</span>
      <span className="font-mono-tabular text-zinc-400">
        {value}
        {unit}
      </span>
    </div>
    <input
      type="range"
      min={min}
      max={max}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-zinc-800 accent-[#FF2D55]"
    />
  </div>
);
