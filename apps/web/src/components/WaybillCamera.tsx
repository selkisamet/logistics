import { useEffect, useRef, useState } from 'react';
import type { WaybillExtraction } from '@lojistik/shared';
import { ApiError, uploadSingle } from '../lib/api';
import { Button } from './ui';

type Status = 'starting' | 'ready' | 'error';

// ImageCapture tarayıcı API'si (TS lib'inde her sürümde yok) — gevşek tip.
type PhotoCaps = { imageWidth?: { max?: number }; imageHeight?: { max?: number } };
type ImageCaptureLike = {
  takePhoto: (settings?: { imageWidth?: number; imageHeight?: number }) => Promise<Blob>;
  getPhotoCapabilities: () => Promise<PhotoCaps>;
};

/**
 * İzin al, cihazları etiketleriyle tarayıp ARKA ANA kamerayı seç ve onu aç.
 * Çoklu kameralı telefonlarda 'exact environment' bazen yardımcı (derinlik/makro) kamerayı
 * seçip siyah ekran verir; deviceId ile ana arka kamerayı hedeflemek bunu önler.
 */
async function openRearStream(): Promise<MediaStream> {
  const md = navigator.mediaDevices;
  const baseVideo = { width: { ideal: 1920 }, height: { ideal: 1080 } };

  // 1) İzin + başlangıç akışı (arka tercihli).
  let stream: MediaStream;
  try {
    stream = await md.getUserMedia({ video: { ...baseVideo, facingMode: { ideal: 'environment' } } });
  } catch {
    stream = await md.getUserMedia({ video: true });
  }

  // 2) Etiketlere göre arka ANA kamerayı seçip yeniden aç (yardımcı/ön kamerayı ele).
  try {
    const cams = (await md.enumerateDevices()).filter((d) => d.kind === 'videoinput');
    if (cams.length > 1) {
      const backs = cams.filter((c) => /back|rear|arka|environment/i.test(c.label));
      const isAux = (l: string) => /wide|ultra|tele|depth|macro|mono|geniş|derinlik/i.test(l);
      const chosen = backs.find((c) => !isAux(c.label)) ?? backs[0];
      const currentId = stream.getVideoTracks()[0]?.getSettings().deviceId;
      if (chosen?.deviceId && chosen.deviceId !== currentId) {
        stream.getTracks().forEach((t) => t.stop());
        stream = await md.getUserMedia({ video: { ...baseVideo, deviceId: { exact: chosen.deviceId } } });
      }
    }
  } catch {
    /* enumerate/switch başarısızsa mevcut akışla devam */
  }

  return stream;
}

/**
 * İrsaliye No'yu uygulama İÇİNDE, ARKA kamerayla okur (sayfa yenilenmez, çevirme gerekmez).
 * Çekim ImageCapture.takePhoto() ile tam çözünürlükte alınır. Kamera yalnızca https/localhost'ta açılır.
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
      openRearStream()
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

  /** Odaklı, tam çözünürlüklü kare al: ImageCapture.takePhoto (varsa) yoksa video karesi. */
  const grabPhoto = async (): Promise<Blob | null> => {
    const track = trackRef.current;
    const ImageCaptureCtor = (
      window as unknown as { ImageCapture?: new (t: MediaStreamTrack) => ImageCaptureLike }
    ).ImageCapture;

    if (track && ImageCaptureCtor) {
      try {
        const ic = new ImageCaptureCtor(track);
        await new Promise((r) => setTimeout(r, 350)); // odak otursun
        let settings: { imageWidth?: number; imageHeight?: number } | undefined;
        try {
          const caps = await ic.getPhotoCapabilities();
          settings = { imageWidth: caps.imageWidth?.max, imageHeight: caps.imageHeight?.max };
        } catch {
          /* varsayılan çözünürlük */
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
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      <div className="flex items-center justify-between p-4 text-white">
        <span className="font-semibold">İrsaliye Numarasını Oku</span>
        <button onClick={onClose} className="rounded-lg px-3 py-1.5 text-sm">
          Kapat ✕
        </button>
      </div>

      <div className="relative flex-1 bg-black">
        <video
          ref={videoRef}
          className="h-full w-full object-cover"
          autoPlay
          muted
          playsInline
          onLoadedMetadata={(e) => void e.currentTarget.play().catch(() => undefined)}
        />

        {status === 'ready' && (
          <div className="pointer-events-none absolute inset-x-0 top-5 px-6 text-center text-sm text-white/90">
            İrsaliye No'yu ortala, net olunca çek
          </div>
        )}

        {busy && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/50 text-white">
            <span className="h-8 w-8 animate-spin rounded-full border-4 border-white/30 border-t-white" />
            <p className="text-sm">Okunuyor…</p>
          </div>
        )}

        {status === 'starting' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center text-white">
            <span className="h-8 w-8 animate-spin rounded-full border-4 border-white/30 border-t-white" />
            <p className="text-sm">Kamera başlatılıyor…</p>
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

      <div className="safe-bottom space-y-2 bg-white p-4">
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
