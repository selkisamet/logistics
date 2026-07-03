import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CameraPreview } from '@capacitor-community/camera-preview';
import type { WaybillExtraction } from '@lojistik/shared';
import { ApiError, uploadSingle } from '../lib/api';

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
      {/* Üst: başlık + belirgin yuvarlak kapatma */}
      <div className="flex shrink-0 items-start justify-between bg-gradient-to-b from-black/70 to-transparent p-4 text-white">
        <span className="mt-1 font-semibold drop-shadow">İrsaliye Numarasını Oku</span>
        <button
          onClick={onClose}
          aria-label="Kapat"
          className="flex h-11 w-11 items-center justify-center rounded-full bg-black/55 text-2xl leading-none ring-1 ring-white/40 transition active:scale-95"
        >
          ✕
        </button>
      </div>

      {/* Orta: native önizleme arkada. Yönlendirme yazısı + çekimde ORTADA loader. */}
      <div className="relative min-h-0 flex-1">
        {ready && !busy && (
          <div className="pointer-events-none absolute inset-x-0 top-2 px-6 text-center text-sm text-white/90 drop-shadow">
            İrsaliye No'yu ortala, net olunca çek
          </div>
        )}
        {!ready && !hint && (
          <div className="absolute inset-0 flex items-center justify-center bg-black text-white">
            <span className="h-9 w-9 animate-spin rounded-full border-4 border-white/30 border-t-white" />
          </div>
        )}
        {busy && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="flex flex-col items-center gap-3 rounded-2xl bg-black/65 px-7 py-5 text-white">
              <span className="h-11 w-11 animate-spin rounded-full border-4 border-white/25 border-t-white" />
              <span className="text-sm">Okunuyor…</span>
            </div>
          </div>
        )}
      </div>

      {/* Alt: hata mesajı + yuvarlak (yazısız) deklanşör */}
      <div className="safe-bottom shrink-0 bg-gradient-to-t from-black/70 to-transparent px-4 pb-6 pt-10">
        {hint && <p className="mb-3 text-center text-sm text-amber-300 drop-shadow">{hint}</p>}
        <div className="flex items-center justify-center">
          <button
            onClick={() => void capture()}
            disabled={!ready || busy}
            aria-label="Resim çek"
            className="flex h-[72px] w-[72px] items-center justify-center rounded-full border-4 border-white/85 transition active:scale-95 disabled:opacity-40"
          >
            <span className="h-14 w-14 rounded-full bg-white" />
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
