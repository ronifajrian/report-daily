import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import ReportForm from './ReportForm';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface CreateReportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export const CreateReportModal = ({ open, onOpenChange, onSuccess }: CreateReportModalProps) => {
  const handleSuccess = () => {
    onSuccess();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl h-[90vh] sm:h-auto overflow-y-auto p-0">
        <DialogHeader className="sticky top-0 bg-background z-10 p-6 pb-4 border-b">
          <div className="flex items-center justify-between">
            <DialogTitle>Create Report</DialogTitle>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onOpenChange(false)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </DialogHeader>
        <div className="p-6 pt-4">
          <ReportForm onSuccess={handleSuccess} />
        </div>
      </DialogContent>
    </Dialog>
  );
};
