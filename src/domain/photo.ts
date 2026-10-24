export type PropertyPhoto = {
  url: string;
  name: string;
  providedAt: string;
  file?: File;
  persisted?: boolean;
};
export function validatePhoto(file: File) {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
    throw new Error(
      "Choisissez une photo JPG, PNG ou WebP. Si votre photo est en HEIC, exportez-la en JPG.",
    );
  if (file.size > 10 * 1024 * 1024)
    throw new Error(
      "Cette photo dépasse 10 Mo. Choisissez une version plus légère.",
    );
  if (!file.size) throw new Error("Cette photo est vide.");
}
export async function readPhoto(file: File): Promise<PropertyPhoto> {
  validatePhoto(file);
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    if (img.naturalWidth * img.naturalHeight > 40_000_000)
      throw new Error(
        "Cette photo est trop grande. Réduisez sa résolution avant de l’ajouter.",
      );
    return { url, name: file.name, providedAt: new Date().toISOString(), file };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error instanceof Error && error.message.includes("résolution")
      ? error
      : new Error("La photo ne peut pas être lue. Essayez un autre fichier.");
  }
}
