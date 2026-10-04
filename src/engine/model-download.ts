// Fetching the Base Model's file for the browser. The file is tens of
// megabytes, so the download reports its progress chunk by chunk for the page
// to show.
// Free of anything DOM: it runs in a Web Worker, and under Node in tests. The
// network and the cache are handed in, so tests can supply their own.

/** How far a download has come. */
export interface DownloadProgress {
  receivedBytes: number;
  /** The size of the whole file, when known. */
  totalBytes: number | undefined;
}

/** The part of the browser's Cache API the download uses. */
export interface ModelCache {
  match(url: string): Promise<Response | undefined>;
  put(url: string, response: Response): Promise<void>;
}

export interface DownloadOptions {
  cache: ModelCache;
  fetch: (url: string) => Promise<Response>;
  onProgress?: (progress: DownloadProgress) => void;
}

/**
 * Returns the bytes of the file at the URL: from the cache when an earlier
 * visit stored it, otherwise from the network, storing it for the next visit.
 */
export async function downloadModel(url: string, options: DownloadOptions): Promise<Uint8Array<ArrayBuffer>> {
  const cached = await options.cache.match(url);
  if (cached !== undefined) {
    return new Uint8Array(await cached.arrayBuffer());
  }

  const bytes = await fetchWithProgress(url, options);
  // Stored only once every byte has arrived, so an interrupted download never
  // leaves a truncated file behind for the next visit to trust.
  await options.cache.put(url, new Response(bytes));
  return bytes;
}

async function fetchWithProgress(url: string, options: DownloadOptions): Promise<Uint8Array<ArrayBuffer>> {
  const response = await options.fetch(url);
  if (!response.ok) {
    throw new Error(`Could not download ${url}: ${response.status} ${response.statusText}`);
  }

  const totalBytes = Number(response.headers.get('Content-Length'));

  const chunks: Uint8Array[] = [];
  let receivedBytes = 0;
  const reader = response.body!.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    chunks.push(value);
    receivedBytes = receivedBytes + value.length;
    options.onProgress?.({ receivedBytes: receivedBytes, totalBytes: totalBytes });
  }

  return joinChunks(chunks, receivedBytes);
}

/** Copies the chunks, in order, into one array of the given length. */
function joinChunks(chunks: Uint8Array[], length: number): Uint8Array<ArrayBuffer> {
  const joined = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset = offset + chunk.length;
  }
  return joined;
}
