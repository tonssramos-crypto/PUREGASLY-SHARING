import { useEffect, useState } from 'react';
import { mediaUrl } from '../api/axios';

// Thumbnail strip with a click-to-enlarge lightbox (Esc / arrows work).
export default function PhotoGallery({ photos = [] }) {
  const [open, setOpen] = useState(null); // index or null

  useEffect(() => {
    if (open === null) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(null);
      if (e.key === 'ArrowRight') setOpen((i) => (i + 1) % photos.length);
      if (e.key === 'ArrowLeft') setOpen((i) => (i - 1 + photos.length) % photos.length);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, photos.length]);

  if (!photos.length) return null;

  return (
    <>
      <div className="photo-strip">
        {photos.map((id, i) => (
          <button key={id} type="button" className="photo-thumb" onClick={() => setOpen(i)} aria-label={`Open photo ${i + 1}`}>
            <img src={mediaUrl(id)} alt="" loading="lazy" />
          </button>
        ))}
      </div>

      {open !== null && (
        <div className="lightbox" onClick={() => setOpen(null)} role="dialog" aria-modal="true">
          <img src={mediaUrl(photos[open])} alt="" onClick={(e) => e.stopPropagation()} />
          <button type="button" className="lightbox-close" onClick={() => setOpen(null)} aria-label="Close">✕</button>
          {photos.length > 1 && (
            <>
              <button
                type="button"
                className="lightbox-nav prev"
                onClick={(e) => { e.stopPropagation(); setOpen((open - 1 + photos.length) % photos.length); }}
                aria-label="Previous photo"
              >‹</button>
              <button
                type="button"
                className="lightbox-nav next"
                onClick={(e) => { e.stopPropagation(); setOpen((open + 1) % photos.length); }}
                aria-label="Next photo"
              >›</button>
            </>
          )}
        </div>
      )}
    </>
  );
}
