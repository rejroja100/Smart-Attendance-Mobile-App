import axios, { AxiosError, AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import auth from '@react-native-firebase/auth';
import { API_BASE_URL } from '@/utils/constants';
import type {
  Role,
  User,
  Course,
  AttendanceRecord,
  AttendanceCode,
  DashboardCourse,
} from '@/types';

export interface ApiError extends Error {
  status?: number;
}

interface ServerErrorBody {
  message?: string;
  detail?: string;
  error?: string;
}

const client = axios.create({
  baseURL: API_BASE_URL,
  timeout: 20000,
  headers: { 'Content-Type': 'application/json' },
});

// Inject Firebase ID token on every request.
client.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    try {
      const current = auth().currentUser;
      if (current) {
        const token = await current.getIdToken();
        if (token) {
          config.headers = config.headers ?? {};
          (config.headers as Record<string, string>)['Authorization'] = `Bearer ${token}`;
        }
      }
    } catch {
      // ignore — request will go out unauthenticated and server will reject
    }
    return config;
  },
  (error: unknown) => Promise.reject(error),
);

// Normalize errors so callers always see `Error` with .status and a friendly .message.
client.interceptors.response.use(
  (res: AxiosResponse) => res,
  (error: AxiosError<ServerErrorBody>) => {
    const status = error.response?.status;
    const body = error.response?.data;
    const message =
      (body && (body.detail || body.message || body.error)) ||
      error.message ||
      'Network request failed';
    const wrapped: ApiError = new Error(message);
    wrapped.status = status;
    return Promise.reject(wrapped);
  },
);

// ---------- Auth (router prefix: /api/auth) ----------
export function loginUser(role: Role): Promise<User> {
  return client.post<User>('/api/auth/login', { role }).then((r) => r.data);
}

export function getMe(): Promise<User> {
  return client.get<User>('/api/auth/me').then((r) => r.data);
}

export function logoutUser(): Promise<{ message: string }> {
  return client.post<{ message: string }>('/api/auth/logout').then((r) => r.data);
}

// ---------- Courses (router prefix: /api/courses) ----------
export function getTeacherCourses(): Promise<Course[]> {
  return client.get<Course[]>('/api/courses/teacher').then((r) => r.data);
}

export function getStudentCourses(): Promise<Course[]> {
  return client.get<Course[]>('/api/courses/student').then((r) => r.data);
}

export function createCourse(name: string, code: string): Promise<Course> {
  return client.post<Course>('/api/courses', { name, code }).then((r) => r.data);
}

export function deleteCourse(courseId: string): Promise<{ success: boolean; id: string }> {
  return client
    .delete<{ success: boolean; id: string }>(`/api/courses/${courseId}`)
    .then((r) => r.data);
}

export function getCourse(courseId: string): Promise<Course> {
  return client.get<Course>(`/api/courses/${courseId}`).then((r) => r.data);
}

export function enrollInCourse(
  courseId: string,
  studentName: string,
  studentRoll: string,
): Promise<Course> {
  return client
    .post<Course>(`/api/courses/${courseId}/enroll`, {
      studentName,
      studentRoll,
    })
    .then((r) => r.data);
}

export function removeStudent(
  courseId: string,
  studentId: string,
): Promise<Course> {
  return client
    .delete<Course>(`/api/courses/${courseId}/students/${studentId}`)
    .then((r) => r.data);
}

// ---------- Code-based attendance (router prefix: /api/attendance) ----------
// Backend requires `courseId` and `code` in the body.
export function submitCode(courseId: string, code: string): Promise<AttendanceCode> {
  return client
    .post<AttendanceCode>('/api/attendance/code/submit', { courseId, code })
    .then((r) => r.data);
}

export function verifyStudentCode(
  courseId: string,
  code: string,
): Promise<{ success: boolean; record: AttendanceRecord }> {
  return client
    .post<{ success: boolean; record: AttendanceRecord }>(
      '/api/attendance/code/verify',
      { courseId, code },
    )
    .then((r) => r.data);
}

// ---------- Manual attendance ----------
export function submitManualAttendance(
  courseId: string,
  records: { studentId: string; present: boolean }[],
): Promise<{ success: boolean; count: number }> {
  return client
    .post<{ success: boolean; count: number }>('/api/attendance/manual', {
      courseId,
      records,
    })
    .then((r) => r.data);
}

// ---------- Bluetooth attendance ----------
export function submitBluetoothAttendance(
  courseId: string,
  teacherDeviceId: string,
): Promise<{ success: boolean; record: AttendanceRecord }> {
  return client
    .post<{ success: boolean; record: AttendanceRecord }>(
      '/api/attendance/bluetooth',
      { courseId, teacherDeviceId },
    )
    .then((r) => r.data);
}

export function startBluetoothSession(
  courseId: string,
  teacherDeviceId: string,
): Promise<{ success: boolean; startedAt: string; active: boolean }> {
  return client
    .post<{ success: boolean; startedAt: string; active: boolean }>(
      '/api/attendance/bluetooth/start',
      { courseId, teacherDeviceId },
    )
    .then((r) => r.data);
}

// Backend currently requires { courseId, teacherDeviceId } in the stop body, so we
// pass the deviceId we used when starting (defaults to empty string if unknown).
export function stopBluetoothSession(
  courseId: string,
  teacherDeviceId: string = '',
): Promise<{ success: boolean; stoppedAt: string; active: boolean }> {
  return client
    .post<{ success: boolean; stoppedAt: string; active: boolean }>(
      '/api/attendance/bluetooth/stop',
      { courseId, teacherDeviceId },
    )
    .then((r) => r.data);
}

// ---------- Dashboards & listing ----------
// Backend returns { courses: [...] } — unwrap so callers get the array directly.
export function getStudentDashboard(): Promise<DashboardCourse[]> {
  return client
    .get<{ courses: DashboardCourse[] }>('/api/students/dashboard')
    .then((r) => r.data?.courses ?? []);
}

// Backend returns a flat list: [{ studentId, date, present, method, timestamp }, ...].
// Reshape into { dates, records: { [studentId]: { [date]: AttendanceRecord } } }
// because the teacher's live-detection UI consumes that shape.
export interface CourseAttendanceView {
  dates: string[];
  records: Record<string, Record<string, AttendanceRecord>>;
}

interface FlatAttendanceRow {
  studentId: string;
  date: string;
  present: boolean;
  method: AttendanceRecord['method'];
  timestamp: string;
}

export function getCourseAttendance(courseId: string): Promise<CourseAttendanceView> {
  return client
    .get<FlatAttendanceRow[]>(`/api/attendance/${courseId}`)
    .then((r) => {
      const rows = Array.isArray(r.data) ? r.data : [];
      const dateSet = new Set<string>();
      const records: Record<string, Record<string, AttendanceRecord>> = {};
      for (const row of rows) {
        if (!row?.studentId || !row?.date) continue;
        dateSet.add(row.date);
        if (!records[row.studentId]) records[row.studentId] = {};
        records[row.studentId][row.date] = {
          date: row.date,
          present: !!row.present,
          method: row.method,
          timestamp: row.timestamp,
        };
      }
      const dates = Array.from(dateSet).sort();
      return { dates, records };
    });
}

// ---------- Export ----------
export interface ExportResult {
  data: ArrayBuffer;
  filename: string;
  contentType: string;
}

export function exportAttendance(
  courseId: string,
  format: 'xlsx' | 'csv',
): Promise<ExportResult> {
  return client
    .get(`/api/attendance/${courseId}/export`, {
      params: { format },
      responseType: 'arraybuffer',
    })
    .then((r) => {
      const disposition = (r.headers?.['content-disposition'] ?? '') as string;
      const match = /filename="?([^";]+)"?/i.exec(disposition);
      const filename = match?.[1] ?? `attendance-${courseId}.${format}`;
      const contentType =
        (r.headers?.['content-type'] as string | undefined) ??
        (format === 'xlsx'
          ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
          : 'text/csv');
      return { data: r.data as ArrayBuffer, filename, contentType };
    });
}

export default client;
