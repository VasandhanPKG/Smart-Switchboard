export type DeviceStatus = 'ON' | 'OFF';
// Make DeviceName a generic string to allow for dynamic devices
export type DeviceName = string;
export type VoiceAction = DeviceStatus | 'TOGGLE';
export type View = 'dashboard' | 'modes' | 'scheduler' | 'profile';

// Update DevicesState to be an index signature for dynamic keys
export interface DevicesState {
  [key: string]: DeviceStatus;
}

export interface SensorsState {
  temperature: number;
  humidity: number;
  ldr: number;
  motion: 0 | 1;
}

export interface Schedule {
  id: string;
  device: DeviceName;
  action: DeviceStatus;
  time: string; // "HH:MM"
}

export interface Timer {
  id: string;
  device: DeviceName;
  action: DeviceStatus;
  endTime: number; // JS timestamp (milliseconds)
}

export interface Notification {
  id: string;
  message: string;
  type: 'warning' | 'error' | 'info';
  timestamp: number;
}