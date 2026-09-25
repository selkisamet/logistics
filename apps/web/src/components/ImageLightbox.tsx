import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

export type LightboxImage = { url: string; alt?: string };

/**
 * Tam ekran görüntü izleyici (lightbox).
 *
 * İrsaliye/tutanak fotoğrafları eskiden yeni sekmede açılıyordu; depoda
 * telefonla çalışırken bu uygulamadan çıkmak demekti. Artık sayfanın üstünde
 * açılıp kapanıyor.
 *
 * Birden çok görüntü verilirse aralarında gezilebilir — bir irsaliye çoğu zaman
 * birkaç sayfa oluyor ve tek tek geri dönmek zahmetliydi.
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
  const many = images.length > 1;

  // Klavye: Esc kapatır, oklar gezinir (masaüstünde fareye uzanmaya gerek kalmasın)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (!many) return;
      if (e.key === 'ArrowLeft') setI((n) => (n - 1 + images.length) % images.length);
      if (e.key === 'ArrowRight') setI((n) => (n + 1) % images.length);
    };
    document.addEventListener('keydown', onKey);
    // Arkadaki sayfa kaymasın (mobilde parmakla kaydırınca fotoğraf değil sayfa gidiyordu)
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [images.length, many, onClose]);

  const img = images[i];
  if (!img) return null;

  const step = (d: 1 | -1) => setI((n) => (n + d + images.length) % images.length);

  return createPortal(
    // Arka plana tıklayınca kapanır; görüntünün kendisi tıklamayı yutar
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black/90"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div className="flex shrink-0 items-center justify-between p-3 text-white">
        <span className="text-sm text-white/70">{many ? `${i + 1} / ${images.length}` : ''}</span>
        <button
          onClick={onClose}
          aria-label="Kapat"
          className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-2xl leading-none ring-1 ring-white/30 transition active:scale-95"
        >
          ✕
        </button>
      </div>

      <div className="relative flex min-h-0 flex-1 items-center justify-center px-3 pb-4">
        <img
          src={img.url}
          alt={img.alt ?? ''}
          onClick={(e) => e.stopPropagation()}
          className="max-h-full max-w-full object-contain"
        />
        {many && (
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
