import { PermissionsAndroid, Platform } from 'react-native';
import { BLE_SERVICE_PREFIX } from '@/utils/constants';
import { startBluetoothSession, stopBluetoothSession } from './api';

// On Android 12+ (API 31+) the BLUETOOTH_SCAN / BLUETOOTH_CONNECT /
// BLUETOOTH_ADVERTISE permissions must be requested at runtime — declaring
// them in app.json/AndroidManifest.xml alone isn't enough. Older Android
// versions instead use ACCESS_FINE_LOCATION for BLE scanning.

type PermissionGroup = 'advertise' | 'scan';

async function ensureBluetoothPermissions(group: PermissionGroup): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  const apiLevel = typeof Platform.Version === 'number' ? Platform.Version : parseInt(String(Platform.Version), 10);

  const perms: string[] = [];
  if (apiLevel >= 31) {
    if (group === 'advertise') {
      perms.push(PermissionsAndroid.PERMISSIONS.BLUETOOTH_ADVERTISE);
      perms.push(PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT);
    } else {
      perms.push(PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN);
      perms.push(PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT);
    }
  } else {
    // Pre-Android-12: scanning needs FINE_LOCATION; advertising is gated by BLUETOOTH_ADMIN
    // which is install-time and already declared in the manifest.
    if (group === 'scan') {
      perms.push(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
    }
  }

  if (perms.length === 0) return true;

  try {
    const result = await PermissionsAndroid.requestMultiple(perms);
    return Object.values(result).every((r) => r === PermissionsAndroid.RESULTS.GRANTED);
  } catch (e) {
    if (__DEV__) {
      // eslint-disable-next-line no-console
      console.warn('[bluetooth] permission request failed:', e);
    }
    return false;
  }
}

// We use two BLE libraries on purpose:
//   - react-native-ble-advertiser → teacher broadcasts (BLE peripheral)
//   - react-native-ble-manager    → student scans     (BLE central)
// Each is lazily required so the file still loads on platforms where
// the native modules aren't linked (e.g. when running in a JS-only test).

// -------------------------------------------------------------------- helpers

interface BleManagerLike {
  start: (opts?: { showAlert?: boolean }) => Promise<void>;
  scan: (
    serviceUUIDs: string[],
    seconds: number,
    allowDuplicates?: boolean,
  ) => Promise<void>;
  stopScan: () => Promise<void>;
}

interface BleAdvertiserLike {
  setCompanyId: (id: number) => void;
  broadcast: (
    uuid: string,
    manufacturerData: number[],
    options?: Record<string, unknown>,
  ) => Promise<unknown>;
  stopBroadcast: () => Promise<unknown>;
}

interface DiscoveredPeripheral {
  id: string;
  name?: string | null;
  advertising?: {
    localName?: string;
    serviceUUIDs?: string[];
  };
}

let bleManager: BleManagerLike | null = null;
let bleEmitter: {
  addListener: (event: string, cb: (...args: unknown[]) => void) => { remove: () => void };
} | null = null;
let bleAdvertiser: BleAdvertiserLike | null = null;
let initialized = false;
let advertising = false;
let advertiserConfigured = false;

function loadCentral(): {
  manager: BleManagerLike | null;
  emitter: typeof bleEmitter;
} {
  if (bleManager) return { manager: bleManager, emitter: bleEmitter };
  try {
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

function loadAdvertiser(): BleAdvertiserLike | null {
  if (bleAdvertiser) return bleAdvertiser;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('react-native-ble-advertiser');
    const advertiser: BleAdvertiserLike = mod?.default ?? mod;
    if (!advertiser || typeof advertiser.broadcast !== 'function') {
      return null;
    }
    bleAdvertiser = advertiser;
    if (!advertiserConfigured) {
      try {
        // 0x00E0 is unassigned in the Bluetooth SIG company-ID list, so it
        // won't collide with real iBeacon / Eddystone broadcasts on the
        // student's scanner. Any 16-bit value would work here.
        advertiser.setCompanyId(0x00e0);
        advertiserConfigured = true;
      } catch (e) {
        if (__DEV__) {
          // eslint-disable-next-line no-console
          console.warn('[bluetooth] setCompanyId failed:', e);
        }
      }
    }
    return bleAdvertiser;
  } catch (e) {
    if (__DEV__) {
      // eslint-disable-next-line no-console
      console.warn(
        '[bluetooth] react-native-ble-advertiser not available — advertising will fall back to backend session only:',
        e,
      );
    }
    return null;
  }
}

export async function initBle(): Promise<boolean> {
  if (initialized) return true;
  const { manager } = loadCentral();
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

// -------------------------------------------------------------- UUID derivation

// Derive a deterministic 128-bit Bluetooth service UUID from a course id.
// Both the teacher's advertiser and the student's scanner derive the same
// UUID for the same course, so detection works without any shared lookup.
export function courseIdToServiceUuid(courseId: string): string {
  let hex = '';
  for (let i = 0; i < courseId.length; i += 1) {
    hex += courseId.charCodeAt(i).toString(16).padStart(2, '0');
  }
  // Pad / truncate to exactly 32 hex characters (128 bits).
  hex = (hex + '0'.repeat(32)).slice(0, 32);
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ]
    .join('-')
    .toUpperCase();
}

function buildLocalName(courseId: string): string {
  const safe = courseId.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 16);
  return `${BLE_SERVICE_PREFIX}${safe}`;
}

// ---------------------------------------------------------------- teacher side

export async function startTeacherBroadcast(courseId: string): Promise<{
  ok: boolean;
  fallback: boolean;
  deviceId: string;
  error?: string;
}> {
  await initBle();
  const deviceId = buildLocalName(courseId);
  const uuid = courseIdToServiceUuid(courseId);

  // Always tell the backend we're starting — this gives us a server-side
  // record of the session so the student API endpoint can validate
  // attendance even on devices where native advertising is unavailable.
  try {
    await startBluetoothSession(courseId, deviceId);
  } catch (e) {
    if (__DEV__) {
      // eslint-disable-next-line no-console
      console.warn('[bluetooth] backend session start failed:', e);
    }
  }

  const advertiser = loadAdvertiser();
  if (!advertiser) {
    return {
      ok: true,
      fallback: true,
      deviceId,
      error:
        'BLE advertising library not available; using backend session fallback.',
    };
  }

  // Android 12+ requires runtime BLUETOOTH_ADVERTISE permission.
  const granted = await ensureBluetoothPermissions('advertise');
  if (!granted) {
    return {
      ok: true,
      fallback: true,
      deviceId,
      error:
        'Bluetooth permission was not granted. Allow Nearby devices in Settings, then try again.',
    };
  }

  try {
    await advertiser.broadcast(uuid, [], {
      advertiseMode: 2, // ADVERTISE_MODE_LOW_LATENCY
      txPowerLevel: 3, // ADVERTISE_TX_POWER_HIGH (~ +1 dBm, best range)
      connectable: false,
      // Drop the device name from the advertising packet — a 128-bit UUID
      // already eats ~18 bytes and the BLE adv packet is capped at 31 bytes.
      // The student scanner matches on UUID anyway.
      includeDeviceName: false,
      includeTxPowerLevel: false,
    });
    advertising = true;
    return { ok: true, fallback: false, deviceId };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (__DEV__) {
      // eslint-disable-next-line no-console
      console.warn('[bluetooth] broadcast failed:', msg);
    }
    return {
      ok: true,
      fallback: true,
      deviceId,
      error: msg,
    };
  }
}

export async function stopTeacherBroadcast(courseId?: string): Promise<void> {
  const advertiser = loadAdvertiser();
  if (advertiser && advertising) {
    try {
      await advertiser.stopBroadcast();
    } catch (e) {
      if (__DEV__) {
        // eslint-disable-next-line no-console
        console.warn('[bluetooth] stopBroadcast failed:', e);
      }
    }
    advertising = false;
  }
  if (courseId) {
    try {
      await stopBluetoothSession(courseId, buildLocalName(courseId));
    } catch (e) {
      if (__DEV__) {
        // eslint-disable-next-line no-console
        console.warn('[bluetooth] backend session stop failed:', e);
      }
    }
  }
}

// ---------------------------------------------------------------- student side

function peripheralMatchesCourse(
  p: DiscoveredPeripheral,
  courseId: string,
): boolean {
  const targetUuid = courseIdToServiceUuid(courseId).toLowerCase();
  const targetName = buildLocalName(courseId).toLowerCase();

  // Match either on the advertised service UUID (preferred, set by the
  // new advertiser library) or on the local name (kept for compatibility
  // with the fallback path).
  const advertisedUuids = (p.advertising?.serviceUUIDs ?? []).map((u) =>
    String(u).toLowerCase(),
  );
  if (advertisedUuids.includes(targetUuid)) return true;

  const candidates: string[] = [];
  if (p.name) candidates.push(p.name);
  if (p.advertising?.localName) candidates.push(p.advertising.localName);
  return candidates.some((c) => c.toLowerCase().includes(targetName));
}

export async function scanForCourse(
  courseId: string,
  onFound: (deviceId: string, peripheral: DiscoveredPeripheral) => void,
  timeoutMs = 15000,
): Promise<DiscoveredPeripheral | null> {
  await initBle();
  const { manager, emitter } = loadCentral();
  if (!manager || !emitter) {
    if (__DEV__) {
      // eslint-disable-next-line no-console
      console.warn('[bluetooth] scan unavailable — BLE manager module missing.');
    }
    return null;
  }

  // Android 12+ requires runtime BLUETOOTH_SCAN/CONNECT. Older versions need
  // ACCESS_FINE_LOCATION. Without these the scan throws synchronously.
  const granted = await ensureBluetoothPermissions('scan');
  if (!granted) {
    if (__DEV__) {
      // eslint-disable-next-line no-console
      console.warn('[bluetooth] scan permission denied');
    }
    return null;
  }

  const seconds = Math.ceil(timeoutMs / 1000);
  const targetUuid = courseIdToServiceUuid(courseId);

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

    // Pass the target service UUID to the scan so the OS can pre-filter
    // matching devices. ble-manager accepts an array of service UUIDs.
    manager.scan([targetUuid], seconds, false).catch(async (e) => {
      // Some Android builds reject filtered scans on older Bluetooth
      // versions — retry once without the filter and let the discover
      // listener filter on local name instead.
      if (__DEV__) {
        // eslint-disable-next-line no-console
        console.warn('[bluetooth] filtered scan failed, retrying open scan:', e);
      }
      try {
        await manager.scan([], seconds, false);
      } catch (e2) {
        if (__DEV__) {
          // eslint-disable-next-line no-console
          console.warn('[bluetooth] open scan also failed:', e2);
        }
        void cleanup(null);
      }
    });
  });
}

export const bluetoothMeta = { platform: Platform.OS, prefix: BLE_SERVICE_PREFIX };
