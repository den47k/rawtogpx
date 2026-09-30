import { SHARE_CACHE, SHARED_FILE_KEY } from '../../sw/shareConfig.ts';

/**
 * If the page was opened by the share target (`?shared=...`), take the shared file out
 * of the cache (deleting it) and clean the URL. Returns null if there is nothing to load.
 */
export async function takeSharedFile(): Promise<File | { error: string } | null> {
  const url = new URL(window.location.href);
  const shared = url.searchParams.get('shared');
  if (shared === null) return null;
  url.searchParams.delete('shared');
  window.history.replaceState(null, '', url.href);

  if (shared !== '1') return { error: 'The shared item did not include a file.' };
  if (!('caches' in window)) return { error: 'This browser cannot receive shared files.' };
  try {
    const cache = await caches.open(SHARE_CACHE);
    const key = new URL(SHARED_FILE_KEY, new URL(import.meta.env.BASE_URL, window.location.origin))
      .href;
    const res = await cache.match(key);
    await cache.delete(key);
    if (!res) return { error: 'The shared file was not found. Please share it again.' };
    const name = decodeURIComponent(res.headers.get('X-File-Name') ?? 'shared.gpx');
    return new File([await res.blob()], name);
  } catch {
    return { error: 'Could not read the shared file.' };
  }
}
