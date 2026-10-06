# Nota de cambio — apertura remota por `trigger`

**Para el backend DT4FM · 30-09-2026.** Enmienda al contrato de la
[guía de la VPS](guia-servidor-vps-accesos.md) (§4, §5 y §12) y a
[D-18](decisiones-arquitectura-y-seguridad.md#d-18--apertura-remota-de-un-toque).
`POST /v1/devices/{deviceId}/open` y `/close` desaparecen. Queda **una sola orden física**,
`POST /v1/devices/{deviceId}/trigger`, que manda un pulso a la barrera vehicular. **Abrir** y
**Cerrar** pasan a ser una fase de la interfaz que lleva el backend.

Credenciales, inventario, `health`, `buildings` y `devices` no cambian.

---

## Qué cambia

| | Antes (guía §4) | Ahora |
|---|---|---|
| Ruta | `POST …/open` y `POST …/close` | `POST …/trigger`. Las otras dos dan `404`: no hay alias |
| Cuerpo | `requestId` + `actor` | **Solo** `requestId`. Cualquier otro campo da `400 invalid_request` |
| `requestId` | UUID | UUID canónico **en minúsculas**, con guiones, sin llaves |
| Respuesta correcta | `state`: `opened`, `closed` o `uncertain`, con `at` | `state`: `triggered` o `ambiguous`, **sin `at`** |
| Qué confirma el éxito | Que la puerta se abrió o se cerró | Que el pulso salió hacia la barrera. **Nada sobre su posición** |
| Puertas | Cualquiera; el Supervisor CAV incluía las peatonales | **Solo barreras vehiculares** |
| Control físico apagado | `remote_open_disabled` | `503 operations_disabled` |
| Quién deduplica | La VPS | El gateway, por `(deviceId, requestId)`, en disco y durante al menos 24 h |

**Por qué.** La barrera no tiene sensor de posición y el hardware admite una sola orden: un pulso
de relé. El gestor de Inglaterra ya mandaba **el mismo pulso** para abrir y para cerrar
(`cmd=open` en los dos casos); «Cerrar» era una etiqueta del navegador. Un `opened` o un `closed`
afirmaría algo que nadie mide. La guía pedía también que `close` sobre una barrera ya bajada no la
abriera. Sin sensor, el gateway no puede saberlo: esa garantía la tiene que dar ahora el backend,
con los tiempos de la [regla 3](#reglas-nuevas).

## La llamada

```http
POST /v1/devices/ING-VEHICULAR-1/trigger
Content-Type: application/json

{"requestId":"6f1c9a5e-3b2d-4c8e-9a71-0d4e2f5b8c13"}
```

```json
{"requestId":"6f1c9a5e-3b2d-4c8e-9a71-0d4e2f5b8c13","deviceId":"ING-VEHICULAR-1","state":"triggered"}
```

- **Solo el service token.** Un operador con sesión de Cloudflare recibe `403`.
- El `deviceId` sale de `GET /v1/devices`: el dispositivo del edificio con `kind: "barrier"` y
  `scope: "vehicular"`.
- **Un solo intento, 8 s de timeout**, como hasta ahora. La API central tarda como máximo 7 s: 2 s
  para encontrar el gateway dueño y 5 s para el pulso.
- `at` ya no llega. La hora del pulso la pone el backend al recibir la respuesta.
- Para cruzar con los logs de la VPS basta el `requestId`: la API central lo registra en cada orden.

## Cómo leer la respuesta

**Lista blanca, no negra.** Solo estas respuestas garantizan que no salió ningún pulso. Cualquier
otra es incierta.

| Respuesta | ¿Hubo pulso? | Qué hace el backend |
|---|---|---|
| `200` `triggered` | Sí | Avanza la fase (ver abajo) |
| `200` `ambiguous` | Pudo haberlo | Registra `uncertain`. Sin reintento |
| `400 invalid_request` | No | Error del cliente. Alerta |
| `400 device_not_compatible` | No | El `deviceId` no es una barrera vehicular habilitada. Alerta de configuración |
| `401`/`403 unauthorized`, o `302` de Cloudflare | No | Alerta. No reintenta |
| `404 not_found` | No | Ningún gateway tiene ese `deviceId`. Alerta |
| `500 device_ambiguous` | No | Dos edificios reclaman el mismo `deviceId`. Alerta |
| `502 gateway_rejected` | No | El gateway se negó antes de tocar el relé. Alerta |
| `503 operations_disabled` | No | Control físico apagado en ese edificio. Informa y no reintenta |
| `503 device_unreachable` | No | El gateway no alcanzó la barrera. «No se abrió» |
| `503 gateway_unreachable` | No | El gateway del edificio no respondió. «No se abrió» |
| **Cualquier otra**: `500 internal_error`, un 5xx sin código, un cuerpo ilegible, un `200` cuyo `requestId` o `deviceId` no coincide, un timeout o un corte | **Incierto** | Igual que `ambiguous` |

Esto sustituye la regla de §5 según la cual «un código tipado o un `4xx` se da por *no se abrió*».
`internal_error` lleva código y aun así es incierto: darlo por *no se abrió* invitaría a pulsar
otra vez sobre una barrera que pudo haberse movido.

## `requestId`: uno por clic

- **Cada clic intencional, sea Abrir o Cerrar, genera un UUID nuevo**, que se guarda en
  `remote_open_request` antes de llamar, como hoy.
- El backend sigue sin reintentar (D-18). Si alguna vez reenvía una orden por un fallo técnico,
  **reutiliza el mismo UUID**: el gateway devuelve el resultado guardado sin dar un segundo pulso.
  Si el primero no llegó a terminar, contesta `ambiguous` y tampoco pulsa.
- **Un UUID nuevo siempre es un pulso nuevo.** Reenviar con otro UUID equivale a pulsar dos veces.

## Reglas nuevas

1. **La fase es por barrera y se guarda en la base.** No es por huésped ni vive en el navegador:
   dos navegadores divergen y un reinicio de Render la pierde. Todos, huéspedes y Supervisor CAV,
   leen la misma. La fase solo conoce los pulsos que envió el backend: no ve una apertura por PIN,
   por mando ni desde la consola local. **Es una ayuda de interfaz, no el estado de la barrera.**

2. **Nadie más puede pulsar una barrera que otro acaba de abrir.** Con un pulso único, el
   «Abrir» de un segundo huésped es un «Cerrar» sobre el coche del primero.
   `POST /guest/vehicular-gate/open` sobre una barrera que no está en `ready` responde `409` y no
   llama a la VPS.

3. **Dos tiempos por edificio, medidos en sitio.** Tras un `triggered` en `ready`:

   | Desde el pulso | Quién puede pulsar | Por qué |
   |---|---|---|
   | Hasta la **ventana de cierre** | Quien la abrió o el Supervisor CAV («Cerrar») | Es el caso de uso de D-18 |
   | De ahí al **cierre automático** | Nadie | La barrera puede estar bajando o ya abajo; un pulso la volvería a abrir |
   | Después | Cualquiera con acceso («Abrir») | La barrera ya bajó sola |

   La ventana de cierre tiene que terminar **antes** de que la barrera baje sola, y el cierre
   automático tiene que ser **igual o mayor** que lo que tarda en bajar. Hoy hay dos cifras para
   Inglaterra que no coinciden: 90 s en el gestor heredado y 60 s en `VEHICULAR_AUTO_CLOSE_MS`. Hay
   que medirlo. **Un edificio sin tiempos medidos no ofrece el botón**, aunque su gateway tenga el
   control físico encendido. Hoy no hay ninguno medido: Inglaterra tiene dos cifras en conflicto,
   y Pradera y Republica no tienen ninguna.

4. **Enfriamiento de 10 s por barrera, para cualquier pulso.** Sustituye al enfriamiento «por
   orden» de D-18: ahora Abrir y Cerrar son la misma orden. El gestor de Inglaterra aplicaba ese
   mismo plazo, y no se sabe qué hace el controlador con un pulso a mitad de recorrido.

5. **`ambiguous` no mueve la fase ni autoriza otro pulso.** La barrera pasa a `uncertain`. El
   huésped ve lo mismo que hoy («si no se abrió, marca tu PIN»); en el panel, el Supervisor CAV
   ve el incidente y elige la fase a mano. Nunca se deduce la fase de un `ambiguous`. Queda
   pendiente [quién la libera para los huéspedes](#pendiente-de-acordar).

6. **El Supervisor CAV solo opera barreras vehiculares.** El panel deja de ofrecer apertura
   remota de puertas peatonales: la API central las rechaza con `400 device_not_compatible` y el
   gateway solo admite la barrera vehicular de cada edificio. Si hace falta, es un desarrollo
   nuevo de IoT, no una opción de configuración.

7. **`actor` se queda en el backend.** Ya no viaja, así que la consola local del gateway no sabrá
   quién pulsó. `remote_open_request` es el único registro de quién fue.

## En el portal

- `POST /guest/vehicular-gate/open` y `/close` pueden seguir existiendo: son acciones de la
  interfaz. **Las dos mandan `trigger`, cada una con su UUID.**
- `/close` responde `409` fuera de la ventana de cierre, o si la barrera la abrió otro huésped.
  «Ya bajó» pasa a significar «venció la ventana»: nadie sabe si bajó.
- `vehicularGateOpenUntil` es el fin de la ventana de cierre, no el del cierre automático.
- `canOpenVehicularGate` exige además que la barrera esté en `ready` y que el edificio tenga los
  tiempos medidos.
- **Ningún texto afirma posición.** «Orden enviada a la barrera», no «La barrera se abrió». Da
  igual si `outcome` conserva los valores `opened` y `closed`: lo que no puede hacer es decírselo
  así al huésped.

## Lo que no cambia

- Autenticación por service token de Cloudflare Access.
- Un intento, 8 s de timeout, ningún reintento automático.
- `ACCESS_REMOTE_OPEN_ENABLED` apagado por defecto; `remote_open_request` escrito **antes** de
  llamar; tope de 30 aperturas por estancia al día; el huésped, solo dentro de su ventana de acceso
  y con credencial `vehicular` o `both`.
- El control físico del gateway sigue **apagado por defecto** en cada edificio y responde
  `operations_disabled`.

## Migración

Nada en la VPS. En el backend:

- **`access-iot.client.ts`**: ruta, cuerpo, lectura de `triggered`/`ambiguous` y la tabla de
  [cómo leer la respuesta](#cómo-leer-la-respuesta).
- **`access-iot.mock.ts`**: implementar `trigger` con esta forma y deduplicación por
  `(deviceId, requestId)`, y quitar `open` y `close`. Si el mock sigue aceptando `actor` o
  contestando `opened`, las pruebas pasan contra algo que la VPS ya no hace.
- **`remote-open.rules.ts`**: fase por barrera, los dos tiempos por edificio y el enfriamiento por
  barrera.
- **`remote_open_request`**: las filas antiguas con `opened`, `closed` o `uncertain` son
  historial y se quedan como están.

`trigger` está implementado en la API central y **pendiente de despliegue**. Hasta entonces el
backend sigue contra el mock.

## Antes de dar el cambio por bueno

- [ ] El cliente llama a `trigger` con `{"requestId"}` y nada más
- [ ] El UUID sale en minúsculas; un clic, un UUID; un reenvío técnico, el mismo UUID
- [ ] Solo las respuestas de la lista blanca se registran como *no se abrió*. **Con una prueba
      que fije** que `internal_error`, un 5xx sin código y un timeout quedan como inciertos
- [ ] La fase vive en la base, por barrera: dos navegadores y dos instancias ven la misma
- [ ] Un huésped que pulsa una barrera abierta por otro recibe `409` y la VPS no recibe nada
- [ ] Entre la ventana de cierre y el cierre automático nadie puede pulsar
- [ ] Enfriamiento de 10 s por barrera, contado en la base, para cualquier pulso
- [ ] `ambiguous` deja la barrera en `uncertain`, sin segundo pulso automático
- [ ] Sin tiempos medidos, el edificio no muestra el botón
- [ ] El panel del Supervisor no ofrece apertura remota de puertas peatonales
- [ ] El mock implementa `trigger` y responde `404` a `open` y `close`
- [ ] Ningún texto del portal ni del panel dice que la barrera se abrió o se cerró
- [ ] **En sitio, con IoT**, en Inglaterra: se mide cuánto tarda la barrera en bajar sola, se
      comprueba que un pulso con la barrera arriba la baja y que no baja con un vehículo debajo

## Pendiente de acordar

**Quién saca la barrera de `uncertain` para los huéspedes.** La tabla de IoT pide que la resuelva
una persona. D-18 descartó bloquear la apertura remota tras un incierto porque un timeout de red
dejaría sin ella a todo el edificio. La propuesta es que `uncertain` vuelva a `ready` cuando pase
el cierre automático medido. Para entonces la barrera bajó sola, hubiera pulso o no. Así la fase
sale de un tiempo medido y no del `ambiguous`, y D-18 se mantiene. El Supervisor CAV puede
resolverla antes desde el panel. Requiere el visto bueno de IoT, porque se aparta de su tabla.

## Dónde está en la guía

Hay que actualizar: §4 (sustituir `open` y `close` por `trigger`), §5 (`remote_open_disabled`
pasa a `operations_disabled`, y la regla de abrir y cerrar pasa a la lista blanca de esta nota),
§12 (los cinco puntos de apertura y cierre), D-18 (puertas peatonales, enfriamiento, fase) y la
tabla de endpoints del README del portal.
