import type { ListingRecord } from "../domain/listing-import";
import type { CapturePage } from "../domain/capture-analysis";
export async function packTranscripts(
  pages: CapturePage[],
): Promise<NonNullable<ListingRecord["transcripts"]>> {
  const raw = new TextEncoder().encode(JSON.stringify(pages));
  if (raw.length > 1000000)
    throw new Error(
      "Textes trop volumineux : téléchargez le texte brut et réduisez le nombre de pages avant sauvegarde.",
    );
  const stream = new Response(raw).body!.pipeThrough(
    new CompressionStream("gzip"),
  );
  const data = new Uint8Array(await new Response(stream).arrayBuffer());
  if (data.length > 30000)
    throw new Error(
      "Textes trop volumineux pour un dossier : téléchargez le texte brut et réduisez le lot avant sauvegarde.",
    );
  return {
    encoding: "gzip-base64",
    data: btoa(String.fromCharCode(...data)),
    pages: pages.length,
  };
}
export async function unpackTranscripts(
  archive: NonNullable<ListingRecord["transcripts"]>,
): Promise<CapturePage[]> {
  const bytes = Uint8Array.from(atob(archive.data), (c) => c.charCodeAt(0));
  const stream = new Response(bytes).body!.pipeThrough(
    new DecompressionStream("gzip"),
  );
  const reader = stream.getReader();
  let size = 0,
    text = "";
  const decoder = new TextDecoder();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 1000000) {
        await reader.cancel();
        throw new Error("Archive trop volumineuse.");
      }
      text += decoder.decode(value, { stream: true });
    }
  } finally {
    reader.releaseLock();
  }
  text += decoder.decode();
  const pages = JSON.parse(text);
  if (
    !Array.isArray(pages) ||
    pages.length > 200 ||
    pages.some(
      (p) =>
        typeof p.text !== "string" ||
        typeof p.source !== "string" ||
        !Number.isInteger(p.page) ||
        !["ocr", "pdf", "text"].includes(p.method),
    )
  )
    throw new Error("Archive de lecture invalide.");
  return pages;
}
