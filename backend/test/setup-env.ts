/**
 * Variables de entorno para toda la corrida E2E. Se ejecuta ANTES de que
 * cualquier módulo de la app se importe (vía `setupFiles` en jest-e2e.json),
 * así que esto es lo primero que ve `ConfigService`.
 *
 * DATABASE_URL / DATABASE_URL_DIRECT NO se tocan aquí: los pone quien lance
 * la corrida (docker-compose local, o el `services: postgres` del CI).
 *
 * Todo lo demás apaga por completo las salidas de red reales — como
 * defensa en profundidad, además de los mocks explícitos de cada suite — y
 * corta los dos disparadores que podrían ejecutar trabajo real sin que
 * ningún test lo pida: el scheduler de push (el único que arranca en
 * `true` en .env.example) y el guard del webhook IoT.
 */

// openMAINT: no hace falta que resuelva a nada real — todo pasa por mocks —
// pero ConfigService.get la debe encontrar definida para que el arranque no
// tropiece con un `undefined` en sitios que hacen `?? ''`.
process.env.OPENMAINT_URL ??=
  'http://openmaint.invalid/cmdbuild/services/rest/v3';
process.env.OPENMAINT_USERNAME ??= 'mock-admin';
process.env.OPENMAINT_PASSWORD ??= 'mock-password';
process.env.ENABLE_DOCS = 'false';

// Todos los schedulers apagados. PUSH_SCHEDULER_ENABLED en particular viene
// en "true" en .env.example — si se hereda tal cual, un run E2E lento en
// horario laboral de Guayaquil podría disparar el cron de limpieza atrasada.
process.env.HOSTAWAY_SCHEDULER_ENABLED = 'false';
process.env.MEETING_REMINDER_SCHEDULER_ENABLED = 'false';
process.env.PAYMENTS_SCHEDULER_ENABLED = 'false';
process.env.BILLING_SCHEDULER_ENABLED = 'false';
process.env.PUSH_SCHEDULER_ENABLED = 'false';

// Hostaway en modo mock — HostawayService también se sustituye por un mock
// directo en cada suite, pero esto evita que onModuleInit u otro código que
// no pase por el service intente una llamada OAuth real.
process.env.HOSTAWAY_USE_MOCK = 'true';
process.env.HOSTAWAY_CLIENT_ID ??= 'mock-client-id';
process.env.HOSTAWAY_CLIENT_SECRET ??= 'mock-client-secret';

// web-push: vacías apaga PushSenderService por su cuenta
// (`push-sender.service.ts` deja `configured=false` sin VAPID_*).
process.env.VAPID_PUBLIC_KEY = '';
process.env.VAPID_PRIVATE_KEY = '';
process.env.VAPID_SUBJECT ??= 'mailto:no-reply@example.com';

// Recuperación de contraseña: necesita un secreto para no auto-desactivarse.
process.env.PASSWORD_RESET_SECRET ??= 'test-only-secret-do-not-use-in-prod';
process.env.APP_BASE_URL ??= 'http://localhost:5173';

// Webhook IoT: secreto fijo y conocido por los tests.
//
// `=` y no `??=` a propósito: las suites mandan este literal en la cabecera
// `x-iot-secret`, así que si el entorno trajera otro valor (p. ej. el real
// del `.env` filtrado al proceso), el guard rechazaría con 401 y los tests
// del camino feliz fallarían sin motivo aparente. Los que dependen de un
// valor LITERAL se fijan; los demás pueden quedarse en `??=`.
process.env.IOT_WEBHOOK_SECRET = 'test-iot-secret';
process.env.OPENMAINT_IOT_REQUESTER_ID ??= '8191305';
process.env.OPENMAINT_IOT_FALLBACK_SITE_ID ??= '3019998';
// Reintentos a 1: por defecto son 3 con backoff `attempt * 500ms`, que
// añadiría ~1.5s a cada test de la ruta de fallo de openMAINT.
process.env.IOT_CREATE_MAX_ATTEMPTS = '1';

// Correo: no debería llegar a usarse (MailerService va mockeado en todas las
// suites salvo la propia de notifications, que mockea el proveedor por
// debajo), pero se define por si algo lo lee al arrancar.
process.env.MAIL_PROVIDER ??= 'smtp';
process.env.SMTP_HOST ??= 'smtp.invalid';
process.env.SMTP_PORT ??= '2525';
process.env.SMTP_USER ??= 'mock-user';
process.env.SMTP_PASSWORD ??= 'mock-password';
process.env.HISTORIAL_EMAIL_ENABLED = 'false';

process.env.CALENDAR_TIMEZONE ??= 'America/Guayaquil';
process.env.PORT ??= '0';
