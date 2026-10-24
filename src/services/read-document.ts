import "core-js/actual/promise/with-resolvers";
import "core-js/actual/url/parse";
export type DocumentPage = {
  page: number;
  text: string;
  method: "pdf-text" | "ocr";
  confidence?: number;
};
export async function readDocument(
  file: File,
  onProgress: (s: string) => void,
): Promise<DocumentPage[]> {
  if (file.size <= 0 || file.size > 10 * 1024 * 1024)
    throw new Error("Document vide ou supérieur à 10 Mo.");
  if (file.type === "application/pdf") {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.mjs";
    const task = pdfjs.getDocument({
      data: new Uint8Array(await file.arrayBuffer()),
      enableXfa: false,
      useWasm: false,
      stopAtErrors: true,
    });
    try {
      const pdf = await task.promise;
      if (pdf.numPages > 50)
        throw new Error(
          "Ce PDF dépasse 50 pages. Séparez les pages utiles dans un fichier plus court.",
        );
      const pages: DocumentPage[] = [];
      let total = 0;
      for (let n = 1; n <= pdf.numPages; n++) {
        onProgress("Lecture de la page " + n + " / " + pdf.numPages);
        const page = await pdf.getPage(n),
          content = await page.getTextContent();
        const text = content.items
          .map((item) => ("str" in item ? item.str : ""))
          .join(" ")
          .trim();
        if (text.length > 20000 || total + text.length > 200000)
          throw new Error("Texte trop volumineux. Séparez les pages utiles.");
        total += text.length;
        pages.push({ page: n, text, method: "pdf-text" });
        page.cleanup();
      }
      return pages;
    } catch (e) {
      throw e instanceof Error
        ? e
        : new Error(
            "PDF illisible ou protégé. Utilisez une capture de la page.",
          );
    } finally {
      await task.destroy();
    }
  }
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
    throw new Error(
      "Choisissez un PDF, JPG, PNG ou WebP. Convertissez les HEIC en JPG.",
    );
  const bitmap = await createImageBitmap(file);
  if (bitmap.width * bitmap.height > 16000000) {
    bitmap.close();
    throw new Error(
      "Image limitée à 16 mégapixels pour la lecture sur mobile.",
    );
  }
  bitmap.close();
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("fra", 1, {
    workerPath: "/ocr/worker.min.js",
    corePath: "/ocr/core",
    langPath: "/ocr/lang",
    workerBlobURL: false,
    logger: (m) =>
      onProgress(
        m.status === "recognizing text"
          ? "Reconnaissance du texte : " + Math.round(m.progress * 100) + " %"
          : "Préparation de la lecture locale…",
      ),
  });
  try {
    const { data } = await worker.recognize(file);
    return [
      {
        page: 1,
        text: data.text.slice(0, 20000),
        method: "ocr",
        confidence: data.confidence,
      },
    ];
  } finally {
    await worker.terminate();
  }
}
