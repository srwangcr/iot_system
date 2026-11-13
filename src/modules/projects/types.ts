export const PROJECT_STATUSES = ["planned", "active", "paused", "completed", "cancelled"] as const;

export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export interface Project {
  id: string;
  name: string;
  description: string;
  groupId: string;
  status: ProjectStatus;
  startDate: string | null;
  endDate: string | null;
}
