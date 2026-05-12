import { useCallback, useEffect, useRef, useState } from 'react';
import {
  submitCode as apiSubmitCode,
  verifyStudentCode as apiVerifyCode,
  submitManualAttendance as apiSubmitManual,
  getStudentDashboard as apiStudentDashboard,
  getCourseAttendance as apiCourseAttendance,
} from '@/services/api';
import { CODE_DURATION_SECONDS } from '@/utils/constants';
import type {
  AttendanceCode,
  AttendanceRecord,
  Course,
  DashboardCourse,
} from '@/types';

// ---------- Teacher: code session ----------
interface CodeSessionState {
  activeCode: string | null;
  secondsLeft: number;
  expired: boolean;
  startError: string | null;
  starting: boolean;
}

interface UseCodeSessionResult extends CodeSessionState {
  start: (typedCode: string) => Promise<AttendanceCode | null>;
  stop: () => void;
  reset: () => void;
}

export function useCodeSession(courseId: string | undefined): UseCodeSessionResult {
  const [activeCode, setActiveCode] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [expired, setExpired] = useState(false);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearTimer = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      clearTimer();
    };
  }, [clearTimer]);

  const start = useCallback(
    async (typedCode: string): Promise<AttendanceCode | null> => {
      if (!courseId) return null;
      const trimmed = typedCode.trim().toUpperCase();
      if (trimmed.length !== 6) {
        setStartError('Code must be exactly 6 characters.');
        return null;
      }
      setStarting(true);
      setStartError(null);
      try {
        const result = await apiSubmitCode(courseId, trimmed);
        clearTimer();
        setExpired(false);
        setActiveCode(trimmed);
        const total = result.expiresInSeconds ?? CODE_DURATION_SECONDS;
        setSecondsLeft(total);
        intervalRef.current = setInterval(() => {
          setSecondsLeft((prev) => {
            if (prev <= 1) {
              clearTimer();
              setExpired(true);
              return 0;
            }
            return prev - 1;
          });
        }, 1000);
        return result;
      } catch (e: unknown) {
        setStartError(e instanceof Error ? e.message : 'Failed to start session.');
        return null;
      } finally {
        setStarting(false);
      }
    },
    [courseId, clearTimer],
  );

  const stop = useCallback(() => {
    clearTimer();
    setActiveCode(null);
    setSecondsLeft(0);
    setExpired(false);
  }, [clearTimer]);

  const reset = useCallback(() => {
    clearTimer();
    setActiveCode(null);
    setSecondsLeft(0);
    setExpired(false);
    setStartError(null);
  }, [clearTimer]);

  return {
    activeCode,
    secondsLeft,
    expired,
    starting,
    startError,
    start,
    stop,
    reset,
  };
}

// ---------- Student: verify code ----------
interface UseVerifyCodeResult {
  verifying: boolean;
  error: string | null;
  record: AttendanceRecord | null;
  verify: (courseId: string, code: string) => Promise<AttendanceRecord | null>;
  reset: () => void;
}

export function useVerifyCode(): UseVerifyCodeResult {
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [record, setRecord] = useState<AttendanceRecord | null>(null);

  const verify = useCallback(
    async (courseId: string, code: string): Promise<AttendanceRecord | null> => {
      setVerifying(true);
      setError(null);
      try {
        const result = await apiVerifyCode(courseId, code.trim().toUpperCase());
        setRecord(result.record);
        return result.record;
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Could not verify code.');
        return null;
      } finally {
        setVerifying(false);
      }
    },
    [],
  );

  const reset = useCallback(() => {
    setError(null);
    setRecord(null);
  }, []);

  return { verifying, error, record, verify, reset };
}

// ---------- Teacher: manual marking ----------
interface UseManualAttendanceResult {
  marks: Record<string, boolean>;
  setMark: (studentId: string, present: boolean) => void;
  setAll: (present: boolean, course: Course) => void;
  presentCount: number;
  totalCount: number;
  submitting: boolean;
  error: string | null;
  submit: (courseId: string) => Promise<boolean>;
  reset: (course?: Course) => void;
}

export function useManualAttendance(course: Course | null): UseManualAttendanceResult {
  const [marks, setMarks] = useState<Record<string, boolean>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initialize marks whenever course changes (default everyone absent).
  useEffect(() => {
    if (!course) {
      setMarks({});
      return;
    }
    setMarks((prev) => {
      const next: Record<string, boolean> = {};
      for (const s of course.enrolledStudents) {
        next[s.id] = prev[s.id] ?? false;
      }
      return next;
    });
  }, [course]);

  const setMark = useCallback((studentId: string, present: boolean) => {
    setMarks((prev) => ({ ...prev, [studentId]: present }));
  }, []);

  const setAll = useCallback((present: boolean, c: Course) => {
    const next: Record<string, boolean> = {};
    for (const s of c.enrolledStudents) next[s.id] = present;
    setMarks(next);
  }, []);

  const presentCount = Object.values(marks).filter(Boolean).length;
  const totalCount = course?.enrolledStudents.length ?? 0;

  const submit = useCallback(
    async (courseId: string): Promise<boolean> => {
      setSubmitting(true);
      setError(null);
      try {
        const records = Object.entries(marks).map(([studentId, present]) => ({
          studentId,
          present,
        }));
        await apiSubmitManual(courseId, records);
        return true;
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Failed to submit attendance.');
        return false;
      } finally {
        setSubmitting(false);
      }
    },
    [marks],
  );

  const reset = useCallback((c?: Course) => {
    if (!c) {
      setMarks({});
      return;
    }
    const next: Record<string, boolean> = {};
    for (const s of c.enrolledStudents) next[s.id] = false;
    setMarks(next);
    setError(null);
  }, []);

  return {
    marks,
    setMark,
    setAll,
    presentCount,
    totalCount,
    submitting,
    error,
    submit,
    reset,
  };
}

// ---------- Student: dashboard ----------
interface UseStudentDashboardResult {
  courses: DashboardCourse[];
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useStudentDashboard(): UseStudentDashboardResult {
  const [courses, setCourses] = useState<DashboardCourse[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (showSpinner: boolean) => {
    if (showSpinner) setLoading(true);
    else setRefreshing(true);
    setError(null);
    try {
      const list = await apiStudentDashboard();
      setCourses(Array.isArray(list) ? list : []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load dashboard.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load(true);
  }, [load]);

  const refresh = useCallback(() => load(false), [load]);

  return { courses, loading, refreshing, error, refresh };
}

// ---------- Teacher: live attendance for a course ----------
interface UseCourseAttendanceResult {
  records: Record<string, Record<string, AttendanceRecord>>;
  dates: string[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useCourseAttendance(
  courseId: string | undefined,
  pollMs: number | null = null,
): UseCourseAttendanceResult {
  const [records, setRecords] = useState<Record<string, Record<string, AttendanceRecord>>>({});
  const [dates, setDates] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!courseId) return;
    try {
      const result = await apiCourseAttendance(courseId);
      setRecords(result.records ?? {});
      setDates(result.dates ?? []);
      setError(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load attendance.');
    } finally {
      setLoading(false);
    }
  }, [courseId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!pollMs || !courseId) return;
    const id = setInterval(() => {
      void load();
    }, pollMs);
    return () => clearInterval(id);
  }, [pollMs, courseId, load]);

  return { records, dates, loading, error, refresh: load };
}
