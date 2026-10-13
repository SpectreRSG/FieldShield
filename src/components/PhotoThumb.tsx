import type { Photo } from '../domain/models';
import { useBlobUrl } from '../state/store';

export function PhotoThumb({ photo, full }: { photo: Photo; full?: boolean }) {
  const url = useBlobUrl(full ? photo.blobKey : photo.thumbKey);
  return url ? (
    <img src={url} alt={photo.caption || photo.fileName} loading="lazy" className={full ? 'viewer-img' : undefined} />
  ) : (
    <div style={{ aspectRatio: '4 / 3', background: '#cfd7e2' }} aria-label="Loading photo" />
  );
}
