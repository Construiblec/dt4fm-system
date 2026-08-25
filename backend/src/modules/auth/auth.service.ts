import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  OpenmaintAuthService,
  type OpenmaintSession,
  type OpenmaintSessionResponse,
} from '../../integrations/openmaint/openmaint.auth.service';
import { OpenmaintRolesService } from '../../integrations/openmaint/openmaint.roles.service';
import { OpenmaintService } from '../../integrations/openmaint/openmaint.service';
import { OpenmaintServiceSession } from '../../integrations/openmaint/openmaint.service-session';
import { OpenmaintUsersService } from '../../integrations/openmaint/openmaint.users.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { LoginDto } from './dto/login.dto';
import { SwitchRoleDto } from './dto/switch-role.dto';

/** Grupo cuyos miembros tienen ficha de residente en vez de ficha de empleado. */
const OWNER_ROLE = 'Propietarios';

/**
 * Lo que devuelven tanto el login como el cambio de rol. Es el mismo contrato
 * a propósito: al cambiar de rol el cliente reemplaza su sesión entera, porque
 * los identificadores dependen del grupo activo (un usuario puede tener
 * `employeeId` como técnico y `tenantId` como residente).
 */
export type AuthSession = {
  sessionId: string;
  username: string;
  userId: number;
  /** Grupo activo. Es el **Code** de openMAINT, no la Description. */
  role: string;
  /** Todos los grupos de la cuenta; con más de uno el cliente ofrece elegir. */
  availableRoles: string[];
  /**
   * Code → Description de cada grupo (`MaintOffice` → "TPM Equipment"). Es lo
   * que la interfaz enseña: el Code es un identificador interno.
   */
  roleLabels: Record<string, string>;
  name: string | null;
  employeeId: number | null;
  cleaningEmployeeId: number | null;
  tenantId: number | null;
};

@Injectable()
export class AuthService {
  constructor(
    private readonly openmaintAuthService: OpenmaintAuthService,
    private readonly openmaintService: OpenmaintService,
    private readonly serviceSession: OpenmaintServiceSession,
    private readonly users: OpenmaintUsersService,
    private readonly roles: OpenmaintRolesService,
  ) {}

  /**
   * Login único para equipo y residentes: openMAINT los autentica igual, contra
   * el mismo `POST /sessions`. Lo que cambia entre unos y otros no es el acceso
   * sino qué identificadores tienen resueltos, y eso se decide por el grupo.
   */
  async login(dto: LoginDto): Promise<AuthSession> {
    let response: OpenmaintSessionResponse;

    try {
      response = await this.openmaintAuthService.login(
        dto.username,
        dto.password,
        dto.role,
      );
    } catch (error) {
      // openMAINT contesta 401 con credenciales malas, pero el cliente HTTP
      // re-lanza el AxiosError crudo y no hay filtro global de excepciones: sin
      // este catch el frontend recibiría un 500 opaco en vez de un 401.
      const status = (error as { response?: { status?: number } })?.response
        ?.status;

      if (status === 401 || status === 403) {
        throw new UnauthorizedException('Usuario o contraseña incorrectos');
      }

      throw new InternalServerErrorException(
        'No se pudo contactar con OpenMAINT',
      );
    }

    if (!response?.data?._id) {
      throw new UnauthorizedException('Usuario o contraseña incorrectos');
    }

    return this.buildSession(response.data);
  }

  /**
   * Cambia el grupo activo **de la sesión ya emitida**, sin re-autenticar ni
   * volver a pedir la contraseña: openMAINT recalcula los privilegios sobre el
   * mismo `sessionId`. Los identificadores se vuelven a resolver porque no son
   * los mismos en todos los grupos.
   */
  async switchRole(
    sessionId: string,
    dto: SwitchRoleDto,
  ): Promise<AuthSession> {
    const current = await this.readSession(sessionId);

    // El rol llega del cliente, así que se contrasta contra los grupos reales
    // de la sesión. Sin esto cualquiera podría pedir un grupo que no le toca.
    if (!(current.availableRoles ?? []).includes(dto.role)) {
      throw new UnauthorizedException('El usuario no pertenece a ese rol');
    }

    try {
      await this.openmaintAuthService.setSessionRole(sessionId, dto.role);
    } catch {
      throw new InternalServerErrorException('No se pudo cambiar de rol');
    }

    return this.buildSession({ ...current, _id: sessionId, role: dto.role });
  }

  /**
   * Cambio de contraseña con sesión iniciada, para cualquier rol.
   *
   * Escribe con la sesión de servicio y reenviando los grupos leídos, porque
   * `PUT /users/{id}` reemplaza el recurso entero: con cuentas multi-rol, fijar
   * la lista de grupos a mano les borraría el resto de accesos.
   */
  async changePassword(sessionId: string, dto: ChangePasswordDto) {
    const current = await this.readSession(sessionId);

    await this.verifyPassword(current.username, dto.currentPassword);

    const serviceSessionId = await this.serviceSession.get();
    const account = await this.users.getAccount(
      current.userId,
      serviceSessionId,
    );

    if (!account) {
      throw new InternalServerErrorException(
        'No se pudo identificar la cuenta',
      );
    }

    try {
      await this.users.updatePassword(
        account,
        dto.newPassword,
        serviceSessionId,
      );
    } catch {
      throw new InternalServerErrorException(
        'No se pudo actualizar la contraseña',
      );
    }

    return { success: true, message: 'Contraseña actualizada correctamente' };
  }

  /** openMAINT no expone «comprobar contraseña»: se valida intentando entrar. */
  private async verifyPassword(username: string, password: string) {
    let response: OpenmaintSessionResponse;

    try {
      response = await this.openmaintAuthService.login(username, password);
    } catch {
      throw new BadRequestException('La contraseña actual es incorrecta');
    }

    if (!response?.data?._id) {
      throw new BadRequestException('La contraseña actual es incorrecta');
    }
  }

  private async readSession(sessionId: string): Promise<OpenmaintSession> {
    if (!sessionId) {
      throw new UnauthorizedException('Sesión no válida');
    }

    try {
      const response = await this.openmaintAuthService.getSession(sessionId);

      if (!response?.data?.userId) {
        throw new UnauthorizedException('Sesión no válida');
      }

      return response.data;
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }

      throw new UnauthorizedException('Sesión no válida');
    }
  }

  /**
   * Resuelve los identificadores que la app necesita según el grupo activo.
   * Los tres resolvers devuelven `null` sin lanzar, así que el login nunca se
   * cae porque a un usuario le falte una ficha.
   */
  private async buildSession(data: OpenmaintSession): Promise<AuthSession> {
    const sessionId = data._id;
    const { username, userId } = data;
    const availableRoles = data.availableRoles ?? [];
    const name = data.userDescription ?? null;

    const isOwner = availableRoles.includes(OWNER_ROLE);

    const [employeeId, cleaningEmployeeId, tenantId, roleLabels] =
      await Promise.all([
        typeof userId === 'number'
          ? this.openmaintService.resolveEmployeeId(userId, sessionId)
          : Promise.resolve(null),
        this.openmaintService.resolveCleaningEmployeeId(username, sessionId),
        // Solo los residentes tienen ficha `Tenant`, y buscarla cuesta una
        // sesión de servicio extra: para el equipo no se paga ese viaje.
        isOwner && name ? this.resolveTenantId(name) : Promise.resolve(null),
        this.roles.getLabels(),
      ]);

    return {
      sessionId,
      username,
      userId,
      role: data.role ?? '',
      availableRoles,
      roleLabels,
      name,
      employeeId,
      cleaningEmployeeId,
      tenantId,
    };
  }

  private async resolveTenantId(description: string): Promise<number | null> {
    try {
      const serviceSessionId = await this.serviceSession.get();

      return await this.openmaintService.findTenantByDescription(
        description,
        serviceSessionId,
      );
    } catch {
      // Un residente sin ficha `Tenant` localizable puede entrar igual; su
      // dashboard se encarga de avisar de que no hay datos.
      return null;
    }
  }
}
