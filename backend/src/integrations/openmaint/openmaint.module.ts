import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { OpenmaintClient } from './openmaint.client';
import { OpenmaintService } from './openmaint.service';
import { OpenmaintAuthService } from './openmaint.auth.service';
import { OpenmaintRolesService } from './openmaint.roles.service';
import { OpenmaintServiceSession } from './openmaint.service-session';
import { OpenmaintUsersService } from './openmaint.users.service';
import { SessionRoleService } from './session-role.service';
import { UnitResolverService } from './unit-resolver.service';
import { MaintCategoryCatalogService } from './maint-category-catalog.service';

@Module({
  imports: [HttpModule],
  providers: [
    OpenmaintClient,
    OpenmaintService,
    OpenmaintAuthService,
    OpenmaintRolesService,
    OpenmaintServiceSession,
    OpenmaintUsersService,
    SessionRoleService,
    UnitResolverService,
    MaintCategoryCatalogService,
  ],
  exports: [
    OpenmaintClient,
    OpenmaintService,
    OpenmaintAuthService,
    OpenmaintRolesService,
    OpenmaintServiceSession,
    OpenmaintUsersService,
    SessionRoleService,
    UnitResolverService,
    MaintCategoryCatalogService,
  ],
})
export class OpenmaintModule {}
