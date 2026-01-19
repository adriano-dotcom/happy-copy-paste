-- Insert 9 pre-optimized email templates by vertical
INSERT INTO email_templates (name, subject, body_html, category, is_active)
VALUES 
-- TRANSPORTE - Prospecção
('Prospecção - Transporte', 'Proteção para sua operação de transporte - {{empresa}}', 
'<div style="font-family: Arial, sans-serif; color: #333; line-height: 1.6;">
<p>{{saudacao}} {{nome}},</p>

<p>Sou o Adriano, da <strong>Jacometo Corretora de Seguros</strong>. Trabalhamos exclusivamente com transportadores há mais de 15 anos, e vi que a <strong>{{empresa}}</strong> atua no setor.</p>

<p>Nosso foco é garantir <strong>proteção completa para sua carga e operação</strong> — com coberturas de RCTR-C, RC-DC e RC-V que trazem tranquilidade no dia a dia.</p>

<p>Posso te enviar uma simulação rápida? Qual o melhor canal para conversarmos?</p>

<br/><br/>
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top: 20px; border-top: 1px solid #e2e8f0; padding-top: 20px;">
  <tr>
    <td style="font-family: Arial, sans-serif; font-size: 14px; color: #333; line-height: 1.7;">
      <p style="margin: 0 0 12px 0; font-weight: 500; color: #475569;">Atenciosamente,</p>
      <strong style="font-size: 15px; color: #1e293b; display: block;">Adriano Jacometo</strong>
      <span style="color: #64748b; display: block; margin-bottom: 4px;">Corretor de Seguros</span>
      <strong style="color: #334155; display: block; margin-bottom: 16px;">Jacometo Corretora de Seguros</strong>
      <span style="display: block; margin-bottom: 6px; color: #475569;">📱 WhatsApp: <a href="https://wa.me/5543991434002" style="color: #25D366; text-decoration: none;">+55 43 99143-4002</a></span>
      <span style="display: block; margin-bottom: 6px; color: #475569;">📞 Telefone: (43) 3321-5007</span>
      <span style="display: block; margin-bottom: 6px; color: #475569;">📍 Rua Souza Naves, 612 – Sala 51 – Centro – Londrina/PR</span>
      <span style="display: block; margin-top: 10px;">🌐 <a href="https://transporte.jacometoseguros.com.br" style="color: #6366f1; text-decoration: none;">transporte.jacometoseguros.com.br</a></span>
    </td>
  </tr>
</table>
</div>', 'general', true),

-- TRANSPORTE - Follow-up
('Follow-up - Transporte', 'Retomando: proteção para suas cargas - {{nome}}', 
'<div style="font-family: Arial, sans-serif; color: #333; line-height: 1.6;">
<p>{{saudacao}} {{nome}},</p>

<p>Tudo bem? Sou o Adriano, da Jacometo Seguros. Conversamos recentemente sobre seguro de carga para a <strong>{{empresa}}</strong>.</p>

<p>Queria saber se conseguiu avaliar nossa proposta ou se surgiu alguma dúvida. Estou à disposição para esclarecer qualquer ponto.</p>

<p>Quando fica bom para conversarmos?</p>

<br/><br/>
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top: 20px; border-top: 1px solid #e2e8f0; padding-top: 20px;">
  <tr>
    <td style="font-family: Arial, sans-serif; font-size: 14px; color: #333; line-height: 1.7;">
      <p style="margin: 0 0 12px 0; font-weight: 500; color: #475569;">Atenciosamente,</p>
      <strong style="font-size: 15px; color: #1e293b; display: block;">Adriano Jacometo</strong>
      <span style="color: #64748b; display: block; margin-bottom: 4px;">Corretor de Seguros</span>
      <strong style="color: #334155; display: block; margin-bottom: 16px;">Jacometo Corretora de Seguros</strong>
      <span style="display: block; margin-bottom: 6px; color: #475569;">📱 WhatsApp: <a href="https://wa.me/5543991434002" style="color: #25D366; text-decoration: none;">+55 43 99143-4002</a></span>
      <span style="display: block; margin-bottom: 6px; color: #475569;">📞 Telefone: (43) 3321-5007</span>
      <span style="display: block; margin-bottom: 6px; color: #475569;">📍 Rua Souza Naves, 612 – Sala 51 – Centro – Londrina/PR</span>
      <span style="display: block; margin-top: 10px;">🌐 <a href="https://transporte.jacometoseguros.com.br" style="color: #6366f1; text-decoration: none;">transporte.jacometoseguros.com.br</a></span>
    </td>
  </tr>
</table>
</div>', 'follow-up', true),

-- TRANSPORTE - Proposta
('Proposta - Transporte', 'Proposta de Seguro de Carga - {{empresa}}', 
'<div style="font-family: Arial, sans-serif; color: #333; line-height: 1.6;">
<p>{{saudacao}} {{nome}},</p>

<p>Conforme combinado, segue a proposta de seguro de carga para a <strong>{{empresa}}</strong>.</p>

<p><strong>Coberturas incluídas:</strong></p>
<ul style="margin: 10px 0; padding-left: 20px;">
  <li>RCTR-C – Responsabilidade Civil do Transportador</li>
  <li>RC-DC – Cobertura contra roubo e desaparecimento de carga</li>
  <li>RC-V – Danos a terceiros</li>
</ul>

<p>A proposta está válida por <strong>7 dias</strong>. Qualquer dúvida, estou à disposição.</p>

<p>Podemos agendar uma ligação para fecharmos os detalhes?</p>

<br/><br/>
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top: 20px; border-top: 1px solid #e2e8f0; padding-top: 20px;">
  <tr>
    <td style="font-family: Arial, sans-serif; font-size: 14px; color: #333; line-height: 1.7;">
      <p style="margin: 0 0 12px 0; font-weight: 500; color: #475569;">Atenciosamente,</p>
      <strong style="font-size: 15px; color: #1e293b; display: block;">Adriano Jacometo</strong>
      <span style="color: #64748b; display: block; margin-bottom: 4px;">Corretor de Seguros</span>
      <strong style="color: #334155; display: block; margin-bottom: 16px;">Jacometo Corretora de Seguros</strong>
      <span style="display: block; margin-bottom: 6px; color: #475569;">📱 WhatsApp: <a href="https://wa.me/5543991434002" style="color: #25D366; text-decoration: none;">+55 43 99143-4002</a></span>
      <span style="display: block; margin-bottom: 6px; color: #475569;">📞 Telefone: (43) 3321-5007</span>
      <span style="display: block; margin-bottom: 6px; color: #475569;">📍 Rua Souza Naves, 612 – Sala 51 – Centro – Londrina/PR</span>
      <span style="display: block; margin-top: 10px;">🌐 <a href="https://transporte.jacometoseguros.com.br" style="color: #6366f1; text-decoration: none;">transporte.jacometoseguros.com.br</a></span>
    </td>
  </tr>
</table>
</div>', 'proposal', true),

-- FROTAS - Prospecção
('Prospecção - Frotas', 'Proteção completa para sua frota - {{empresa}}', 
'<div style="font-family: Arial, sans-serif; color: #333; line-height: 1.6;">
<p>{{saudacao}} {{nome}},</p>

<p>Sou o Adriano, da <strong>Jacometo Corretora de Seguros</strong>. Atendemos empresas com frotas há mais de 15 anos, oferecendo <strong>proteção patrimonial completa</strong>.</p>

<p>Para a <strong>{{empresa}}</strong>, podemos montar um plano que inclui:</p>
<ul style="margin: 10px 0; padding-left: 20px;">
  <li>Seguro de frota com condições especiais</li>
  <li>Cobertura de terceiros e assistência 24h</li>
  <li>Gestão de sinistros simplificada</li>
</ul>

<p>Quantos veículos vocês têm hoje? Posso preparar uma simulação personalizada.</p>

<br/><br/>
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top: 20px; border-top: 1px solid #e2e8f0; padding-top: 20px;">
  <tr>
    <td style="font-family: Arial, sans-serif; font-size: 14px; color: #333; line-height: 1.7;">
      <p style="margin: 0 0 12px 0; font-weight: 500; color: #475569;">Atenciosamente,</p>
      <strong style="font-size: 15px; color: #1e293b; display: block;">Adriano Jacometo</strong>
      <span style="color: #64748b; display: block; margin-bottom: 4px;">Corretor de Seguros</span>
      <strong style="color: #334155; display: block; margin-bottom: 16px;">Jacometo Corretora de Seguros</strong>
      <span style="display: block; margin-bottom: 6px; color: #475569;">📱 WhatsApp: <a href="https://wa.me/5543991434002" style="color: #25D366; text-decoration: none;">+55 43 99143-4002</a></span>
      <span style="display: block; margin-bottom: 6px; color: #475569;">📞 Telefone: (43) 3321-5007</span>
      <span style="display: block; margin-bottom: 6px; color: #475569;">📍 Rua Souza Naves, 612 – Sala 51 – Centro – Londrina/PR</span>
      <span style="display: block; margin-top: 10px;">🌐 <a href="https://transporte.jacometoseguros.com.br" style="color: #6366f1; text-decoration: none;">transporte.jacometoseguros.com.br</a></span>
    </td>
  </tr>
</table>
</div>', 'general', true),

-- FROTAS - Follow-up
('Follow-up - Frotas', 'Retomando: seguro de frota - {{nome}}', 
'<div style="font-family: Arial, sans-serif; color: #333; line-height: 1.6;">
<p>{{saudacao}} {{nome}},</p>

<p>Tudo bem? Sou o Adriano, da Jacometo Seguros. Conversamos sobre o seguro de frota da <strong>{{empresa}}</strong>.</p>

<p>Conseguiu avaliar as opções? Estou à disposição para ajustar qualquer cobertura ou tirar dúvidas.</p>

<p>Qual o melhor horário para uma ligação rápida?</p>

<br/><br/>
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top: 20px; border-top: 1px solid #e2e8f0; padding-top: 20px;">
  <tr>
    <td style="font-family: Arial, sans-serif; font-size: 14px; color: #333; line-height: 1.7;">
      <p style="margin: 0 0 12px 0; font-weight: 500; color: #475569;">Atenciosamente,</p>
      <strong style="font-size: 15px; color: #1e293b; display: block;">Adriano Jacometo</strong>
      <span style="color: #64748b; display: block; margin-bottom: 4px;">Corretor de Seguros</span>
      <strong style="color: #334155; display: block; margin-bottom: 16px;">Jacometo Corretora de Seguros</strong>
      <span style="display: block; margin-bottom: 6px; color: #475569;">📱 WhatsApp: <a href="https://wa.me/5543991434002" style="color: #25D366; text-decoration: none;">+55 43 99143-4002</a></span>
      <span style="display: block; margin-bottom: 6px; color: #475569;">📞 Telefone: (43) 3321-5007</span>
      <span style="display: block; margin-bottom: 6px; color: #475569;">📍 Rua Souza Naves, 612 – Sala 51 – Centro – Londrina/PR</span>
      <span style="display: block; margin-top: 10px;">🌐 <a href="https://transporte.jacometoseguros.com.br" style="color: #6366f1; text-decoration: none;">transporte.jacometoseguros.com.br</a></span>
    </td>
  </tr>
</table>
</div>', 'follow-up', true),

-- FROTAS - Proposta
('Proposta - Frotas', 'Proposta de Seguro de Frota - {{empresa}}', 
'<div style="font-family: Arial, sans-serif; color: #333; line-height: 1.6;">
<p>{{saudacao}} {{nome}},</p>

<p>Segue a proposta de seguro de frota para a <strong>{{empresa}}</strong>, conforme conversamos.</p>

<p><strong>Coberturas incluídas:</strong></p>
<ul style="margin: 10px 0; padding-left: 20px;">
  <li>Cobertura compreensiva (colisão, roubo, incêndio)</li>
  <li>Responsabilidade civil de terceiros</li>
  <li>Assistência 24h nacional</li>
  <li>Carro reserva (conforme contratado)</li>
</ul>

<p>Proposta válida por <strong>10 dias</strong>. Posso esclarecer qualquer dúvida.</p>

<p>Vamos agendar uma conversa para fechar?</p>

<br/><br/>
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top: 20px; border-top: 1px solid #e2e8f0; padding-top: 20px;">
  <tr>
    <td style="font-family: Arial, sans-serif; font-size: 14px; color: #333; line-height: 1.7;">
      <p style="margin: 0 0 12px 0; font-weight: 500; color: #475569;">Atenciosamente,</p>
      <strong style="font-size: 15px; color: #1e293b; display: block;">Adriano Jacometo</strong>
      <span style="color: #64748b; display: block; margin-bottom: 4px;">Corretor de Seguros</span>
      <strong style="color: #334155; display: block; margin-bottom: 16px;">Jacometo Corretora de Seguros</strong>
      <span style="display: block; margin-bottom: 6px; color: #475569;">📱 WhatsApp: <a href="https://wa.me/5543991434002" style="color: #25D366; text-decoration: none;">+55 43 99143-4002</a></span>
      <span style="display: block; margin-bottom: 6px; color: #475569;">📞 Telefone: (43) 3321-5007</span>
      <span style="display: block; margin-bottom: 6px; color: #475569;">📍 Rua Souza Naves, 612 – Sala 51 – Centro – Londrina/PR</span>
      <span style="display: block; margin-top: 10px;">🌐 <a href="https://transporte.jacometoseguros.com.br" style="color: #6366f1; text-decoration: none;">transporte.jacometoseguros.com.br</a></span>
    </td>
  </tr>
</table>
</div>', 'proposal', true),

-- SAÚDE - Prospecção
('Prospecção - Saúde', 'Plano de Saúde para sua equipe - {{empresa}}', 
'<div style="font-family: Arial, sans-serif; color: #333; line-height: 1.6;">
<p>{{saudacao}} {{nome}},</p>

<p>Sou o Adriano, da <strong>Jacometo Corretora de Seguros</strong>. Trabalhamos com as principais operadoras de saúde do Brasil, como Unimed, Bradesco Saúde, SulAmérica e outras.</p>

<p>Para a <strong>{{empresa}}</strong>, posso apresentar opções de planos que equilibram <strong>custo e cobertura</strong>, pensando no bem-estar da sua equipe.</p>

<p>Quantos colaboradores vocês têm hoje? Assim já consigo trazer opções direcionadas.</p>

<br/><br/>
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top: 20px; border-top: 1px solid #e2e8f0; padding-top: 20px;">
  <tr>
    <td style="font-family: Arial, sans-serif; font-size: 14px; color: #333; line-height: 1.7;">
      <p style="margin: 0 0 12px 0; font-weight: 500; color: #475569;">Atenciosamente,</p>
      <strong style="font-size: 15px; color: #1e293b; display: block;">Adriano Jacometo</strong>
      <span style="color: #64748b; display: block; margin-bottom: 4px;">Corretor de Seguros</span>
      <strong style="color: #334155; display: block; margin-bottom: 16px;">Jacometo Corretora de Seguros</strong>
      <span style="display: block; margin-bottom: 6px; color: #475569;">📱 WhatsApp: <a href="https://wa.me/5543991434002" style="color: #25D366; text-decoration: none;">+55 43 99143-4002</a></span>
      <span style="display: block; margin-bottom: 6px; color: #475569;">📞 Telefone: (43) 3321-5007</span>
      <span style="display: block; margin-bottom: 6px; color: #475569;">📍 Rua Souza Naves, 612 – Sala 51 – Centro – Londrina/PR</span>
      <span style="display: block; margin-top: 10px;">🌐 <a href="https://transporte.jacometoseguros.com.br" style="color: #6366f1; text-decoration: none;">transporte.jacometoseguros.com.br</a></span>
    </td>
  </tr>
</table>
</div>', 'general', true),

-- SAÚDE - Follow-up
('Follow-up - Saúde', 'Retomando: plano de saúde - {{nome}}', 
'<div style="font-family: Arial, sans-serif; color: #333; line-height: 1.6;">
<p>{{saudacao}} {{nome}},</p>

<p>Tudo bem? Sou o Adriano, da Jacometo Seguros. Conversamos sobre planos de saúde para a <strong>{{empresa}}</strong>.</p>

<p>Conseguiu avaliar as opções que enviei? Posso ajustar as coberturas ou buscar outras operadoras se preferir.</p>

<p>Quando podemos conversar?</p>

<br/><br/>
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top: 20px; border-top: 1px solid #e2e8f0; padding-top: 20px;">
  <tr>
    <td style="font-family: Arial, sans-serif; font-size: 14px; color: #333; line-height: 1.7;">
      <p style="margin: 0 0 12px 0; font-weight: 500; color: #475569;">Atenciosamente,</p>
      <strong style="font-size: 15px; color: #1e293b; display: block;">Adriano Jacometo</strong>
      <span style="color: #64748b; display: block; margin-bottom: 4px;">Corretor de Seguros</span>
      <strong style="color: #334155; display: block; margin-bottom: 16px;">Jacometo Corretora de Seguros</strong>
      <span style="display: block; margin-bottom: 6px; color: #475569;">📱 WhatsApp: <a href="https://wa.me/5543991434002" style="color: #25D366; text-decoration: none;">+55 43 99143-4002</a></span>
      <span style="display: block; margin-bottom: 6px; color: #475569;">📞 Telefone: (43) 3321-5007</span>
      <span style="display: block; margin-bottom: 6px; color: #475569;">📍 Rua Souza Naves, 612 – Sala 51 – Centro – Londrina/PR</span>
      <span style="display: block; margin-top: 10px;">🌐 <a href="https://transporte.jacometoseguros.com.br" style="color: #6366f1; text-decoration: none;">transporte.jacometoseguros.com.br</a></span>
    </td>
  </tr>
</table>
</div>', 'follow-up', true),

-- SAÚDE - Proposta
('Proposta - Saúde', 'Proposta de Plano de Saúde - {{empresa}}', 
'<div style="font-family: Arial, sans-serif; color: #333; line-height: 1.6;">
<p>{{saudacao}} {{nome}},</p>

<p>Segue a proposta de plano de saúde para a <strong>{{empresa}}</strong>, conforme conversamos.</p>

<p><strong>Detalhes da proposta:</strong></p>
<ul style="margin: 10px 0; padding-left: 20px;">
  <li>Operadora selecionada conforme seu perfil</li>
  <li>Cobertura nacional/regional</li>
  <li>Rede credenciada ampla</li>
  <li>Carências reduzidas (quando aplicável)</li>
</ul>

<p>Proposta válida por <strong>15 dias</strong>. Estou à disposição para esclarecer qualquer dúvida.</p>

<p>Podemos agendar uma ligação para alinhar os próximos passos?</p>

<br/><br/>
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top: 20px; border-top: 1px solid #e2e8f0; padding-top: 20px;">
  <tr>
    <td style="font-family: Arial, sans-serif; font-size: 14px; color: #333; line-height: 1.7;">
      <p style="margin: 0 0 12px 0; font-weight: 500; color: #475569;">Atenciosamente,</p>
      <strong style="font-size: 15px; color: #1e293b; display: block;">Adriano Jacometo</strong>
      <span style="color: #64748b; display: block; margin-bottom: 4px;">Corretor de Seguros</span>
      <strong style="color: #334155; display: block; margin-bottom: 16px;">Jacometo Corretora de Seguros</strong>
      <span style="display: block; margin-bottom: 6px; color: #475569;">📱 WhatsApp: <a href="https://wa.me/5543991434002" style="color: #25D366; text-decoration: none;">+55 43 99143-4002</a></span>
      <span style="display: block; margin-bottom: 6px; color: #475569;">📞 Telefone: (43) 3321-5007</span>
      <span style="display: block; margin-bottom: 6px; color: #475569;">📍 Rua Souza Naves, 612 – Sala 51 – Centro – Londrina/PR</span>
      <span style="display: block; margin-top: 10px;">🌐 <a href="https://transporte.jacometoseguros.com.br" style="color: #6366f1; text-decoration: none;">transporte.jacometoseguros.com.br</a></span>
    </td>
  </tr>
</table>
</div>', 'proposal', true);