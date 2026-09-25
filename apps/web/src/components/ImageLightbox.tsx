import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export type LightboxImage = { url: string; alt?: string };

const MIN_SCALE = 1;
const MAX_SCALE = 8;
/** Çift tık/çift dokunuşun açtığı oran — irsaliye yazısını okumaya yetecek kadar. */
const DOUBLE_TAP_SCALE = 3;

/**
 * Tam ekran görüntü izleyici (lightbox).
 *
 * İrsaliye/tutanak fotoğrafları eskiden yeni sekmede açılıyordu; depoda
 * telefonla çalışırken bu uygulamadan çıkmak demekti.
 *
 * Matbu irsaliyelerin yazısı küçük olduğu için YAKINLAŞTIRMA şart: masaüstünde
 * fare tekerleği, dokunmatikte iki parmak, her ikisinde de sürükleyerek gezinme
 * ve çift tıkla aç/kapa.
 *
 * Birden çok görüntü verilirse aralarında gezilebilir — bir irsaliye çoğu zaman
 * birkaç sayfa oluyor.
 */
export function ImageLightbox({
  images,
  startIndex = 0,
  onClose,
}: {
  images: LightboxImage[];
  startIndex?: number;
  onClose: () => void;
}) {
  const [i, setI] = useState(startIndex);
  /** Ölçek ve kaydırma TEK durumda: üçü birlikte hesaplanıyor, ayrı tutulursa
   *  güncelleyicilerin içinden birbirini çağırmak gerekir (saf değil, StrictMode'da bozulur). */
  const [view, setView] = useState({ s: 1, x: 0, y: 0 });
  /** Olay dinleyicileri anlık değeri senkron okusun diye ayna. */
  const viewRef = useRef(view);
  viewRef.current = view;
  const { s: scale, x: tx, y: ty } = view;
  const stageRef = useRef<HTMLDivElement>(null);
  /** Sürükleme oldu mu — olduysa bırakınca pencereyi KAPATMA (yanlışlıkla kapanmasın). */
  const movedRef = useRef(false);
  const many = images.length > 1;

  const reset = useCallback(() => setView({ s: 1, x: 0, y: 0 }), []);

  const step = useCallback(
    (d: 1 | -1) => {
      setI((n) => (n + d + images.length) % images.length);
      reset(); // yeni görüntü her zaman sığdırılmış açılsın
    },
    [images.length, reset],
  );

  /**
   * İmlecin/parmakların altındaki noktayı sabit tutarak ölçeği değiştirir.
   * Aksi halde yakınlaştırma hep merkeze doğru olur ve okumak istediğiniz
   * köşe ekrandan kaçar.
   *
   * Ekran = merkez + t + s·p  →  p sabit kalsın istiyorsak  t' = c − (s'/s)·(c − t)
   */
  const zoomAt = useCallback((factor: number, cx: number, cy: number) => {
    setView((v) => {
      const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, v.s * factor));
      if (next === MIN_SCALE) return { s: 1, x: 0, y: 0 }; // sığdırınca ortala
      const k = next / v.s;
      return { s: next, x: cx - k * (cx - v.x), y: cy - k * (cy - v.y) };
    });
  }, []);

  /** Olay koordinatını sahnenin MERKEZİNE göre çevirir (transform merkezden hesaplanıyor). */
  const toCenter = (clientX: number, clientY: number) => {
    const r = stageRef.current?.getBoundingClientRect();
    if (!r) return { x: 0, y: 0 };
    return { x: clientX - r.left - r.width / 2, y: clientY - r.top - r.height / 2 };
  };

  // Klavye: Esc kapatır, oklar gezinir, +/− yakınlaştırır
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') return onClose();
      if (e.key === '+' || e.key === '=') return zoomAt(1.25, 0, 0);
      if (e.key === '-') return zoomAt(0.8, 0, 0);
      if (e.key === '0') return reset();
      if (!many) return;
      if (e.key === 'ArrowLeft') step(-1);
      if (e.key === 'ArrowRight') step(1);
    };
    document.addEventListener('keydown', onKey);
    // Arkadaki sayfa kaymasın (mobilde parmak hareketi fotoğrafı değil sayfayı kaydırıyordu)
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [many, onClose, step, zoomAt, reset]);

  /**
   * Tekerlek ve dokunma olayları NATIVE dinleyiciyle bağlanır: React'in sentetik
   * olayları passive kaydedildiği için `preventDefault` çalışmaz ve sayfa/tarayıcı
   * kendi zoom'unu yapar.
   */
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const { x, y } = toCenter(e.clientX, e.clientY);
      // Üstel: her adım oransal, yani 8x'te de 1x'te de aynı hızda gelir
      zoomAt(Math.exp(-e.deltaY * 0.0015), x, y);
    };

    let pinchDist = 0; // iki parmak arası son mesafe
    let lastX = 0;
    let lastY = 0;

    const dist = (t: TouchList) =>
      Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);

    const onTouchStart = (e: TouchEvent) => {
      movedRef.current = false;
      if (e.touches.length === 2) {
        pinchDist = dist(e.touches);
      } else if (e.touches.length === 1) {
        lastX = e.touches[0].clientX;
        lastY = e.touches[0].clientY;
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        e.preventDefault();
        movedRef.current = true;
        const d = dist(e.touches);
        if (pinchDist > 0) {
          const mid = toCenter(
            (e.touches[0].clientX + e.touches[1].clientX) / 2,
            (e.touches[0].clientY + e.touches[1].clientY) / 2,
          );
          zoomAt(d / pinchDist, mid.x, mid.y);
        }
        pinchDist = d;
      } else if (e.touches.length === 1) {
        // Tek parmak yalnızca YAKINLAŞTIRILMIŞKEN gezdirir; 1x'te dokunuş
        // kapatma için serbest kalsın
        if (viewRef.current.s > MIN_SCALE) {
          e.preventDefault();
          movedRef.current = true;
          const dx = e.touches[0].clientX - lastX;
          const dy = e.touches[0].clientY - lastY;
          setView((v) => ({ ...v, x: v.x + dx, y: v.y + dy }));
        }
        lastX = e.touches[0].clientX;
        lastY = e.touches[0].clientY;
      }
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) pinchDist = 0;
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('touchstart', onTouchStart, { passive: false });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd);
    return () => {
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
    };
  }, [zoomAt]);

  // Fareyle gezinme (yalnızca yakınlaştırılmışken)
  const onMouseDown = (e: React.MouseEvent) => {
    if (scale === MIN_SCALE) return;
    e.preventDefault();
    movedRef.current = false;
    let lx = e.clientX;
    let ly = e.clientY;
    const move = (ev: MouseEvent) => {
      movedRef.current = true;
      const dx = ev.clientX - lx;
      const dy = ev.clientY - ly;
      setView((v) => ({ ...v, x: v.x + dx, y: v.y + dy }));
      lx = ev.clientX;
      ly = ev.clientY;
    };
    const up = () => {
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
    };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  };

  const toggleZoom = (clientX: number, clientY: number) => {
    if (scale > MIN_SCALE) reset();
    else {
      const { x, y } = toCenter(clientX, clientY);
      zoomAt(DOUBLE_TAP_SCALE, x, y);
    }
  };

  const img = images[i];
  if (!img) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex flex-col bg-black/90" role="dialog" aria-modal="true">
      <div className="flex shrink-0 items-center justify-between gap-2 p-3 text-white">
        <span className="text-sm text-white/70">
          {many ? `${i + 1} / ${images.length}` : ''}
          {scale > MIN_SCALE ? `  ·  %${Math.round(scale * 100)}` : ''}
        </span>
        <div className="flex items-center gap-2">
          {scale > MIN_SCALE && (
            <button
              onClick={reset}
              className="rounded-full bg-white/10 px-3 py-2 text-sm ring-1 ring-white/30 transition active:scale-95"
            >
              Sığdır
            </button>
          )}
          <button
            onClick={onClose}
            aria-label="Kapat"
            className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-2xl leading-none ring-1 ring-white/30 transition active:scale-95"
          >
            ✕
          </button>
        </div>
      </div>

      {/* touch-none: tarayıcının kendi kaydırma/zoom jestleri devreye girmesin */}
      <div
        ref={stageRef}
        className="relative flex min-h-0 flex-1 touch-none items-center justify-center overflow-hidden px-3 pb-4"
        onClick={() => {
          // Sürüklemeden sonra bırakınca kapanmasın; yakınlaştırılmışken de kapatma
          if (!movedRef.current && scale === MIN_SCALE) onClose();
          movedRef.current = false;
        }}
        onDoubleClick={(e) => toggleZoom(e.clientX, e.clientY)}
        onMouseDown={onMouseDown}
      >
        <img
          src={img.url}
          alt={img.alt ?? ''}
          draggable={false}
          onClick={(e) => e.stopPropagation()}
          style={{
            transform: `translate(${tx}px, ${ty}px) scale(${scale})`,
            cursor: scale > MIN_SCALE ? 'grab' : 'zoom-in',
          }}
          className="max-h-full max-w-full select-none object-contain"
        />
        {many && scale === MIN_SCALE && (
          <>
            <NavButton side="left" onClick={() => step(-1)} />
            <NavButton side="right" onClick={() => step(1)} />
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}

/** Kenarda duran geniş dokunma hedefi — telefonda başparmakla ulaşılabilsin. */
function NavButton({ side, onClick }: { side: 'left' | 'right'; onClick: () => void }) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      aria-label={side === 'left' ? 'Önceki' : 'Sonraki'}
      className={`absolute top-1/2 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-2xl text-white ring-1 ring-white/30 transition active:scale-95 ${
        side === 'left' ? 'left-2' : 'right-2'
      }`}
    >
      {side === 'left' ? '‹' : '›'}
    </button>
  );
}
