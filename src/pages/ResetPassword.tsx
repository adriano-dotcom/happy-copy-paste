import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2, Check, X, KeyRound } from "lucide-react";
import logo from "@/assets/jacometo-logo.png";

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

export default function ResetPassword() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    // Listen for the PASSWORD_RECOVERY event from Supabase
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setIsReady(true);
      }
    });

    // Also check if there's already a session (user clicked recovery link)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setIsReady(true);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();

    if (password !== confirmPassword) {
      toast.error("As senhas não coincidem");
      return;
    }

    if (!isPasswordValid(password)) {
      toast.error("A senha não atende aos requisitos de segurança");
      return;
    }

    setIsLoading(true);

    const { error } = await supabase.auth.updateUser({ password });

    setIsLoading(false);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success("Senha alterada com sucesso!");
    navigate("/", { replace: true });
  };

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden p-3 sm:p-4">
      <div
        className="absolute inset-0 bg-cover bg-center bg-no-repeat scale-105"
        style={{
          backgroundImage: `url('https://images.unsplash.com/photo-1492168732976-2676c584c675?auto=format&fit=crop&w=2000&q=80')`,
        }}
      />
      <div className="absolute inset-0 bg-gradient-to-br from-blue-900/85 via-slate-900/80 to-indigo-900/85" />
      <div className="absolute top-1/4 -left-20 w-48 sm:w-72 h-48 sm:h-72 bg-cyan-500/20 rounded-full blur-3xl" />
      <div className="absolute bottom-1/4 -right-20 w-64 sm:w-96 h-64 sm:h-96 bg-blue-500/15 rounded-full blur-3xl" />

      <Card className="w-full max-w-md relative z-10 bg-white/10 backdrop-blur-xl border border-white/20 shadow-2xl shadow-black/20 animate-fade-in">
        <CardHeader className="text-center pb-2 px-4 sm:px-6 pt-5 sm:pt-6">
          <div className="flex justify-center mb-3 sm:mb-4">
            <div className="p-2 sm:p-3 bg-white/10 rounded-xl sm:rounded-2xl backdrop-blur-sm border border-white/10">
              <img src={logo} alt="Jacometo Seguros" className="h-9 sm:h-12" />
            </div>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
            Redefinir Senha
          </h1>
          <p className="text-white/60 text-xs sm:text-sm mt-3 sm:mt-4">
            {isReady ? "Digite sua nova senha abaixo" : "Verificando link de recuperação..."}
          </p>
        </CardHeader>

        <CardContent className="pt-2 px-4 sm:px-6 pb-5 sm:pb-6">
          {!isReady ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-8 h-8 text-cyan-400 animate-spin" />
            </div>
          ) : (
            <form onSubmit={handleResetPassword} className="space-y-3 sm:space-y-4">
              <div className="space-y-1.5 sm:space-y-2">
                <Label htmlFor="new-password" className="text-white/90 text-xs sm:text-sm font-medium">
                  Nova Senha
                </Label>
                <Input
                  id="new-password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isLoading}
                  className="bg-white/10 border-white/20 text-white placeholder:text-white/40 focus:bg-white/15 focus:border-cyan-400/50 focus:ring-cyan-400/20 transition-all h-10 sm:h-11 text-sm sm:text-base"
                />
                {password && (
                  <div className="mt-2 space-y-1 text-xs">
                    {(() => {
                      const checks = validatePassword(password);
                      return (
                        <>
                          <div className={`flex items-center gap-1.5 ${checks.minLength ? 'text-green-400' : 'text-white/50'}`}>
                            {checks.minLength ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                            Mínimo 8 caracteres
                          </div>
                          <div className={`flex items-center gap-1.5 ${checks.hasUppercase ? 'text-green-400' : 'text-white/50'}`}>
                            {checks.hasUppercase ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                            Letra maiúscula
                          </div>
                          <div className={`flex items-center gap-1.5 ${checks.hasNumber ? 'text-green-400' : 'text-white/50'}`}>
                            {checks.hasNumber ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                            Número
                          </div>
                          <div className={`flex items-center gap-1.5 ${checks.hasSpecial ? 'text-green-400' : 'text-white/50'}`}>
                            {checks.hasSpecial ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                            Caractere especial
                          </div>
                        </>
                      );
                    })()}
                  </div>
                )}
              </div>
              <div className="space-y-1.5 sm:space-y-2">
                <Label htmlFor="confirm-password" className="text-white/90 text-xs sm:text-sm font-medium">
                  Confirmar Nova Senha
                </Label>
                <Input
                  id="confirm-password"
                  type="password"
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  disabled={isLoading}
                  className="bg-white/10 border-white/20 text-white placeholder:text-white/40 focus:bg-white/15 focus:border-cyan-400/50 focus:ring-cyan-400/20 transition-all h-10 sm:h-11 text-sm sm:text-base"
                />
                {confirmPassword && password !== confirmPassword && (
                  <p className="text-red-400 text-xs mt-1">As senhas não coincidem</p>
                )}
              </div>
              <Button
                type="submit"
                className="w-full bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-semibold shadow-lg shadow-cyan-500/25 border-0 transition-all duration-300 h-10 sm:h-11 text-sm sm:text-base mt-1 sm:mt-2"
                disabled={isLoading || !isPasswordValid(password) || password !== confirmPassword}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Salvando...
                  </>
                ) : (
                  <>
                    <KeyRound className="mr-2 h-4 w-4" />
                    Redefinir Senha
                  </>
                )}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
