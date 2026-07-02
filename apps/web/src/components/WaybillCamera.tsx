import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CameraPreview } from '@capacitor-community/camera-preview';
import type { WaybillExtraction } from '@lojistik/shared';
import { ApiError, uploadSingle } from '../lib/api';
import { Button } from './ui';

/**
 * Native (Capacitor) kamera: CameraX tabanlı camera-preview eklentisiyle ARKA kamerayı
 * açar (gerçek otomatik odak → net). Tam ekran native önizleme WebView'ın ARKASINDA
 * render edilir; bu yüzden kamera açıkken arka planı şeffaf yaparız. Çekilen foto OCR'a
 * (/ocr/waybill) gider, numara input'a yazılır. Sayfa YENİLENMEZ.
 */
export function WaybillCamera({
  onResult,
  onClose,
}: {
  onResult: (res: WaybillExtraction) => void;
  onClose: () => void;
}) {
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState('');
  const startedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    document.documentElement.classList.add('wb-camera-active');

    (async () => {
      try {
        await CameraPreview.start({
          position: 'rear',
          toBack: true,
          disableAudio: true,
          x: 0,
          y: 0,
          width: window.innerWidth,
          height: window.innerHeight,
        });
        if (cancelled) {
          await CameraPreview.stop().catch(() => undefined);
          return;
        }
        startedRef.current = true;
        setReady(true);
      } catch (err) {
        if (!cancelled) setHint(err instanceof Error ? err.message : 'Kamera açılamadı.');
      }
    })();

    return () => {
      cancelled = true;
      document.documentElement.classList.remove('wb-camera-active');
      if (startedRef.current) void CameraPreview.stop().catch(() => undefined);
      startedRef.current = false;
    };
  }, []);

  const capture = async () => {
    if (busy || !ready) return;
    setBusy(true);
    setHint('');
    try {
      const shot = await CameraPreview.capture({ quality: 90 });
      const blob = await (await fetch(`data:image/jpeg;base64,${shot.value}`)).blob();
      const file = new File([blob], 'irsaliye.jpg', { type: 'image/jpeg' });
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
      setBusy(false);
    }
  };

  // Not: modal body'ye portal edilir; #root gizlenince orta alan gerçekten şeffaf olur
  // ve arkadaki native önizleme görünür. Üst/alt barlar yarı saydam.
  return createPortal(
    <div className="fixed inset-x-0 top-0 z-50 flex h-[100dvh] flex-col">
      <div className="flex shrink-0 items-center justify-between bg-black/60 p-4 text-white">
        <span className="font-semibold">İrsaliye Numarasını Oku</span>
        <button onClick={onClose} className="rounded-lg px-3 py-1.5 text-sm">
          Kapat ✕
        </button>
      </div>

      <div className="relative min-h-0 flex-1">
        {ready && (
          <div className="pointer-events-none absolute inset-x-0 top-4 px-6 text-center text-sm text-white/90 drop-shadow">
            İrsaliye No'yu ortala, net olunca çek
          </div>
        )}
        {!ready && !hint && (
          <div className="absolute inset-0 flex items-center justify-center bg-black text-white">
            <span className="h-8 w-8 animate-spin rounded-full border-4 border-white/30 border-t-white" />
          </div>
        )}
      </div>

      <div className="safe-bottom shrink-0 space-y-2 bg-black/60 p-4">
        {hint && <p className="text-center text-sm text-amber-300">{hint}</p>}
        <Button className="w-full" loading={busy} disabled={!ready} onClick={() => void capture()}>
          📷 Resim Çek
        </Button>
      </div>
    </div>,
    document.body,
  );
}
