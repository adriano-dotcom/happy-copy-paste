import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const LOVABLE_AI_URL = "https://ai.gateway.lovable.dev/v1/audio/transcriptions";

serve(async (req) => {
  // Handle CORS preflight
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

      // Get verify token from settings
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
      const body = await req.json();
      console.log('[Webhook] Received payload:', JSON.stringify(body, null, 2));

      // Extract message data from WhatsApp Cloud API format
      const entry = body.entry?.[0];
      const changes = entry?.changes?.[0];
      const value = changes?.value;
      
      if (!value) {
        console.log('[Webhook] No value in payload, ignoring');
        return new Response(JSON.stringify({ status: 'ignored' }), { 
          status: 200, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        });
      }

      const messages = value.messages;
      const contacts = value.contacts;
      const phoneNumberId = value.metadata?.phone_number_id;

      // Handle status updates (delivered, read, etc)
      if (value.statuses) {
        for (const status of value.statuses) {
          console.log('[Webhook] Status update:', status);
          
          // Update message status in database
          if (status.id) {
            const statusMap: Record<string, string> = {
              'sent': 'sent',
              'delivered': 'delivered',
              'read': 'read',
              'failed': 'failed'
            };
            
            const newStatus = statusMap[status.status];
            if (newStatus) {
              await supabase
                .from('messages')
                .update({ 
                  status: newStatus,
                  ...(newStatus === 'delivered' && { delivered_at: new Date().toISOString() }),
                  ...(newStatus === 'read' && { read_at: new Date().toISOString() })
                })
                .eq('whatsapp_message_id', status.id);
            }
          }
        }
        
        return new Response(JSON.stringify({ status: 'processed_statuses' }), { 
          status: 200, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        });
      }

      // Get settings for audio transcription
      const { data: settings } = await supabase
        .from('nina_settings')
        .select('whatsapp_access_token')
        .maybeSingle();

      // Process incoming messages
      if (messages && messages.length > 0) {
        for (const message of messages) {
          const contactInfo = contacts?.find((c: any) => c.wa_id === message.from);
          
          // Insert into message_grouping_queue for deduplication and grouping
          const { error: queueError } = await supabase
            .from('message_grouping_queue')
            .insert({
              whatsapp_message_id: message.id,
              phone_number_id: phoneNumberId,
              message_data: message,
              contacts_data: contactInfo || null
            });

          if (queueError) {
            // If duplicate key error, message was already received
            if (queueError.code === '23505') {
              console.log('[Webhook] Duplicate message ignored:', message.id);
            } else {
              console.error('[Webhook] Queue insert error:', queueError);
            }
          } else {
            console.log('[Webhook] Message queued:', message.id);
            
            // Process the message immediately
            await processIncomingMessage(supabase, message, contactInfo, phoneNumberId, settings, lovableApiKey);
          }
        }
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

// Download media from WhatsApp API
async function downloadWhatsAppMedia(settings: any, mediaId: string): Promise<ArrayBuffer | null> {
  if (!settings?.whatsapp_access_token) {
    console.error('[Webhook] No WhatsApp access token configured');
    return null;
  }

  try {
    // Step 1: Get the media URL
    const mediaInfoResponse = await fetch(
      `https://graph.facebook.com/v18.0/${mediaId}`,
      {
        headers: {
          'Authorization': `Bearer ${settings.whatsapp_access_token}`
        }
      }
    );

    if (!mediaInfoResponse.ok) {
      console.error('[Webhook] Failed to get media info:', await mediaInfoResponse.text());
      return null;
    }

    const mediaInfo = await mediaInfoResponse.json();
    const mediaUrl = mediaInfo.url;

    if (!mediaUrl) {
      console.error('[Webhook] No media URL in response');
      return null;
    }

    // Step 2: Download the actual media
    const mediaResponse = await fetch(mediaUrl, {
      headers: {
        'Authorization': `Bearer ${settings.whatsapp_access_token}`
      }
    });

    if (!mediaResponse.ok) {
      console.error('[Webhook] Failed to download media:', await mediaResponse.text());
      return null;
    }

    return await mediaResponse.arrayBuffer();
  } catch (error) {
    console.error('[Webhook] Error downloading media:', error);
    return null;
  }
}

// Transcribe audio using Lovable AI Gateway (Whisper)
async function transcribeAudio(audioBuffer: ArrayBuffer, lovableApiKey: string): Promise<string | null> {
  try {
    console.log('[Webhook] Transcribing audio, size:', audioBuffer.byteLength, 'bytes');

    // Create FormData with the audio file
    const formData = new FormData();
    const audioBlob = new Blob([audioBuffer], { type: 'audio/ogg' });
    formData.append('file', audioBlob, 'audio.ogg');
    formData.append('model', 'whisper-1');
    formData.append('language', 'pt');

    const response = await fetch(LOVABLE_AI_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`
      },
      body: formData
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Webhook] Transcription error:', response.status, errorText);
      return null;
    }

    const result = await response.json();
    const transcription = result.text;
    
    console.log('[Webhook] Transcription result:', transcription);
    return transcription || null;
  } catch (error) {
    console.error('[Webhook] Error transcribing audio:', error);
    return null;
  }
}

async function processIncomingMessage(
  supabase: any, 
  message: any, 
  contactInfo: any, 
  phoneNumberId: string,
  settings: any,
  lovableApiKey: string
) {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  
  const phoneNumber = message.from;
  const whatsappId = contactInfo?.wa_id || phoneNumber;
  const contactName = contactInfo?.profile?.name || null;

  // 1. Get or create contact
  let { data: contact } = await supabase
    .from('contacts')
    .select('*')
    .eq('phone_number', phoneNumber)
    .maybeSingle();

  if (!contact) {
    const { data: newContact, error: contactError } = await supabase
      .from('contacts')
      .insert({
        phone_number: phoneNumber,
        whatsapp_id: whatsappId,
        name: contactName,
        call_name: contactName?.split(' ')[0] || null
      })
      .select()
      .single();

    if (contactError) {
      console.error('[Webhook] Error creating contact:', contactError);
      throw contactError;
    }
    contact = newContact;
    console.log('[Webhook] Created new contact:', contact.id);
  } else {
    // Update contact name if we have a new one
    if (contactName && !contact.name) {
      await supabase
        .from('contacts')
        .update({ 
          name: contactName, 
          call_name: contactName.split(' ')[0],
          last_activity: new Date().toISOString()
        })
        .eq('id', contact.id);
    }
  }

  // 2. Get or create active conversation
  let { data: conversation } = await supabase
    .from('conversations')
    .select('*')
    .eq('contact_id', contact.id)
    .eq('is_active', true)
    .maybeSingle();

  if (!conversation) {
    const { data: newConversation, error: convError } = await supabase
      .from('conversations')
      .insert({
        contact_id: contact.id,
        status: 'nina', // Nina handles new conversations by default
        is_active: true
      })
      .select()
      .single();

    if (convError) {
      console.error('[Webhook] Error creating conversation:', convError);
      throw convError;
    }
    conversation = newConversation;
    console.log('[Webhook] Created new conversation:', conversation.id);
  }

  // 3. Parse message content based on type
  let content: string | null = null;
  let mediaUrl: string | null = null;
  let mediaType: string | null = null;
  let messageType: string = 'text';

  switch (message.type) {
    case 'text':
      content = message.text?.body;
      break;
    case 'image':
      messageType = 'image';
      mediaType = 'image';
      content = message.image?.caption || null;
      break;
    case 'audio':
      messageType = 'audio';
      mediaType = 'audio';
      // Try to transcribe the audio
      const audioMediaId = message.audio?.id;
      if (audioMediaId && settings?.whatsapp_access_token && lovableApiKey) {
        console.log('[Webhook] Attempting to transcribe audio message:', audioMediaId);
        const audioBuffer = await downloadWhatsAppMedia(settings, audioMediaId);
        if (audioBuffer) {
          const transcription = await transcribeAudio(audioBuffer, lovableApiKey);
          if (transcription) {
            content = transcription;
            console.log('[Webhook] Audio transcribed successfully:', transcription.substring(0, 100));
          } else {
            content = '[áudio não transcrito]';
          }
        } else {
          content = '[áudio não baixado]';
        }
      } else {
        content = '[áudio]';
      }
      break;
    case 'video':
      messageType = 'video';
      mediaType = 'video';
      content = message.video?.caption || null;
      break;
    case 'document':
      messageType = 'document';
      mediaType = 'document';
      content = message.document?.filename || null;
      break;
    default:
      content = `[${message.type}]`;
  }

  // 4. Create message record
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
      metadata: { raw: message, original_type: message.type }
    })
    .select()
    .single();

  if (msgError) {
    console.error('[Webhook] Error creating message:', msgError);
    throw msgError;
  }
  console.log('[Webhook] Created message:', dbMessage.id);

  // 5. Update conversation last_message_at (trigger should handle this but let's be sure)
  await supabase
    .from('conversations')
    .update({ last_message_at: new Date().toISOString() })
    .eq('id', conversation.id);

  // 6. If conversation is handled by Nina, queue for AI processing
  if (conversation.status === 'nina') {
    const { error: ninaQueueError } = await supabase
      .from('nina_processing_queue')
      .insert({
        message_id: dbMessage.id,
        conversation_id: conversation.id,
        contact_id: contact.id,
        priority: 1,
        context_data: {
          phone_number_id: phoneNumberId,
          contact_name: contact.name || contact.call_name,
          message_type: messageType,
          original_type: message.type
        }
      });

    if (ninaQueueError) {
      console.error('[Webhook] Error queuing for Nina:', ninaQueueError);
    } else {
      console.log('[Webhook] Message queued for Nina processing');
      
      // Trigger nina-orchestrator directly (cron jobs não funcionam sem pg_net)
      try {
        const orchestratorUrl = `${supabaseUrl}/functions/v1/nina-orchestrator`;
        console.log('[Webhook] Triggering nina-orchestrator at:', orchestratorUrl);
        
        fetch(orchestratorUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseServiceKey}`
          },
          body: JSON.stringify({ triggered_by: 'whatsapp-webhook' })
        }).catch(err => console.error('[Webhook] Error triggering nina-orchestrator:', err));
      } catch (err) {
        console.error('[Webhook] Failed to trigger nina-orchestrator:', err);
      }
    }
  }
}
