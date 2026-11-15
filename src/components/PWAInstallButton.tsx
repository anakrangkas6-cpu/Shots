import React, { useState } from 'react';
import { Download, Smartphone, X } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

interface PWAInstallButtonProps {
  compact?: boolean;
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({
  compact = false,
}) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={install}
        className={`inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/5 px-3.5 text-xs font-semibold text-white transition hover:bg-white/10 whitespace-nowrap shrink-0 ${
          compact ? 'w-full xl:justify-start' : ''
        }`}
      >
        <Download className="h-4 w-4 shrink-0 text-[#FF2D55]" />
        <span className={compact ? 'hidden xl:inline' : ''}>
          Pasang Aplikasi
        </span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          className={`inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/5 px-3.5 text-xs font-semibold text-white transition hover:bg-white/10 whitespace-nowrap shrink-0 ${
            compact ? 'w-full xl:justify-start' : ''
          }`}
        >
          <Smartphone className="h-4 w-4 shrink-0 text-[#FF2D55]" />
          <span className={compact ? 'hidden xl:inline' : ''}>
            Pasang di iOS
          </span>
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
            <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#141419] p-6 shadow-2xl">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold text-white">
                  Pasang di iPhone / iPad
                </h3>
                <button
                  type="button"
                  onClick={() => setShowIOSGuide(false)}
                  aria-label="Tutup panduan"
                  className="flex h-9 w-9 items-center justify-center rounded-full text-zinc-400 hover:bg-white/10 hover:text-white"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-zinc-300">
                1. Ketuk tombol <strong>Bagikan (Share)</strong> di bilah Safari.
                <br />
                2. Gulir ke bawah lalu pilih{' '}
                <strong>Tambahkan ke Layar Utama</strong>.
              </p>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="mt-5 h-11 w-full rounded-xl bg-[#FF2D55] text-sm font-semibold text-white transition hover:bg-[#e6244a]"
              >
                Mengerti
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};
