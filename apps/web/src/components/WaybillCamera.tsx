import { useEffect, useRef, useState } from 'react';
import type { WaybillExtraction } from '@lojistik/shared';
import { ApiError, uploadSingle } from '../lib/api';
import { Button } from './ui';

type Status = 'starting' | 'ready' | 'error';

/**
 * İrsaliye numarasını CANLI kamerayla okuyan tam ekran modal.
 * Numarayı çerçeveye alıp "Oku"ya basınca o kare OCR'a (POST /ocr/waybill) gönderilir;
 * numara bulunursa onResult ile döner ve kapanır. Dosya/foto yükleme diyaloğu YOK.
 * Not: Tarayıcı kamerası yalnızca https veya localhost'ta açılır.
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

    // Kısa gecikme: StrictMode çift-mount'unda kamera iki kez açılmasın.
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
          // Sürekli otomatik odak — destekleyen cihazlarda belgeyi netler.
          try {
            await stream
              .getVideoTracks()[0]
              ?.applyConstraints({
                advanced: [{ focusMode: 'continuous' }],
              } as unknown as MediaTrackConstraints);
          } catch {
            /* desteklenmiyorsa yoksay */
          }
          if (cancelled) {
            stream.getTracks().forEach((t) => t.stop());
            return;
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
    };
  }, [attempt]);

  // Operatör İrsaliye No bölgesini net çerçeveleyip "Çek ve Oku"ya basar → o kare OCR'a gider.
  const capture = async () => {
    const video = videoRef.current;
    if (!video || inFlightRef.current || status !== 'ready') return;
    const w = video.videoWidth;
    const h = video.videoHeight;
    if (!w || !h) return;

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, w, h);
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', 0.9));
    if (!blob) return;

    const file = new File([blob], 'irsaliye.jpg', { type: 'image/jpeg' });
    inFlightRef.current = true;
    setBusy(true);
    setHint('');
    try {
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
        <video ref={videoRef} className="h-full w-full object-cover" autoPlay muted playsInline />

        {status === 'ready' && (
          <>
            <div className="pointer-events-none absolute inset-x-0 top-5 px-6 text-center text-sm text-white/90">
              Sadece "İrsaliye No" kısmını çerçeveye alın · net görününce çekin
            </div>
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="h-24 w-11/12 max-w-md rounded-lg border-4 border-white/70" />
            </div>
          </>
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
