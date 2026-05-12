import { Platform } from 'react-native';
import { BLE_SERVICE_PREFIX } from '@/utils/constants';
import { startBluetoothSession, stopBluetoothSession } from './api';

interface BleManagerLike {
  start: (opts?: { showAlert?: boolean }) => Promise<void>;
  scan: (
    serviceUUIDs: string[],
    seconds: number,
    allowDuplicates?: boolean,
  ) => Promise<void>;
  stopScan: () => Promise<void>;
  startAdvertising?: (data: {
    name?: string;
    serviceUUIDs?: string[];
  }) => Promise<void>;
  stopAdvertising?: () => Promise<void>;
}

interface DiscoveredPeripheral {
  id: string;
  name?: string | null;
  advertising?: {
    localName?: string;
    manufacturerData?: unknown;
    serviceUUIDs?: string[];
  };
}

let bleManager: BleManagerLike | null = null;
let bleEmitter: { addListener: (event: string, cb: (...args: unknown[]) => void) => { remove: () => void } } | null = null;
let initialized = false;
let advertising = false;

function loadBle(): { manager: BleManagerLike | null; emitter: typeof bleEmitter } {
  if (bleManager) return { manager: bleManager, emitter: bleEmitter };
  try {
    // Lazy require so the file can load even when the native module is unavailable.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('react-native-ble-manager');
    const manager: BleManagerLike = mod?.default ?? mod;
    bleManager = manager;
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { NativeEventEmitter, NativeModules } = require('react-native');
      const native = NativeModules?.BleManager;
      if (native) {
        bleEmitter = new NativeEventEmitter(native);
      }
    } catch {
      bleEmitter = null;
    }
    return { manager: bleManager, emitter: bleEmitter };
  } catch (e) {
    if (__DEV__) {
      // eslint-disable-next-line no-console
      console.warn('[bluetooth] react-native-ble-manager not available:', e);
    }
    return { manager: null, emitter: null };
  }
}

export async function initBle(): Promise<boolean> {
  if (initialized) return true;
  const { manager } = loadBle();
  if (!manager) return false;
  try {
    await manager.start({ showAlert: false });
    initialized = true;
    return true;
  } catch (e) {
    if (__DEV__) {
      // eslint-disable-next-line no-console
      console.warn('[bluetooth] init failed:', e);
    }
    return false;
  }
}

function buildLocalName(courseId: string): string {
  const safe = courseId.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 16);
  return `${BLE_SERVICE_PREFIX}${safe}`;
}

export async function startTeacherBroadcast(courseId: string): Promise<{
  ok: boolean;
  fallback: boolean;
  deviceId: string;
  error?: string;
}> {
  await initBle();
  const { manager } = loadBle();
  const deviceId = buildLocalName(courseId);

  // Always also notify backend so students can verify even if pure BLE adv isn't possible.
  try {
    await startBluetoothSession(courseId, deviceId);
  } catch (e) {
    if (__DEV__) {
      // eslint-disable-next-line no-console
      console.warn('[bluetooth] backend session start failed:', e);
    }
  }

  if (!manager || typeof manager.startAdvertising !== 'function') {
    if (__DEV__) {
      // eslint-disable-next-line no-console
      console.warn(
        '[bluetooth] BLE advertising not supported on this platform/device — using backend session fallback.',
      );
    }
    return {
      ok: true,
      fallback: true,
      deviceId,
      error: 'BLE advertising unavailable; using backend session fallback.',
    };
  }

  try {
    await manager.startAdvertising({ name: deviceId, serviceUUIDs: [] });
    advertising = true;
    return { ok: true, fallback: false, deviceId };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (__DEV__) {
      // eslint-disable-next-line no-console
      console.warn('[bluetooth] startAdvertising failed:', msg);
    }
    return { ok: true, fallback: true, deviceId, error: msg };
  }
}

export async function stopTeacherBroadcast(courseId?: string): Promise<void> {
  const { manager } = loadBle();
  if (manager && typeof manager.stopAdvertising === 'function' && advertising) {
    try {
      await manager.stopAdvertising();
    } catch (e) {
      if (__DEV__) {
        // eslint-disable-next-line no-console
        console.warn('[bluetooth] stopAdvertising failed:', e);
      }
    }
    advertising = false;
  }
  if (courseId) {
    try {
      await stopBluetoothSession(courseId);
    } catch (e) {
      if (__DEV__) {
        // eslint-disable-next-line no-console
        console.warn('[bluetooth] backend session stop failed:', e);
      }
    }
  }
}

function peripheralMatchesCourse(
  p: DiscoveredPeripheral,
  courseId: string,
): boolean {
  const target = buildLocalName(courseId).toLowerCase();
  const candidates: string[] = [];
  if (p.name) candidates.push(p.name);
  if (p.advertising?.localName) candidates.push(p.advertising.localName);
  return candidates.some((c) => c.toLowerCase().includes(target.toLowerCase()));
}

export async function scanForCourse(
  courseId: string,
  onFound: (deviceId: string, peripheral: DiscoveredPeripheral) => void,
  timeoutMs = 15000,
): Promise<DiscoveredPeripheral | null> {
  await initBle();
  const { manager, emitter } = loadBle();
  if (!manager || !emitter) {
    if (__DEV__) {
      // eslint-disable-next-line no-console
      console.warn('[bluetooth] scan unavailable — BLE module missing.');
    }
    return null;
  }

  const seconds = Math.ceil(timeoutMs / 1000);

  return new Promise<DiscoveredPeripheral | null>((resolve) => {
    let resolved = false;
    let sub: { remove: () => void } | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const cleanup = async (result: DiscoveredPeripheral | null) => {
      if (resolved) return;
      resolved = true;
      if (sub) {
        try {
          sub.remove();
        } catch {
          // ignore
        }
      }
      if (timer) clearTimeout(timer);
      try {
        await manager.stopScan();
      } catch {
        // ignore
      }
      resolve(result);
    };

    try {
      sub = emitter.addListener('BleManagerDiscoverPeripheral', (...args) => {
        const p = args[0] as DiscoveredPeripheral;
        if (p && peripheralMatchesCourse(p, courseId)) {
          try {
            onFound(p.id, p);
          } catch {
            // ignore consumer errors
          }
          void cleanup(p);
        }
      });
    } catch (e) {
      if (__DEV__) {
        // eslint-disable-next-line no-console
        console.warn('[bluetooth] failed to attach scan listener:', e);
      }
      void cleanup(null);
      return;
    }

    timer = setTimeout(() => {
      void cleanup(null);
    }, timeoutMs);

    manager
      .scan([], seconds, false)
      .catch((e) => {
        if (__DEV__) {
          // eslint-disable-next-line no-console
          console.warn('[bluetooth] scan failed:', e);
        }
        void cleanup(null);
      });
  });
}

export const bluetoothMeta = { platform: Platform.OS, prefix: BLE_SERVICE_PREFIX };
