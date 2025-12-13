import React, { useState, useRef } from 'react';
import { Upload, FileSpreadsheet, AlertCircle, CheckCircle2, Loader2, X, Download } from 'lucide-react';
import { Button } from './ui/button';
import { Label } from './ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { getRegionFromPhone } from '@/utils/dddRegionMapper';

interface ImportContactsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

interface ParsedRow {
  [key: string]: string;
}

interface ColumnMapping {
  name: string;
  phone: string;
  email: string;
  company: string;
  cnpj: string;
}

interface ValidationResult {
  valid: ParsedRow[];
  invalid: { row: ParsedRow; errors: string[] }[];
}

const REQUIRED_FIELDS = ['name', 'phone'];
const FIELD_LABELS: Record<string, string> = {
  name: 'Nome',
  phone: 'Telefone',
  email: 'Email',
  company: 'Empresa',
  cnpj: 'CNPJ'
};

const ImportContactsModal: React.FC<ImportContactsModalProps> = ({
  open,
  onOpenChange,
  onSuccess
}) => {
  const [step, setStep] = useState<'upload' | 'mapping' | 'preview' | 'importing'>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [mapping, setMapping] = useState<ColumnMapping>({
    name: '',
    phone: '',
    email: '',
    company: '',
    cnpj: ''
  });
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetState = () => {
    setStep('upload');
    setFile(null);
    setHeaders([]);
    setRows([]);
    setMapping({ name: '', phone: '', email: '', company: '', cnpj: '' });
    setValidation(null);
    setImporting(false);
    setProgress({ current: 0, total: 0 });
  };

  const parseCSV = (text: string): { headers: string[]; rows: ParsedRow[] } => {
    const lines = text.split(/\r?\n/).filter(line => line.trim());
    if (lines.length < 2) return { headers: [], rows: [] };

    // Detect separator (comma or semicolon)
    const firstLine = lines[0];
    const separator = firstLine.includes(';') ? ';' : ',';

    const headers = firstLine.split(separator).map(h => h.trim().replace(/^["']|["']$/g, ''));
    
    const rows: ParsedRow[] = [];
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(separator).map(v => v.trim().replace(/^["']|["']$/g, ''));
      if (values.length === headers.length) {
        const row: ParsedRow = {};
        headers.forEach((header, idx) => {
          row[header] = values[idx];
        });
        rows.push(row);
      }
    }

    return { headers, rows };
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    if (!selectedFile.name.endsWith('.csv')) {
      toast.error('Por favor, selecione um arquivo CSV');
      return;
    }

    setFile(selectedFile);

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const { headers: parsedHeaders, rows: parsedRows } = parseCSV(text);
      
      if (parsedHeaders.length === 0) {
        toast.error('Arquivo CSV inválido');
        return;
      }

      setHeaders(parsedHeaders);
      setRows(parsedRows);

      // Auto-detect mapping
      const autoMapping: ColumnMapping = { name: '', phone: '', email: '', company: '', cnpj: '' };
      parsedHeaders.forEach(header => {
        const lowerHeader = header.toLowerCase();
        if (lowerHeader.includes('nome') || lowerHeader === 'name') autoMapping.name = header;
        if (lowerHeader.includes('telefone') || lowerHeader.includes('phone') || lowerHeader.includes('celular')) autoMapping.phone = header;
        if (lowerHeader.includes('email') || lowerHeader.includes('e-mail')) autoMapping.email = header;
        if (lowerHeader.includes('empresa') || lowerHeader.includes('company')) autoMapping.company = header;
        if (lowerHeader.includes('cnpj')) autoMapping.cnpj = header;
      });
      setMapping(autoMapping);
      setStep('mapping');
    };
    reader.readAsText(selectedFile);
  };

  const validateRows = (): ValidationResult => {
    const valid: ParsedRow[] = [];
    const invalid: { row: ParsedRow; errors: string[] }[] = [];

    rows.forEach(row => {
      const errors: string[] = [];

      // Check name
      const name = row[mapping.name]?.trim();
      if (!name || name.length < 2) {
        errors.push('Nome inválido');
      }

      // Check phone - aceita 10-11 dígitos (sem país) ou 12-13 dígitos (com 55)
      const phone = row[mapping.phone]?.replace(/\D/g, '');
      const isValidLength = phone && phone.length >= 10 && phone.length <= 13;
      const hasValidCountryCode = phone && phone.length >= 12 ? phone.startsWith('55') : true;
      if (!phone || !isValidLength || !hasValidCountryCode) {
        errors.push('Telefone inválido (use formato: 11999999999 ou 5511999999999)');
      }

      // Check email (optional)
      if (mapping.email && row[mapping.email]) {
        const email = row[mapping.email].trim();
        if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          errors.push('Email inválido');
        }
      }

      // Check CNPJ (optional)
      if (mapping.cnpj && row[mapping.cnpj]) {
        const cnpj = row[mapping.cnpj].replace(/\D/g, '');
        if (cnpj && cnpj.length !== 14) {
          errors.push('CNPJ inválido');
        }
      }

      if (errors.length > 0) {
        invalid.push({ row, errors });
      } else {
        valid.push(row);
      }
    });

    return { valid, invalid };
  };

  const handleProceedToPreview = () => {
    if (!mapping.name || !mapping.phone) {
      toast.error('Mapeie os campos obrigatórios (Nome e Telefone)');
      return;
    }

    const result = validateRows();
    setValidation(result);
    setStep('preview');
  };

  const handleImport = async () => {
    if (!validation || validation.valid.length === 0) return;

    setStep('importing');
    setImporting(true);
    setProgress({ current: 0, total: validation.valid.length });

    let successCount = 0;
    let errorCount = 0;

    // Import in batches of 50
    const batchSize = 50;
    const batches = [];
    for (let i = 0; i < validation.valid.length; i += batchSize) {
      batches.push(validation.valid.slice(i, i + batchSize));
    }

    for (const batch of batches) {
      const contacts = batch.map(row => {
        // Normalizar telefone para formato internacional (55...)
        let phoneNumber = row[mapping.phone]?.replace(/\D/g, '') || '';
        if (phoneNumber && !phoneNumber.startsWith('55')) {
          phoneNumber = '55' + phoneNumber;
        }
        
        // Extrair cidade/estado do DDD
        const region = getRegionFromPhone(phoneNumber);
        
        return {
          name: row[mapping.name]?.trim(),
          phone_number: phoneNumber,
          email: mapping.email ? row[mapping.email]?.trim() || null : null,
          company: mapping.company ? row[mapping.company]?.trim() || null : null,
          cnpj: mapping.cnpj ? row[mapping.cnpj]?.replace(/\D/g, '') || null : null,
          lead_source: 'outbound', // Contatos importados são outbound
          city: region?.city || null,
          state: region?.stateCode || null
        };
      });

      const { error } = await supabase.from('contacts').insert(contacts);
      
      if (error) {
        console.error('Batch import error:', error);
        errorCount += batch.length;
      } else {
        successCount += batch.length;
      }

      setProgress(prev => ({ ...prev, current: prev.current + batch.length }));
    }

    setImporting(false);

    if (successCount > 0) {
      toast.success(`${successCount} contatos importados com sucesso!`);
      onSuccess();
      onOpenChange(false);
      resetState();
    }

    if (errorCount > 0) {
      toast.error(`${errorCount} contatos falharam na importação`);
    }
  };

  const downloadTemplate = () => {
    const csvContent = 'nome,telefone,email,empresa,cnpj\nJoão Silva,11999998888,joao@email.com,Transportes ABC,12345678000190\nMaria Santos,21988887777,maria@email.com,Logística XYZ,98765432000199';
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'modelo_contatos.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => {
      if (!isOpen) resetState();
      onOpenChange(isOpen);
    }}>
      <DialogContent className="sm:max-w-[600px] bg-slate-900 border-slate-800 text-slate-50">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <FileSpreadsheet className="w-5 h-5 text-cyan-400" />
            Importar Contatos
          </DialogTitle>
        </DialogHeader>

        <div className="mt-4">
          {/* Step 1: Upload */}
          {step === 'upload' && (
            <div className="space-y-6">
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-slate-700 rounded-xl p-10 text-center cursor-pointer hover:border-cyan-500/50 hover:bg-slate-800/30 transition-all"
              >
                <Upload className="w-12 h-12 mx-auto text-slate-500 mb-4" />
                <p className="text-slate-300 font-medium mb-2">Clique para selecionar ou arraste o arquivo</p>
                <p className="text-sm text-slate-500">Arquivos CSV suportados</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </div>

              <div className="flex items-center justify-center">
                <Button
                  variant="outline"
                  onClick={downloadTemplate}
                  className="border-slate-700 text-slate-300 hover:bg-slate-800"
                >
                  <Download className="w-4 h-4 mr-2" />
                  Baixar Modelo CSV
                </Button>
              </div>
            </div>
          )}

          {/* Step 2: Mapping */}
          {step === 'mapping' && (
            <div className="space-y-6">
              <div className="p-4 bg-slate-800/50 rounded-lg border border-slate-700">
                <p className="text-sm text-slate-400">
                  <span className="font-medium text-slate-300">Arquivo:</span> {file?.name}
                </p>
                <p className="text-sm text-slate-400">
                  <span className="font-medium text-slate-300">Linhas:</span> {rows.length} contatos encontrados
                </p>
              </div>

              <div className="space-y-4">
                <h3 className="text-sm font-medium text-slate-400 border-b border-slate-800 pb-2">
                  Mapeamento de Colunas
                </h3>

                <div className="grid grid-cols-2 gap-4">
                  {(['name', 'phone', 'email', 'company', 'cnpj'] as const).map(field => (
                    <div key={field} className="space-y-2">
                      <Label className="text-slate-300">
                        {FIELD_LABELS[field]}
                        {REQUIRED_FIELDS.includes(field) && <span className="text-red-400 ml-1">*</span>}
                      </Label>
                      <Select
                        value={mapping[field] || '__none__'}
                        onValueChange={(value) => setMapping(prev => ({ ...prev, [field]: value === '__none__' ? '' : value }))}
                      >
                        <SelectTrigger className="bg-slate-950 border-slate-800 text-slate-200">
                          <SelectValue placeholder="Selecione a coluna" />
                        </SelectTrigger>
                        <SelectContent className="bg-slate-900 border-slate-800">
                          <SelectItem value="__none__" className="text-slate-400">Não mapear</SelectItem>
                          {headers.map(header => (
                            <SelectItem key={header} value={header} className="text-slate-200">
                              {header}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>
              </div>

              {/* Preview first rows */}
              <div className="space-y-2">
                <h3 className="text-sm font-medium text-slate-400">Preview (primeiros 3 registros)</h3>
                <div className="rounded-lg border border-slate-800 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-800/50">
                      <tr>
                        <th className="px-3 py-2 text-left text-slate-400">Nome</th>
                        <th className="px-3 py-2 text-left text-slate-400">Telefone</th>
                        <th className="px-3 py-2 text-left text-slate-400">Email</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      {rows.slice(0, 3).map((row, idx) => (
                        <tr key={idx}>
                          <td className="px-3 py-2 text-slate-300">{mapping.name ? row[mapping.name] : '-'}</td>
                          <td className="px-3 py-2 text-slate-300">{mapping.phone ? row[mapping.phone] : '-'}</td>
                          <td className="px-3 py-2 text-slate-300">{mapping.email ? row[mapping.email] : '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="flex justify-between pt-4 border-t border-slate-800">
                <Button variant="outline" onClick={() => setStep('upload')} className="border-slate-700 text-slate-300">
                  Voltar
                </Button>
                <Button onClick={handleProceedToPreview} className="bg-cyan-600 hover:bg-cyan-700">
                  Validar e Continuar
                </Button>
              </div>
            </div>
          )}

          {/* Step 3: Preview */}
          {step === 'preview' && validation && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-lg">
                  <div className="flex items-center gap-2 mb-1">
                    <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                    <span className="font-medium text-emerald-400">Válidos</span>
                  </div>
                  <p className="text-2xl font-bold text-emerald-400">{validation.valid.length}</p>
                </div>
                <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
                  <div className="flex items-center gap-2 mb-1">
                    <AlertCircle className="w-5 h-5 text-red-400" />
                    <span className="font-medium text-red-400">Com Erros</span>
                  </div>
                  <p className="text-2xl font-bold text-red-400">{validation.invalid.length}</p>
                </div>
              </div>

              {validation.invalid.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-sm font-medium text-red-400">Registros com erro (não serão importados)</h3>
                  <div className="max-h-40 overflow-y-auto rounded-lg border border-red-500/30 bg-red-500/5">
                    {validation.invalid.slice(0, 5).map((item, idx) => (
                      <div key={idx} className="px-3 py-2 border-b border-red-500/20 last:border-b-0">
                        <p className="text-sm text-slate-300">{item.row[mapping.name] || 'Sem nome'}</p>
                        <p className="text-xs text-red-400">{item.errors.join(', ')}</p>
                      </div>
                    ))}
                    {validation.invalid.length > 5 && (
                      <div className="px-3 py-2 text-xs text-slate-500">
                        ... e mais {validation.invalid.length - 5} registros com erro
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="flex justify-between pt-4 border-t border-slate-800">
                <Button variant="outline" onClick={() => setStep('mapping')} className="border-slate-700 text-slate-300">
                  Voltar
                </Button>
                <Button
                  onClick={handleImport}
                  disabled={validation.valid.length === 0}
                  className="bg-cyan-600 hover:bg-cyan-700"
                >
                  Importar {validation.valid.length} Contatos
                </Button>
              </div>
            </div>
          )}

          {/* Step 4: Importing */}
          {step === 'importing' && (
            <div className="py-10 text-center space-y-4">
              <Loader2 className="w-12 h-12 mx-auto text-cyan-400 animate-spin" />
              <p className="text-slate-300 font-medium">Importando contatos...</p>
              <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                <div
                  className="h-full bg-cyan-500 transition-all duration-300"
                  style={{ width: `${(progress.current / progress.total) * 100}%` }}
                />
              </div>
              <p className="text-sm text-slate-500">{progress.current} de {progress.total}</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ImportContactsModal;
