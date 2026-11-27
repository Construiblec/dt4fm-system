import { INestApplication } from '@nestjs/common';
import { ModulesContainer } from '@nestjs/core';
import { CleaningTasksSessionService } from '../src/modules/cleaning-tasks/cleaning-tasks.session.service';
import { createTestApp } from './helpers/test-app';

describe('Sesión de servicio (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    ({ app } = await createTestApp());
  });

  afterAll(async () => {
    await app?.close();
  });

  // Dos instancias son dos logins y dos enfriamientos: riesgo de bloquear la cuenta.
  it('CleaningTasksSessionService vive en un solo módulo', () => {
    const owners = [...app.get(ModulesContainer).values()].filter((module) =>
      module.providers.has(CleaningTasksSessionService),
    );

    expect(owners).toHaveLength(1);
  });
});
