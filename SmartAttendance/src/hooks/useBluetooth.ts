import { useCallback, useEffect, useRef, useState } from 'react';
import {
  startTeacherBroadcast,
  stopTeacherBroadcast,
  scanForCourse,
  initBle,
} from '@/services/bluetooth';
import { submitBluetoothAttendance } from '@/services/api';

// ---------- Teacher: broadcast ----------
interface UseTeacherBroadcastResult {
  broadcasting: boolean;
  starting: boolean;
  fallback: boolean;
  deviceId: string | null;
  error: string | null;
  start: (courseId: string) => Promise<void>;
  stop: (courseId: string) => Promise<void>;
}

export function useTeacherBroadcast(): UseTeacherBroadcastResult {
  const [broadcasting, setBroadcasting] = useState(false);
  const [starting, setStarting] = useState(false);
  const [fallback, setFallback] = useState(false);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const courseRef = useRef<string | null>(null);

  const start = useCallback(async (courseId: string) => {
    setStarting(true);
    setError(null);
    courseRef.current = courseId;
    try {
      const result = await startTeacherBroadcast(courseId);
      setBroadcasting(result.ok);
      setFallback(result.fallback);
      setDeviceId(result.deviceId);
      if (result.error) setError(result.error);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to start broadcast.');
    } finally {
      setStarting(false);
    }
  }, []);

  const stop = useCallback(async (courseId: string) => {
    try {
      await stopTeacherBroadcast(courseId);
    } finally {
      setBroadcasting(false);
      setFallback(false);
      setDeviceId(null);
    }
  }, []);

  // Best-effort cleanup if the screen unmounts while broadcasting.
  useEffect(() => {
    return () => {
      if (broadcasting && courseRef.current) {
        void stopTeacherBroadcast(courseRef.current);
      }
    };
    // We intentionally only respond to broadcasting changes here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [broadcasting]);

  return { broadcasting, starting, fallback, deviceId, error, start, stop };
}

// ---------- Student: scan ----------
type ScanStatus = 'idle' | 'scanning' | 'found' | 'not_found' | 'error' | 'submitting' | 'success';

interface UseStudentScanResult {
  status: ScanStatus;
  error: string | null;
  foundDeviceId: string | null;
  scan: (courseId: string, timeoutMs?: number) => Promise<boolean>;
  reset: () => void;
}

export function useStudentScan(): UseStudentScanResult {
  const [status, setStatus] = useState<ScanStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [foundDeviceId, setFoundDeviceId] = useState<string | null>(null);

  const scan = useCallback(
    async (courseId: string, timeoutMs = 15000): Promise<boolean> => {
      setStatus('scanning');
      setError(null);
      setFoundDeviceId(null);
      try {
        await initBle();
        const peripheral = await scanForCourse(
          courseId,
          (deviceId) => setFoundDeviceId(deviceId),
          timeoutMs,
        );
        if (!peripheral) {
          setStatus('not_found');
          return false;
        }
        setStatus('submitting');
        const result = await submitBluetoothAttendance(courseId, peripheral.id);
        if (result.success) {
          setStatus('success');
          return true;
        }
        setError('Server did not accept attendance.');
        setStatus('error');
        return false;
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Scan failed.');
        setStatus('error');
        return false;
      }
    },
    [],
  );

  const reset = useCallback(() => {
    setStatus('idle');
    setError(null);
    setFoundDeviceId(null);
  }, []);

  return { status, error, foundDeviceId, scan, reset };
}
