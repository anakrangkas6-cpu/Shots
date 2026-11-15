import React, { useRef, useState } from 'react';
import { Camera, Check, Upload, X } from 'lucide-react';
import { UserProfile } from '../types/shorts';
import { AVATAR_PRESETS } from '../utils/effects';

interface ProfileModalProps {
  profile: UserProfile;
  isOpen: boolean;
  onClose: () => void;
  onSave: (nextProfile: UserProfile) => void;
}

function resizeImageFileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const size = 280;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(String(reader.result));
          return;
        }
        const minSide = Math.min(img.width, img.height);
        const sx = (img.width - minSide) / 2;
        const sy = (img.height - minSide) / 2;
        ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, size, size);
        resolve(canvas.toDataURL('image/jpeg', 0.9));
      };
      img.onerror = () => reject(new Error('Gagal membaca gambar'));
      img.src = String(reader.result);
    };
    reader.onerror = () => reject(new Error('Gagal memuat berkas gambar'));
    reader.readAsDataURL(file);
  });
}

export const ProfileModal: React.FC<ProfileModalProps> = ({
  profile,
  isOpen,
  onClose,
  onSave,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [name, setName] = useState(profile.name);
  const [handle, setHandle] = useState(profile.handle);
  const [bio, setBio] = useState(profile.bio);
  const [avatarDataUrl, setAvatarDataUrl] = useState(profile.avatarDataUrl);
  const [errorMsg, setErrorMsg] = useState('');

  if (!isOpen) return null;

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setErrorMsg('');
    try {
      const resized = await resizeImageFileToDataUrl(file);
      setAvatarDataUrl(resized);
    } catch {
      setErrorMsg('Format foto tidak dapat dibaca. Coba pilih JPG atau PNG.');
    }
    e.target.value = '';
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = name.trim() || 'Kreator Pribadi';
    const rawHandle = handle.trim() || 'kreator.lokal';
    const cleanHandle = rawHandle.startsWith('@') ? rawHandle : `@${rawHandle}`;
    onSave({
      name: cleanName,
      handle: cleanHandle,
      bio: bio.trim(),
      avatarDataUrl,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 backdrop-blur-sm sm:items-center sm:p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Edit profil dan foto profil"
        className="w-full max-w-md rounded-t-3xl border border-white/10 bg-[#141419] p-6 shadow-2xl sm:rounded-2xl"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-white">Profil &amp; Foto</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup editor profil"
            className="flex h-10 w-10 items-center justify-center rounded-full text-zinc-400 transition hover:bg-white/10 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-5">
          {/* Avatar Upload & Presets */}
          <div className="flex flex-col items-center gap-4">
            <div className="relative">
              <img
                src={avatarDataUrl}
                alt={name}
                referrerPolicy="no-referrer"
                className="h-24 w-24 rounded-full border-2 border-white/20 object-cover shadow-lg"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                aria-label="Ganti foto profil"
                className="absolute -bottom-1 -right-1 flex h-9 w-9 items-center justify-center rounded-full bg-[#FF2D55] text-white shadow-md transition hover:bg-[#e6244a]"
              >
                <Camera className="h-4 w-4" />
              </button>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              className="hidden"
            />

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 text-xs font-semibold text-white transition hover:bg-white/10"
            >
              <Upload className="h-3.5 w-3.5" />
              <span>Pilih Foto dari Perangkat</span>
            </button>

            <div className="flex items-center gap-2.5">
              {AVATAR_PRESETS.map((presetUrl, index) => (
                <button
                  key={index}
                  type="button"
                  onClick={() => setAvatarDataUrl(presetUrl)}
                  aria-label={`Pilih avatar bawaan ${index + 1}`}
                  className={`relative h-10 w-10 overflow-hidden rounded-full border-2 transition ${
                    avatarDataUrl === presetUrl
                      ? 'border-[#FF2D55] scale-105'
                      : 'border-transparent opacity-75 hover:opacity-100'
                  }`}
                >
                  <img
                    src={presetUrl}
                    alt={`Avatar ${index + 1}`}
                    className="h-full w-full object-cover"
                  />
                </button>
              ))}
            </div>

            {errorMsg && (
              <p className="text-xs font-medium text-rose-400">{errorMsg}</p>
            )}
          </div>

          <div className="space-y-3.5">
            <div>
              <label
                htmlFor="profile-name"
                className="mb-1.5 block text-xs font-medium text-zinc-400"
              >
                Nama Tampilan
              </label>
              <input
                id="profile-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={40}
                className="h-11 w-full rounded-xl border border-white/10 bg-zinc-900 px-3.5 text-sm text-white focus:border-white/30 focus:outline-none"
              />
            </div>

            <div>
              <label
                htmlFor="profile-handle"
                className="mb-1.5 block text-xs font-medium text-zinc-400"
              >
                Username (@handle)
              </label>
              <input
                id="profile-handle"
                type="text"
                value={handle}
                onChange={(e) => setHandle(e.target.value)}
                maxLength={32}
                className="h-11 w-full rounded-xl border border-white/10 bg-zinc-900 px-3.5 text-sm text-white focus:border-white/30 focus:outline-none"
              />
            </div>

            <div>
              <label
                htmlFor="profile-bio"
                className="mb-1.5 block text-xs font-medium text-zinc-400"
              >
                Bio Singkat
              </label>
              <textarea
                id="profile-bio"
                rows={2}
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                maxLength={140}
                className="w-full resize-none rounded-xl border border-white/10 bg-zinc-900 px-3.5 py-2.5 text-sm text-white focus:border-white/30 focus:outline-none"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="h-11 rounded-xl px-4 text-sm font-medium text-zinc-300 transition hover:bg-white/10"
            >
              Batal
            </button>
            <button
              type="submit"
              className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#FF2D55] px-5 text-sm font-semibold text-white transition hover:bg-[#e6244a]"
            >
              <Check className="h-4 w-4" />
              <span>Simpan Profil</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
