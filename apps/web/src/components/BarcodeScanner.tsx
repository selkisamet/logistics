import { useEffect, useRef, useState } from 'react';
import { BrowserMultiFormatReader, type IScannerControls } from '@zxing/browser';
import { Button, Input } from './ui';

type Status = 'starting' | 'ready' | 'error';

/**
 * Telefon/bilgisayar kamerasıyla QR/barkod okuyan tam ekran modal.
 * Kamera kullanılamıyorsa (izin yok / güvenli olmayan bağlantı) manuel giriş sunar.
 * Not: Tarayıcı kamerası yalnızca https veya localhost'ta açılır.
 */
export function BarcodeScanner({
  onScan,
  onClose,
}: {
  onScan: (code: string) => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState<Status>('starting');
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [attempt, setAttempt] = useState(0);
  const [manual, setManual] = useState('');

  // onScan her render'da değişebilir; ref ile sabitleyip effekti yeniden çalıştırmayız.
  const onScanRef = useRef(onScan);
  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  useEffect(() => {
    let cancelled = false;
    let controls: IScannerControls | null = null;
    const reader = new BrowserMultiFormatReader();
    setStatus('starting');
    setErrorMsg('');

    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus('error');
      setErrorMsg(
        'Bu tarayıcı kamerayı desteklemiyor ya da bağlantı güvenli değil (https gerekir). Kodu elle girin.',
      );
      return;
    }

    // Kısa gecikme: StrictMode'un anlık çift mount'unda kamera iki kez açılmasın
    // (ilk effekt iptal edilince timer temizlenir, kamera hiç açılmamış olur).
    const timer = setTimeout(() => {
      reader
        .decodeFromConstraints(
          {
            video: {
              facingMode: { ideal: 'environment' },
              width: { ideal: 1920 },
              height: { ideal: 1080 },
            },
          },
          videoRef.current!,
          (result) => {
            if (result && !cancelled) onScanRef.current(result.getText());
          },
        )
        .then((c) => {
          if (cancelled) {
            c.stop();
            return;
          }
          controls = c;
          const video = videoRef.current;
          if (video) {
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
      controls?.stop();
    };
  }, [attempt]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      <div className="flex items-center justify-between p-4 text-white">
        <span className="font-semibold">QR / Barkod Okut</span>
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
        />
        {status === 'ready' && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="h-48 w-48 rounded-xl border-4 border-white/70" />
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
        <p className="text-xs text-slate-500">Okutamıyorsanız kodu elle yazın:</p>
        <div className="flex gap-2">
          <Input
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            placeholder="SKU veya barkod"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && manual.trim()) onScan(manual.trim());
            }}
          />
          <Button onClick={() => manual.trim() && onScan(manual.trim())}>Ekle</Button>
        </div>
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
      return 'Uygun bir kamera bulunamadı. Kodu elle girebilirsiniz.';
    case 'NotReadableError':
      return 'Kamera başka bir uygulama tarafından kullanılıyor. O uygulamayı kapatıp tekrar deneyin.';
    default:
      return 'Kamera açılamadı. İzin verin ya da kodu elle girin.';
  }
}
