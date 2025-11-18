// src/components/location/LocationPermissionModal.tsx
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { MapPin, Smartphone, Globe, Lock } from "lucide-react";
import { useLocation } from "@/contexts/LocationContext";
import { useEffect, useState } from "react";

export const LocationPermissionModal = () => {
  const { isHelpOpen, setIsHelpOpen, requestLocation } = useLocation();
  const [deviceType, setDeviceType] = useState<'ios' | 'android' | 'desktop'>('desktop');

  useEffect(() => {
    const ua = navigator.userAgent.toLowerCase();
    if (/iphone|ipad|ipod/.test(ua)) setDeviceType('ios');
    else if (/android/.test(ua)) setDeviceType('android');
  }, []);

  const handleRetry = () => {
    setIsHelpOpen(false);
    requestLocation();
  };

  return (
    <Dialog open={isHelpOpen} onOpenChange={setIsHelpOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="mx-auto bg-destructive/10 p-3 rounded-full mb-2 w-fit">
            <MapPin className="h-6 w-6 text-destructive" />
          </div>
          <DialogTitle className="text-center">Location Required</DialogTitle>
          <DialogDescription className="text-center">
            Kami membutuhkan lokasi Anda untuk validasi laporan.
          </DialogDescription>
        </DialogHeader>

        <div className="bg-muted/50 p-4 rounded-lg text-sm space-y-3 border my-2">
          <p className="font-semibold flex items-center gap-2">
            {deviceType === 'ios' ? <Smartphone className="h-4 w-4"/> : <Globe className="h-4 w-4"/>}
            Cara mengaktifkan di {deviceType === 'ios' ? 'iPhone (Safari)' : deviceType === 'android' ? 'Android (Chrome)' : 'Browser'}:
          </p>
          
          <ol className="list-decimal list-inside space-y-2 text-muted-foreground ml-1">
            {deviceType === 'ios' && (
              <>
                <li>Tap ikon <strong>"Aa"</strong> atau <Lock className="h-3 w-3 inline"/> di address bar</li>
                <li>Pilih <strong>Website Settings</strong></li>
                <li>Set Location ke <strong>Allow</strong></li>
                <li>Refresh halaman ini</li>
              </>
            )}
            {deviceType === 'android' && (
              <>
                <li>Tap ikon <Lock className="h-3 w-3 inline"/> <strong>Gembok</strong> di address bar</li>
                <li>Pilih <strong>Permissions</strong></li>
                <li>Aktifkan <strong>Location</strong></li>
                <li>Klik Reset Permissions jika perlu</li>
              </>
            )}
            {deviceType === 'desktop' && (
              <>
                <li>Klik ikon <Lock className="h-3 w-3 inline"/> <strong>Gembok</strong> di sebelah URL</li>
                <li>Aktifkan toggle <strong>Location</strong></li>
                <li>Reload halaman</li>
              </>
            )}
          </ol>
        </div>

        <Button onClick={handleRetry} className="w-full">Coba Lagi (Saya Sudah Aktifkan)</Button>
      </DialogContent>
    </Dialog>
  );
};