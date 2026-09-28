# Nota de cambio — formato del `employeeNo`

**Para Servidor Central IoT (VPS) · 28-09-2026.** Enmienda al contrato de la
[guía de la VPS](guia-servidor-vps-accesos.md). Cambia **un solo dato**: cómo se forma el
`employeeNo` que se escribe en los terminales. Endpoints, cuerpos y errores quedan igual.

---

## Qué cambia

| | Antes | Ahora |
|---|---|---|
| Huésped | `DT4-G-688b2fcb` | `DT4G688B2FCB` |
| Residente | `DT4-T-<8 hex>` | `DT4T<8 HEX>` |
| Personal | `DT4-E-<8 hex>` | `DT4E<8 HEX>` |
| Longitud | 14 | **12** |
| Caja del hash | minúsculas | **MAYÚSCULAS** |
| Qué es «propio» (`managed`) | empieza por `DT4-` | cumple **entero** `DT4[GTE][0-9A-F]{8}` |

**Por qué.** Los terminales Hikvision solo admiten letras y números en `employeeNo`; un `DT4-G-…` se
rechaza. El formato anterior nunca se pudo escribir en un aparato.

## Cómo se deriva

1. SHA-256 del `credentialId` tal como llega en la URL (texto UTF-8).
2. Los 8 primeros caracteres del hash en hexadecimal, **en mayúsculas**.
3. `DT4` + letra del `subjectType` (`guest` → `G`, `tenant` → `T`, `employee` → `E`) + esos 8.

```python
import hashlib
import re

PREFIX = {"guest": "G", "tenant": "T", "employee": "E"}
MANAGED = re.compile(r"DT4[GTE][0-9A-F]{8}")


def employee_no(credential_id: str, subject_type: str) -> str:
    digest = hashlib.sha256(credential_id.encode("utf-8")).hexdigest()[:8].upper()
    return f"DT4{PREFIX[subject_type]}{digest}"


def is_managed(employee_no: str) -> bool:
    return MANAGED.fullmatch(employee_no) is not None
```

Vectores de prueba (los mismos que genera el mock del backend):

| `credentialId` | `subjectType` | `employeeNo` |
|---|---|---|
| `3f9a2b11-7c4e-4d2a-9b61-5e8f0a1c2d34` | `guest` | `DT4G688B2FCB` |
| `0b8e4d52-2a19-4f6c-8d37-9e1c5a7b3f60` | `tenant` | `DT4T8141BA18` |
| `c47ca6f1-f675-4653-a3a6-31487feb054b` | `employee` | `DT4E8AFE861C` |

## Tres reglas nuevas

1. **`managed` exige el formato completo, no el prefijo.** Sin separador, `startswith("DT4")`
   marcaría como propio un `DT4FM01` cargado a mano, y la conciliación lo borraría. Usar
   `fullmatch`, no `match` con `$`: en Python `$` acepta un salto de línea final.

   | `employeeNo` | `managed` |
   |---|---|
   | `DT4G688B2FCB` | `true` |
   | `77`, `DT4FM01`, `DT4-G-688b2fcb` | `false` |
   | `dt4g688b2fcb` | `false` — se reporta y no se toca, que es el fallo seguro |

2. **Devolver el `employeeNo` idéntico** en el `PUT`, en `GET /v1/credentials/{id}` y en
   `GET /v1/devices/{id}/inventory`. El backend concilia por igualdad exacta: si el valor vuelve con
   otra caja, da la credencial por ausente y la reescribe cada noche.
3. **La consola local rechaza altas que empiecen por `DT4`.** Ese espacio es del sistema.

## Lo que no cambia

- Endpoints, cuerpos de petición y respuesta, códigos de error.
- `credentialId` (uuid del backend) y `subjectType`.
- `deviceId` y `eventId` pueden seguir llevando guiones (`ING-PEATONAL-1`): son identificadores de
  la VPS y nunca se escriben en el terminal.
- Nunca reutilizar un `employeeNo`; nunca borrar un usuario que no sea propio; derivar en vez de
  autonumerar.

## Migración

**Ninguna.** Ningún terminal tiene usuarios `DT4-…`, porque el aparato no los admite, y la VPS aún no
existe. Si hay prototipos con el formato anterior, basta con cambiar la derivación. En el backend el
mock ya genera el formato nuevo y las pruebas lo fijan.

## Antes de dar el cambio por bueno

- [ ] `employee_no()` reproduce los tres vectores de la tabla
- [ ] **En un terminal real**: el alta con `DT4G688B2FCB` se acepta, y `UserInfo/Search` la devuelve
      idéntica, en mayúsculas
- [ ] `is_managed()` da los resultados de la tabla de la regla 1, con una prueba que los fije
- [ ] Ningún camino de borrado usa `startswith("DT4")`
- [ ] La consola local rechaza un `employeeNo` que empiece por `DT4`

## Dónde está en la guía

Actualizados el 28-09-2026: [§2](guia-servidor-vps-accesos.md#el-employeeno-que-se-escribe-en-el-terminal)
(formato y reglas), §4 (ejemplos del `PUT` y del inventario), §9 (tabla de conciliación), §10
(consola local), §11 (ejemplo de evento) y §12 (checklist).
