import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { format } from "date-fns"; // Ditambahkan untuk memformat tanggal absolut

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Updated function to format time like Instagram/Facebook
export function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  const secondsInMinute = 60;
  const secondsInHour = 3600;
  const secondsInDay = 86400;
  
  const diffInMinutes = Math.floor(diffInSeconds / secondsInMinute);
  const diffInHours = Math.floor(diffInSeconds / secondsInHour);
  const diffInDays = Math.floor(diffInSeconds / secondsInDay);

  if (diffInMinutes < 60) {
    // Kurang dari 1 jam: menit lalu (e.g., 5m ago)
    return diffInMinutes <= 0 ? 'Just now' : `${diffInMinutes}m ago`;
  } else if (diffInHours < 24) {
    // Kurang dari 24 jam: jam lalu (e.g., 7h ago)
    return `${diffInHours} hours ago`;
  } else if (diffInDays < 7) {
    // Kurang dari 7 hari: hari lalu (e.g., 3 days ago)
    return `${diffInDays} days ago`;
  } else if (date.getFullYear() === now.getFullYear()) {
    // Di tahun yang sama: Bulan Tanggal (e.g., Nov 12)
    return format(date, 'MMM dd');
  } else {
    // Beda tahun: Bulan Tanggal, Tahun (e.g., Nov 12, 2017)
    return format(date, 'MMM dd, yyyy');
  }
}

export function getInitials(fullName: string): string {
  if (!fullName) return 'NA';
  const parts = fullName.split(' ').filter(part => part.length > 0);
  if (parts.length === 0) return 'NA';
  
  if (parts.length === 1) {
    return parts[0][0].toUpperCase();
  }
  
  // Take the first letter of the first part and the last part
  const firstInitial = parts[0][0];
  const lastInitial = parts[parts.length - 1][0];
  
  return (firstInitial + lastInitial).toUpperCase();
}