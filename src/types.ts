export type Page =
  | "overview"
  | "schedule"
  | "grades"
  | "homework"
  | "resources"
  | "accounts"
  | "files"
  | "settings"
  | "downloads"
  | "mail"
  | "services"
  | "classrooms";
export interface Account {
  id: string;
  name: string;
  studentId: string;
  department: string;
  identity: string;
  demo: boolean;
  color: string;
}
export interface Grade {
  id: string;
  name: string;
  teacher: string;
  score: string;
  credits: string;
  term: string;
  detail: string;
}
export interface Course {
  id: string;
  name: string;
  teacher: string;
  place: string;
  day: number;
  period: number;
  weeks: string;
  selection: boolean;
  color: string;
}
export interface Homework {
  id: string;
  course: string;
  title: string;
  type: string;
  deadline: string;
  status: string;
  content: string;
  courseId?: string;
  submittedAt?: string;
  sourceId?: string;
  snId?: string;
  userId?: string;
  teacherId?: string;
  openedAt?: string;
  rawContent?: string;
  repeatAllowed?: boolean;
  score?: string;
  totalScore?: string;
  grouped?: string;
  submitCount?: number;
  allCount?: number;
  reviewStatus?: string;
}
export interface Resource {
  id: string;
  name: string;
  course: string;
  kind: "course" | "folder" | "file";
  size?: string;
  children: Resource[];
  courseId?: string;
  sourceId?: string;
  loaded?: boolean;
  docType?: string;
  rpId?: string;
  downloadAllowed?: boolean;
  url?: string;
  convertUrl?: string;
  term?: string;
}
export interface HomeworkPatch {
  courseId: string;
  course: string;
  type: string;
  items: Homework[];
}
export interface CourseError {
  courseId: string;
  course: string;
  type: string;
  message: string;
}
export interface Replay {
  id: string;
  videoId: string;
  courseId: string;
  name: string;
  startTime: string;
  endTime: string;
  room: string;
  teacher: string;
  teacherId: string;
  content: string;
}
export interface ReplayLink {
  view: string;
  label: string;
  url: string;
}
export interface DownloadItem {
  id: string;
  name: string;
  courseId?: string;
  rpId?: string;
  url?: string;
  downloadAllowed?: boolean;
  relativePath?: string[];
  kind: "resource" | "replay";
  view?: string;
  teacherId?: string;
}
export interface DownloadTask {
  id: string;
  accountId: string;
  name: string;
  state: "queued" | "downloading" | "completed" | "failed" | "cancelled";
  loaded: number;
  total: number;
  error?: string;
  path?: string;
  folder?: string;
  speed?: number;
  eta?: number;
  createdAt?: number;
  updatedAt?: number;
  startedAt?: number;
  finishedAt?: number;
}
export interface Change {
  id: string;
  category: string;
  kind: "新增" | "修改" | "删除";
  title: string;
  time: string;
}
export interface CampusData {
  grades: Grade[];
  courses: Course[];
  homework: Homework[];
  resources: Resource[];
  mailCount: number;
  currentWeek: number;
  lastSync: string;
  changes: Change[];
  homeworkErrors?: CourseError[];
  term?: string;
  replays?: Record<string, Replay[]>;
  syncedAt?: Record<string, string>;
  mailInbox?: MailMessage[];
  mailTotal?: number;
  mailSent?: MailMessage[];
  mailSentTotal?: number;
  balances?: { card: string; network: string };
}
export interface AppStore {
  accounts: Account[];
  activeId: string;
  data: Record<string, CampusData>;
}
export interface SyncResult {
  profile?: Account;
  authExpired?: boolean;
  grades?: Grade[];
  courses?: Course[];
  homework?: Homework[];
  resources?: Resource[];
  mailCount?: number;
  currentWeek?: number;
  failures: string[];
  retriedCourseId?: string;
  homeworkPatches?: HomeworkPatch[];
  homeworkErrors?: CourseError[];
  term?: string;
  scope?: string;
  mailInbox?: MailMessage[];
  mailTotal?: number;
  balances?: { card?: string; network?: string };
}
export const emptyData = (): CampusData => ({
  grades: [],
  courses: [],
  homework: [],
  resources: [],
  mailCount: 0,
  currentWeek: 1,
  lastSync: "",
  changes: [],
});
export const navItems: { id: Page; label: string; icon: string }[] = [
  { id: "overview", label: "校园概览", icon: "house" },
  { id: "schedule", label: "我的课表", icon: "calendar" },
  { id: "grades", label: "学业成绩", icon: "graduation" },
  { id: "homework", label: "课程作业", icon: "notebook" },
  { id: "resources", label: "课程资料", icon: "folder" },
  { id: "files", label: "文件空间", icon: "folder" },
  { id: "downloads", label: "下载管理", icon: "download" },
  { id: "mail", label: "校园邮箱", icon: "mail" },
  { id: "services", label: "校园服务", icon: "services" },
  { id: "classrooms", label: "教室占用", icon: "classrooms" },
];

export interface Attachment {
  convertUrl?: string;
  id: string;
  name: string;
  url: string;
  size: number;
}
export interface UploadedFile extends Attachment {
  visitName: string;
  uploadedAt: string;
  lastModified?: number;
  noteId?: string;
}
export interface HomeworkDetailData {
  content: string;
  attachments: Attachment[];
  submittedContent: string;
  submittedAttachments: Attachment[];
  submittedAt: string;
  status: string;
  score: string;
  comment: string;
  openedAt: string;
  deadline: string;
  repeatAllowed: boolean;
  reviewError: string;
  submitCount?: number;
  allCount?: number;
  reviewStatus?: string;
}
export interface SpaceFile {
  id: string;
  name: string;
  url: string;
  rpId: string;
  size: string;
  inputTime: string;
}
export interface Preferences {
  quickLogin: boolean;
  resourcePort: number;
  downloadConcurrency: number;
  reuseUploads: boolean;
  saveUploads: boolean;
  networkReconnect: boolean;
  networkAccount: string;
  networkInterval: number;
  mailNotifications: boolean;
  mailAccount: string;
  mailInterval: number;
}

export interface MailMessage {
  to?: string;
  id: string;
  subject: string;
  from: string;
  summary: string;
  date: string;
  read: boolean;
  attached: boolean;
}

export type RoomStatus =
  | "free"
  | "scheduled"
  | "rescheduled"
  | "exam"
  | "experiment"
  | "other"
  | "unknown";
export interface Classroom {
  id: string;
  name: string;
  capacity: number;
  cells: RoomStatus[];
}
export interface ClassroomPage {
  week: number;
  building: string;
  rooms: Classroom[];
  buildings: { id: string; name: string }[];
  semesters: { id: string; name: string }[];
  currentSemester?: string;
}
