
import React, { useState, useEffect, useCallback } from 'react';
import { database, auth } from './firebase'; // Use centralized firebase instance
import { ref, onValue, update, get, DataSnapshot, set } from 'firebase/database';
import { onAuthStateChanged, signOut, User } from 'firebase/auth';
import { DeviceControlCard } from './components/DeviceControlCard';
import { SensorCard } from './components/SensorCard';
import { Header } from './components/Header';
import { Scheduler } from './components/Scheduler';
import { VoiceControl } from './components/VoiceControl';
import { Navbar } from './components/Navbar';
import { Modes } from './components/Modes';
import { NotificationCenter } from './components/NotificationCenter';
import { AddDeviceModal } from './components/AddDeviceModal';
import { Auth } from './components/Auth';
import { Profile } from './components/Profile';
import { LandingPage } from './components/LandingPage';
import { Thermometer, Droplet, Sun, Eye, PlusCircle } from 'lucide-react';
import type { DevicesState, SensorsState, DeviceName, DeviceStatus, VoiceAction, View, Notification as NotificationType } from './types';

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [showAuthPage, setShowAuthPage] = useState(false);
  const [devices, setDevices] = useState<DevicesState | null>(null);
  const [sensors, setSensors] = useState<SensorsState | null>(null);
  const [dataLoading, setDataLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<View>('dashboard');
  const [notifications, setNotifications] = useState<NotificationType[]>([]);
  const [isAddDeviceModalOpen, setIsAddDeviceModalOpen] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (!currentUser) {
        // If user logs out, show landing page, not auth page
        setShowAuthPage(false);
      }
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const addNotification = useCallback((message: string, type: NotificationType['type']) => {
    setNotifications(prev => {
        if (prev.some(n => n.message === message)) return prev;
        const newNotification: NotificationType = {
            id: crypto.randomUUID(), message, type, timestamp: Date.now(),
        };
        return [newNotification, ...prev].slice(0, 5);
    });
  }, []);

  const removeNotification = useCallback((id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  }, []);

  useEffect(() => {
    if (!user) {
      setDevices(null);
      setSensors(null);
      setDataLoading(false);
      return;
    }
    
    setDataLoading(true);

    const devicesRef = ref(database, 'devices');
    const sensorsRef = ref(database, 'sensors');

    // If data doesn't exist at the root, initialize it with default values.
    const initializeData = async () => {
      const [devicesSnap, sensorsSnap] = await Promise.all([get(devicesRef), get(sensorsRef)]);
      if (!devicesSnap.exists()) {
        console.log("No devices data found, initializing with defaults.");
        await set(devicesRef, { led_red: 'OFF', led_blue: 'OFF', relay1: 'OFF', relay2: 'OFF' });
      }
      if (!sensorsSnap.exists()) {
        console.log("No sensors data found, initializing with defaults.");
        await set(sensorsRef, { temperature: 25, humidity: 60, ldr: 500, motion: 0 });
      }
    };

    let unsubscribeDevices: () => void;
    let unsubscribeSensors: () => void;
    
    initializeData().then(() => {
        const onDevicesValue = (snapshot: DataSnapshot) => {
          setDevices(snapshot.val());
          setDataLoading(false);
        };
        const onError = (err: Error) => {
          console.error(err);
          setError('Failed to fetch data. Please check your connection.');
          setDataLoading(false);
        };

        unsubscribeDevices = onValue(devicesRef, onDevicesValue, onError);
        unsubscribeSensors = onValue(sensorsRef, (snapshot) => setSensors(snapshot.val()), onError);
    }).catch(err => {
        console.error("Data initialization failed:", err);
        setError("Failed to initialize dashboard data.");
        setDataLoading(false);
    });

    return () => {
      if (unsubscribeDevices) unsubscribeDevices();
      if (unsubscribeSensors) unsubscribeSensors();
    };
  }, [user]);
  
  // Fault detection effect
  useEffect(() => {
    if (!sensors) return;
    if (sensors.temperature > 50) addNotification(`High Temperature Alert: ${sensors.temperature}°C`, 'warning');
    if (sensors.humidity > 90) addNotification(`High Humidity Alert: ${sensors.humidity}%`, 'warning');
  }, [sensors, addNotification]);

  const handleDeviceToggle = useCallback(async (deviceName: DeviceName, currentStatus: DeviceStatus) => {
    if (!user) return;
    const newStatus = currentStatus === 'ON' ? 'OFF' : 'ON';
    try {
      await update(ref(database), { [`/devices/${deviceName}`]: newStatus });
    } catch (e) {
      console.error("Failed to update device state:", e);
      addNotification('Failed to update device. Check connection.', 'error');
    }
  }, [user, addNotification]);

  const handleAddNewDevice = useCallback(async (deviceId: DeviceName) => {
    if (!user) return;
    try {
      await update(ref(database), { [`/devices/${deviceId}`]: 'OFF' });
      addNotification(`Successfully added device: ${deviceId}`, 'info');
    } catch (e) {
      console.error("Failed to add new device:", e);
      addNotification(`Failed to add device: ${deviceId}.`, 'error');
    }
  }, [user, addNotification]);

  const handleSetDeviceState = useCallback(async (deviceName: DeviceName, newStatus: DeviceStatus) => {
    if (!user) return;
    try {
      await update(ref(database), { [`/devices/${deviceName}`]: newStatus });
    } catch (e) {
      console.error("Failed to set device state:", e);
      addNotification(`Failed to set ${deviceName}. Check connection.`, 'error');
    }
  }, [user, addNotification]);

  const handleSetMode = useCallback(async (settings: Partial<DevicesState>) => {
    if (!user) return;
    try {
      const updates: { [key: string]: DeviceStatus } = {};
      for (const key in settings) {
        updates[`/devices/${key}`] = settings[key as keyof DevicesState] as DeviceStatus;
      }
      await update(ref(database), updates);
    } catch (e) {
      console.error("Failed to set mode:", e);
      addNotification('Failed to set mode. Check connection.', 'error');
    }
  }, [user, addNotification]);

  const handleVoiceCommand = useCallback((device: DeviceName, action: VoiceAction) => {
    if (action === 'TOGGLE') {
      const currentStatus = devices?.[device];
      if (typeof currentStatus !== 'undefined') handleDeviceToggle(device, currentStatus);
    } else {
      handleSetDeviceState(device, action);
    }
  }, [devices, handleDeviceToggle, handleSetDeviceState]);

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Error signing out: ", error);
      addNotification("Failed to log out.", "error");
    }
  };

  const getSensorValue = (sensor: keyof SensorsState) => {
    if (!sensors) return 'N/A';
    if (sensor === 'motion') return sensors.motion === 1 ? 'Detected' : 'Clear';
    return sensors[sensor]?.toString() ?? 'N/A';
  };
  
  const getSensorUnit = (sensor: keyof SensorsState) => {
      switch (sensor) {
          case 'temperature': return '°C';
          case 'humidity': return '%';
          case 'ldr': return '';
          default: return '';
      }
  };

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-900">
        <div className="text-xl text-cyan-400">Authenticating...</div>
      </div>
    );
  }

  if (!user) {
    return showAuthPage ? <Auth onShowLanding={() => setShowAuthPage(false)} /> : <LandingPage onShowAuth={() => setShowAuthPage(true)} />;
  }
  
  if (dataLoading) {
     return (
      <div className="flex items-center justify-center min-h-screen bg-gray-900">
        <div className="text-xl text-cyan-400">Connecting to Switchboard...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-900">
        <div className="text-xl text-red-500">{error}</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 p-4 sm:p-6 lg:p-8 font-sans">
      <div className="max-w-7xl mx-auto">
        <Header 
          user={user} 
          onLogout={handleLogout} 
          onTestNotificationClick={() => addNotification('This is a test notification!', 'info')} 
        />
        <Navbar currentView={view} setView={setView} />

        <main className="mt-8">
            {view === 'dashboard' && (
                <>
                    <section aria-labelledby="controls-heading">
                        <div className="flex justify-between items-center mb-4">
                            <h2 id="controls-heading" className="text-2xl font-bold text-cyan-300">Controls</h2>
                            <button
                                onClick={() => setIsAddDeviceModalOpen(true)}
                                className="flex items-center gap-2 bg-cyan-600 hover:bg-cyan-500 text-sm text-white font-semibold py-2 px-3 rounded-lg transition-colors"
                            >
                                <PlusCircle size={16} />
                                <span className="hidden sm:inline">Add Device</span>
                                <span className="sm:hidden">Add</span>
                            </button>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                            {devices && Object.entries(devices).map(([key, status]) => (
                                <DeviceControlCard
                                    key={key}
                                    name={key}
                                    status={status}
                                    onToggle={() => handleDeviceToggle(key, status)}
                                />
                            ))}
                        </div>
                    </section>
                    <section aria-labelledby="sensors-heading" className="mt-12">
                        <h2 id="sensors-heading" className="text-2xl font-bold text-cyan-300 mb-4">Live Sensor Readings</h2>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                            <SensorCard name="Temperature" value={getSensorValue('temperature')} unit={getSensorUnit('temperature')} icon={<Thermometer className="w-8 h-8 text-red-400" />} />
                            <SensorCard name="Humidity" value={getSensorValue('humidity')} unit={getSensorUnit('humidity')} icon={<Droplet className="w-8 h-8 text-blue-400" />} />
                            <SensorCard name="Light Level (LDR)" value={getSensorValue('ldr')} unit={getSensorUnit('ldr')} icon={<Sun className="w-8 h-8 text-yellow-400" />} />
                            <SensorCard name="Motion" value={getSensorValue('motion')} unit={getSensorUnit('motion')} icon={<Eye className="w-8 h-8 text-purple-400" />} />
                        </div>
                    </section>
                </>
            )}

            {view === 'modes' && (
                <section aria-labelledby="modes-heading">
                    <h2 id="modes-heading" className="text-2xl font-bold text-cyan-300 mb-4">Device Modes</h2>
                    <Modes onSetMode={handleSetMode} />
                </section>
            )}

            {view === 'scheduler' && (
                <section aria-labelledby="scheduler-heading">
                    <h2 id="scheduler-heading" className="text-2xl font-bold text-cyan-300 mb-4">Scheduler & Timers</h2>
                    <Scheduler setDeviceState={handleSetDeviceState} devices={devices} />
                </section>
            )}

            {view === 'profile' && (
                <Profile user={user} onLogout={handleLogout} />
            )}
        </main>
      </div>
      <VoiceControl onCommand={handleVoiceCommand} />
      <NotificationCenter notifications={notifications} onDismiss={removeNotification} />
       <AddDeviceModal 
        isOpen={isAddDeviceModalOpen}
        onClose={() => setIsAddDeviceModalOpen(false)}
        onSave={handleAddNewDevice}
        existingDeviceIds={devices ? Object.keys(devices) : []}
      />
    </div>
  );
};

export default App;
