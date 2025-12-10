import React, { useState } from 'react';
import { X, User, Phone, Mail, Building2, FileText, Loader2 } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

interface CreateContactModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

// Format phone: 11999998888 → (11) 99999-8888
const formatPhone = (value: string) => {
  const digits = value.replace(/\D/g, '');
  if (digits.length <= 2) return digits;
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7, 11)}`;
};

// Format CNPJ: 12345678000190 → 12.345.678/0001-90
const formatCNPJ = (value: string) => {
  const digits = value.replace(/\D/g, '');
  if (digits.length <= 2) return digits;
  if (digits.length <= 5) return `${digits.slice(0, 2)}.${digits.slice(2)}`;
  if (digits.length <= 8) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5)}`;
  if (digits.length <= 12) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8)}`;
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12, 14)}`;
};

// Validate CNPJ with verifier digits
const validateCNPJ = (cnpj: string): boolean => {
  const digits = cnpj.replace(/\D/g, '');
  if (digits.length !== 14) return false;
  if (/^(\d)\1+$/.test(digits)) return false;
  
  let sum = 0;
  let weight = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  for (let i = 0; i < 12; i++) {
    sum += parseInt(digits[i]) * weight[i];
  }
  let remainder = sum % 11;
  let digit1 = remainder < 2 ? 0 : 11 - remainder;
  if (parseInt(digits[12]) !== digit1) return false;

  sum = 0;
  weight = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  for (let i = 0; i < 13; i++) {
    sum += parseInt(digits[i]) * weight[i];
  }
  remainder = sum % 11;
  let digit2 = remainder < 2 ? 0 : 11 - remainder;
  return parseInt(digits[13]) === digit2;
};

const CreateContactModal: React.FC<CreateContactModalProps> = ({
  open,
  onOpenChange,
  onSuccess
}) => {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    email: '',
    company: '',
    cnpj: '',
    notes: ''
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const resetForm = () => {
    setFormData({ name: '', phone: '', email: '', company: '', cnpj: '', notes: '' });
    setErrors({});
  };

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    
    if (!formData.name.trim() || formData.name.trim().length < 2) {
      newErrors.name = 'Nome deve ter pelo menos 2 caracteres';
    }
    
    const phoneDigits = formData.phone.replace(/\D/g, '');
    if (!phoneDigits || phoneDigits.length < 10 || phoneDigits.length > 11) {
      newErrors.phone = 'Telefone inválido (10-11 dígitos)';
    }
    
    if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Email inválido';
    }
    
    const cnpjDigits = formData.cnpj.replace(/\D/g, '');
    if (cnpjDigits && cnpjDigits.length > 0) {
      if (cnpjDigits.length !== 14) {
        newErrors.cnpj = 'CNPJ deve ter 14 dígitos';
      } else if (!validateCNPJ(cnpjDigits)) {
        newErrors.cnpj = 'CNPJ inválido';
      }
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validate()) return;
    
    setLoading(true);
    try {
      const phoneDigits = formData.phone.replace(/\D/g, '');
      const cnpjDigits = formData.cnpj.replace(/\D/g, '') || null;
      
      const { error } = await supabase.from('contacts').insert({
        name: formData.name.trim(),
        phone_number: phoneDigits,
        email: formData.email.trim() || null,
        company: formData.company.trim() || null,
        cnpj: cnpjDigits,
        notes: formData.notes.trim() || null
      });

      if (error) throw error;

      toast.success('Contato criado com sucesso!');
      resetForm();
      onOpenChange(false);
      onSuccess();
    } catch (error: any) {
      console.error('Error creating contact:', error);
      if (error.code === '23505') {
        toast.error('Este telefone já está cadastrado');
      } else {
        toast.error('Erro ao criar contato');
      }
    } finally {
      setLoading(false);
    }
  };

  const handlePhoneChange = (value: string) => {
    setFormData(prev => ({ ...prev, phone: formatPhone(value) }));
  };

  const handleCNPJChange = (value: string) => {
    setFormData(prev => ({ ...prev, cnpj: formatCNPJ(value) }));
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => {
      if (!isOpen) resetForm();
      onOpenChange(isOpen);
    }}>
      <DialogContent className="sm:max-w-[500px] bg-slate-900 border-slate-800 text-slate-50">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <User className="w-5 h-5 text-cyan-400" />
            Novo Contato
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5 mt-4">
          {/* Dados Pessoais */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-slate-400 border-b border-slate-800 pb-2">
              Dados Pessoais
            </h3>
            
            <div className="space-y-2">
              <Label htmlFor="name" className="text-slate-300">
                Nome <span className="text-red-400">*</span>
              </Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="Nome completo"
                  className="pl-10 bg-slate-950 border-slate-800 text-slate-200 placeholder:text-slate-600"
                />
              </div>
              {errors.name && <p className="text-xs text-red-400">{errors.name}</p>}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="phone" className="text-slate-300">
                  Telefone <span className="text-red-400">*</span>
                </Label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <Input
                    id="phone"
                    value={formData.phone}
                    onChange={(e) => handlePhoneChange(e.target.value)}
                    placeholder="(11) 99999-9999"
                    className="pl-10 bg-slate-950 border-slate-800 text-slate-200 placeholder:text-slate-600"
                  />
                </div>
                {errors.phone && <p className="text-xs text-red-400">{errors.phone}</p>}
              </div>

              <div className="space-y-2">
                <Label htmlFor="email" className="text-slate-300">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <Input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                    placeholder="email@exemplo.com"
                    className="pl-10 bg-slate-950 border-slate-800 text-slate-200 placeholder:text-slate-600"
                  />
                </div>
                {errors.email && <p className="text-xs text-red-400">{errors.email}</p>}
              </div>
            </div>
          </div>

          {/* Dados da Empresa */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-slate-400 border-b border-slate-800 pb-2">
              Dados da Empresa
            </h3>

            <div className="space-y-2">
              <Label htmlFor="company" className="text-slate-300">Empresa</Label>
              <div className="relative">
                <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <Input
                  id="company"
                  value={formData.company}
                  onChange={(e) => setFormData(prev => ({ ...prev, company: e.target.value }))}
                  placeholder="Nome da empresa"
                  className="pl-10 bg-slate-950 border-slate-800 text-slate-200 placeholder:text-slate-600"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="cnpj" className="text-slate-300">CNPJ</Label>
              <div className="relative">
                <FileText className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <Input
                  id="cnpj"
                  value={formData.cnpj}
                  onChange={(e) => handleCNPJChange(e.target.value)}
                  placeholder="12.345.678/0001-90"
                  className="pl-10 bg-slate-950 border-slate-800 text-slate-200 placeholder:text-slate-600"
                />
              </div>
              {errors.cnpj && <p className="text-xs text-red-400">{errors.cnpj}</p>}
            </div>
          </div>

          {/* Notas */}
          <div className="space-y-2">
            <Label htmlFor="notes" className="text-slate-300">Notas</Label>
            <Textarea
              id="notes"
              value={formData.notes}
              onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
              placeholder="Observações sobre o contato..."
              rows={3}
              className="bg-slate-950 border-slate-800 text-slate-200 placeholder:text-slate-600 resize-none"
            />
          </div>

          {/* Buttons */}
          <div className="flex justify-end gap-3 pt-4 border-t border-slate-800">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="border-slate-700 text-slate-300 hover:bg-slate-800"
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={loading} className="bg-cyan-600 hover:bg-cyan-700">
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Salvando...
                </>
              ) : (
                'Salvar Contato'
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default CreateContactModal;
