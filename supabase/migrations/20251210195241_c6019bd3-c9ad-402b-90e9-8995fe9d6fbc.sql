-- Tabela de templates de email
CREATE TABLE public.email_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  subject text NOT NULL,
  body_html text NOT NULL,
  category text DEFAULT 'general',
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- RLS
ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all operations on email_templates" 
  ON public.email_templates FOR ALL USING (true) WITH CHECK (true);

-- Trigger para updated_at
CREATE TRIGGER update_email_templates_updated_at
  BEFORE UPDATE ON public.email_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Templates iniciais
INSERT INTO public.email_templates (name, subject, body_html, category) VALUES
(
  'Follow-up Inicial',
  'Obrigado pelo contato - Jacometo Seguros',
  '<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
    <h2 style="color: #1e3a5f;">Olá {{nome}}! 👋</h2>
    <p>Obrigado pelo seu interesse na <strong>Jacometo Seguros</strong>!</p>
    <p>Recebemos sua mensagem e nossa equipe está analisando suas necessidades para oferecer a melhor solução em seguros para você.</p>
    <p>Em breve entraremos em contato com mais informações.</p>
    <p style="margin-top: 30px;">Atenciosamente,<br><strong>Equipe Jacometo Seguros</strong></p>
    <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
    <p style="font-size: 12px; color: #666;">📱 WhatsApp: (43) 9143-4002<br>🌐 jacometoseguros.com.br</p>
  </div>',
  'follow-up'
),
(
  'Proposta Comercial',
  'Proposta de Seguro RCTR-C - {{empresa}}',
  '<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
    <h2 style="color: #1e3a5f;">Proposta Comercial 📋</h2>
    <p>Olá <strong>{{nome}}</strong>,</p>
    <p>Conforme conversamos, segue nossa proposta de seguro RCTR-C para <strong>{{empresa}}</strong>:</p>
    <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
      <p style="margin: 0;"><strong>Valor da Proposta:</strong> R$ {{valor}}</p>
      <p style="margin: 10px 0 0;"><strong>Condições:</strong> Pagamento em até 4x sem juros</p>
    </div>
    <p>Esta proposta é válida por 7 dias.</p>
    <p>Ficou com alguma dúvida? Estamos à disposição!</p>
    <p style="margin-top: 30px;">Atenciosamente,<br><strong>Equipe Jacometo Seguros</strong></p>
  </div>',
  'proposal'
),
(
  'Bem-vindo - Pós-Venda',
  'Bem-vindo à Jacometo Seguros! 🎉',
  '<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
    <h2 style="color: #1e3a5f;">Parabéns, {{nome}}! 🎉</h2>
    <p>Seja muito bem-vindo(a) à família <strong>Jacometo Seguros</strong>!</p>
    <p>Seu seguro está ativo e você já está protegido. Aqui estão algumas informações importantes:</p>
    <ul>
      <li><strong>Sinistros:</strong> (43) 9143-4002 (24h)</li>
      <li><strong>Dúvidas:</strong> contato@jacometoseguros.com.br</li>
      <li><strong>Portal:</strong> jacometoseguros.com.br/cliente</li>
    </ul>
    <p>Conte conosco sempre que precisar!</p>
    <p style="margin-top: 30px;">Com carinho,<br><strong>Equipe Jacometo Seguros</strong></p>
  </div>',
  'welcome'
);