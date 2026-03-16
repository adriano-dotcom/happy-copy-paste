import React, { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2, Check, X, KeyRound } from "lucide-react";

const validatePassword = (password: string) => ({
  minLength: password.length >= 8,
  hasUppercase: /[A-Z]/.test(password),
  hasNumber: /[0-9]/.test(password),
  hasSpecial: /[^A-Za-z0-9]/.test(password),
});

const isPasswordValid = (password: string) => {
  const checks = validatePassword(password);
  return checks.minLength && checks.hasUppercase && checks.hasNumber && checks.hasSpecial;
};

interface ChangePasswordModalProps {
  open: boolean;
  onClose: () => void;
}

const ChangePasswordModal: React.FC<ChangePasswordModalProps> = ({ open, onClose }) => {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (newPassword !== confirmPassword) {
      toast.error("As senhas não coincidem");
      return;
    }

    if (!isPasswordValid(newPassword)) {
      toast.error("A senha não atende aos requisitos de segurança");
      return;
    }

    setIsLoading(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setIsLoading(false);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success("Senha alterada com sucesso!");
    setNewPassword("");
    setConfirmPassword("");
    onClose();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md shadow-2xl">
        <div className="px-6 py-5 border-b border-slate-700 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-white flex items-center gap-2">
            <KeyRound className="w-5 h-5 text-cyan-400" />
            Alterar Senha
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="modal-new-password" className="text-slate-300 text-sm font-medium">
              Nova Senha
            </Label>
            <Input
              id="modal-new-password"
              type="password"
              placeholder="••••••••"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              disabled={isLoading}
              className="bg-slate-800 border-slate-600 text-white placeholder:text-slate-500 focus:border-cyan-400/50 focus:ring-cyan-400/20"
            />
            {newPassword && (
              <div className="mt-2 space-y-1 text-xs">
                {(() => {
                  const checks = validatePassword(newPassword);
                  return (
                    <>
                      <div className={`flex items-center gap-1.5 ${checks.minLength ? 'text-green-400' : 'text-slate-500'}`}>
                        {checks.minLength ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                        Mínimo 8 caracteres
                      </div>
                      <div className={`flex items-center gap-1.5 ${checks.hasUppercase ? 'text-green-400' : 'text-slate-500'}`}>
                        {checks.hasUppercase ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                        Letra maiúscula
                      </div>
                      <div className={`flex items-center gap-1.5 ${checks.hasNumber ? 'text-green-400' : 'text-slate-500'}`}>
                        {checks.hasNumber ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                        Número
                      </div>
                      <div className={`flex items-center gap-1.5 ${checks.hasSpecial ? 'text-green-400' : 'text-slate-500'}`}>
                        {checks.hasSpecial ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                        Caractere especial
                      </div>
                    </>
                  );
                })()}
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="modal-confirm-password" className="text-slate-300 text-sm font-medium">
              Confirmar Nova Senha
            </Label>
            <Input
              id="modal-confirm-password"
              type="password"
              placeholder="••••••••"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              disabled={isLoading}
              className="bg-slate-800 border-slate-600 text-white placeholder:text-slate-500 focus:border-cyan-400/50 focus:ring-cyan-400/20"
            />
            {confirmPassword && newPassword !== confirmPassword && (
              <p className="text-red-400 text-xs mt-1">As senhas não coincidem</p>
            )}
          </div>

          <div className="flex gap-3 pt-2">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1 border-slate-600 text-slate-300 hover:bg-slate-800">
              Cancelar
            </Button>
            <Button
              type="submit"
              className="flex-1 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-semibold border-0"
              disabled={isLoading || !isPasswordValid(newPassword) || newPassword !== confirmPassword}
            >
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvar"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ChangePasswordModal;
