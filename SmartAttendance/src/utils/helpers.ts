import { ENROLL_LINK_BASE } from './constants';

export function getInitial(name: string): string {
  if (!name || typeof name !== 'string') return '?';
  const trimmed = name.trim();
  if (trimmed.length === 0) return '?';
  return trimmed.charAt(0).toUpperCase();
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

function toDate(d: Date | string): Date {
  return d instanceof Date ? d : new Date(d);
}

export function formatDate(d: Date | string): string {
  const date = toDate(d);
  if (isNaN(date.getTime())) return '';
  const y = date.getFullYear();
  const m = pad2(date.getMonth() + 1);
  const day = pad2(date.getDate());
  return `${y}-${m}-${day}`;
}

export function formatTime(d: Date | string): string {
  const date = toDate(d);
  if (isNaN(date.getTime())) return '';
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

export type AttendanceStatus = 'good' | 'warning' | 'danger';

export function pctColor(pct: number): AttendanceStatus {
  if (pct >= 75) return 'good';
  if (pct >= 50) return 'warning';
  return 'danger';
}

export function enrollLink(courseId: string): string {
  return `${ENROLL_LINK_BASE}${courseId}`;
}

const COLOR_PALETTE: readonly string[] = [
  'bg-rose-500',
  'bg-pink-500',
  'bg-fuchsia-500',
  'bg-purple-500',
  'bg-violet-500',
  'bg-indigo-500',
  'bg-blue-500',
  'bg-sky-500',
  'bg-cyan-500',
  'bg-teal-500',
  'bg-emerald-500',
  'bg-green-500',
  'bg-lime-500',
  'bg-amber-500',
  'bg-orange-500',
  'bg-red-500',
] as const;

// Generate a random 6-character alphanumeric code for the instructor-code
// attendance method. Excludes ambiguous characters (0/O, 1/I/L) to make the
// code easier for students to read off a projector or whiteboard.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function generateAttendanceCode(length = 6): string {
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += CODE_ALPHABET.charAt(Math.floor(Math.random() * CODE_ALPHABET.length));
  }
  return out;
}

export function randomColor(seed: string): string {
  if (!seed) return COLOR_PALETTE[0];
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  const idx = Math.abs(hash) % COLOR_PALETTE.length;
  return COLOR_PALETTE[idx];
}
