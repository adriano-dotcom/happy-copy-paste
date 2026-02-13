import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

const WHATSAPP_API_URL = "https://graph.facebook.com/v18.0";

// ===== WebM-to-OGG REMUXER (for Chrome Opus audio) =====
// Chrome records audio/webm;codecs=opus but WhatsApp only accepts audio/ogg.
// Both use the same Opus codec - we just need to change the container format.

function readEbmlVint(data: Uint8Array, offset: number): { value: number; length: number } {
  if (offset >= data.length) return { value: 0, length: 1 };
  const first = data[offset];
  let len = 1;
  let mask = 0x80;
  while (len <= 8 && !(first & mask)) { len++; mask >>= 1; }
  let value = first & (mask - 1);
  for (let i = 1; i < len; i++) {
    if (offset + i >= data.length) break;
    value = (value * 256) + data[offset + i];
  }
  return { value, length: len };
}

function readEbmlElementId(data: Uint8Array, offset: number): { id: number; length: number } {
  if (offset >= data.length) return { id: 0, length: 1 };
  const first = data[offset];
  let len = 1;
  if (first & 0x80) len = 1;
  else if (first & 0x40) len = 2;
  else if (first & 0x20) len = 3;
  else if (first & 0x10) len = 4;
  else len = 1;
  let id = 0;
  for (let i = 0; i < len && (offset + i) < data.length; i++) {
    id = (id * 256) + data[offset + i];
  }
  return { id, length: len };
}

// EBML Element IDs we care about
const EID = {
  Segment: 0x18538067, Tracks: 0x1654AE6B, TrackEntry: 0xAE,
  CodecPrivate: 0x63A2, Cluster: 0x1F43B675, SimpleBlock: 0xA3,
  Timecode: 0xE7, BlockGroup: 0xA0, Block: 0xA1,
};

const CONTAINER_IDS = new Set([EID.Segment, EID.Tracks, EID.TrackEntry, EID.Cluster, EID.BlockGroup]);

interface ExtractedAudio {
  codecPrivate: Uint8Array;
  frames: Uint8Array[];
}

function extractOpusFromWebM(webm: Uint8Array): ExtractedAudio {
  let codecPrivate: Uint8Array | null = null;
  const frames: Uint8Array[] = [];

  function parse(start: number, end: number) {
    let pos = start;
    while (pos < end - 1) {
      const idR = readEbmlElementId(webm, pos);
      pos += idR.length;
      if (pos >= end) break;
      const sizeR = readEbmlVint(webm, pos);
      pos += sizeR.length;
      if (pos >= end) break;

      // Unknown size sentinel (0x1FFFFFFFFFFFFFF) - use remaining data
      const elemEnd = (sizeR.value >= 0xFFFFFFFFFFFE) ? end : Math.min(pos + sizeR.value, end);
      const id = idR.id;

      if (CONTAINER_IDS.has(id)) {
        parse(pos, elemEnd);
      } else if (id === EID.CodecPrivate) {
        codecPrivate = webm.slice(pos, elemEnd);
      } else if (id === EID.SimpleBlock || id === EID.Block) {
        // Track number (vint), 2-byte timecode, 1-byte flags, then frame data
        const trackVint = readEbmlVint(webm, pos);
        const dataStart = pos + trackVint.length + 3; // +2 timecode +1 flags
        if (dataStart < elemEnd) {
          frames.push(webm.slice(dataStart, elemEnd));
        }
      }
      pos = elemEnd;
    }
  }

  parse(0, webm.length);
  if (!codecPrivate) {
    // Build default OpusHead if not found
    codecPrivate = new Uint8Array([
      0x4F, 0x70, 0x75, 0x73, 0x48, 0x65, 0x61, 0x64, // "OpusHead"
      0x01, // version
      0x01, // 1 channel
      0x38, 0x01, // pre-skip: 312
      0x80, 0xBB, 0x00, 0x00, // sample rate: 48000
      0x00, 0x00, // output gain: 0
      0x00, // channel mapping: 0
    ]);
  }
  return { codecPrivate, frames };
}

// OGG CRC32 (polynomial 0x04C11DB7)
const OGG_CRC = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let r = i << 24;
  for (let j = 0; j < 8; j++) r = (r & 0x80000000) ? ((r << 1) ^ 0x04C11DB7) : (r << 1);
  OGG_CRC[i] = r >>> 0;
}
function oggCrc32(d: Uint8Array): number {
  let c = 0;
  for (let i = 0; i < d.length; i++) c = ((c << 8) ^ OGG_CRC[((c >>> 24) ^ d[i]) & 0xFF]) >>> 0;
  return c;
}

function makeOggPage(serial: number, seq: number, granule: bigint, headerType: number, packets: Uint8Array[]): Uint8Array {
  const segs: number[] = [];
  for (const p of packets) {
    let rem = p.length;
    while (rem >= 255) { segs.push(255); rem -= 255; }
    segs.push(rem);
  }
  const hdrSize = 27 + segs.length;
  const dataSize = packets.reduce((s, p) => s + p.length, 0);
  const page = new Uint8Array(hdrSize + dataSize);
  const dv = new DataView(page.buffer);

  page.set([0x4F, 0x67, 0x67, 0x53], 0); // "OggS"
  page[4] = 0; // version
  page[5] = headerType;
  dv.setUint32(6, Number(granule & 0xFFFFFFFFn), true);
  dv.setUint32(10, Number((granule >> 32n) & 0xFFFFFFFFn), true);
  dv.setUint32(14, serial, true);
  dv.setUint32(18, seq, true);
  dv.setUint32(22, 0, true); // CRC placeholder
  page[26] = segs.length;
  for (let i = 0; i < segs.length; i++) page[27 + i] = segs[i];

  let off = hdrSize;
  for (const p of packets) { page.set(p, off); off += p.length; }

  dv.setUint32(22, oggCrc32(page), true);
  return page;
}

function remuxWebmToOgg(webmData: Uint8Array): Uint8Array {
  const { codecPrivate, frames } = extractOpusFromWebM(webmData);
  console.log(`[Remuxer] Extracted ${frames.length} Opus frames from WebM (codecPrivate: ${codecPrivate.length} bytes)`);

  if (frames.length === 0) {
    throw new Error('No Opus frames found in WebM data');
  }

  const serial = Math.floor(Math.random() * 0xFFFFFFFF);
  const pages: Uint8Array[] = [];
  let seq = 0;

  // Page 0: OpusHead (BOS)
  // Ensure codecPrivate starts with "OpusHead"
  let opusHead = codecPrivate;
  const opusHeadMagic = [0x4F, 0x70, 0x75, 0x73, 0x48, 0x65, 0x61, 0x64];
  if (codecPrivate.length < 8 || String.fromCharCode(...codecPrivate.slice(0, 8)) !== 'OpusHead') {
    // Prepend OpusHead magic if missing (some WebM files store raw config)
    const fullHead = new Uint8Array(8 + codecPrivate.length);
    fullHead.set(opusHeadMagic, 0);
    fullHead.set(codecPrivate, 8);
    opusHead = fullHead;
  }
  pages.push(makeOggPage(serial, seq++, 0n, 0x02, [opusHead])); // BOS

  // Page 1: OpusTags
  const vendor = new TextEncoder().encode('Lovable');
  const tags = new Uint8Array(8 + 4 + vendor.length + 4);
  const tv = new DataView(tags.buffer);
  tags.set(new TextEncoder().encode('OpusTags'), 0);
  tv.setUint32(8, vendor.length, true);
  tags.set(vendor, 12);
  tv.setUint32(12 + vendor.length, 0, true);
  pages.push(makeOggPage(serial, seq++, 0n, 0x00, [tags]));

  // Audio pages - group ~50 frames per page
  let preSkip = 0;
  if (opusHead.length >= 12) preSkip = opusHead[10] | (opusHead[11] << 8);
  let granule = BigInt(preSkip);
  const FPP = 50; // frames per page
  const SPF = 960; // samples per frame (20ms at 48kHz)

  for (let i = 0; i < frames.length; i += FPP) {
    const batch = frames.slice(i, Math.min(i + FPP, frames.length));
    granule += BigInt(batch.length * SPF);
    const isLast = (i + FPP >= frames.length);
    pages.push(makeOggPage(serial, seq++, granule, isLast ? 0x04 : 0x00, batch));
  }

  const totalSize = pages.reduce((s, p) => s + p.length, 0);
  const result = new Uint8Array(totalSize);
  let off = 0;
  for (const p of pages) { result.set(p, off); off += p.length; }

  console.log(`[Remuxer] Created OGG file: ${result.length} bytes, ${frames.length} frames, ${pages.length} pages`);
  return result;
}
// ===== END REMUXER =====

// ===== RETRY UTILITY =====
async function fetchSettingsWithRetry(
  supabase: any,
  maxRetries = 3,
  baseDelayMs = 1000
): Promise<{ data: any | null; error: any }> {
  let lastError: any = null;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const result = await supabase
      .from('nina_settings')
      .select('whatsapp_access_token, whatsapp_phone_number_id, whatsapp_token_in_vault')
      .maybeSingle();
    
    if (!result.error) {
      return result;
    }
    
    lastError = result.error;
    const errorStr = String(result.error?.message || '');
    const isTransient = errorStr.includes('522') || 
                        errorStr.includes('timeout') ||
                        errorStr.includes('Connection') ||
                        errorStr.includes('DOCTYPE');
    
    if (!isTransient || attempt === maxRetries) {
      console.error(`[Sender] Attempt ${attempt}/${maxRetries} failed (non-retryable):`, result.error);
      return result;
    }
    
    const delay = baseDelayMs * Math.pow(2, attempt - 1);
    console.log(`[Sender] Attempt ${attempt}/${maxRetries} failed (transient), retrying in ${delay}ms...`);
    await new Promise(resolve => setTimeout(resolve, delay));
  }
  
  return { data: null, error: lastError };
}
// ===== END RETRY UTILITY =====

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    console.log('[Sender] Starting send process...');

    // Get WhatsApp credentials from settings WITH RETRY
    const { data: settings, error: settingsError } = await fetchSettingsWithRetry(supabase);

    if (settingsError) {
      console.error('[Sender] Error fetching settings after retries:', settingsError);
      return new Response(JSON.stringify({ 
        error: 'Erro ao buscar configurações',
        message: settingsError.message,
        retry_suggested: true,
        processed: 0 
      }), {
        status: 503, // Service Unavailable - suggests retry
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (!settings) {
      console.log('[Sender] Sistema não configurado - nenhuma configuração encontrada na tabela nina_settings');
      return new Response(JSON.stringify({ 
        error: 'Sistema não configurado',
        message: 'Acesse /settings para configurar o WhatsApp',
        processed: 0 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    console.log('[Sender] Settings loaded successfully');

    // Get access token from Vault or fallback to table
    let accessToken = settings.whatsapp_access_token;
    if (settings.whatsapp_token_in_vault) {
      try {
        const { data: vaultToken } = await supabase.rpc('get_vault_secret', { 
          secret_name: 'vault_whatsapp_token' 
        });
        if (vaultToken) {
          accessToken = vaultToken;
          console.log('[Sender] Using WhatsApp token from Vault');
        }
      } catch (e) {
        console.log('[Sender] Vault lookup failed, using table fallback');
      }
    }

    if (!accessToken || !settings.whatsapp_phone_number_id) {
      console.log('[Sender] WhatsApp credentials not configured');
      return new Response(JSON.stringify({ 
        error: 'WhatsApp não configurado',
        message: 'Configure Access Token e Phone Number ID em /settings',
        processed: 0 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // ===== RATE LIMIT CHECK =====
    const { data: canSend, error: rateLimitError } = await supabase.rpc('check_rate_limit', { 
      p_phone_number_id: settings.whatsapp_phone_number_id 
    });

    if (rateLimitError) {
      console.error('[Sender] Error checking rate limit:', rateLimitError);
    }

    if (canSend === false) {
      console.log('[Sender] Rate limit reached for today, exiting');
      return new Response(JSON.stringify({ 
        error: 'Rate limit reached',
        message: 'Limite diário de mensagens atingido',
        processed: 0 
      }), {
        status: 429,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    console.log('[Sender] Rate limit check passed');
    // ===== END RATE LIMIT CHECK =====

    // Create settings object with resolved token
    const resolvedSettings = {
      ...settings,
      whatsapp_access_token: accessToken
    };

    const MAX_EXECUTION_TIME = 25000; // 25 seconds
    const startTime = Date.now();
    let totalSent = 0;
    let iterations = 0;

    console.log('[Sender] Starting polling loop');

    while (Date.now() - startTime < MAX_EXECUTION_TIME) {
      iterations++;
      console.log(`[Sender] Iteration ${iterations}, elapsed: ${Date.now() - startTime}ms`);

      // Claim batch of messages to send
      const { data: queueItems, error: claimError } = await supabase
        .rpc('claim_send_queue_batch', { p_limit: 10 });

      if (claimError) {
        console.error('[Sender] Error claiming batch:', claimError);
        throw claimError;
      }

      if (!queueItems || queueItems.length === 0) {
        console.log('[Sender] No messages ready to send, checking for scheduled messages...');
        
        // Check for messages scheduled in the next 5 seconds
        const { data: upcoming, error: upcomingError } = await supabase
          .from('send_queue')
          .select('id, scheduled_at')
          .eq('status', 'pending')
          .gte('scheduled_at', new Date().toISOString())
          .lte('scheduled_at', new Date(Date.now() + 5000).toISOString())
          .order('scheduled_at', { ascending: true })
          .limit(1);

        if (upcomingError) {
          console.error('[Sender] Error checking upcoming messages:', upcomingError);
        }

        if (upcoming && upcoming.length > 0) {
          const scheduledAt = new Date(upcoming[0].scheduled_at).getTime();
          const now = Date.now();
          const waitTime = Math.min(
            Math.max(scheduledAt - now + 100, 0),
            5000
          );
          
          if (waitTime > 0 && (Date.now() - startTime + waitTime) < MAX_EXECUTION_TIME) {
            console.log(`[Sender] Waiting ${waitTime}ms for scheduled message at ${toBRT(upcoming[0].scheduled_at)}`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
            continue;
          }
        }
        
        // No more messages to process
        console.log('[Sender] No more messages to process, exiting loop');
        break;
      }

      console.log(`[Sender] Processing batch of ${queueItems.length} messages`);

      for (const item of queueItems) {
        try {
          await sendMessage(supabase, resolvedSettings, item);
          
          // Mark as completed
          await supabase
            .from('send_queue')
            .update({ 
              status: 'completed', 
              sent_at: new Date().toISOString() 
            })
            .eq('id', item.id);
          
          totalSent++;
          console.log(`[Sender] Successfully sent message ${item.id} (${totalSent} total)`);
          
          // ===== INCREMENT RATE LIMIT COUNTER =====
          await supabase.rpc('increment_rate_limit', { 
            p_phone_number_id: settings.whatsapp_phone_number_id,
            p_count: 1 
          });
          // ===== END INCREMENT RATE LIMIT =====
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          console.error(`[Sender] Error sending item ${item.id}:`, error);
          
          // Mark as failed with retry
          const newRetryCount = (item.retry_count || 0) + 1;
          const shouldRetry = newRetryCount < 3;
          
          await supabase
            .from('send_queue')
            .update({ 
              status: shouldRetry ? 'pending' : 'failed',
              retry_count: newRetryCount,
              error_message: errorMessage,
              scheduled_at: shouldRetry 
                ? new Date(Date.now() + newRetryCount * 60000).toISOString() 
                : null
            })
            .eq('id', item.id);
        }
      }
    }

    const executionTime = Date.now() - startTime;
    console.log(`[Sender] Completed: sent ${totalSent} messages in ${iterations} iterations (${executionTime}ms)`);

    return new Response(JSON.stringify({ 
      sent: totalSent, 
      iterations,
      executionTime 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[Sender] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

// ===== UPLOAD MEDIA DIRECTLY TO WHATSAPP =====
async function uploadMediaToWhatsApp(
  phoneNumberId: string,
  accessToken: string,
  mediaUrl: string,
  mimeType: string
): Promise<string | null> {
  try {
    console.log(`[Sender] Downloading media from: ${mediaUrl}`);
    const downloadResp = await fetch(mediaUrl);
    if (!downloadResp.ok) {
      console.error(`[Sender] Failed to download media: ${downloadResp.status}`);
      return null;
    }
    
    const mediaBuffer = await downloadResp.arrayBuffer();
    console.log(`[Sender] Downloaded ${mediaBuffer.byteLength} bytes, uploading to WhatsApp with mime: ${mimeType}`);
    
    // Sanitize mimeType for WhatsApp compatibility
    let effectiveMimeType = mimeType;
    let uint8Array = new Uint8Array(mediaBuffer);
    
    if (mimeType === 'audio/mp4' || mimeType === 'audio/mp4; codecs=mp4a.40.2') {
      effectiveMimeType = 'audio/aac';
      console.log('[Sender] Mapped audio/mp4 -> audio/aac for WhatsApp compatibility');
    }
    
    // WebM -> OGG: Real remuxing (not just relabeling)
    // Chrome records audio/webm;codecs=opus but WhatsApp requires audio/ogg
    // Both use the same Opus codec, we just change the container format
    if (mimeType === 'audio/webm' || mimeType === 'audio/webm; codecs=opus') {
      try {
        console.log(`[Sender] Remuxing WebM->OGG (${uint8Array.length} bytes)...`);
        uint8Array = remuxWebmToOgg(uint8Array);
        effectiveMimeType = 'audio/ogg';
        console.log(`[Sender] Remuxed successfully: ${uint8Array.length} bytes OGG`);
      } catch (remuxError) {
        console.error('[Sender] Remux failed, falling back to relabel:', remuxError);
        effectiveMimeType = 'audio/ogg';
      }
    }
    
    // Determine file extension from effective mime type
    const extMap: Record<string, string> = {
      'audio/ogg': 'ogg',
      'audio/aac': 'aac',
      'audio/mpeg': 'mp3',
    };
    const ext = extMap[effectiveMimeType] || 'ogg';
    
    // Build multipart form data manually
    const boundary = '----FormBoundary' + Math.random().toString(36).substring(2);

    const header = [
      `--${boundary}`,
      `Content-Disposition: form-data; name="messaging_product"`,
      '',
      'whatsapp',
      `--${boundary}`,
      `Content-Disposition: form-data; name="type"`,
      '',
      effectiveMimeType,
      `--${boundary}`,
      `Content-Disposition: form-data; name="file"; filename="audio.${ext}"`,
      `Content-Type: ${effectiveMimeType}`,
      '',
      ''
    ].join('\r\n');
    
    const footer = `\r\n--${boundary}--\r\n`;
    
    const headerBytes = new TextEncoder().encode(header);
    const footerBytes = new TextEncoder().encode(footer);
    
    const body = new Uint8Array(headerBytes.length + uint8Array.length + footerBytes.length);
    body.set(headerBytes, 0);
    body.set(uint8Array, headerBytes.length);
    body.set(footerBytes, headerBytes.length + uint8Array.length);
    
    const uploadResp = await fetch(
      `${WHATSAPP_API_URL}/${phoneNumberId}/media`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
        },
        body: body,
      }
    );
    
    const uploadData = await uploadResp.json();
    
    if (!uploadResp.ok) {
      console.error('[Sender] WhatsApp media upload error:', uploadData);
      return null;
    }
    
    console.log('[Sender] Media uploaded successfully, ID:', uploadData.id);
    return uploadData.id;
  } catch (error) {
    console.error('[Sender] Error uploading media to WhatsApp:', error);
    return null;
  }
}
// ===== END UPLOAD MEDIA =====

async function sendMessage(supabase: any, settings: any, queueItem: any) {

  // Get contact phone number
  const { data: contact } = await supabase
    .from('contacts')
    .select('phone_number, whatsapp_id')
    .eq('id', queueItem.contact_id)
    .maybeSingle();

  if (!contact) {
    throw new Error('Contact not found');
  }

  // ========================================
  // CHECK WHATSAPP 24H WINDOW (for non-template messages)
  // ========================================
  const isTemplateMessage = queueItem.metadata?.is_template === true;
  
  if (!isTemplateMessage) {
    // Get conversation to check window
    const { data: conversation, error: convError } = await supabase
      .from('conversations')
      .select('whatsapp_window_start')
      .eq('id', queueItem.conversation_id)
      .maybeSingle();

    if (convError) {
      console.error('[Sender] Error fetching conversation:', convError);
      throw new Error(`Erro ao buscar conversa: ${convError.message}`);
    }

    if (!conversation) {
      console.warn(`[Sender] Conversation ${queueItem.conversation_id} not found - skipping orphan message`);
      // Don't throw - just skip this message (orphan data)
      return;
    }

    const windowStart = conversation.whatsapp_window_start ? new Date(conversation.whatsapp_window_start) : null;
    const now = new Date();
    const windowEndTime = windowStart ? new Date(windowStart.getTime() + 24 * 60 * 60 * 1000) : null;
    const isWindowOpen = windowStart !== null && windowEndTime !== null && now < windowEndTime;

    if (!isWindowOpen) {
      console.log('[Sender] WhatsApp 24h window is closed, rejecting message');
      throw new Error('Janela de 24h expirada - use template para reabrir conversa');
    }
    
    console.log('[Sender] WhatsApp window is open, proceeding with message');
  } else {
    console.log('[Sender] Template message - bypassing window check');
  }

  const recipient = contact.whatsapp_id || contact.phone_number;

  // ========================================
  // STEP 1: CREATE MESSAGE RECORD FIRST (before sending)
  // This ensures messages appear in UI even if WhatsApp fails
  // ========================================
  let messageId = queueItem.message_id;

  if (!messageId) {
    // Create message with 'processing' status BEFORE sending
    console.log('[Sender] Creating message record BEFORE sending...');
    const { data: newMsg, error: createError } = await supabase
      .from('messages')
      .insert({
        conversation_id: queueItem.conversation_id,
        content: queueItem.content,
        type: queueItem.message_type,
        from_type: queueItem.from_type,
        status: 'processing', // Initial status - will update after send
        media_url: queueItem.media_url || null,
        metadata: queueItem.metadata || {}
      })
      .select('id')
      .single();

    if (createError) {
      console.error('[Sender] Error creating message record:', createError);
      // Continue anyway - we still want to try sending
    } else if (newMsg) {
      messageId = newMsg.id;
      console.log('[Sender] Created message record:', messageId);
      
      // Update send_queue with the message_id for tracking
      await supabase
        .from('send_queue')
        .update({ message_id: messageId })
        .eq('id', queueItem.id);
    }
  }

  // Update conversation last_message_at immediately
  await supabase
    .from('conversations')
    .update({ last_message_at: new Date().toISOString() })
    .eq('id', queueItem.conversation_id);

  // ========================================
  // STEP 2: BUILD WHATSAPP PAYLOAD
  // ========================================
  let payload: any = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: recipient
  };

  switch (queueItem.message_type) {
    case 'text':
      payload.type = 'text';
      payload.text = { body: queueItem.content };
      break;
    
    case 'image':
      payload.type = 'image';
      payload.image = { 
        link: queueItem.media_url,
        caption: queueItem.content || undefined
      };
      break;
    
    case 'audio': {
      // Upload audio directly to WhatsApp Media API to avoid content-type issues
      // Supabase Storage serves files as application/octet-stream which WhatsApp rejects
      
      // Detect MIME type: use metadata if available, otherwise infer from URL extension
      let audioMimeType = queueItem.metadata?.mime_type || '';
      if (!audioMimeType) {
        const mediaUrlLower = (queueItem.media_url || '').toLowerCase();
        if (mediaUrlLower.includes('.mp3')) {
          audioMimeType = 'audio/mpeg';
        } else if (mediaUrlLower.includes('.ogg')) {
          audioMimeType = 'audio/ogg';
        } else if (mediaUrlLower.includes('.webm')) {
          audioMimeType = 'audio/webm';
        } else if (mediaUrlLower.includes('.m4a') || mediaUrlLower.includes('.aac')) {
          audioMimeType = 'audio/aac';
        } else {
          audioMimeType = 'audio/ogg'; // Final fallback
        }
        console.log(`[Sender] Inferred audio MIME from URL: ${audioMimeType} (url: ${queueItem.media_url})`);
      }
      
      const audioMediaId = await uploadMediaToWhatsApp(
        settings.whatsapp_phone_number_id,
        settings.whatsapp_access_token,
        queueItem.media_url,
        audioMimeType
      );
      payload.type = 'audio';
      if (audioMediaId) {
        payload.audio = { id: audioMediaId };
      } else {
        // Fallback to link if upload fails
        console.warn('[Sender] Media upload failed, falling back to link');
        payload.audio = { link: queueItem.media_url };
      }
      break;
    }
    
    case 'document':
      payload.type = 'document';
      payload.document = { 
        link: queueItem.media_url,
        filename: queueItem.content || 'document'
      };
      break;
    
    // ===== INTERACTIVE BUTTONS SUPPORT =====
    case 'interactive':
      payload.type = 'interactive';
      payload.interactive = queueItem.metadata?.interactive_payload;
      console.log('[Sender] Interactive payload:', JSON.stringify(payload.interactive));
      break;
    // ===== END INTERACTIVE BUTTONS SUPPORT =====
    
    default:
      payload.type = 'text';
      payload.text = { body: queueItem.content };
  }

  console.log('[Sender] WhatsApp API payload:', JSON.stringify(payload, null, 2));

  // ========================================
  // STEP 3: SEND VIA WHATSAPP API
  // ========================================
  try {
    const response = await fetch(
      `${WHATSAPP_API_URL}/${settings.whatsapp_phone_number_id}/messages`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${settings.whatsapp_access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      }
    );

    const responseData = await response.json();

    if (!response.ok) {
      console.error('[Sender] WhatsApp API error:', responseData);
      
      // Update message status to 'failed' if we have a messageId
      if (messageId) {
        await supabase
          .from('messages')
          .update({
            status: 'failed',
            metadata: {
              ...(queueItem.metadata || {}),
              whatsapp_error: responseData.error?.message || 'WhatsApp API error'
            }
          })
          .eq('id', messageId);
        console.log('[Sender] Updated message status to failed:', messageId);
      }
      
      throw new Error(responseData.error?.message || 'WhatsApp API error');
    }

    const whatsappMessageId = responseData.messages?.[0]?.id;
    console.log('[Sender] Message sent successfully, WA ID:', whatsappMessageId);

    // ========================================
    // STEP 4: UPDATE MESSAGE TO 'SENT' STATUS
    // ========================================
    if (messageId) {
      const { error: updateError } = await supabase
        .from('messages')
        .update({
          whatsapp_message_id: whatsappMessageId,
          status: 'sent',
          sent_at: new Date().toISOString()
        })
        .eq('id', messageId);

      if (updateError) {
        console.error('[Sender] Error updating message to sent:', updateError);
      } else {
        console.log('[Sender] Updated message status to sent:', messageId);
      }
    }

  } catch (error) {
    // If WhatsApp send failed but we already created the message,
    // ensure it's marked as failed
    if (messageId) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      await supabase
        .from('messages')
        .update({
          status: 'failed',
          metadata: {
            ...(queueItem.metadata || {}),
            whatsapp_error: errorMessage
          }
        })
        .eq('id', messageId);
      console.log('[Sender] Marked message as failed due to error:', messageId);
    }
    
    // Re-throw to trigger retry logic in main loop
    throw error;
  }
}
