export const GROUP_STATUSES = ["active", "inactive"] as const;

export type GroupStatus = (typeof GROUP_STATUSES)[number];

export interface Group {
  id: string;
  name: string;
  description: string;
  lead: string;
  memberCount: number;
  status: GroupStatus;
}
