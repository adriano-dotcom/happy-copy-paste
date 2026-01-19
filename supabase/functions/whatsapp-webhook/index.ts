import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { encode as base64Encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";

// Declare EdgeRuntime for background tasks (Supabase Deno runtime)
declare const EdgeRuntime: {
  waitUntil(promise: Promise<any>): void;
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ===== TIMEZONE UTILITY =====
const BRAZIL_TIMEZONE = 'America/Sao_Paulo';
function toBRT(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleString('pt-BR', { timeZone: BRAZIL_TIMEZONE });
}
// ===== END TIMEZONE UTILITY =====

const dddMap: Record<string, { city: string; state: string }> = {
  '11': { city: 'São Paulo', state: 'SP' }, '12': { city: 'São José dos Campos', state: 'SP' },
  '13': { city: 'Santos', state: 'SP' }, '14': { city: 'Bauru', state: 'SP' },
  '15': { city: 'Sorocaba', state: 'SP' }, '16': { city: 'Ribeirão Preto', state: 'SP' },
  '17': { city: 'São José do Rio Preto', state: 'SP' }, '18': { city: 'Presidente Prudente', state: 'SP' },
  '19': { city: 'Campinas', state: 'SP' }, '21': { city: 'Rio de Janeiro', state: 'RJ' },
  '22': { city: 'Campos dos Goytacazes', state: 'RJ' }, '24': { city: 'Petrópolis', state: 'RJ' },
  '27': { city: 'Vitória', state: 'ES' }, '28': { city: 'Cachoeiro de Itapemirim', state: 'ES' },
  '31': { city: 'Belo Horizonte', state: 'MG' }, '32': { city: 'Juiz de Fora', state: 'MG' },
  '33': { city: 'Governador Valadares', state: 'MG' }, '34': { city: 'Uberlândia', state: 'MG' },
  '35': { city: 'Poços de Caldas', state: 'MG' }, '37': { city: 'Divinópolis', state: 'MG' },
  '38': { city: 'Montes Claros', state: 'MG' }, '41': { city: 'Curitiba', state: 'PR' },
  '42': { city: 'Ponta Grossa', state: 'PR' }, '43': { city: 'Londrina', state: 'PR' },
  '44': { city: 'Maringá', state: 'PR' }, '45': { city: 'Cascavel', state: 'PR' },
  '46': { city: 'Francisco Beltrão', state: 'PR' }, '47': { city: 'Joinville', state: 'SC' },
  '48': { city: 'Florianópolis', state: 'SC' }, '49': { city: 'Chapecó', state: 'SC' },
  '51': { city: 'Porto Alegre', state: 'RS' }, '53': { city: 'Pelotas', state: 'RS' },
  '54': { city: 'Caxias do Sul', state: 'RS' }, '55': { city: 'Santa Maria', state: 'RS' },
  '61': { city: 'Brasília', state: 'DF' }, '62': { city: 'Goiânia', state: 'GO' },
  '64': { city: 'Rio Verde', state: 'GO' }, '63': { city: 'Palmas', state: 'TO' },
  '65': { city: 'Cuiabá', state: 'MT' }, '66': { city: 'Rondonópolis', state: 'MT' },
  '67': { city: 'Campo Grande', state: 'MS' }, '68': { city: 'Rio Branco', state: 'AC' },
  '69': { city: 'Porto Velho', state: 'RO' }, '71': { city: 'Salvador', state: 'BA' },
  '73': { city: 'Ilhéus', state: 'BA' }, '74': { city: 'Juazeiro', state: 'BA' },
  '75': { city: 'Feira de Santana', state: 'BA' }, '77': { city: 'Vitória da Conquista', state: 'BA' },
  '79': { city: 'Aracaju', state: 'SE' }, '81': { city: 'Recife', state: 'PE' },
  '87': { city: 'Petrolina', state: 'PE' }, '82': { city: 'Maceió', state: 'AL' },
  '83': { city: 'João Pessoa', state: 'PB' }, '84': { city: 'Natal', state: 'RN' },
  '85': { city: 'Fortaleza', state: 'CE' }, '88': { city: 'Juazeiro do Norte', state: 'CE' },
  '86': { city: 'Teresina', state: 'PI' }, '89': { city: 'Picos', state: 'PI' },
  '98': { city: 'São Luís', state: 'MA' }, '99': { city: 'Imperatriz', state: 'MA' },
  '91': { city: 'Belém', state: 'PA' }, '93': { city: 'Santarém', state: 'PA' },
  '94': { city: 'Marabá', state: 'PA' }, '92': { city: 'Manaus', state: 'AM' },
  '97': { city: 'Parintins', state: 'AM' }, '95': { city: 'Boa Vista', state: 'RR' },
  '96': { city: 'Macapá', state: 'AP' },
};

function getRegionFromDDD(phoneNumber: string): { city: string; state: string } | null {
  const digits = phoneNumber.replace(/\D/g, '');
  if (digits.length < 10) return null;
  const ddd = digits.startsWith('55') && digits.length >= 12 ? digits.substring(2, 4) : digits.substring(0, 2);
  return dddMap[ddd] || null;
}

// Normalize Brazilian phone number to consistent format
function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('55') && digits.length >= 12) {
    return digits;
  }
  if (digits.length >= 10 && digits.length <= 11) {
    return '55' + digits;
  }
  return digits;
}

// Generate phone variants for flexible search (Brazilian mobile numbers)
function getPhoneVariants(phone: string): string[] {
  const normalized = normalizePhone(phone);
  const variants: string[] = [normalized];
  
  if (!normalized.startsWith('55') || normalized.length < 12) {
    return variants;
  }
  
  const ddd = normalized.substring(2, 4);
  const rest = normalized.substring(4);
  
  if (rest.length === 9 && rest.startsWith('9')) {
    const withoutNine = '55' + ddd + rest.substring(1);
    variants.push(withoutNine);
  }
  
  if (rest.length === 8) {
    const withNine = '55' + ddd + '9' + rest;
    variants.push(withNine);
  }
  
  console.log('[Webhook] Phone variants for', phone, ':', variants);
  return variants;
}

// Find contact by phone OR whatsapp_id with flexible matching
async function findContactByPhone(supabase: any, phoneNumber: string): Promise<any | null> {
  const { data: contactByWaId, error: waIdError } = await supabase
    .from('contacts')
    .select('*')
    .eq('whatsapp_id', phoneNumber)
    .maybeSingle();
  
  if (waIdError) {
    console.error('[Webhook] Error searching contacts by whatsapp_id:', waIdError);
  }
  
  if (contactByWaId) {
    console.log('[Webhook] Found existing contact by whatsapp_id:', contactByWaId.id);
    return contactByWaId;
  }
  
  const variants = getPhoneVariants(phoneNumber);
  
  const { data: contacts, error } = await supabase
    .from('contacts')
    .select('*')
    .in('phone_number', variants);
  
  if (error) {
    console.error('[Webhook] Error searching contacts:', error);
    return null;
  }
  
  if (contacts && contacts.length > 0) {
    const contact = contacts[0];
    console.log('[Webhook] Found existing contact with phone variant:', contact.phone_number);
    
    if (!contact.whatsapp_id && phoneNumber) {
      await supabase
        .from('contacts')
        .update({ whatsapp_id: phoneNumber })
        .eq('id', contact.id);
      console.log('[Webhook] Updated whatsapp_id for contact:', contact.id);
    }
    
    return contact;
  }
  
  return null;
}

// ===== HMAC-SHA256 SIGNATURE VERIFICATION =====
async function verifyWebhookSignature(
  bodyText: string,
  signatureHeader: string | null,
  appSecret: string
): Promise<boolean> {
  if (!signatureHeader || !appSecret) {
    console.warn('[Webhook] Missing signature header or app secret');
    return false;
  }

  try {
    if (!signatureHeader.startsWith('sha256=')) {
      console.warn('[Webhook] Invalid signature format');
      return false;
    }

    const providedSignature = signatureHeader.substring(7);
    const encoder = new TextEncoder();
    const keyData = encoder.encode(appSecret);
    const messageData = encoder.encode(bodyText);
    
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    
    const signatureBuffer = await crypto.subtle.sign('HMAC', cryptoKey, messageData);
    const signatureArray = new Uint8Array(signatureBuffer);
    const expectedSignature = Array.from(signatureArray)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    if (providedSignature.length !== expectedSignature.length) {
      return false;
    }
    
    let result = 0;
    for (let i = 0; i < providedSignature.length; i++) {
      result |= providedSignature.charCodeAt(i) ^ expectedSignature.charCodeAt(i);
    }
    
    const isValid = result === 0;
    if (!isValid) {
      console.warn('[Webhook] Signature mismatch');
    }
    
    return isValid;
  } catch (error) {
    console.error('[Webhook] Signature verification error:', error);
    return false;
  }
}
// ===== END SIGNATURE VERIFICATION =====

// ===== BACKGROUND TASK: Handle shutdown gracefully =====
addEventListener('beforeunload', (ev: any) => {
  console.log('[Webhook] Function shutdown due to:', ev.detail?.reason);
});
// ===== END SHUTDOWN HANDLING =====

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const lovableApiKey = Deno.env.get('LOVABLE_API_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    // GET request = Webhook verification from WhatsApp
    if (req.method === 'GET') {
      const url = new URL(req.url);
      const mode = url.searchParams.get('hub.mode');
      const token = url.searchParams.get('hub.verify_token');
      const challenge = url.searchParams.get('hub.challenge');

      const { data: settings } = await supabase
        .from('nina_settings')
        .select('whatsapp_verify_token')
        .maybeSingle();

      const verifyToken = settings?.whatsapp_verify_token || 'webhook-verify-token';

      if (mode === 'subscribe' && token === verifyToken) {
        console.log('[Webhook] Verification successful');
        return new Response(challenge, { status: 200, headers: corsHeaders });
      } else {
        console.error('[Webhook] Verification failed');
        return new Response('Forbidden', { status: 403, headers: corsHeaders });
      }
    }

    // POST request = Incoming message from WhatsApp
    if (req.method === 'POST') {
      const bodyText = await req.text();
      
      const { data: authSettings } = await supabase
        .from('nina_settings')
        .select('whatsapp_app_secret, whatsapp_access_token')
        .maybeSingle();
      
      const appSecret = authSettings?.whatsapp_app_secret;
      
      if (appSecret) {
        const signatureHeader = req.headers.get('X-Hub-Signature-256');
        const isValidSignature = await verifyWebhookSignature(bodyText, signatureHeader, appSecret);
        
        if (!isValidSignature) {
          console.error('[Webhook] Invalid signature - rejecting request');
          return new Response('Forbidden', { status: 403, headers: corsHeaders });
        }
        console.log('[Webhook] Signature verified successfully');
      } else {
        console.warn('[Webhook] ⚠️ App secret not configured - signature verification skipped.');
      }
      
      const body = JSON.parse(bodyText);
      console.log('[Webhook] Received payload at', toBRT(new Date()));

      const entry = body.entry?.[0];
      const changes = entry?.changes?.[0];
      const value = changes?.value;
      const field = changes?.field;
      
      if (!value) {
        console.log('[Webhook] No value in payload, ignoring');
        return new Response(JSON.stringify({ status: 'ignored' }), { 
          status: 200, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        });
      }

      // ===== HANDLE ACCOUNT UPDATES (Quality Score, Tier changes) =====
      if (field === 'account_update') {
        console.log('[Webhook] Received account_update event:', JSON.stringify(value));
        EdgeRuntime.waitUntil(handleAccountUpdate(supabase, value));
        return new Response(JSON.stringify({ status: 'processing_account_update' }), { 
          status: 200, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        });
      }

      // ===== HANDLE TEMPLATE STATUS UPDATES =====
      if (field === 'message_template_status_update') {
        console.log('[Webhook] Received template status update:', JSON.stringify(value));
        EdgeRuntime.waitUntil(handleTemplateStatusUpdate(supabase, value));
        return new Response(JSON.stringify({ status: 'processing_template_update' }), { 
          status: 200, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        });
      }

      const messages = value.messages;
      const contacts = value.contacts;
      const phoneNumberId = value.metadata?.phone_number_id;

      // Handle status updates (delivered, read, etc) - fast path
      if (value.statuses) {
        // Process status updates in background
        EdgeRuntime.waitUntil(processStatusUpdates(supabase, value.statuses));
        
        return new Response(JSON.stringify({ status: 'processing_statuses' }), { 
          status: 200, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        });
      }

      // Process incoming messages
      if (messages && messages.length > 0) {
        const settings = authSettings;
        
        for (const message of messages) {
          const contactInfo = contacts?.find((c: any) => c.wa_id === message.from);
          
          // Insert into message_grouping_queue for deduplication
          const { error: queueError } = await supabase
            .from('message_grouping_queue')
            .insert({
              whatsapp_message_id: message.id,
              phone_number_id: phoneNumberId,
              message_data: message,
              contacts_data: contactInfo || null
            });

          if (queueError) {
            if (queueError.code === '23505') {
              console.log('[Webhook] Duplicate message ignored:', message.id);
            } else {
              console.error('[Webhook] Queue insert error:', queueError);
              // Log to dead letter queue
              await logToDeadLetterQueue(supabase, message, phoneNumberId, queueError);
            }
            continue;
          }
          
          console.log('[Webhook] Message queued:', message.id);
          
          // ===== BACKGROUND PROCESSING: Heavy operations run after response =====
          // Queue message record first (fast), then process media in background
          EdgeRuntime.waitUntil(
            processIncomingMessageWithBackground(
              supabase, 
              message, 
              contactInfo, 
              phoneNumberId, 
              settings, 
              lovableApiKey
            )
          );
        }
        
        // Return immediately after queuing - don't wait for OCR/transcription
        return new Response(JSON.stringify({ status: 'queued', count: messages.length }), { 
          status: 200, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        });
      }

      return new Response(JSON.stringify({ status: 'processed' }), { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }

    return new Response('Method not allowed', { status: 405, headers: corsHeaders });

  } catch (error) {
    console.error('[Webhook] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500, 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });
  }
});

// ===== DEAD LETTER QUEUE: Log failed messages for retry =====
async function logToDeadLetterQueue(
  supabase: any, 
  message: any, 
  phoneNumberId: string, 
  error: any
) {
  try {
    await supabase.from('webhook_dead_letter').insert({
      source: 'whatsapp',
      payload: message,
      error_message: error?.message || JSON.stringify(error),
      phone_number_id: phoneNumberId
    });
    console.log('[Webhook] Logged to dead letter queue:', message.id);
  } catch (dlqError) {
    console.error('[Webhook] Failed to log to dead letter queue:', dlqError);
  }
}

// ===== BACKGROUND: Process status updates =====
async function processStatusUpdates(supabase: any, statuses: any[]) {
  for (const status of statuses) {
    try {
      console.log('[Webhook] Processing status update:', status.status, 'for', status.id);
      
      if (status.id) {
        const statusMap: Record<string, string> = {
          'sent': 'sent',
          'delivered': 'delivered',
          'read': 'read',
          'failed': 'failed'
        };
        
        const newStatus = statusMap[status.status];
        if (newStatus) {
          const updateData: Record<string, any> = { 
            status: newStatus,
            ...(newStatus === 'delivered' && { delivered_at: new Date().toISOString() }),
            ...(newStatus === 'read' && { read_at: new Date().toISOString() })
          };
          
          if (newStatus === 'failed' && status.errors && status.errors.length > 0) {
            console.log('[Webhook] Message failed with errors:', JSON.stringify(status.errors));
            
            const { data: existingMsg } = await supabase
              .from('messages')
              .select('metadata')
              .eq('whatsapp_message_id', status.id)
              .maybeSingle();
            
            updateData.metadata = {
              ...(existingMsg?.metadata || {}),
              whatsapp_error: {
                code: status.errors[0]?.code,
                title: status.errors[0]?.title,
                message: status.errors[0]?.message,
                details: status.errors[0]?.error_data?.details
              }
            };
          }
          
          await supabase
            .from('messages')
            .update(updateData)
            .eq('whatsapp_message_id', status.id);
            
          // Also update campaign_contacts if this is a campaign message
          if (newStatus === 'delivered' || newStatus === 'read') {
            const updateField = newStatus === 'delivered' ? 'delivered_at' : 'read_at';
            await supabase
              .from('campaign_contacts')
              .update({ [updateField]: new Date().toISOString() })
              .eq('whatsapp_message_id', status.id);
          }
        }
      }
    } catch (error) {
      console.error('[Webhook] Error processing status:', error);
    }
  }
}

// Transcribe audio using ElevenLabs Scribe v1
async function transcribeAudio(
  audioBuffer: ArrayBuffer, 
  mimeType: string,
  supabase: any
): Promise<string | null> {
  try {
    const { data: settings } = await supabase
      .from('nina_settings')
      .select('elevenlabs_api_key')
      .maybeSingle();

    if (!settings?.elevenlabs_api_key) {
      console.log('[Webhook] ElevenLabs API key not configured, skipping transcription');
      return null;
    }

    console.log('[Webhook] Transcribing audio with ElevenLabs, size:', audioBuffer.byteLength, 'bytes');

    const formData = new FormData();
    const extension = mimeType.split('/')[1]?.replace('ogg; codecs=opus', 'ogg') || 'ogg';
    const blob = new Blob([audioBuffer], { type: mimeType });
    formData.append('file', blob, `audio.${extension}`);
    formData.append('model_id', 'scribe_v1');

    const response = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
      method: 'POST',
      headers: { 'xi-api-key': settings.elevenlabs_api_key },
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Webhook] ElevenLabs STT error:', response.status, errorText);
      return null;
    }

    const result = await response.json();
    const transcription = result.text?.trim() || null;
    
    if (transcription) {
      console.log('[Webhook] Transcription result:', transcription.substring(0, 100));
    }
    
    return transcription;
  } catch (error) {
    console.error('[Webhook] Error transcribing audio:', error);
    return null;
  }
}

// Extract text from image using Gemini Vision OCR
async function extractTextFromImage(
  imageBuffer: ArrayBuffer,
  mimeType: string,
  lovableApiKey: string
): Promise<string | null> {
  try {
    console.log('[OCR] Starting image text extraction, size:', imageBuffer.byteLength, 'bytes');
    
    const base64Image = base64Encode(imageBuffer);
    
    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: {
                url: `data:${mimeType};base64,${base64Image}`
              }
            },
            {
              type: 'text',
              text: 'Extraia TODO o texto visível nesta imagem. Se houver números de CNPJ, CPF, telefone ou endereços, extraia-os com precisão. Retorne APENAS o texto extraído, sem explicações ou comentários adicionais. Se não conseguir ler nenhum texto, responda apenas: [imagem sem texto legível]'
            }
          ]
        }],
        max_tokens: 1000
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[OCR] Gemini Vision error:', response.status, errorText);
      return null;
    }

    const data = await response.json();
    const extractedText = data.choices?.[0]?.message?.content?.trim();

    if (extractedText && extractedText !== '[imagem sem texto legível]') {
      console.log('[OCR] Texto extraído com sucesso:', extractedText.substring(0, 100) + '...');
      return extractedText;
    }
    
    console.log('[OCR] Nenhum texto legível encontrado na imagem');
    return null;

  } catch (error) {
    console.error('[OCR] Error extracting text from image:', error);
    return null;
  }
}

// Extract text from PDF document using Gemini Vision OCR
async function extractTextFromPDF(
  pdfBuffer: ArrayBuffer,
  lovableApiKey: string
): Promise<string | null> {
  try {
    console.log('[OCR] Starting PDF text extraction, size:', pdfBuffer.byteLength, 'bytes');
    
    const base64PDF = base64Encode(pdfBuffer);
    
    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: {
                url: `data:application/pdf;base64,${base64PDF}`
              }
            },
            {
              type: 'text',
              text: `Extraia TODO o texto visível deste documento PDF.

Se for um CRLV (Certificado de Registro e Licenciamento de Veículo), extraia com precisão:
- Placa do veículo
- RENAVAM
- Marca/Modelo
- Ano de fabricação e ano do modelo
- Combustível
- Nome do proprietário
- CPF/CNPJ do proprietário
- Cor do veículo
- Chassi (se visível)

Formate os dados de forma estruturada.
Se não conseguir ler, responda: [documento sem texto legível]`
            }
          ]
        }],
        max_tokens: 2000
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[OCR] Gemini PDF Vision error:', response.status, errorText);
      return null;
    }

    const data = await response.json();
    const extractedText = data.choices?.[0]?.message?.content?.trim();

    if (extractedText && extractedText !== '[documento sem texto legível]') {
      console.log('[OCR] PDF texto extraído com sucesso:', extractedText.substring(0, 100) + '...');
      return extractedText;
    }
    
    console.log('[OCR] Nenhum texto legível encontrado no PDF');
    return null;
  } catch (error) {
    console.error('[OCR] Error extracting text from PDF:', error);
    return null;
  }
}

// Download media from WhatsApp API and upload to Supabase Storage
async function downloadAndStoreMedia(
  supabase: any, 
  settings: any, 
  mediaId: string,
  contactPhone: string,
  messageType: string
): Promise<{ storageUrl: string | null; mediaBuffer: ArrayBuffer | null; mimeType: string | null }> {
  if (!settings?.whatsapp_access_token) {
    console.error('[Webhook] No WhatsApp access token configured');
    return { storageUrl: null, mediaBuffer: null, mimeType: null };
  }

  try {
    console.log('[Webhook] Getting media info for:', mediaId);
    const mediaInfoResponse = await fetch(
      `https://graph.facebook.com/v18.0/${mediaId}`,
      {
        headers: {
          'Authorization': `Bearer ${settings.whatsapp_access_token}`
        }
      }
    );

    if (!mediaInfoResponse.ok) {
      const errorText = await mediaInfoResponse.text();
      console.error('[Webhook] Failed to get media info:', errorText);
      return { storageUrl: null, mediaBuffer: null, mimeType: null };
    }

    const mediaInfo = await mediaInfoResponse.json();
    const mediaUrl = mediaInfo.url;
    const mimeType = mediaInfo.mime_type || 'application/octet-stream';

    if (!mediaUrl) {
      console.error('[Webhook] No media URL in response');
      return { storageUrl: null, mediaBuffer: null, mimeType: null };
    }

    console.log('[Webhook] Downloading media from WhatsApp...');
    const mediaResponse = await fetch(mediaUrl, {
      headers: {
        'Authorization': `Bearer ${settings.whatsapp_access_token}`
      }
    });

    if (!mediaResponse.ok) {
      const errorText = await mediaResponse.text();
      console.error('[Webhook] Failed to download media:', errorText);
      return { storageUrl: null, mediaBuffer: null, mimeType: null };
    }

    const mediaBuffer = await mediaResponse.arrayBuffer();
    console.log('[Webhook] Downloaded media, size:', mediaBuffer.byteLength, 'bytes');

    const fileExtension = mimeType.includes('pdf') ? 'pdf' :
                          mimeType.includes('msword') ? 'doc' :
                          mimeType.includes('wordprocessingml') ? 'docx' :
                          mimeType.includes('spreadsheetml') ? 'xlsx' :
                          mimeType.includes('ms-excel') ? 'xls' :
                          mimeType.includes('ogg') ? 'ogg' : 
                          mimeType.includes('mp4') ? 'mp4' : 
                          mimeType.includes('mpeg') ? 'mp3' :
                          mimeType.includes('jpeg') ? 'jpg' :
                          mimeType.includes('png') ? 'png' :
                          mimeType.includes('webp') ? 'webp' : 'bin';
    const timestamp = Date.now();
    const sanitizedPhone = contactPhone.replace(/\D/g, '');
    const fileName = `${messageType}/${sanitizedPhone}/${timestamp}_${mediaId.substring(0, 8)}.${fileExtension}`;

    console.log('[Webhook] Uploading to Storage:', fileName);
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('whatsapp-media')
      .upload(fileName, mediaBuffer, {
        contentType: mimeType,
        cacheControl: '31536000',
        upsert: false
      });

    if (uploadError) {
      console.error('[Webhook] Storage upload error:', uploadError);
      return { storageUrl: null, mediaBuffer, mimeType };
    }

    const { data: urlData } = supabase.storage
      .from('whatsapp-media')
      .getPublicUrl(fileName);

    const storageUrl = urlData?.publicUrl || null;
    console.log('[Webhook] Media stored successfully:', storageUrl);

    return { storageUrl, mediaBuffer, mimeType };

  } catch (error) {
    console.error('[Webhook] Error downloading/storing media:', error);
    return { storageUrl: null, mediaBuffer: null, mimeType: null };
  }
}

// ===== MAIN BACKGROUND PROCESSOR =====
// This runs after the webhook returns 200 to WhatsApp
async function processIncomingMessageWithBackground(
  supabase: any, 
  message: any, 
  contactInfo: any, 
  phoneNumberId: string,
  settings: any,
  lovableApiKey: string
) {
  try {
    const rawPhoneNumber = message.from;
    const normalizedPhone = normalizePhone(rawPhoneNumber);
    const whatsappId = contactInfo?.wa_id || rawPhoneNumber;
    const contactName = contactInfo?.profile?.name || null;

    // 1. Get or create contact using flexible phone search
    let contact = await findContactByPhone(supabase, rawPhoneNumber);

    if (!contact) {
      const region = getRegionFromDDD(normalizedPhone);
      
      const { data: newContact, error: contactError } = await supabase
        .from('contacts')
        .insert({
          phone_number: normalizedPhone,
          whatsapp_id: whatsappId,
          name: contactName,
          call_name: contactName?.split(' ')[0] || null,
          lead_source: 'inbound',
          city: region?.city || null,
          state: region?.state || null
        })
        .select()
        .single();

      if (contactError) {
        console.error('[Webhook BG] Error creating contact:', contactError);
        throw contactError;
      }
      contact = newContact;
      console.log('[Webhook BG] Created new contact:', contact.id, region ? `(${region.city} - ${region.state})` : '');
    } else {
      const updates: any = { last_activity: new Date().toISOString() };
      
      if (contactName && !contact.name) {
        updates.name = contactName;
        updates.call_name = contactName.split(' ')[0];
      }
      
      if (!contact.whatsapp_id) {
        updates.whatsapp_id = whatsappId;
      }
      
      await supabase
        .from('contacts')
        .update(updates)
        .eq('id', contact.id);
        
      console.log('[Webhook BG] Using existing contact:', contact.id);
    }

    // 2. Get or create active conversation
    const { data: existingConversations } = await supabase
      .from('conversations')
      .select('*')
      .eq('contact_id', contact.id)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1);

    let conversation = existingConversations?.[0] || null;

    if (!conversation) {
      const { data: inactiveConversations } = await supabase
        .from('conversations')
        .select('*')
        .eq('contact_id', contact.id)
        .eq('is_active', false)
        .order('updated_at', { ascending: false })
        .limit(1);

      if (inactiveConversations?.[0]) {
        const { data: reactivatedConv, error: reactivateError } = await supabase
          .from('conversations')
          .update({
            is_active: true,
            status: 'nina',
            whatsapp_window_start: new Date().toISOString()
          })
          .eq('id', inactiveConversations[0].id)
          .select()
          .single();

        if (!reactivateError && reactivatedConv) {
          conversation = reactivatedConv;
          console.log('[Webhook BG] Reactivated conversation:', conversation.id);
        }
      }
    }

    if (!conversation) {
      const { data: newConversation, error: convError } = await supabase
        .from('conversations')
        .insert({
          contact_id: contact.id,
          status: 'nina',
          is_active: true
        })
        .select()
        .single();

      if (convError) {
        console.error('[Webhook BG] Error creating conversation:', convError);
        throw convError;
      }
      conversation = newConversation;
      console.log('[Webhook BG] Created new conversation:', conversation.id);
    }

    // 3. Parse message content - FAST PATH for text, SLOW PATH for media
    let content: string | null = null;
    let mediaUrl: string | null = null;
    let mediaType: string | null = null;
    let messageType: string = 'text';
    let pendingMediaProcessing = false;

    switch (message.type) {
      case 'text':
        content = message.text?.body;
        break;
      case 'image':
        messageType = 'image';
        mediaType = 'image';
        content = message.image?.caption || '[imagem - processando...]';
        pendingMediaProcessing = true;
        break;
      case 'audio':
        messageType = 'audio';
        mediaType = 'audio';
        content = '[áudio - transcrevendo...]';
        pendingMediaProcessing = true;
        break;
      case 'video':
        messageType = 'video';
        mediaType = 'video';
        content = message.video?.caption || '[vídeo]';
        pendingMediaProcessing = true;
        break;
      case 'document':
        messageType = 'document';
        mediaType = 'document';
        content = message.document?.filename || '[documento - processando...]';
        pendingMediaProcessing = true;
        break;
      default:
        content = `[${message.type}]`;
    }

    // 4. Create message record IMMEDIATELY (before media processing)
    const { data: dbMessage, error: msgError } = await supabase
      .from('messages')
      .insert({
        conversation_id: conversation.id,
        whatsapp_message_id: message.id,
        content: content,
        type: messageType,
        from_type: 'user',
        status: 'sent',
        media_url: mediaUrl,
        media_type: mediaType,
        sent_at: new Date(parseInt(message.timestamp) * 1000).toISOString(),
        metadata: { raw: message, original_type: message.type, processing: pendingMediaProcessing }
      })
      .select()
      .single();

    if (msgError) {
      console.error('[Webhook BG] Error creating message:', msgError);
      throw msgError;
    }
    console.log('[Webhook BG] Created message:', dbMessage.id);

    // 5. Update conversation last_message_at
    await supabase
      .from('conversations')
      .update({ last_message_at: new Date().toISOString() })
      .eq('id', conversation.id);

    // 6. Process media in background (download, store, OCR/transcribe)
    if (pendingMediaProcessing) {
      await processMediaAndUpdateMessage(
        supabase, 
        dbMessage.id, 
        message, 
        normalizedPhone, 
        settings, 
        lovableApiKey
      );
    }

    // 7. Queue for Nina AI processing (with debounce)
    if (conversation.status === 'nina') {
      const DEBOUNCE_DELAY_MS = 15000;
      const scheduledFor = new Date(Date.now() + DEBOUNCE_DELAY_MS).toISOString();
      
      const { error: ninaQueueError } = await supabase
        .from('nina_processing_queue')
        .insert({
          message_id: dbMessage.id,
          conversation_id: conversation.id,
          contact_id: contact.id,
          priority: 1,
          scheduled_for: scheduledFor,
          context_data: {
            phone_number_id: phoneNumberId,
            contact_name: contact.name || contact.call_name,
            message_type: messageType,
            original_type: message.type,
            debounce_scheduled_at: new Date().toISOString()
          }
        });

      if (ninaQueueError) {
        console.error('[Webhook BG] Error queuing for Nina:', ninaQueueError);
      } else {
        console.log('[Webhook BG] Message queued for Nina (scheduled:', scheduledFor, ')');
      }
    }

    console.log('[Webhook BG] Background processing complete for message:', dbMessage.id);
  } catch (error) {
    console.error('[Webhook BG] Error in background processing:', error);
    // Log to dead letter queue for manual review
    await logToDeadLetterQueue(supabase, message, phoneNumberId, error);
  }
}

// ===== PROCESS MEDIA AND UPDATE MESSAGE =====
// Limite de tamanho para OCR de PDFs (5MB) - evita estouro de memória
const MAX_PDF_SIZE_FOR_OCR = 5 * 1024 * 1024;

async function processMediaAndUpdateMessage(
  supabase: any,
  messageId: string,
  message: any,
  normalizedPhone: string,
  settings: any,
  lovableApiKey: string
) {
  try {
    let mediaUrl: string | null = null;
    let content: string | null = null;
    let mediaBuffer: ArrayBuffer | null = null;
    let mimeType: string | null = null;
    
    // ============================================
    // FASE 1: Download e Upload para Storage
    // ============================================
    switch (message.type) {
      case 'image': {
        const imageMediaId = message.image?.id;
        if (imageMediaId && settings?.whatsapp_access_token) {
          console.log('[Webhook Media] Processing image:', imageMediaId);
          const result = await downloadAndStoreMedia(supabase, settings, imageMediaId, normalizedPhone, 'image');
          mediaUrl = result.storageUrl || null;
          mediaBuffer = result.mediaBuffer;
          mimeType = result.mimeType;
        }
        content = message.image?.caption || '[imagem]';
        break;
      }
      
      case 'audio': {
        const audioMediaId = message.audio?.id;
        if (audioMediaId && settings?.whatsapp_access_token) {
          console.log('[Webhook Media] Processing audio:', audioMediaId);
          const result = await downloadAndStoreMedia(supabase, settings, audioMediaId, normalizedPhone, 'audio');
          mediaUrl = result.storageUrl || null;
          mediaBuffer = result.mediaBuffer;
          mimeType = result.mimeType;
        }
        content = '[áudio]';
        break;
      }
      
      case 'video': {
        const videoMediaId = message.video?.id;
        if (videoMediaId && settings?.whatsapp_access_token) {
          console.log('[Webhook Media] Processing video:', videoMediaId);
          const result = await downloadAndStoreMedia(supabase, settings, videoMediaId, normalizedPhone, 'video');
          mediaUrl = result.storageUrl || null;
        }
        content = message.video?.caption || '[vídeo]';
        break;
      }
      
      case 'document': {
        const docMediaId = message.document?.id;
        if (docMediaId && settings?.whatsapp_access_token) {
          console.log('[Webhook Media] Processing document:', docMediaId);
          const result = await downloadAndStoreMedia(supabase, settings, docMediaId, normalizedPhone, 'document');
          mediaUrl = result.storageUrl || null;
          mediaBuffer = result.mediaBuffer;
          mimeType = result.mimeType;
        }
        content = message.document?.filename || '[documento]';
        break;
      }
    }

    // ============================================
    // FASE 2: SALVAR media_url IMEDIATAMENTE
    // Garante que o arquivo fique acessível mesmo se OCR falhar
    // ============================================
    if (mediaUrl) {
      console.log('[Webhook Media] Saving media_url immediately:', mediaUrl);
      const { error: urlSaveError } = await supabase
        .from('messages')
        .update({ media_url: mediaUrl })
        .eq('id', messageId);
      
      if (urlSaveError) {
        console.error('[Webhook Media] Error saving media_url:', urlSaveError);
      } else {
        console.log('[Webhook Media] media_url saved successfully for message:', messageId);
      }
    }

    // ============================================
    // FASE 3: OCR/Transcrição (em try/catch separado)
    // Se falhar, o arquivo já está acessível
    // ============================================
    try {
      switch (message.type) {
        case 'image': {
          if (mediaBuffer && mimeType && lovableApiKey) {
            const extractedText = await extractTextFromImage(mediaBuffer, mimeType, lovableApiKey);
            if (extractedText) {
              const imageCaption = message.image?.caption || null;
              content = imageCaption 
                ? `${imageCaption}\n\n[Texto extraído da imagem: ${extractedText}]`
                : `[Texto extraído da imagem: ${extractedText}]`;
            }
          }
          break;
        }
        
        case 'audio': {
          if (mediaBuffer && mimeType) {
            const transcription = await transcribeAudio(mediaBuffer, mimeType, supabase);
            if (transcription) {
              content = transcription;
            }
          }
          break;
        }
        
        case 'document': {
          const docFilename = message.document?.filename || '[documento]';
          const docMimeType = message.document?.mime_type || '';
          
          const isPdf = docFilename.toLowerCase().endsWith('.pdf') || 
                        docMimeType.includes('pdf') ||
                        (mimeType && mimeType.includes('pdf'));
          
          // Verificar tamanho antes de tentar OCR (evita estouro de memória)
          const bufferSize = mediaBuffer?.byteLength || 0;
          const sizeOk = bufferSize > 0 && bufferSize < MAX_PDF_SIZE_FOR_OCR;
          
          if (isPdf && mediaBuffer && lovableApiKey && sizeOk) {
            console.log(`[Webhook Media] PDF detected (${(bufferSize / 1024 / 1024).toFixed(2)}MB), attempting OCR...`);
            const extractedText = await extractTextFromPDF(mediaBuffer, lovableApiKey);
            if (extractedText) {
              content = `${docFilename}\n\n[Texto extraído do documento: ${extractedText}]`;
            }
          } else if (isPdf && bufferSize >= MAX_PDF_SIZE_FOR_OCR) {
            console.log(`[Webhook Media] PDF too large for OCR (${(bufferSize / 1024 / 1024).toFixed(2)}MB > 5MB), skipping OCR`);
          }
          break;
        }
      }
    } catch (ocrError) {
      // OCR falhou, mas arquivo já está salvo - apenas logamos
      console.error('[Webhook Media] OCR/Transcription failed (file still accessible):', ocrError);
    }

    // ============================================
    // FASE 4: Atualizar content e finalizar
    // ============================================
    // Buscar metadata atual para preservar dados originais (raw.document.id, etc.)
    const { data: currentMessage } = await supabase
      .from('messages')
      .select('metadata')
      .eq('id', messageId)
      .single();

    const existingMetadata = (currentMessage?.metadata as Record<string, any>) || {};

    const updateData: any = {
      metadata: { 
        ...existingMetadata,      // Preserva raw, original_type, etc.
        processing: false         // Atualiza apenas o flag
      }
    };
    
    if (content) {
      updateData.content = content;
    }

    const { error: updateError } = await supabase
      .from('messages')
      .update(updateData)
      .eq('id', messageId);

    if (updateError) {
      console.error('[Webhook Media] Error updating message:', updateError);
    } else {
      console.log('[Webhook Media] Message updated with processed content:', messageId);
    }
  } catch (error) {
    console.error('[Webhook Media] Error processing media:', error);
    // Mark message as having failed processing - preservar metadata existente
    const { data: errorMessage } = await supabase
      .from('messages')
      .select('metadata')
      .eq('id', messageId)
      .single();
    
    const errorMetadata = (errorMessage?.metadata as Record<string, any>) || {};
    
    await supabase
      .from('messages')
      .update({ 
        metadata: { 
          ...errorMetadata,
          processing: false, 
          processing_error: (error as Error).message 
        }
      })
      .eq('id', messageId);
  }
}

// ===== HANDLE ACCOUNT UPDATES (Quality Score changes) =====
async function handleAccountUpdate(supabase: any, value: any) {
  try {
    const { 
      event, 
      current_limit, 
      display_phone_number, 
      phone_number_id,
      ban_info,
      restriction_info
    } = value;

    console.log('[Webhook Account] Processing account update:', event, 'for', phone_number_id);

    // Map event to quality rating
    const ratingMap: Record<string, string> = {
      'FLAGGED': 'YELLOW',
      'DOWNGRADE': 'RED',
      'UPGRADE': 'GREEN',
      'UNFLAGGED': 'GREEN',
      'ACCOUNT_RESTRICTED': 'RED',
      'ACCOUNT_BANNED': 'RED'
    };

    const rating = ratingMap[event] || 'GREEN';

    // Get previous status
    const { data: settings } = await supabase
      .from('nina_settings')
      .select('whatsapp_quality_status')
      .maybeSingle();

    const previousStatus = settings?.whatsapp_quality_status || { rating: 'GREEN' };

    // Insert into history
    const { error: historyError } = await supabase
      .from('whatsapp_quality_history')
      .insert({
        phone_number_id: phone_number_id || settings?.whatsapp_phone_number_id,
        display_phone_number,
        event_type: event,
        current_limit,
        old_limit: previousStatus.tier,
        quality_rating: rating,
        raw_payload: value
      });

    if (historyError) {
      console.error('[Webhook Account] Error inserting history:', historyError);
    }

    // Update current status in nina_settings
    const newStatus = {
      rating,
      event,
      tier: current_limit || previousStatus.tier,
      last_check: new Date().toISOString(),
      ban_info: ban_info || null,
      restriction_info: restriction_info || null
    };

    const { error: updateError } = await supabase
      .from('nina_settings')
      .update({ whatsapp_quality_status: newStatus })
      .eq('id', '1e57a20e-4a9e-4fdc-a6ef-0ed084cfcf2c');

    if (updateError) {
      console.error('[Webhook Account] Error updating status:', updateError);
    }

    console.log('[Webhook Account] Status updated:', rating, 'Previous:', previousStatus.rating);

    // Send alert if quality dropped to YELLOW or RED
    if ((rating === 'YELLOW' || rating === 'RED') && previousStatus.rating !== rating) {
      console.log('[Webhook Account] Triggering quality alert for rating:', rating);
      await sendQualityAlertFromWebhook(supabase, rating, event, current_limit, display_phone_number);
    }

  } catch (error) {
    console.error('[Webhook Account] Error processing account update:', error);
  }
}

// ===== HANDLE TEMPLATE STATUS UPDATES =====
async function handleTemplateStatusUpdate(supabase: any, value: any) {
  try {
    const { 
      event, 
      message_template_id,
      message_template_name,
      message_template_language,
      reason
    } = value;

    console.log('[Webhook Template] Processing template update:', event, message_template_name);

    // Update whatsapp_templates table if template was rejected or disabled
    if (event === 'REJECTED' || event === 'DISABLED' || event === 'FLAGGED') {
      const { error } = await supabase
        .from('whatsapp_templates')
        .update({ 
          status: event.toLowerCase(),
          updated_at: new Date().toISOString()
        })
        .eq('template_id', message_template_id);

      if (error) {
        console.error('[Webhook Template] Error updating template status:', error);
      } else {
        console.log('[Webhook Template] Template status updated:', message_template_name, '->', event);
      }

      // Log to quality history as well for tracking
      await supabase
        .from('whatsapp_quality_history')
        .insert({
          phone_number_id: 'template_update',
          event_type: `TEMPLATE_${event}`,
          quality_rating: event === 'APPROVED' ? 'GREEN' : 'YELLOW',
          raw_payload: {
            template_id: message_template_id,
            template_name: message_template_name,
            language: message_template_language,
            reason
          }
        });
    }

    // If template was approved, update status
    if (event === 'APPROVED') {
      const { error } = await supabase
        .from('whatsapp_templates')
        .update({ 
          status: 'approved',
          updated_at: new Date().toISOString()
        })
        .eq('template_id', message_template_id);

      if (error) {
        console.error('[Webhook Template] Error updating approved template:', error);
      }
    }

  } catch (error) {
    console.error('[Webhook Template] Error processing template update:', error);
  }
}

// ===== SEND QUALITY ALERT EMAIL =====
async function sendQualityAlertFromWebhook(
  supabase: any,
  rating: string,
  event: string,
  tier: string,
  phoneNumber: string
) {
  try {
    console.log('[Webhook Alert] Sending quality alert for rating:', rating);

    const color = rating === 'RED' ? '#DC2626' : '#F59E0B';
    const emoji = rating === 'RED' ? '🚨' : '⚠️';
    const severity = rating === 'RED' ? 'CRÍTICO' : 'ATENÇÃO';

    // Get alert recipients (team members with admin role)
    const { data: admins } = await supabase
      .from('team_members')
      .select('email, name')
      .eq('role', 'admin');

    const recipients = admins?.map((a: any) => a.email).filter(Boolean) || [];
    
    if (recipients.length === 0) {
      console.warn('[Webhook Alert] No admin recipients found');
      return;
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    for (const email of recipients) {
      try {
        await fetch(`${supabaseUrl}/functions/v1/send-email`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseKey}`
          },
          body: JSON.stringify({
            to: email,
            subject: `${emoji} ${severity}: Quality Score WhatsApp ${rating}`,
            html: `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <div style="background: ${color}; color: white; padding: 20px; border-radius: 8px 8px 0 0;">
                  <h1 style="margin: 0;">${emoji} Alerta de Quality Score</h1>
                </div>
                <div style="background: #f8f9fa; padding: 20px; border-radius: 0 0 8px 8px;">
                  <p><strong>Status:</strong> <span style="background: ${color}; color: white; padding: 2px 8px; border-radius: 4px;">${rating}</span></p>
                  <p><strong>Evento:</strong> ${event}</p>
                  <p><strong>Tier:</strong> ${tier || 'N/A'}</p>
                  <p><strong>Número:</strong> ${phoneNumber || 'N/A'}</p>
                  <p><strong>Hora:</strong> ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</p>
                  <hr style="border: 1px solid #dee2e6; margin: 20px 0;">
                  <p style="color: #666;">Acesse o sistema para verificar e tomar as ações necessárias.</p>
                </div>
              </div>
            `
          })
        });
        console.log('[Webhook Alert] Email sent to:', email);
      } catch (emailError) {
        console.error('[Webhook Alert] Failed to send email to:', email, emailError);
      }
    }
  } catch (error) {
    console.error('[Webhook Alert] Error sending alerts:', error);
  }
}
