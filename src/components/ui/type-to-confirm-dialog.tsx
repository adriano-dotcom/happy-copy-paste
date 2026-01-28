import React, { useState, useEffect } from 'react';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from './alert-dialog';
import { Input } from './input';
import { Button } from './button';
import { AlertTriangle } from 'lucide-react';

interface TypeToConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmText: string;
  onConfirm: () => void;
  destructive?: boolean;
  confirmButtonLabel?: string;
}

export const TypeToConfirmDialog: React.FC<TypeToConfirmDialogProps> = ({
  open,
  onOpenChange,
  title,
  description,
  confirmText,
  onConfirm,
  destructive = true,
  confirmButtonLabel = 'Confirmar Exclusão'
}) => {
  const [inputValue, setInputValue] = useState('');
  const isMatch = inputValue.toUpperCase() === confirmText.toUpperCase();

  // Reset input when dialog opens/closes
  useEffect(() => {
    if (!open) {
      setInputValue('');
    }
  }, [open]);

  const handleConfirm = () => {
    if (isMatch) {
      onConfirm();
      setInputValue('');
      onOpenChange(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && isMatch) {
      handleConfirm();
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="bg-slate-900 border-slate-700">
        <AlertDialogHeader>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center flex-shrink-0">
              <AlertTriangle className="w-5 h-5 text-red-400" />
            </div>
            <AlertDialogTitle className="text-slate-100">{title}</AlertDialogTitle>
          </div>
          <AlertDialogDescription className="text-slate-400 mt-4">
            {description}
          </AlertDialogDescription>
        </AlertDialogHeader>
        
        <div className="my-4">
          <p className="text-sm text-slate-300 mb-2">
            Digite <span className="font-bold text-red-400">{confirmText}</span> para confirmar:
          </p>
          <Input
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={confirmText}
            className="bg-slate-950 border-slate-700 text-slate-100"
            autoFocus
          />
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel 
            className="bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700"
          >
            Cancelar
          </AlertDialogCancel>
          <Button
            onClick={handleConfirm}
            disabled={!isMatch}
            className={destructive 
              ? "bg-red-600 hover:bg-red-700 disabled:bg-slate-700 disabled:text-slate-500"
              : "bg-cyan-600 hover:bg-cyan-700 disabled:bg-slate-700 disabled:text-slate-500"
            }
          >
            {confirmButtonLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
