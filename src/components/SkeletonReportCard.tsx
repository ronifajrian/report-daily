import React from 'react';

export default function SkeletonReportCard() {
  return (
    <div className="w-full animate-pulse">
      <div className="flex items-start gap-3 p-4 bg-card rounded-2xl shadow-sm">
        <div className="h-10 w-10 rounded-full bg-muted" />
        <div className="flex-1 space-y-2">
          <div className="h-4 w-3/4 rounded bg-muted" />
          <div className="h-3 w-1/2 rounded bg-muted" />
          <div className="h-20 rounded bg-muted" />
        </div>
      </div>
    </div>
  );
}
