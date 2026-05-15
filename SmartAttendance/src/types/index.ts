export type Role = 'student' | 'teacher';

export interface User {
  uid: string;
  name: string;
  email: string;
  role: Role;
  photoURL?: string;
}

export interface Student {
  id: string;
  name: string;
  email: string;
  roll: string;
}

export interface Course {
  id: string;
  name: string;
  code: string;
  teacherId: string;
  teacherName: string;
  studentIds: string[];
  enrolledStudents: Student[];
  createdAt: string;
  /** Total unique class dates ever held for this course (computed server-side). */
  totalClasses?: number;
}

export type AttendanceMethod = 'bluetooth' | 'code' | 'manual';

export interface AttendanceRecord {
  date: string;
  present: boolean;
  method: AttendanceMethod;
  timestamp: string;
}

export interface AttendanceCode {
  code: string;
  expiresAt: string;
  expiresInSeconds: number;
  courseId: string;
  createdBy: string;
}

export interface ApiResponse<T> {
  data: T;
  message: string;
  success: boolean;
}

export interface DashboardCourse {
  id: string;
  name: string;
  code: string;
  totalClasses: number;
  presentCount: number;
  percentage: number;
  status: 'good' | 'warning' | 'danger';
}
