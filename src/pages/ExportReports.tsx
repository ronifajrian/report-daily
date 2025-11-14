import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Download, ArrowLeft, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import * as XLSX from 'xlsx';
import { useAuth } from '@/hooks/useAuth';

export default function ExportReports() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [selectedYear, setSelectedYear] = useState<string>(new Date().getFullYear().toString());
  const [selectedMonth, setSelectedMonth] = useState<string>((new Date().getMonth() + 1).toString());
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  // Generate years (current year and 5 years back)
  const years = Array.from({ length: 6 }, (_, i) => {
    const year = new Date().getFullYear() - i;
    return year.toString();
  });

  const months = [
    { value: '1', label: 'Januari' },
    { value: '2', label: 'Februari' },
    { value: '3', label: 'Maret' },
    { value: '4', label: 'April' },
    { value: '5', label: 'Mei' },
    { value: '6', label: 'Juni' },
    { value: '7', label: 'Juli' },
    { value: '8', label: 'Agustus' },
    { value: '9', label: 'September' },
    { value: '10', label: 'Oktober' },
    { value: '11', label: 'November' },
    { value: '12', label: 'Desember' },
  ];

  const handleExport = async () => {
    setLoading(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error('Not authenticated');
      }

      // Calculate start and end date of the selected month
      const year = parseInt(selectedYear);
      const month = parseInt(selectedMonth);
      const startDate = new Date(year, month - 1, 1);
      const endDate = new Date(year, month, 0, 23, 59, 59, 999);

      const params = new URLSearchParams();
      params.append('startDate', startDate.toISOString());
      params.append('endDate', endDate.toISOString());

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/export-reports?${params.toString()}`,
        {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to export');
      }

      const result = await response.json();

      if (!result.data || result.data.length === 0) {
        toast({
          title: 'Tidak ada data',
          description: 'Tidak ada laporan pada periode yang dipilih',
          variant: 'destructive',
        });
        setLoading(false);
        return;
      }

      // Create Excel file using xlsx
      const ws = XLSX.utils.json_to_sheet(result.data);
      
      // Set column widths
      ws['!cols'] = [
        { wch: 12 }, // Tanggal
        { wch: 25 }, // Nama BR
        { wch: 50 }, // Kegiatan
      ];

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Laporan');

      // Generate filename
      const monthName = months.find(m => m.value === selectedMonth)?.label || '';
      const filename = `Reporting - ${selectedYear} ${monthName}.xlsx`;

      // Download file
      XLSX.writeFile(wb, filename);

      toast({
        title: 'Export berhasil',
        description: `${result.count} laporan berhasil diexport`,
      });

      // Navigate back after successful export
      setTimeout(() => navigate('/dashboard'), 1500);
    } catch (error: any) {
      console.error('Export error:', error);
      toast({
        title: 'Export gagal',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container max-w-2xl mx-auto px-4 py-8">
        <Button
          variant="ghost"
          onClick={() => navigate('/dashboard')}
          className="mb-6 gap-2"
        >
          <ArrowLeft className="h-4 w-4" />
          Kembali ke Dashboard
        </Button>

        <div className="bg-card rounded-lg border p-6 space-y-6">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Export Laporan ke Excel</h1>
            <p className="text-muted-foreground mt-2">
              Pilih periode bulan untuk export laporan
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Tahun</label>
              <Select value={selectedYear} onValueChange={setSelectedYear}>
                <SelectTrigger>
                  <SelectValue placeholder="Pilih tahun" />
                </SelectTrigger>
                <SelectContent>
                  {years.map((year) => (
                    <SelectItem key={year} value={year}>
                      {year}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Bulan</label>
              <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                <SelectTrigger>
                  <SelectValue placeholder="Pilih bulan" />
                </SelectTrigger>
                <SelectContent className="max-h-60">
                  {months.map((month) => (
                    <SelectItem key={month.value} value={month.value}>
                      {month.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <p className="text-sm text-muted-foreground">
            Laporan akan diexport untuk periode bulan yang dipilih
          </p>

          <Button
            onClick={handleExport}
            disabled={loading}
            className="w-full"
            size="lg"
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Mengexport...
              </>
            ) : (
              <>
                <Download className="mr-2 h-4 w-4" />
                Export ke Excel
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}