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

/** Downloads the file at the URL and returns its bytes. */
export async function downloadModel(url: string, options: DownloadOptions): Promise<Uint8Array> {
  const response = await options.fetch(url);
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
function joinChunks(chunks: Uint8Array[], length: number): Uint8Array {
  const joined = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset = offset + chunk.length;
  }
  return joined;
}
