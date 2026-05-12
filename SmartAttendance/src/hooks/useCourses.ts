import { useCallback, useEffect, useState } from 'react';
import {
  getTeacherCourses,
  getStudentCourses,
  createCourse as apiCreateCourse,
  deleteCourse as apiDeleteCourse,
  enrollInCourse as apiEnrollInCourse,
  removeStudent as apiRemoveStudent,
  getCourse as apiGetCourse,
} from '@/services/api';
import type { Course } from '@/types';

interface UseCoursesResult {
  courses: Course[];
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  createCourse: (name: string, code: string) => Promise<Course>;
  deleteCourse: (courseId: string) => Promise<void>;
  enroll: (courseId: string, name: string, roll: string) => Promise<Course>;
  removeStudent: (courseId: string, studentId: string) => Promise<void>;
}

export function useCourses(role: 'teacher' | 'student'): UseCoursesResult {
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (showSpinner: boolean) => {
      if (showSpinner) setLoading(true);
      else setRefreshing(true);
      setError(null);
      try {
        const list =
          role === 'teacher' ? await getTeacherCourses() : await getStudentCourses();
        setCourses(Array.isArray(list) ? list : []);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Failed to load courses.');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [role],
  );

  useEffect(() => {
    void load(true);
  }, [load]);

  const refresh = useCallback(async () => {
    await load(false);
  }, [load]);

  const createCourse = useCallback(
    async (name: string, code: string): Promise<Course> => {
      const created = await apiCreateCourse(name, code);
      setCourses((prev) => [created, ...prev]);
      return created;
    },
    [],
  );

  const deleteCourse = useCallback(async (courseId: string): Promise<void> => {
    await apiDeleteCourse(courseId);
    setCourses((prev) => prev.filter((c) => c.id !== courseId));
  }, []);

  const enroll = useCallback(
    async (courseId: string, name: string, roll: string): Promise<Course> => {
      const updated = await apiEnrollInCourse(courseId, name, roll);
      setCourses((prev) => {
        const exists = prev.some((c) => c.id === updated.id);
        return exists
          ? prev.map((c) => (c.id === updated.id ? updated : c))
          : [updated, ...prev];
      });
      return updated;
    },
    [],
  );

  const removeStudent = useCallback(
    async (courseId: string, studentId: string): Promise<void> => {
      await apiRemoveStudent(courseId, studentId);
      setCourses((prev) =>
        prev.map((c) =>
          c.id === courseId
            ? {
                ...c,
                studentIds: c.studentIds.filter((id) => id !== studentId),
                enrolledStudents: c.enrolledStudents.filter((s) => s.id !== studentId),
              }
            : c,
        ),
      );
    },
    [],
  );

  return {
    courses,
    loading,
    refreshing,
    error,
    refresh,
    createCourse,
    deleteCourse,
    enroll,
    removeStudent,
  };
}

interface UseCourseResult {
  course: Course | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  setCourse: (c: Course) => void;
}

export function useCourse(courseId: string | undefined): UseCourseResult {
  const [course, setCourse] = useState<Course | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!courseId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const c = await apiGetCourse(courseId);
      setCourse(c);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load course.');
    } finally {
      setLoading(false);
    }
  }, [courseId]);

  useEffect(() => {
    void load();
  }, [load]);

  return { course, loading, error, refresh: load, setCourse };
}
