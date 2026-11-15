import React from 'react';
import { VideoEffectConfig } from '../types/shorts';

interface VideoEffectOverlaysProps {
  effect: VideoEffectConfig;
}

export const VideoEffectOverlays: React.FC<VideoEffectOverlaysProps> = ({
  effect,
}) => {
  const vignetteOpacity = Math.max(0, Math.min(1, effect.vignette / 100));

  const textPosClass =
    effect.textPosition === 'top'
      ? 'top-16'
      : effect.textPosition === 'center'
        ? 'top-1/2 -translate-y-1/2'
        : 'bottom-32';

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* Adjustable Vignette */}
      {vignetteOpacity > 0 && (
        <div
          className="absolute inset-0"
          style={{
            background: `radial-gradient(circle at center, transparent 42%, rgba(0,0,0,${(vignetteOpacity * 0.85).toFixed(2)}) 100%)`,
          }}
        />
      )}

      {/* Letterbox 2.35:1 */}
      {effect.overlay === 'letterbox' && (
        <>
          <div className="absolute inset-x-0 top-0 h-[10%] bg-black" />
          <div className="absolute inset-x-0 bottom-0 h-[10%] bg-black" />
        </>
      )}

      {/* Soft Bokeh Particles */}
      {effect.overlay === 'bokeh' && (
        <div className="absolute inset-0">
          <div
            className="effect-bokeh-orb absolute left-[14%] top-[22%] h-24 w-24 rounded-full bg-amber-200/20 blur-xl"
            style={{ animationDelay: '0s' }}
          />
          <div
            className="effect-bokeh-orb absolute right-[18%] top-[36%] h-32 w-32 rounded-full bg-rose-300/15 blur-2xl"
            style={{ animationDelay: '1.4s' }}
          />
          <div
            className="effect-bokeh-orb absolute left-[28%] bottom-[28%] h-20 w-20 rounded-full bg-sky-200/20 blur-xl"
            style={{ animationDelay: '2.7s' }}
          />
          <div
            className="effect-bokeh-orb absolute right-[14%] bottom-[20%] h-28 w-28 rounded-full bg-amber-100/15 blur-2xl"
            style={{ animationDelay: '0.8s' }}
          />
        </div>
      )}

      {/* VHS Tape Overlay */}
      {effect.overlay === 'vhs' && (
        <div className="absolute inset-0">
          <div
            className="absolute inset-0 opacity-25"
            style={{
              backgroundImage:
                'repeating-linear-gradient(0deg, rgba(255,255,255,0.08) 0px, rgba(255,255,255,0.08) 1px, transparent 1px, transparent 3px)',
            }}
          />
          <div className="absolute left-5 top-14 font-mono-tabular text-[11px] font-medium tracking-wider text-white/80 drop-shadow">
            PLAY ▸ SP 00:00
          </div>
        </div>
      )}

      {/* Retro Glitch Overlay */}
      {effect.overlay === 'glitch' && (
        <div className="effect-glitch-scan absolute inset-0">
          <div className="absolute inset-x-0 top-[28%] h-3 bg-cyan-400/25 mix-blend-screen" />
          <div className="absolute inset-x-0 top-[62%] h-2 bg-rose-500/30 mix-blend-screen" />
        </div>
      )}

      {/* Film Grain Overlay */}
      {effect.overlay === 'grain' && (
        <div className="effect-grain-layer absolute inset-0 opacity-30 mix-blend-overlay" />
      )}

      {/* Custom Text Overlay */}
      {effect.textOverlay.trim().length > 0 && (
        <div
          className={`absolute inset-x-6 flex justify-center ${textPosClass}`}
        >
          <p className="max-w-full break-words rounded-xl bg-black/55 px-4 py-2 text-center text-base font-bold tracking-tight text-white shadow-lg backdrop-blur-sm">
            {effect.textOverlay}
          </p>
        </div>
      )}
    </div>
  );
};
