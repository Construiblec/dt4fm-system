# Acta de congelamiento — GDGI RC1

**Fecha:** 2026-08-31
**Versión congelada:** `v0.1.0-rc1` sobre `main`, commit `4f01218`
**Responsable:** _(por completar)_

Cumple la **Fase 0 · §5.2** del procedimiento.

---

## Se declara

A partir de esta fecha, y hasta que concluya la certificación interna con el gate del D10, **no se incorporan funcionalidades nuevas** al GDGI.

Los únicos cambios admitidos son:

1. **Corrección de error** — de un defecto que impida certificar.
2. **Mejora indispensable** — cuando sin ella una prueba no se puede ejecutar.

Cualquier otra cosa va al [Backlog Post-Piloto](backlog-post-piloto.md), aunque sea barata de resolver.

Durante la quincena **solo se corrigen P1 y P2**. P3, P4 y RF se anotan y esperan.

---

## Estado de las ramas al congelar

Comprobado el 2026-08-31 sobre `origin`:

| Rama | Estado |
|---|---|
| `main` | **Congelada como RC1.** Contiene todo lo de `develop` |
| `develop` | Alineada con `main` |
| `Angel` | Fusionada |
| `feature/mnt-prv-informes` | Fusionada |
| `feature/mnt-prv-vista` | Fusionada |
| `feature/pwa-installer` | Fusionada |
| `feature/pwa-notificaciones` | Fusionada |
| `feature/steve` | Fusionada |
| `fix/mnt-prv-vista` | Fusionada |
| `feature/reserva-filtro` | **Abierta** — 1 commit sin fusionar |

Siete de las ocho ramas de trabajo ya estaban integradas. Las fusionadas pueden borrarse del remoto sin pérdida.

---

## Decisión pendiente: `feature/reserva-filtro`

Contiene un commit: *«feat: mejorar filtro de reservas de áreas comunales»*.

Es una **funcionalidad**, no una corrección, así que por aplicación estricta del §5.2 **no debería entrar** en la RC1. Queda registrada como BP-005 en el backlog.

Si el equipo decide lo contrario, debe fusionarse **antes** de empujar el tag; el tag es local y todavía no se ha publicado, así que moverlo no cuesta nada. Después del empuje, cambiarlo obliga a reescribir un tag ya distribuido.

| Opción | Consecuencia |
|---|---|
| **Dejarla fuera** *(recomendada)* | La RC1 es exactamente lo que ya estaba integrado y probado. La mejora entra en la v1.0 |
| Incluirla | Hay que fusionar, esperar a que el CI pase, y mover el tag antes de publicarlo |

---

## Qué queda sin cerrar del §5.1

Dos campos del inventario no son deducibles desde el repositorio y deben completarse antes del D3:

- **Versión de openMAINT** — se obtiene desde la propia instancia, como administrador.
- **Dispositivos IoT activos en el piloto** — listado con su `assetCode` y el activo de openMAINT correspondiente.

Sin ellos, terminada la certificación no se podrá afirmar con precisión contra qué se probó.

---

## Publicación del tag

El tag existe **en local y no se ha publicado**. Para hacerlo efectivo:

```bash
git push origin v0.1.0-rc1
```

Mientras no se publique, el congelamiento no es visible para el resto del equipo.
