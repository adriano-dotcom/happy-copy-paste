import React, { useState } from 'react';
import { MessageSquare, Key, Phone, ExternalLink, Copy, Check, ChevronDown, ChevronUp } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/Button';

interface StepWhatsAppProps {
  accessToken: string;
  phoneNumberId: string;
  verifyToken: string;
  onAccessTokenChange: (value: string) => void;
  onPhoneNumberIdChange: (value: string) => void;
  onVerifyTokenChange: (value: string) => void;
  webhookUrl: string;
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.1,
    },
  },
} as const;

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { 
    opacity: 1, 
    y: 0,
    transition: { type: "spring" as const, stiffness: 300, damping: 24 }
  },
};

export const StepWhatsApp: React.FC<StepWhatsAppProps> = ({
  accessToken,
  phoneNumberId,
  verifyToken,
  onAccessTokenChange,
  onPhoneNumberIdChange,
  onVerifyTokenChange,
  webhookUrl,
}) => {
  const [showWebhook, setShowWebhook] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopied(field);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <motion.div 
      className="space-y-8"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      <motion.div variants={itemVariants} className="text-center mb-8">
        <motion.div 
          className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-green-500/20 to-emerald-500/20 border border-green-500/30 flex items-center justify-center"
          whileHover={{ scale: 1.05, rotate: 5 }}
          transition={{ type: "spring", stiffness: 400 }}
        >
          <MessageSquare className="w-8 h-8 text-green-400" />
        </motion.div>
        <h3 className="text-xl font-semibold text-white mb-2">WhatsApp Cloud API</h3>
        <p className="text-slate-400 text-sm max-w-md mx-auto">
          Conecte sua conta do WhatsApp Business para enviar e receber mensagens.
        </p>
      </motion.div>

      <div className="space-y-6 max-w-md mx-auto">
        <motion.div variants={itemVariants} className="space-y-2">
          <Label htmlFor="accessToken" className="text-slate-300 flex items-center gap-2">
            <Key className="w-4 h-4 text-slate-500" />
            Access Token
          </Label>
          <Input
            id="accessToken"
            type="password"
            value={accessToken}
            onChange={(e) => onAccessTokenChange(e.target.value)}
            placeholder="EAAxxxxxxxx..."
            className="bg-slate-800/50 border-slate-700 focus:border-green-500 text-white placeholder:text-slate-500 font-mono text-sm"
          />
        </motion.div>

        <motion.div variants={itemVariants} className="space-y-2">
          <Label htmlFor="phoneNumberId" className="text-slate-300 flex items-center gap-2">
            <Phone className="w-4 h-4 text-slate-500" />
            Phone Number ID
          </Label>
          <Input
            id="phoneNumberId"
            value={phoneNumberId}
            onChange={(e) => onPhoneNumberIdChange(e.target.value)}
            placeholder="123456789012345"
            className="bg-slate-800/50 border-slate-700 focus:border-green-500 text-white placeholder:text-slate-500 font-mono text-sm"
          />
        </motion.div>

        {/* Webhook Configuration (Collapsible) */}
        <motion.div variants={itemVariants} className="pt-4 border-t border-slate-700/50">
          <motion.button
            onClick={() => setShowWebhook(!showWebhook)}
            whileHover={{ x: 4 }}
            className="flex items-center justify-between w-full text-left text-sm text-slate-400 hover:text-slate-300 transition-colors"
          >
            <span className="flex items-center gap-2">
              <ExternalLink className="w-4 h-4" />
              Configuração de Webhook
            </span>
            <motion.div
              animate={{ rotate: showWebhook ? 180 : 0 }}
              transition={{ duration: 0.2 }}
            >
              <ChevronDown className="w-4 h-4" />
            </motion.div>
          </motion.button>

          <AnimatePresence>
            {showWebhook && (
              <motion.div 
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="mt-4 space-y-4">
                  <div className="space-y-2">
                    <Label className="text-slate-400 text-xs">Webhook URL</Label>
                    <div className="flex gap-2">
                      <Input
                        value={webhookUrl}
                        readOnly
                        className="bg-slate-900 border-slate-700 text-slate-300 font-mono text-xs flex-1"
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => copyToClipboard(webhookUrl, 'url')}
                        className="px-3"
                      >
                        {copied === 'url' ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="verifyToken" className="text-slate-400 text-xs">
                      Verify Token
                    </Label>
                    <div className="flex gap-2">
                      <Input
                        id="verifyToken"
                        value={verifyToken}
                        onChange={(e) => onVerifyTokenChange(e.target.value)}
                        placeholder="seu_token_verificacao"
                        className="bg-slate-800/50 border-slate-700 focus:border-green-500 text-white placeholder:text-slate-500 font-mono text-xs flex-1"
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => copyToClipboard(verifyToken, 'token')}
                        className="px-3"
                        disabled={!verifyToken}
                      >
                        {copied === 'token' ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                      </Button>
                    </div>
                  </div>

                  <div className="p-3 rounded-lg bg-slate-800/30 border border-slate-700/50">
                    <p className="text-xs text-slate-400">
                      Configure estes valores no{' '}
                      <a
                        href="https://developers.facebook.com/apps"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-cyan-400 hover:underline"
                      >
                        Meta Business Dashboard
                      </a>
                      {' '}→ WhatsApp → Configuration → Webhook.
                    </p>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>

      {/* Tutorial Link */}
      <motion.div variants={itemVariants} className="text-center pt-4">
        <motion.a
          href="https://developers.facebook.com/docs/whatsapp/cloud-api/get-started"
          target="_blank"
          rel="noopener noreferrer"
          whileHover={{ scale: 1.02 }}
          className="inline-flex items-center gap-2 text-sm text-cyan-400 hover:text-cyan-300 transition-colors"
        >
          <ExternalLink className="w-4 h-4" />
          Como obter as credenciais do WhatsApp
        </motion.a>
      </motion.div>
    </motion.div>
  );
};