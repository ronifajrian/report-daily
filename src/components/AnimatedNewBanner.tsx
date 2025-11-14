import React from 'react';
import { motion } from 'framer-motion';

interface Props {
  count: number;
  onClick: () => void;
}

export default function AnimatedNewBanner({ count, onClick }: Props) {
  if (!count) return null;

  return (
    <motion.button
      initial={{ y: -18, opacity: 0, scale: 0.98 }}
      animate={{ y: 0, opacity: 1, scale: 1 }}
      exit={{ y: -18, opacity: 0, scale: 0.98 }}
      transition={{ type: 'spring', stiffness: 300, damping: 25 }}
      onClick={onClick}
      className="sticky top-3 z-30 mx-auto mt-3 w-fit rounded-full bg-white/95 px-4 py-2 shadow-md border border-gray-100 flex items-center gap-3 focus:outline-none focus:ring-2 focus:ring-primary"
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center gap-2">
        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-primary text-sm font-medium">
          {count}
        </span>
        <div className="text-sm font-medium text-foreground">
          {count} new report{count > 1 ? 's' : ''}
        </div>
        <div className="text-xs text-muted-foreground ml-2">Tap to view</div>
      </div>
    </motion.button>
  );
}
