import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Phone, Loader2, User } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface CallConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  contact: {
    id: string;
    name: string | null;
    phone: string;
    avatar?: string | null;
    company?: string | null;
    tags?: string[];
  };
  conversationId: string;
  defaultExtension: string;
  onCallInitiated?: () => void;
}

function formatPhoneNumber(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  
  if (digits.startsWith("55") && digits.length >= 12) {
    const ddd = digits.slice(2, 4);
    const number = digits.slice(4);
    if (number.length === 9) {
      return `+55 (${ddd}) ${number.slice(0, 5)}-${number.slice(5)}`;
    } else if (number.length === 8) {
      return `+55 (${ddd}) ${number.slice(0, 4)}-${number.slice(4)}`;
    }
  }
  
  if (digits.length === 11) {
    const ddd = digits.slice(0, 2);
    const number = digits.slice(2);
    return `(${ddd}) ${number.slice(0, 5)}-${number.slice(5)}`;
  }
  
  if (digits.length === 10) {
    const ddd = digits.slice(0, 2);
    const number = digits.slice(2);
    return `(${ddd}) ${number.slice(0, 4)}-${number.slice(4)}`;
  }
  
  return phone;
}

export function CallConfirmationModal({
  isOpen,
  onClose,
  contact,
  conversationId,
  defaultExtension,
  onCallInitiated,
}: CallConfirmationModalProps) {
  const [extension, setExtension] = useState(defaultExtension || "1000");
  const [isLoading, setIsLoading] = useState(false);

  const handleInitiateCall = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("api4com-dial", {
        body: {
          contactId: contact.id,
          conversationId,
          phoneNumber: contact.phone,
          extension,
        },
      });

      if (error) throw error;

      if (data?.success) {
        toast.success("Ligação iniciada", {
          description: `Chamada para ${contact.name || contact.phone} em andamento`,
        });
        onCallInitiated?.();
        onClose();
      } else {
        throw new Error(data?.error || "Falha ao iniciar ligação");
      }
    } catch (error: any) {
      console.error("Erro ao iniciar ligação:", error);
      toast.error("Erro na ligação", {
        description: error.message || "Não foi possível iniciar a chamada",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md bg-slate-900/95 backdrop-blur-lg border-slate-700/50">
        <DialogHeader className="text-center pb-2">
          <div className="mx-auto mb-4 relative">
            <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center animate-pulse">
              <Phone className="w-8 h-8 text-emerald-400" />
            </div>
          </div>
          <DialogTitle className="text-xl font-semibold text-slate-100">
            Confirmar Ligação
          </DialogTitle>
          <DialogDescription className="sr-only">
            Confirme os dados para iniciar a ligação
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center py-4 space-y-4">
          {/* Avatar */}
          <div className="w-20 h-20 rounded-full bg-slate-700 flex items-center justify-center overflow-hidden border-2 border-slate-600">
            {contact.avatar ? (
              <img
                src={contact.avatar}
                alt={contact.name || "Contato"}
                className="w-full h-full object-cover"
              />
            ) : (
              <User className="w-10 h-10 text-slate-400" />
            )}
          </div>

          {/* Contact Info */}
          <div className="text-center space-y-1">
            <h3 className="text-lg font-semibold text-slate-100">
              {contact.name || "Sem nome"}
            </h3>
            {contact.company && (
              <p className="text-sm text-slate-400">{contact.company}</p>
            )}
            <p className="text-base font-mono text-emerald-400">
              {formatPhoneNumber(contact.phone)}
            </p>
          </div>

          {/* Tags */}
          {contact.tags && contact.tags.length > 0 && (
            <div className="flex flex-wrap gap-2 justify-center">
              {contact.tags.slice(0, 3).map((tag) => (
                <span
                  key={tag}
                  className="px-2 py-1 text-xs rounded-full bg-slate-700 text-slate-300"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}

          {/* Extension Input */}
          <div className="w-full space-y-2 pt-2">
            <Label htmlFor="extension" className="text-slate-300 text-sm">
              Ramal que receberá a chamada
            </Label>
            <Input
              id="extension"
              value={extension}
              onChange={(e) => setExtension(e.target.value)}
              placeholder="Ex: 1000"
              className="bg-slate-800 border-slate-600 text-slate-100 text-center text-lg font-mono"
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-2">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={isLoading}
            className="flex-1 border-slate-600 text-slate-300 hover:bg-slate-800"
          >
            Cancelar
          </Button>
          <Button
            onClick={handleInitiateCall}
            disabled={isLoading || !extension}
            className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Ligando...
              </>
            ) : (
              <>
                <Phone className="w-4 h-4 mr-2" />
                Iniciar Ligação
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
