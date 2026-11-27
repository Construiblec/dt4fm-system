import { Injectable, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { CleaningTasksModule } from '../../../modules/cleaning-tasks/cleaning-tasks.module';
import { CleaningTasksSessionService } from '../../../modules/cleaning-tasks/cleaning-tasks.session.service';
import { MaintenanceSupervisionModule } from '../../../modules/maintenance-supervision/maintenance-supervision.module';
import { OpenmaintClient } from '../openmaint.client';
import { ServiceAccountSessionModule } from './service-account-session.module';

@Injectable()
class ConsumerA {
  constructor(readonly session: CleaningTasksSessionService) {}
}

@Injectable()
class ConsumerB {
  constructor(readonly session: CleaningTasksSessionService) {}
}

@Module({
  imports: [ServiceAccountSessionModule],
  providers: [ConsumerA],
  exports: [ConsumerA],
})
class ModuleA {}

@Module({
  imports: [ServiceAccountSessionModule],
  providers: [ConsumerB],
  exports: [ConsumerB],
})
class ModuleB {}

describe('ServiceAccountSessionModule', () => {
  it('comparte una sola instancia entre los módulos que la importan', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ ignoreEnvFile: true, isGlobal: true }),
        ModuleA,
        ModuleB,
      ],
    })
      .overrideProvider(OpenmaintClient)
      .useValue({})
      .compile();

    const a = moduleRef.get(ConsumerA, { strict: false });
    const b = moduleRef.get(ConsumerB, { strict: false });

    expect(a.session).toBeInstanceOf(CleaningTasksSessionService);
    expect(a.session).toBe(b.session);
    await moduleRef.close();
  });

  it('ningún otro módulo la provee por su cuenta', () => {
    for (const module of [CleaningTasksModule, MaintenanceSupervisionModule]) {
      const providers = (Reflect.getMetadata('providers', module) ??
        []) as unknown[];
      const imports = (Reflect.getMetadata('imports', module) ??
        []) as unknown[];

      expect(providers).not.toContain(CleaningTasksSessionService);
      expect(imports).toContain(ServiceAccountSessionModule);
    }
  });
});
