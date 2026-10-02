import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
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
import { AppSessionsService } from '../app-sessions/app-sessions.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { LoginDto } from './dto/login.dto';
import { SwitchRoleDto } from './dto/switch-role.dto';

/** Grupo cuyos miembros tienen ficha de residente en vez de ficha de empleado. */
const OWNER_ROLE = 'Propietarios';

/**
 * Roles a los que no se puede saltar desde una sesión ya iniciada.
 *
 * Ser residente es una condición de la persona, no un modo de trabajo: nadie
 * del equipo entra como si lo fuera, aunque openMAINT le tenga ese grupo
 * asignado. Sí se puede iniciar sesión directamente en él — es lo que hace un
 * residente —, lo que se prohíbe es cambiarse a él después.
 */
const NON_SWITCHABLE_ROLES = [OWNER_ROLE];

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

/** Lo justo para saber si la sesión sigue viva y con qué grupo. */
export type SessionStatus = Pick<
  AuthSession,
  'username' | 'role' | 'availableRoles'
>;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly openmaintAuthService: OpenmaintAuthService,
    private readonly openmaintService: OpenmaintService,
    private readonly serviceSession: OpenmaintServiceSession,
    private readonly users: OpenmaintUsersService,
    private readonly roles: OpenmaintRolesService,
    private readonly appSessions: AppSessionsService,
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

    const session = await this.buildSession(response.data);

    // Un fallo del registro no puede dejar a nadie sin entrar: la sesión es
    // válida igual, solo que no se recordará ni se podrá cerrar desde otro
    // dispositivo.
    try {
      await this.appSessions.register(session, dto.remember === true);
    } catch (error) {
      this.logger.warn(
        `No se pudo registrar la sesión de ${session.username}: ${(error as Error)?.message}`,
      );
    }

    return session;
  }

  /**
   * Cierra la sesión en openMAINT. Hasta ahora «Cerrar sesión» solo borraba el
   * móvil y la sesión seguía viva una hora; con las sesiones recordadas seguiría
   * viva indefinidamente.
   */
  async logout(sessionId: string): Promise<{ success: true }> {
    await this.appSessions.close(sessionId);
    return { success: true };
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

    // La interfaz tampoco lo ofrece, pero el endpoint es alcanzable por su
    // cuenta: la regla se aplica aquí, no solo en el cliente.
    if (NON_SWITCHABLE_ROLES.includes(dto.role)) {
      throw new UnauthorizedException('No se puede cambiar a ese rol');
    }

    try {
      await this.openmaintAuthService.setSessionRole(sessionId, dto.role);
    } catch {
      throw new InternalServerErrorException('No se pudo cambiar de rol');
    }

    return this.buildSession({ ...current, _id: sessionId, role: dto.role });
  }

  /**
   * Comprueba que openMAINT sigue aceptando la sesión. La app lo pregunta al
   * abrirse y al volver a primer plano: tener un `sessionId` guardado no dice
   * si sigue vivo.
   *
   * No resuelve los identificadores como `buildSession`: serían cuatro
   * llamadas más a openMAINT cada vez que alguien abre la app. Y, a diferencia
   * de `readSession`, distingue una sesión caducada de openMAINT caído: si todo
   * fallo fuera un 401, una caída mandaría al login a todos los que la abran.
   */
  async checkSession(sessionId: string): Promise<SessionStatus> {
    if (!sessionId) {
      throw new UnauthorizedException('Sesión no válida');
    }

    let response: OpenmaintSessionResponse;

    try {
      response = await this.openmaintAuthService.getSession(sessionId);
    } catch (error) {
      const status = (error as { response?: { status?: number } })?.response
        ?.status;

      if (status === 401 || status === 403 || status === 404) {
        throw new UnauthorizedException('Sesión no válida');
      }

      throw new InternalServerErrorException(
        'No se pudo contactar con OpenMAINT',
      );
    }

    const data = response?.data;

    if (!data?.userId) {
      throw new UnauthorizedException('Sesión no válida');
    }

    // Abrir la app cuenta como uso: aplaza el cierre de la sesión recordada.
    try {
      await this.appSessions.touch(sessionId);
    } catch (error) {
      this.logger.warn(
        `No se pudo aplazar la sesión de ${data.username}: ${(error as Error)?.message}`,
      );
    }

    return {
      username: data.username,
      role: data.role ?? '',
      availableRoles: data.availableRoles ?? [],
    };
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

    // Los demás dispositivos vuelven al login; este sigue dentro.
    await this.appSessions.closeAllForUser(current.username, sessionId);

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
