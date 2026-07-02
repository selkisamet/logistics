import { useEffect, useRef, useState } from 'react';
import type { WaybillExtraction } from '@lojistik/shared';
import { ApiError, uploadSingle } from '../lib/api';
import { Button } from './ui';

type Status = 'starting' | 'ready' | 'error';
type ZoomCaps = { min: number; max: number; step: number };

/**
 * İrsaliye No'yu uygulama İÇİNDE (sayfa yenilenmeden) kamerayla okur.
 * Native `capture` bazı telefonlarda kameradan dönünce sayfayı yeniden yüklüyordu; burada
 * getUserMedia ile sayfada kalırız. Net foto için ImageCapture.takePhoto() (varsa) + zoom.
 * Not: Kamera yalnızca https/localhost'ta açılır.
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
  const [zoomCaps, setZoomCaps] = useState<ZoomCaps | null>(null);
  const [zoom, setZoom] = useState(1);

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
      navigator.mediaDevices
        .getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 2560 },
            height: { ideal: 1440 },
          },
        })
        .then(async (stream) => {
          if (cancelled) {
            stream.getTracks().forEach((t) => t.stop());
            return;
          }
          streamRef.current = stream;
          const track = stream.getVideoTracks()[0] ?? null;
          trackRef.current = track;

          // Sürekli otomatik odak (destekleyen cihazlarda).
          try {
            await track?.applyConstraints({
              advanced: [{ focusMode: 'continuous' }],
            } as unknown as MediaTrackConstraints);
          } catch {
            /* yoksay */
          }
          // Zoom yeteneği varsa kaydırıcı için sınırları al.
          try {
            const caps = track?.getCapabilities?.() as unknown as {
              zoom?: { min: number; max: number; step?: number };
            };
            if (caps?.zoom && caps.zoom.max > caps.zoom.min) {
              setZoomCaps({ min: caps.zoom.min, max: caps.zoom.max, step: caps.zoom.step || 0.1 });
              setZoom(caps.zoom.min);
            }
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

  const applyZoom = (value: number) => {
    setZoom(value);
    try {
      void trackRef.current?.applyConstraints({
        advanced: [{ zoom: value }],
      } as unknown as MediaTrackConstraints);
    } catch {
      /* yoksay */
    }
  };

  /** Odaklı yüksek çözünürlüklü kare al: ImageCapture varsa takePhoto, yoksa video karesi. */
  const grabPhoto = async (): Promise<Blob | null> => {
    const track = trackRef.current;
    const AnyImageCapture = (window as unknown as { ImageCapture?: new (t: MediaStreamTrack) => { takePhoto: () => Promise<Blob> } }).ImageCapture;
    if (track && AnyImageCapture) {
      try {
        const ic = new AnyImageCapture(track);
        return await ic.takePhoto();
      } catch {
        /* takePhoto başarısızsa video karesine düş */
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
    return new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', 0.92));
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
        setHint('Numara okunamadı — zoom ile büyütüp net olunca tekrar çekin.');
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
        <video ref={videoRef} className="h-full w-full object-cover" autoPlay muted playsInline />

        {status === 'ready' && (
          <div className="pointer-events-none absolute inset-x-0 top-5 px-6 text-center text-sm text-white/90">
            İrsaliye No'yu zoom ile büyütüp net olunca çekin
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

      <div className="safe-bottom space-y-3 bg-white p-4">
        {hint && <p className="text-center text-sm text-amber-600">{hint}</p>}
        {zoomCaps && status === 'ready' && (
          <label className="flex items-center gap-3 text-sm text-slate-600">
            <span>Zoom</span>
            <input
              type="range"
              min={zoomCaps.min}
              max={zoomCaps.max}
              step={zoomCaps.step}
              value={zoom}
              onChange={(e) => applyZoom(Number(e.target.value))}
              className="flex-1 accent-brand"
            />
          </label>
        )}
        <Button
          className="w-full"
          loading={busy}
          disabled={status !== 'ready'}
          onClick={() => void capture()}
        >
          📷 Çek ve Oku
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
      return 'Uygun bir kamera bulunamadı.';
    case 'NotReadableError':
      return 'Kamera başka bir uygulama tarafından kullanılıyor. O uygulamayı kapatıp tekrar deneyin.';
    default:
      return 'Kamera açılamadı. İzin verin ya da tekrar deneyin.';
  }
}
