import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supervisionKey } from "@/modules/supervisor/hooks/useSupervision";
import {
  createFinding,
  deleteFinding,
  deleteFindingPhoto,
  deleteFixPhoto,
  describeSupervisionError,
  updateFinding,
  uploadFindingPhoto,
  uploadFixPhoto,
} from "@/modules/supervisor/services/supervisionService";
import type {
  LocalPhoto,
  SupervisionDetail,
  SupervisionFinding,
} from "@/modules/supervisor/types/Supervision";
import {
  addFinding,
  patchFinding,
  removeFinding,
  removePhoto,
  replaceFinding,
  restoreFinding,
} from "@/modules/supervisor/utils/findingCache";
import { preparePhotos } from "@/modules/supervisor/utils/findingPhotoUpload";

export type NewFinding = {
  index: number;
  point: SupervisionFinding["point"];
  subcategory: NonNullable<SupervisionFinding["subcategory"]>;
  observation: string;
  resolvedBySupervisor: boolean;
  /** Ya preparadas (en memoria, reducidas y validadas). */
  files: File[];
};

type Result = { ok: true } | { ok: false; error: string };

/**
 * Qué fotos maneja el hook: las que toma el supervisor al registrar la novedad
 * o las del arreglo que sube el operario. Cambia el campo del detalle y las
 * llamadas; el resto (vista previa local, reintento, borrado optimista) es igual.
 */
const PHOTO_KINDS = {
  finding: {
    field: "photos",
    upload: uploadFindingPhoto,
    remove: deleteFindingPhoto,
  },
  fix: { field: "fixPhotos", upload: uploadFixPhoto, remove: deleteFixPhoto },
} as const;

export type PhotoKind = keyof typeof PHOTO_KINDS;

/** Acciones en vuelo por supervisión: la recarga espera a la última. */
const inFlight = new Map<number, number>();

let localSeq = 0;
const nextLocalId = () => `local-${Date.now()}-${(localSeq += 1)}`;

/**
 * Crear, editar y borrar novedades y fotos sin esperar con la pantalla quieta.
 *
 * Mismo patrón que la asignación del coordinador (`useSaveCoordTasks`): el
 * cambio se pinta en la caché antes de que responda openMAINT, se deshace solo
 * si falla, y el detalle se recarga en segundo plano cuando no queda ninguna
 * acción en vuelo (si se recargara antes, traería la lista sin el cambio de
 * otra acción y la tarjeta saltaría atrás).
 *
 * Las fotos que todavía no confirmó openMAINT viven aparte (`localPhotos`):
 * así una recarga no se lleva una foto fallida antes de reintentarla.
 *
 * `kind: "fix"` es la vista del operario: solo usa las acciones de fotos.
 */
export const useFindingActions = (
  supervisionId: number,
  onError: (message: string) => void,
  kind: PhotoKind = "finding",
) => {
  const queryClient = useQueryClient();
  const key = supervisionKey(supervisionId);
  const photoKind = PHOTO_KINDS[kind];
  const [localPhotos, setLocalPhotos] = useState<Record<number, LocalPhoto[]>>(
    {},
  );
  const [busy, setBusy] = useState(0);
  const urls = useRef(new Set<string>());

  // Al salir de la pantalla se liberan las miniaturas locales.
  useEffect(() => {
    const created = urls.current;
    return () => {
      created.forEach((url) => URL.revokeObjectURL(url));
      created.clear();
    };
  }, []);

  const update = useCallback(
    (fn: (detail: SupervisionDetail) => SupervisionDetail) =>
      queryClient.setQueryData<SupervisionDetail>(key, (old) =>
        old ? fn(old) : old,
      ),
    // `key` es un array nuevo en cada render; su contenido depende solo del id.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [queryClient, supervisionId],
  );

  const begin = useCallback(async () => {
    inFlight.set(supervisionId, (inFlight.get(supervisionId) ?? 0) + 1);
    setBusy((n) => n + 1);
    // Una recarga en vuelo traería el detalle de antes y desharía el cambio.
    await queryClient.cancelQueries({ queryKey: supervisionKey(supervisionId) });
  }, [queryClient, supervisionId]);

  const end = useCallback(() => {
    const left = (inFlight.get(supervisionId) ?? 1) - 1;
    inFlight.set(supervisionId, left);
    setBusy((n) => Math.max(0, n - 1));
    if (left === 0) {
      void queryClient.invalidateQueries({
        queryKey: supervisionKey(supervisionId),
      });
    }
  }, [queryClient, supervisionId]);

  const toLocal = (file: File): LocalPhoto => {
    const previewUrl = URL.createObjectURL(file);
    urls.current.add(previewUrl);
    return { localId: nextLocalId(), previewUrl, file, status: "uploading" };
  };

  const dropLocal = (findingId: number, localId: string) =>
    setLocalPhotos((all) => {
      const list = all[findingId] ?? [];
      const target = list.find((p) => p.localId === localId);
      if (target) {
        URL.revokeObjectURL(target.previewUrl);
        urls.current.delete(target.previewUrl);
      }
      return { ...all, [findingId]: list.filter((p) => p.localId !== localId) };
    });

  const setLocalStatus = (
    findingId: number,
    localId: string,
    status: LocalPhoto["status"],
  ) =>
    setLocalPhotos((all) => ({
      ...all,
      [findingId]: (all[findingId] ?? []).map((p) =>
        p.localId === localId ? { ...p, status } : p,
      ),
    }));

  /** Sube una foto local; si openMAINT la confirma, pasa a ser una foto más. */
  const uploadLocal = async (findingId: number, photo: LocalPhoto) => {
    try {
      const { data } = await photoKind.upload(
        supervisionId,
        findingId,
        photo.file,
      );
      update((detail) => ({
        ...detail,
        findings: detail.findings.map((f) =>
          f.id === findingId
            ? { ...f, [photoKind.field]: [...f[photoKind.field], data] }
            : f,
        ),
      }));
      dropLocal(findingId, photo.localId);
    } catch (error) {
      setLocalStatus(findingId, photo.localId, "failed");
      onError(describeSupervisionError(error, "Una foto no se subió."));
    }
  };

  /** Novedad nueva: aparece al instante y sus fotos suben después. */
  const create = async (input: NewFinding): Promise<Result> => {
    await begin();
    const tempId = -Date.now();
    const pendingPhotos = input.files.map(toLocal);
    update((detail) =>
      addFinding(detail, {
        id: tempId,
        index: input.index,
        point: input.point,
        subcategory: input.subcategory,
        observation: input.observation || null,
        resolvedBySupervisor: input.resolvedBySupervisor,
        photos: [],
        fixPhotos: [],
        syncing: "creating",
      }),
    );
    setLocalPhotos((all) => ({ ...all, [tempId]: pendingPhotos }));

    let realId: number;
    try {
      const { data } = await createFinding(supervisionId, {
        index: input.index,
        subcategoryId: input.subcategory.id,
        observation: input.observation,
        resolvedBySupervisor: input.resolvedBySupervisor,
      });
      realId = data.id;
    } catch (error) {
      update((detail) => removeFinding(detail, tempId).detail);
      pendingPhotos.forEach((p) => dropLocal(tempId, p.localId));
      end();
      return {
        ok: false,
        error: describeSupervisionError(error, "No se guardó la novedad."),
      };
    }

    update((detail) => {
      const temp = detail.findings.find((f) => f.id === tempId);
      return temp
        ? replaceFinding(detail, tempId, { ...temp, id: realId, syncing: undefined })
        : detail;
    });
    setLocalPhotos((all) => {
      const { [tempId]: moved = [], ...rest } = all;
      return { ...rest, [realId]: moved };
    });

    // De una en una: el backend valida el tope de 2 en cada subida.
    for (const photo of pendingPhotos) await uploadLocal(realId, photo);
    end();
    return { ok: true };
  };

  /** Edita o marca «resuelto»: se ve al instante y vuelve atrás si falla. */
  const save = async (
    finding: SupervisionFinding,
    changes: {
      subcategory?: NonNullable<SupervisionFinding["subcategory"]>;
      observation?: string;
      resolvedBySupervisor?: boolean;
    },
  ): Promise<Result> => {
    await begin();
    // Solo se revierte lo que cambia: una foto subida mientras tanto se queda.
    const before = {
      subcategory: finding.subcategory,
      observation: finding.observation,
      resolvedBySupervisor: finding.resolvedBySupervisor,
      syncing: undefined,
    };
    update((detail) =>
      patchFinding(detail, finding.id, {
        ...(changes.subcategory ? { subcategory: changes.subcategory } : {}),
        ...(changes.observation !== undefined
          ? { observation: changes.observation || null }
          : {}),
        ...(changes.resolvedBySupervisor !== undefined
          ? { resolvedBySupervisor: changes.resolvedBySupervisor }
          : {}),
        syncing: "saving",
      }),
    );
    try {
      await updateFinding(supervisionId, finding.id, {
        ...(changes.subcategory ? { subcategoryId: changes.subcategory.id } : {}),
        ...(changes.observation !== undefined
          ? { observation: changes.observation }
          : {}),
        ...(changes.resolvedBySupervisor !== undefined
          ? { resolvedBySupervisor: changes.resolvedBySupervisor }
          : {}),
      });
      update((detail) => patchFinding(detail, finding.id, { syncing: undefined }));
      return { ok: true };
    } catch (error) {
      update((detail) => patchFinding(detail, finding.id, before));
      const message = describeSupervisionError(
        error,
        "No se guardaron los cambios de la novedad.",
      );
      onError(message);
      return { ok: false, error: message };
    } finally {
      end();
    }
  };

  /** Borra al instante; si openMAINT falla, la novedad vuelve a su sitio. */
  const remove = async (finding: SupervisionFinding): Promise<Result> => {
    await begin();
    let snapshot: { removed: SupervisionFinding | null; position: number } = {
      removed: null,
      position: -1,
    };
    update((detail) => {
      const result = removeFinding(detail, finding.id);
      snapshot = result;
      return result.detail;
    });
    try {
      await deleteFinding(supervisionId, finding.id);
      return { ok: true };
    } catch (error) {
      const { removed, position } = snapshot;
      if (removed) update((detail) => restoreFinding(detail, removed, position));
      const message = describeSupervisionError(
        error,
        "No se pudo borrar la novedad.",
      );
      onError(message);
      return { ok: false, error: message };
    } finally {
      end();
    }
  };

  /** Fotos para una novedad ya guardada. */
  const addPhotos = async (finding: SupervisionFinding, files: File[]) => {
    let prepared: File[];
    try {
      prepared = await preparePhotos(files);
    } catch (error) {
      onError(describeSupervisionError(error, "No se pudo leer la foto."));
      return;
    }
    await begin();
    const pending = prepared.map(toLocal);
    setLocalPhotos((all) => ({
      ...all,
      [finding.id]: [...(all[finding.id] ?? []), ...pending],
    }));
    for (const photo of pending) await uploadLocal(finding.id, photo);
    end();
  };

  const retryPhoto = async (findingId: number, photo: LocalPhoto) => {
    await begin();
    setLocalStatus(findingId, photo.localId, "uploading");
    await uploadLocal(findingId, photo);
    end();
  };

  const discardPhoto = (findingId: number, photo: LocalPhoto) =>
    dropLocal(findingId, photo.localId);

  /** Borra una foto ya subida; si falla, vuelve. */
  const deletePhoto = async (finding: SupervisionFinding, photoId: string) => {
    await begin();
    const { field } = photoKind;
    const photo = finding[field].find((p) => p.id === photoId);
    update((detail) => removePhoto(detail, finding.id, photoId, field));
    try {
      await photoKind.remove(supervisionId, finding.id, photoId);
    } catch (error) {
      if (photo) {
        update((detail) => ({
          ...detail,
          findings: detail.findings.map((f) =>
            f.id === finding.id && !f[field].some((p) => p.id === photoId)
              ? { ...f, [field]: [...f[field], photo] }
              : f,
          ),
        }));
      }
      onError(describeSupervisionError(error, "No se pudo borrar la foto."));
    } finally {
      end();
    }
  };

  return {
    /** Hay acciones sin terminar: no conviene salir de la pantalla. */
    busy: busy > 0,
    localPhotos,
    create,
    save,
    remove,
    addPhotos,
    retryPhoto,
    discardPhoto,
    deletePhoto,
  };
};
