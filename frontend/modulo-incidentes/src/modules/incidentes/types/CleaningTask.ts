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
  assignedDate: string;
  plannedStartTime: string;
  plannedEndTime: string;
  actualStartTime: string | null;
  actualEndTime: string | null;
  taskObservations: string | null;
  supervisionObserv: string | null;
  teamObservations: string | null;
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
