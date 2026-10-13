import type { Inspection } from '../domain/models';
import { buildDemoInspection, DEMO_PHOTOS } from '../services/demo';
import { renderDemoImage } from '../services/demoImages';
import { makeThumbnail } from '../services/photos';
import type { StoreValue } from './store';

/** Build the fictional demo inspection, draw its synthetic photos, and save everything. */
export async function loadDemo(store: StoreValue): Promise<Inspection> {
  const insp = buildDemoInspection(store.settings);
  for (const [i, spec] of DEMO_PHOTOS.entries()) {
    const photo = insp.photos[i];
    const blob = await renderDemoImage(spec);
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.src = url;
    await img.decode();
    const thumb = await makeThumbnail(img);
    URL.revokeObjectURL(url);
    photo.sizeBytes = blob.size;
    await store.putBlob(photo.blobKey, blob);
    await store.putBlob(photo.thumbKey, thumb);
  }
  await store.addInspection(insp);
  return insp;
}
