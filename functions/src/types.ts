export const ITEMS = ["potato", "branch", "flower", "rooster"] as const;
export type Item = (typeof ITEMS)[number];
export type Phase =
  | "PREPARING"
  | "INDIVIDUAL_OPEN"
  | "INDIVIDUAL_CLOSED"
  | "GROUP_OPEN"
  | "COMPLETED";
export interface Answer {
  q1: string;
  q2: string;
  version: number;
  firstSubmittedAt: number;
  updatedAt: number;
  submitted: true;
  requestId: string;
  nickname: string;
  zepId: string;
}
export interface Student {
  id: string;
  name: string;
  codeHash: string;
  zepId: string | null;
  bindingVersion: number;
  lastActiveAt: number;
  excluded: boolean;
}
export interface Group {
  id: string;
  number: number;
  members: string[];
  recorder: string;
}
export interface Result {
  q1: string;
  q2: string;
  version: number;
  firstSubmittedAt: number;
  updatedAt: number;
  submittedBy: string;
  requestId: string;
}
export interface Session {
  id: string;
  owner: string;
  title: string;
  phase: Phase;
  createdAt: number;
  updatedAt: number;
  students: Student[];
  responses: Record<string, Partial<Record<Item, Answer>>>;
  groups: Group[];
  groupsPublished: boolean;
  groupResults: Record<string, Result>;
  audit: { at: number; action: string; actor: string }[];
}
export interface Auth {
  role: "teacher" | "student";
  uid: string;
  sessionId?: string;
  studentId?: string;
  bindingVersion?: number;
  expiresAt: number;
}
export interface Launch {
  sessionId: string;
  name: string;
  zepId: string;
  route: string;
  expiresAt: number;
  used: boolean;
  attempts: number;
}
export interface Store {
  read<T>(key: string): Promise<T | undefined>;
  update<T, R>(
    key: string,
    fn: (current: T | undefined) => { value: T | undefined; result: R },
  ): Promise<R>;
  list<T>(prefix: string): Promise<T[]>;
}
