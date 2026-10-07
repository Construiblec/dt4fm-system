import { describe, expect, it, vi } from "vitest";
import {
  describeImageError,
  prepareImage,
  readIntoMemory,
  RETRY_DELAYS_MS,
  UnreadableImageError,
} from "@/shared/utils/prepareImage";

/**
 * Un archivo como los del selector del móvil: las primeras `failures` lecturas
 * fallan con `NotReadableError`, como cuando el sistema lo retoca después de
 * elegirlo.
 */
const mobileFile = (
  failures: number,
  { content = "bytes de la foto", name = "foto.jpg", type = "image/jpeg" } = {},
) => {
  const file = new File([content], name, { type, lastModified: 1_700_000_000_000 });
  const read = file.arrayBuffer.bind(file);
  const arrayBuffer = vi.fn(() =>
    arrayBuffer.mock.calls.length <= failures
      ? Promise.reject(new DOMException("El archivo cambió", "NotReadableError"))
      : read(),
  );
  Object.defineProperty(file, "arrayBuffer", { value: arrayBuffer });
  return { file, arrayBuffer };
};

/** Esperas instantáneas, apuntando cuánto se habría esperado. */
const fakeWait = () => {
  const waits: number[] = [];
  return {
    waits,
    wait: (ms: number) => {
      waits.push(ms);
      return Promise.resolve();
    },
  };
};

const text = async (file: File) => new TextDecoder().decode(await file.arrayBuffer());

describe("readIntoMemory", () => {
  it("lee a la primera y devuelve una copia en memoria con el mismo nombre y tipo", async () => {
    const { file, arrayBuffer } = mobileFile(0);
    const { waits, wait } = fakeWait();

    const copy = await readIntoMemory(file, wait);

    expect(copy).not.toBe(file);
    expect(copy.name).toBe("foto.jpg");
    expect(copy.type).toBe("image/jpeg");
    expect(copy.lastModified).toBe(file.lastModified);
    expect(await text(copy)).toBe("bytes de la foto");
    expect(arrayBuffer).toHaveBeenCalledTimes(1);
    expect(waits).toEqual([]);
  });

  it("si la primera lectura falla, reintenta y devuelve la copia", async () => {
    const { file, arrayBuffer } = mobileFile(1);
    const { waits, wait } = fakeWait();

    const copy = await readIntoMemory(file, wait);

    expect(await text(copy)).toBe("bytes de la foto");
    expect(arrayBuffer).toHaveBeenCalledTimes(2);
    expect(waits).toEqual([RETRY_DELAYS_MS[0]]);
  });

  it("si falla siempre, avisa con el nombre de la foto y el código del navegador", async () => {
    const { file, arrayBuffer } = mobileFile(99);
    const { waits, wait } = fakeWait();

    const error = await readIntoMemory(file, wait).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(UnreadableImageError);
    expect(error).toMatchObject({ fileName: "foto.jpg", code: "NotReadableError" });
    expect((error as Error).message).toContain("«foto.jpg»");
    expect((error as Error).message).toContain("(NotReadableError)");
    expect(arrayBuffer).toHaveBeenCalledTimes(RETRY_DELAYS_MS.length + 1);
    expect(waits).toEqual(RETRY_DELAYS_MS);
  });

  it("una lectura vacía cuenta como fallo", async () => {
    const { file } = mobileFile(0, { content: "" });
    const { wait } = fakeWait();

    await expect(readIntoMemory(file, wait)).rejects.toMatchObject({
      code: "EmptyRead",
    });
  });

  it("si el móvil da el tipo vacío, lo deduce de la extensión", async () => {
    const { file } = mobileFile(0, { name: "IMG_0001.HEIC", type: "" });
    const { wait } = fakeWait();

    const copy = await readIntoMemory(file, wait);

    expect(copy.type).toBe("image/heic");
  });

  // Es lo que arregla el fallo: la miniatura y el envío leen la copia, que ya
  // no depende de que el sistema deje leer el archivo original.
  it("la copia se sigue leyendo aunque el original deje de poder leerse", async () => {
    const { file, arrayBuffer } = mobileFile(0);
    const { wait } = fakeWait();

    const copy = await readIntoMemory(file, wait);
    arrayBuffer.mockImplementation(() =>
      Promise.reject(new DOMException("El archivo cambió", "NotReadableError")),
    );

    await expect(file.arrayBuffer()).rejects.toThrow();
    expect(await text(copy)).toBe("bytes de la foto");
  });
});

describe("prepareImage", () => {
  it("devuelve la copia en memoria (una foto pequeña no se reduce)", async () => {
    const { file } = mobileFile(0);

    const prepared = await prepareImage(file);

    expect(prepared).not.toBe(file);
    expect(await text(prepared)).toBe("bytes de la foto");
  });
});

describe("describeImageError", () => {
  it("para una foto ilegible da el mensaje con el código", () => {
    expect(describeImageError(new UnreadableImageError("a.jpg", "NotReadableError"))).toBe(
      "No se pudo leer la foto «a.jpg». Vuelve a tomarla o elige otra. (NotReadableError)",
    );
  });

  it("para cualquier otro fallo, un mensaje genérico", () => {
    expect(describeImageError(new Error("x"))).toBe(
      "No se pudo preparar la foto. Inténtalo de nuevo.",
    );
  });
});
