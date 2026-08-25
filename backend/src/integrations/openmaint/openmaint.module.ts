import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { OpenmaintClient } from './openmaint.client';
import { OpenmaintService } from './openmaint.service';
import { OpenmaintAuthService } from './openmaint.auth.service';
import { OpenmaintRolesService } from './openmaint.roles.service';
import { OpenmaintServiceSession } from './openmaint.service-session';
import { OpenmaintUsersService } from './openmaint.users.service';

@Module({
  imports: [HttpModule],
  providers: [
    OpenmaintClient,
    OpenmaintService,
    OpenmaintAuthService,
    OpenmaintRolesService,
    OpenmaintServiceSession,
    OpenmaintUsersService,
  ],
  exports: [
    OpenmaintClient,
    OpenmaintService,
    OpenmaintAuthService,
    OpenmaintRolesService,
    OpenmaintServiceSession,
    OpenmaintUsersService,
  ],
})
export class OpenmaintModule {}
