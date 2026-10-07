const MAX_DIMENSION = 1920;
const QUALITY = 0.82;
const SKIP_BELOW_BYTES = 1.5 * 1024 * 1024;

/** Formatos que cualquier navegador pinta; el resto (HEIC…) se pasa a JPEG. */
const WEB_FORMATS = ["image/jpeg", "image/png", "image/webp"];

/**
 * Prepara una foto para subirla.
 *
 * Las del celular suelen pasar del límite de 5 MB del servidor, y la app las
 * enseña a tamaño original: se reducen a 1920 px, que se ve nítido en
 * cualquier pantalla y pesa unos cientos de KB. Lo que no es imagen (un PDF)
 * pasa tal cual. Si algo falla, se envía el original y decide el backend.
 */
export const downscaleImage = async (file: File): Promise<File> => {
  if (!file.type.startsWith("image/")) return file;

  const webFormat = WEB_FORMATS.includes(file.type);
  if (webFormat && file.size <= SKIP_BELOW_BYTES) return file;

  try {
    const bitmap = await createImageBitmap(file);

    try {
      const scale = Math.min(
        1,
        MAX_DIMENSION / Math.max(bitmap.width, bitmap.height),
      );

      const canvas = document.createElement("canvas");
      canvas.width = Math.round(bitmap.width * scale);
      canvas.height = Math.round(bitmap.height * scale);
      canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", QUALITY),
      );

      // Vacío no es una foto: mejor el original que una imagen en blanco.
      if (!blob || blob.size === 0) return file;

      return new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", {
        type: "image/jpeg",
      });
    } finally {
      // Después de codificar, no antes: hay navegadores que dibujan en diferido
      // y necesitan el bitmap hasta que el canvas se convierte en archivo.
      bitmap.close();
    }
  } catch {
    return file;
  }
};
