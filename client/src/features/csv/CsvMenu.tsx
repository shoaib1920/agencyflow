import { useRef, useState } from 'react';
import Papa from 'papaparse';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Download, FileSpreadsheet, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { api, errorMessage } from '@/lib/api';
import { downloadFile } from '@/lib/download';
import type { ApiResponse } from '@/lib/types';

interface ImportResult {
  created: number;
  errors: { row: number; message: string }[];
}

const COLUMNS = {
  clients: ['name', 'company', 'email', 'phone', 'country', 'status', 'notes'],
  leads: ['title', 'contactName', 'company', 'email', 'phone', 'country', 'value', 'stage', 'source', 'notes'],
};

/**
 * Export downloads a CSV from the API. Import parses the file in the browser (Papa Parse),
 * shows a preview, and sends the rows as JSON; the server validates each row with the same
 * Zod schema as the normal create endpoint and reports bad rows by number.
 */
export function CsvMenu({ entity, invalidate }: { entity: 'clients' | 'leads'; invalidate: unknown[] }) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<Record<string, string>[] | null>(null);
  const [fileName, setFileName] = useState('');
  const [result, setResult] = useState<ImportResult | null>(null);

  const doImport = useMutation({
    mutationFn: async () => (await api.post<ApiResponse<ImportResult>>(`/${entity}/import`, { rows })).data,
    onSuccess: (res) => {
      setResult(res.data);
      void qc.invalidateQueries({ queryKey: invalidate });
      void qc.invalidateQueries({ queryKey: ['dashboard'] });
      toast.success(res.message ?? 'Imported');
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const onFile = (file?: File) => {
    if (!file) return;
    setFileName(file.name);
    setResult(null);
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim(),
      complete: (parsed) => {
        if (!parsed.data.length) return toast.error('That file has no rows');
        if (parsed.data.length > 1000) return toast.error('Import up to 1000 rows at a time');
        setRows(parsed.data);
      },
      error: (err) => toast.error(err.message),
    });
  };

  const exportCsv = async () => {
    try {
      await downloadFile(`/${entity}/export`, `${entity}.csv`);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const template = () => {
    const blob = new Blob([`${COLUMNS[entity].join(',')}\n`], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${entity}-template.csv`;
    a.click();
  };

  const close = () => {
    setRows(null);
    setResult(null);
  };
  const preview = rows?.slice(0, 5) ?? [];
  const headers = rows?.length ? Object.keys(rows[0]!) : [];

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline"><FileSpreadsheet /> CSV</Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => fileRef.current?.click()}><Upload /> Import from CSV…</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => void exportCsv()}><Download /> Export all to CSV</DropdownMenuItem>
          <DropdownMenuItem onSelect={template}><FileSpreadsheet /> Download template</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <input
        ref={fileRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={(e) => {
          onFile(e.target.files?.[0]);
          e.target.value = '';
        }}
      />

      <Dialog open={rows !== null} onOpenChange={(o) => !o && close()}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Import {entity}</DialogTitle>
            <DialogDescription>
              {fileName}: {rows?.length ?? 0} rows. Columns used: {COLUMNS[entity].join(', ')}.
            </DialogDescription>
          </DialogHeader>

          {result ? (
            <div className="space-y-3">
              <p className="rounded-md bg-success/10 p-3 text-sm"><b>{result.created}</b> {entity} imported.</p>
              {result.errors.length > 0 && (
                <div>
                  <p className="mb-2 text-sm font-medium">{result.errors.length} row(s) skipped:</p>
                  <ul className="max-h-48 space-y-1 overflow-y-auto rounded-md border p-2 text-xs scrollbar-thin">
                    {result.errors.map((e) => (
                      <li key={e.row}><span className="font-mono">Row {e.row}</span> · {e.message}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-xs">
                <thead className="bg-muted/60">
                  <tr>{headers.map((h) => <th key={h} className="whitespace-nowrap px-2 py-1.5 text-left font-medium">{h}</th>)}</tr>
                </thead>
                <tbody>
                  {preview.map((r, i) => (
                    <tr key={i} className="border-t">
                      {headers.map((h) => <td key={h} className="max-w-40 truncate whitespace-nowrap px-2 py-1.5">{r[h]}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
              {(rows?.length ?? 0) > 5 && <p className="border-t px-2 py-1.5 text-xs text-muted-foreground">…and {(rows?.length ?? 0) - 5} more</p>}
            </div>
          )}

          <DialogFooter>
            {result ? (
              <Button onClick={close}>Done</Button>
            ) : (
              <>
                <Button variant="outline" onClick={close}>Cancel</Button>
                <Button loading={doImport.isPending} onClick={() => doImport.mutate()}><Upload /> Import {rows?.length} rows</Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
