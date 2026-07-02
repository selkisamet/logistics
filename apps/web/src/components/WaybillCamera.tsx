import { useEffect, useRef, useState } from 'react';
import type { WaybillExtraction } from '@lojistik/shared';
import { ApiError, uploadSingle } from '../lib/api';
import { Button } from './ui';

type Status = 'starting' | 'ready' | 'error';

type PhotoCaps = { imageWidth?: { max?: number }; imageHeight?: { max?: number } };
type ImageCaptureLike = {
  takePhoto: (settings?: { imageWidth?: number; imageHeight?: number }) => Promise<Blob>;
  getPhotoCapabilities: () => Promise<PhotoCaps>;
};

const BASE_VIDEO = { width: { ideal: 1920 }, height: { ideal: 1080 } };
const isBackLabel = (l: string) => /back|rear|arka|environment/i.test(l);
const isAuxLabel = (l: string) => /wide|ultra|tele|depth|macro|mono|geniş|derinlik/i.test(l);

function hasAutofocus(track?: MediaStreamTrack): boolean {
  try {
    const caps = track?.getCapabilities?.() as unknown as { focusMode?: string[] };
    return !!caps?.focusMode?.some((m) => m === 'continuous' || m === 'single-shot' || m === 'auto');
  } catch {
    return false;
  }
}

/**
 * İzin al → cihazdaki kameraları tara → OTOMATİK ODAK destekleyen ARKA kamerayı seç ve aç.
 * Odaklamayan yardımcı (ultra-geniş/derinlik/makro) ve ön kameraları eler; böylece net + arka.
 */
async function openFocusableRearStream(): Promise<MediaStream> {
  const md = navigator.mediaDevices;

  // 1) İzin + başlangıç akışı.
  let stream: MediaStream;
  try {
    stream = await md.getUserMedia({ video: { ...BASE_VIDEO, facingMode: { ideal: 'environment' } } });
  } catch {
    stream = await md.getUserMedia({ video: true });
  }

  let cams: MediaDeviceInfo[] = [];
  try {
    cams = (await md.enumerateDevices()).filter((d) => d.kind === 'videoinput');
  } catch {
    return stream; // liste alınamadıysa mevcut akışla devam
  }
  const backs = cams.filter((c) => isBackLabel(c.label));
  if (backs.length === 0) return stream;

  const cur = stream.getVideoTracks()[0];
  const curId = cur?.getSettings().deviceId;
  const curIsBack = backs.some((b) => b.deviceId === curId);
  if (curIsBack && hasAutofocus(cur)) return stream; // mevcut akış zaten uygun

  // Önce ana (yardımcı olmayan) arka kameralar, sonra diğerleri.
  const ordered = [...backs.filter((b) => !isAuxLabel(b.label)), ...backs.filter((b) => isAuxLabel(b.label))];

  // 2) Odak destekleyen arka kamerayı bul.
  for (const cam of ordered) {
    if (!cam.deviceId || cam.deviceId === curId) continue;
    try {
      const candidate = await md.getUserMedia({ video: { ...BASE_VIDEO, deviceId: { exact: cam.deviceId } } });
      if (hasAutofocus(candidate.getVideoTracks()[0])) {
        stream.getTracks().forEach((t) => t.stop());
        return candidate;
      }
      candidate.getTracks().forEach((t) => t.stop());
    } catch {
      /* sıradaki */
    }
  }

  // 3) Hiçbiri odak bildirmiyorsa: ana arka kameraya geç (etiket bazlı).
  const mainBack = ordered[0];
  if (mainBack?.deviceId && mainBack.deviceId !== curId) {
    try {
      const s = await md.getUserMedia({ video: { ...BASE_VIDEO, deviceId: { exact: mainBack.deviceId } } });
      stream.getTracks().forEach((t) => t.stop());
      return s;
    } catch {
      /* mevcut akışla devam */
    }
  }
  return stream;
}

/**
 * İrsaliye No'yu uygulama İÇİNDE, odak-destekli ARKA kamerayla okur — sayfa HİÇ yenilenmez.
 * Çekim ImageCapture.takePhoto() ile tam çözünürlükte + odak tetiklenerek alınır; ekrana
 * dokunarak da odaklanır. Kamera yalnızca https/localhost'ta açılır.
 */
export function WaybillCamera({
  onResult,
  onClose,
}: {
  onResult: (res: WaybillExtraction) => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const trackRef = useRef<MediaStreamTrack | null>(null);
  const inFlightRef = useRef(false);
  const [status, setStatus] = useState<Status>('starting');
  const [errorMsg, setErrorMsg] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState('');

  useEffect(() => {
    let cancelled = false;
    setStatus('starting');
    setErrorMsg('');

    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus('error');
      setErrorMsg('Bu tarayıcı kamerayı desteklemiyor ya da bağlantı güvenli değil (https gerekir).');
      return;
    }

    const timer = setTimeout(() => {
      openFocusableRearStream()
        .then(async (stream) => {
          if (cancelled) {
            stream.getTracks().forEach((t) => t.stop());
            return;
          }
          streamRef.current = stream;
          trackRef.current = stream.getVideoTracks()[0] ?? null;
          try {
            await trackRef.current?.applyConstraints({
              advanced: [{ focusMode: 'continuous' }],
            } as unknown as MediaTrackConstraints);
          } catch {
            /* yoksay */
          }
          const video = videoRef.current;
          if (video) {
            video.srcObject = stream;
            video.muted = true;
            void video.play().catch(() => undefined);
          }
          setStatus('ready');
        })
        .catch((err: unknown) => {
          if (cancelled) return;
          setStatus('error');
          setErrorMsg(describeCameraError(err));
        });
    }, 150);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      trackRef.current = null;
    };
  }, [attempt]);

  const focusAt = (xRatio: number, yRatio: number) => {
    try {
      void trackRef.current?.applyConstraints({
        advanced: [{ focusMode: 'single-shot', pointsOfInterest: [{ x: xRatio, y: yRatio }] }],
      } as unknown as MediaTrackConstraints);
    } catch {
      /* yoksay */
    }
  };

  const grabPhoto = async (): Promise<Blob | null> => {
    const track = trackRef.current;
    try {
      await track?.applyConstraints({
        advanced: [{ focusMode: 'single-shot' }],
      } as unknown as MediaTrackConstraints);
      await new Promise((r) => setTimeout(r, 700)); // odak otursun
    } catch {
      /* yoksay */
    }

    const ImageCaptureCtor = (
      window as unknown as { ImageCapture?: new (t: MediaStreamTrack) => ImageCaptureLike }
    ).ImageCapture;
    if (track && ImageCaptureCtor) {
      try {
        const ic = new ImageCaptureCtor(track);
        let settings: { imageWidth?: number; imageHeight?: number } | undefined;
        try {
          const caps = await ic.getPhotoCapabilities();
          settings = { imageWidth: caps.imageWidth?.max, imageHeight: caps.imageHeight?.max };
        } catch {
          /* varsayılan */
        }
        return await ic.takePhoto(settings);
      } catch {
        /* video karesine düş */
      }
    }

    const video = videoRef.current;
    if (!video || !video.videoWidth) return null;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', 0.95));
  };

  const capture = async () => {
    if (inFlightRef.current || status !== 'ready') return;
    inFlightRef.current = true;
    setBusy(true);
    setHint('');
    try {
      const blob = await grabPhoto();
      if (!blob) {
        setHint('Kare alınamadı, tekrar deneyin.');
        return;
      }
      const file = new File([blob], 'irsaliye.jpg', { type: blob.type || 'image/jpeg' });
      const res = await uploadSingle<WaybillExtraction>('/ocr/waybill', file);
      if (res.waybillNo || res.orderNo) {
        onResult(res);
        onClose();
      } else {
        setHint('Numara okunamadı — İrsaliye No net görünecek şekilde tekrar çekin.');
      }
    } catch (err) {
      setHint(err instanceof ApiError ? err.message : 'Okunamadı, tekrar deneyin.');
    } finally {
      inFlightRef.current = false;
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-x-0 top-0 z-50 flex h-[100dvh] flex-col overflow-hidden bg-black">
      <div className="flex shrink-0 items-center justify-between p-4 text-white">
        <span className="font-semibold">İrsaliye Numarasını Oku</span>
        <button onClick={onClose} className="rounded-lg px-3 py-1.5 text-sm">
          Kapat ✕
        </button>
      </div>

      <div className="relative min-h-0 flex-1 bg-black">
        <video
          ref={videoRef}
          className="h-full w-full object-cover"
          autoPlay
          muted
          playsInline
          onLoadedMetadata={(e) => void e.currentTarget.play().catch(() => undefined)}
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            focusAt((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
          }}
        />

        {status === 'ready' && (
          <div className="pointer-events-none absolute inset-x-0 top-5 px-6 text-center text-sm text-white/90">
            Netlemek için ekrana dokun · sonra Resim Çek
          </div>
        )}

        {busy && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/50 text-white">
            <span className="h-8 w-8 animate-spin rounded-full border-4 border-white/30 border-t-white" />
            <p className="text-sm">Odaklanıp okunuyor…</p>
          </div>
        )}

        {status === 'starting' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center text-white">
            <span className="h-8 w-8 animate-spin rounded-full border-4 border-white/30 border-t-white" />
            <p className="text-sm">Arka kamera hazırlanıyor…</p>
            <p className="text-xs text-white/70">
              İzin penceresi çıkarsa <b>İzin Ver</b> deyin.
            </p>
          </div>
        )}

        {status === 'error' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center">
            <p className="text-4xl">📷✖</p>
            <p className="text-sm text-amber-300">{errorMsg}</p>
            <Button variant="secondary" onClick={() => setAttempt((a) => a + 1)}>
              Kamerayı tekrar dene
            </Button>
          </div>
        )}
      </div>

      <div className="safe-bottom shrink-0 space-y-2 bg-white p-4">
        {hint && <p className="text-center text-sm text-amber-600">{hint}</p>}
        <Button
          className="w-full"
          loading={busy}
          disabled={status !== 'ready'}
          onClick={() => void capture()}
        >
          📷 Resim Çek
        </Button>
      </div>
    </div>
  );
}

function describeCameraError(err: unknown): string {
  const name = err instanceof Error ? err.name : '';
  switch (name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'Kamera izni verilmedi. Tarayıcı ayarlarından bu site için kamerayı açıp tekrar deneyin.';
    case 'NotFoundError':
    case 'OverconstrainedError':
      return 'Arka kamera bulunamadı.';
    case 'NotReadableError':
      return 'Kamera başka bir uygulama tarafından kullanılıyor. O uygulamayı kapatıp tekrar deneyin.';
    default:
      return 'Kamera açılamadı. İzin verin ya da tekrar deneyin.';
  }
}
