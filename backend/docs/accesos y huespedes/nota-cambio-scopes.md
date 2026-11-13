# Nota de cambio — scopes de acceso independientes

**Backend DT4FM · 13-11-2026.** Adapta el backend al contrato de la API central `f995d21`
(`openapi.yaml` y `docs/backend-integration-notes.md` del repositorio `construiblec-iot-api`).
Enmienda la [guía de la VPS §4](guia-servidor-vps-accesos.md), que daba al `PUT` un significado
que la VPS no cumple.

## Qué cambió en el contrato

| | Guía original | API central real |
|---|---|---|
| `PUT` | Declara el ámbito completo: reducir lo retira de las demás puertas | **Solo añade** en el scope pedido; nunca retira |
| `DELETE` | Sin body | Body cerrado `{siteId, employeeNo, scopes}` |
| `employeeNo` | Derivado por la VPS | El backend lo conserva del `PUT` y lo reenvía exacto |
| Reintentos | Backend | Igual: ni la API central ni el gateway repiten mutaciones |

`both` sigue siendo válido en el `PUT` (todos los scopes que tiene el edificio). El `siteId` solo lo
publica `/v1/health`.

## Cómo lo resuelve el backend

- `access_credential.scope` es lo **deseado**; `confirmed_scopes` lo **confirmado** por la VPS.
  También `employee_no`, `rewrite_pending`, `sync_error` y `last_synced_at`.
- `sync()` ejecuta solo diferencias: un `PUT` de lo que falta y un `DELETE` exacto de lo que sobra.
  Cambio de fechas, PIN nuevo o restauración marcan `rewrite_pending` y reescriben todos los scopes.
- Peatonal ↔ Vehicular: primero el `PUT` nuevo; el `DELETE` del viejo solo cuando el nuevo está
  confirmado. Nadie se queda sin acceso a mitad del cambio.
- `pin_conflict` al ampliar o cambiar de scope: **se aborta**, sin rotar el PIN. El scope vuelve a lo
  confirmado, `sync_error = pin_conflict` y la pantalla del CAV recibe un `409`. En un alta o una
  restauración sí se rota, como antes.
- Un `partial` confirma solo los scopes con todos sus aparatos en `written`/`deleted`.
- `partial` y `unreachable` quedan `pending` y los reenvía `sync-retry`; `failed`, igual hasta agotar
  `ACCESS_SYNC_MAX_ATTEMPTS`.
- Un candado por credencial (`pg_advisory_lock`) serializa endpoint, webhooks y cron.
- La conciliación nocturna marca para retirar un PIN que siga en un aparato cuyo scope ya no le
  corresponde. Así se limpian las reducciones hechas con el contrato anterior, que nunca llegaron.
- La pantalla del CAV recibe `accessScopes` (estado final) y devuelve `desiredScopes`,
  `confirmedScopes`, `syncStatus` (`confirmed`/`pending`/`failed`) y `syncError`.

## Bandera `ACCESS_SCOPED_SITES`

| Valor | Efecto |
|---|---|
| vacía | Contrato anterior para todos los sitios (comportamiento previo) |
| `inglaterra` | Inglaterra usa el contrato por scopes; **los demás sitios no reciben ninguna mutación**: sus cambios esperan en `pending` (`sync_error = site_frozen`) y los barridos los saltan |
| `inglaterra,pradera` | Ambos; lo acumulado de Pradera sale en el siguiente barrido |

Las lecturas (`/v1/health`, `/v1/devices`, inventario) siguen llegando a todos los sitios.

## Corte coordinado

1. Desplegar el backend con `ACCESS_SCOPED_SITES` vacía y ejecutar la migración
   `AddCredentialScopeSync1789900000000`.
2. Pausar cambios de acceso en el CAV y poner `ACCESS_SCHEDULER_ENABLED=false`.
3. IoT activa `f995d21…` en la API central y verifica liveness.
4. `ACCESS_SCOPED_SITES=inglaterra`.
5. Rearmar las revocaciones atascadas de Inglaterra (el `DELETE` sin body se rechaza desde `b867eb7`):

   ```sql
   UPDATE access_credential
   SET sync_state = 'pending', sync_attempts = 0
   WHERE building_id = <Building._id de Inglaterra>
     AND status IN ('revoked', 'expired')
     AND sync_state = 'failed';
   ```

6. Ejecutar las pruebas de aceptación del README de IoT con una credencial sintética.
7. `ACCESS_SCHEDULER_ENABLED=true` y reabrir los cambios de acceso. La conciliación de esa noche
   retira los scopes sobrantes de las reducciones anteriores.

**Rollback:** vaciar `ACCESS_SCOPED_SITES` y pedir a IoT que revierta la release. Revertir lo lógico
no deshace lo que ya se escribió o borró en las puertas.

## Pradera

Congelada durante el piloto: cero mutaciones. Las reservas nuevas de Pradera no tendrán PIN en la
puerta hasta añadirla a `ACCESS_SCOPED_SITES`, y tampoco se les escribe en Hostaway: el aviso del
PIN espera a que la credencial esté sincronizada.
