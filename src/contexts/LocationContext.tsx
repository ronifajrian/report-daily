// src/contexts/LocationContext.tsx
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useToast } from '@/hooks/use-toast';

type LocationStatus = 'idle' | 'loading' | 'success' | 'error' | 'denied';

interface LocationData {
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: number;
}

interface LocationContextType {
  location: LocationData | null;
  status: LocationStatus;
  errorMsg: string | null;
  requestLocation: () => Promise<LocationData>;
  openPermissionHelp: () => void;
  isHelpOpen: boolean;
  setIsHelpOpen: (open: boolean) => void;
}

const LocationContext = createContext<LocationContextType | undefined>(undefined);

export const LocationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [location, setLocation] = useState<LocationData | null>(null);
  const [status, setStatus] = useState<LocationStatus>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const { toast } = useToast();

  const requestLocation = useCallback(async (): Promise<LocationData> => {
    setStatus('loading');
    setErrorMsg(null);

    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        const msg = 'Geolocation is not supported by your browser';
        setStatus('error');
        setErrorMsg(msg);
        reject(new Error(msg));
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (position) => {
          const data = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
            timestamp: position.timestamp,
          };
          setLocation(data);
          setStatus('success');
          resolve(data);
        },
        (error) => {
          let msg = 'Unable to retrieve location.';
          let newStatus: LocationStatus = 'error';

          switch (error.code) {
            case error.PERMISSION_DENIED:
              msg = 'Location permission denied.';
              newStatus = 'denied';
              setIsHelpOpen(true); // Auto trigger help modal
              break;
            case error.POSITION_UNAVAILABLE:
              msg = 'Location information is unavailable. Check GPS.';
              break;
            case error.TIMEOUT:
              msg = 'Location request timed out.';
              break;
          }

          setStatus(newStatus);
          setErrorMsg(msg);
          
          if (newStatus !== 'denied') {
             toast({
                title: 'Location Error',
                description: msg,
                variant: 'destructive',
             });
          }
          
          reject(new Error(msg));
        },
        {
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 10000, // Cache 10 detik
        }
      );
    });
  }, [toast]);

  // Auto check permission saat mount (Optional, supaya lebih cepat)
  useEffect(() => {
    if (navigator.permissions && navigator.permissions.query) {
      navigator.permissions.query({ name: 'geolocation' as PermissionName }).then((result) => {
        if (result.state === 'granted') requestLocation();
        else if (result.state === 'denied') setStatus('denied');
      });
    } else {
        // Fallback langsung request agar browser memunculkan prompt native
        requestLocation().catch(() => {});
    }
  }, [requestLocation]);

  return (
    <LocationContext.Provider 
      value={{ 
        location, status, errorMsg, requestLocation,
        openPermissionHelp: () => setIsHelpOpen(true),
        isHelpOpen, setIsHelpOpen
      }}
    >
      {children}
    </LocationContext.Provider>
  );
};

export const useLocation = () => {
  const context = useContext(LocationContext);
  if (context === undefined) {
    throw new Error('useLocation must be used within a LocationProvider');
  }
  return context;
};