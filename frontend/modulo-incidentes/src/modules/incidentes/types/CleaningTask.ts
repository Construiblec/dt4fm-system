export type CleaningTaskUnit = {
  id: number;
  code: string;
  description: string;
  name: string;
};

export type CleaningTaskEmployee = {
  id: number;
  name: string;
};

export type CleaningTask = {
  id: number;
  type: "CleaningTask";
  taskNumber: string;
  description: string;
  phase: string;
  generatedDate: string;
  plannedStartTime: string;
  plannedEndTime: string;
  actualStartTime: string | null;
  actualEndTime: string | null;
  /** Tiempo trabajado acumulado, en minutos. */
  executionTime: number | null;
  /** Retraso del primer inicio respecto a lo planificado, en minutos. */
  delayTime: number | null;
  taskObservations: string | null;
  supervisionObserv: string | null;
  teamObservations: string | null;
  /**
   * Tarea pausada por el empleado. La resuelve el backend a partir de la marca
   * [Pausado] de TeamObservations: OpenMAINT no tiene una fase propia para esto,
   * la tarea vuelve a Assigned. Nunca deducirlo leyendo las observaciones.
   */
  isPaused: boolean;
  /**
   * Instante en que arrancó la ejecución en curso, resuelto por el backend desde
   * OpenMAINT. Es el cero del cronómetro y por eso vive en el servidor: así dos
   * ventanas, otro dispositivo o una recarga muestran el mismo tiempo. Null si la
   * tarea no está en ejecución.
   */
  sessionStartedAt: string | null;
  /**
   * Minutos con los que arranca el cronómetro de la ejecución en curso: lo ya
   * trabajado si se reanudó una pausa, cero si la tarea se reabrió (ahí el tiempo
   * nuevo se suma al acumulado). Lo decide el backend para que no dependa de la
   * ventana desde la que se mire.
   */
  sessionBaseMinutes: number;
  hostawayReservation: string | null;
  checkoutDate: string | null;
  source: string;
  unit: CleaningTaskUnit | null;
  employee: CleaningTaskEmployee;
};

export type GetMyCleaningTasksResponse = {
  success: boolean;
  data: CleaningTask[];
  meta: {
    total: number;
    limit: number;
    offset: number;
  };
};
