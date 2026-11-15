export interface VideoCodecProbe {
  container: string;
  codec: string;
  isHevc: boolean;
  headerHex: string;
}

const KNOWN_CODECS: Array<{ tag: string; label: string; isHevc?: boolean }> = [
  { tag: 'avc1', label: 'H.264 / AVC (avc1)' },
  { tag: 'avc3', label: 'H.264 / AVC (avc3)' },
  { tag: 'hvc1', label: 'H.265 / HEVC (hvc1)', isHevc: true },
  { tag: 'hev1', label: 'H.265 / HEVC (hev1)', isHevc: true },
  { tag: 'vp09', label: 'VP9 (vp09)' },
  { tag: 'vp08', label: 'VP8 (vp08)' },
  { tag: 'av01', label: 'AV1 (av01)' },
  { tag: 'mp4v', label: 'MPEG-4 Visual (mp4v)' },
];

function bytesToAscii(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    const c = bytes[i];
    out += c >= 32 && c <= 126 ? String.fromCharCode(c) : '.';
  }
  return out;
}

function bytesToHex(bytes: Uint8Array, limit = 8): string {
  const len = Math.min(bytes.length, limit);
  const parts: string[] = [];
  for (let i = 0; i < len; i++) {
    parts.push(bytes[i].toString(16).padStart(2, '0'));
  }
  return parts.join(' ');
}

export async function probeVideoCodec(blob: Blob): Promise<VideoCodecProbe> {
  try {
    const headLen = Math.min(blob.size, 65536);
    const tailOffset = Math.max(headLen, blob.size - 131072);
    const headBuf = new Uint8Array(await blob.slice(0, headLen).arrayBuffer());
    const tailBuf =
      tailOffset < blob.size
        ? new Uint8Array(await blob.slice(tailOffset, blob.size).arrayBuffer())
        : new Uint8Array(0);

    const headerHex = bytesToHex(headBuf, 8);
    const headAscii = bytesToAscii(headBuf);
    const tailAscii = bytesToAscii(tailBuf);
    const combined = `${headAscii} ${tailAscii}`;

    let container = 'Tidak dikenal';
    if (
      headBuf.length >= 4 &&
      headBuf[0] === 0x1a &&
      headBuf[1] === 0x45 &&
      headBuf[2] === 0xdf &&
      headBuf[3] === 0xa3
    ) {
      container = 'WebM / MKV';
    } else if (headAscii.includes('ftyp')) {
      const idx = headAscii.indexOf('ftyp');
      const brand = headAscii.slice(idx + 4, idx + 8).trim();
      container = brand === 'qt' ? 'QuickTime MOV' : `MP4 (${brand || 'isom'})`;
    } else if (headAscii.startsWith('RIFF')) {
      container = 'AVI / RIFF';
    }

    for (const item of KNOWN_CODECS) {
      if (combined.includes(item.tag)) {
        return {
          container,
          codec: item.label,
          isHevc: Boolean(item.isHevc),
          headerHex,
        };
      }
    }

    return {
      container,
      codec: container.startsWith('WebM') ? 'VP8/VP9/AV1' : 'Codec tidak terdeteksi',
      isHevc: false,
      headerHex,
    };
  } catch {
    return {
      container: 'MP4',
      codec: 'Tidak dapat membaca header',
      isHevc: false,
      headerHex: '',
    };
  }
}
