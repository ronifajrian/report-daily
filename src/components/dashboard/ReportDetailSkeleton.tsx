// src/components/dashboard/ReportDetailSkeleton.tsx
// (Anda perlu mengimpor Skeleton dari @/components/ui/skeleton)
import { Skeleton } from "@/components/ui/skeleton";

export const ReportDetailSkeleton = () => {
  return (
    <div className="flex flex-col h-screen">
      {/* Fixed Header Skeleton */}
      <div className="flex-none border-b bg-background">
        <div className="px-4 py-3">
          <div className="flex items-center gap-3 mb-3">
            <Skeleton className="h-9 w-9 rounded-md flex-shrink-0" />
            <Skeleton className="h-6 w-1/2" />
            <Skeleton className="h-7 w-24 rounded-full ml-auto" />
          </div>

          {/* Action Buttons Skeleton */}
          <div className="flex flex-wrap gap-2">
            <Skeleton className="h-9 w-20 rounded-md" />
            <Skeleton className="h-9 w-24 rounded-md" />
            <Skeleton className="h-9 w-20 rounded-md" />
          </div>
        </div>
      </div>

      {/* Scrollable Content Skeleton */}
      <div className="flex-1 overflow-y-auto">
        <div className="px-4 py-6 space-y-6 pb-20">
          
          {/* Description Skeleton */}
          <div className="space-y-3">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-36 w-full rounded-lg" />
            <Skeleton className="h-9 w-36 rounded-md" />
          </div>

          {/* Attachments Skeleton */}
          <div className="space-y-3">
            <Skeleton className="h-4 w-40" />
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              <Skeleton className="aspect-square w-full rounded-lg" />
              <Skeleton className="aspect-square w-full rounded-lg" />
              <Skeleton className="aspect-square w-full rounded-lg" />
              <Skeleton className="aspect-square w-full rounded-lg" />
            </div>
          </div>

          {/* Comments Skeleton */}
          <div className="space-y-3">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-16 w-full rounded-lg" />
            <Skeleton className="h-12 w-full rounded-lg" />
          </div>

        </div>
      </div>
    </div>
  );
};