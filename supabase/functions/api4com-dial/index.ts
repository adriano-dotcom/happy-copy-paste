import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { contactId, conversationId, phoneNumber } = await req.json();

    console.log('[api4com-dial] Starting call:', { contactId, conversationId, phoneNumber });

    if (!phoneNumber) {
      throw new Error('Phone number is required');
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get API4Com settings
    const { data: settings, error: settingsError } = await supabase
      .from('nina_settings')
      .select('api4com_api_token, api4com_default_extension, api4com_enabled')
      .maybeSingle();

    if (settingsError) {
      console.error('[api4com-dial] Settings error:', settingsError);
      throw new Error('Failed to fetch API4Com settings');
    }

    if (!settings?.api4com_enabled) {
      throw new Error('API4Com integration is not enabled');
    }

    if (!settings?.api4com_api_token) {
      throw new Error('API4Com API token is not configured');
    }

    // Get extension from request or use default
    const extension = settings.api4com_default_extension || '1000';
    
    // Clean phone number - remove all non-digits
    const cleanPhone = phoneNumber.replace(/\D/g, '');
    
    // Format for API4Com - Brazilian numbers need country code with + prefix
    let formattedPhone = cleanPhone;
    if (!cleanPhone.startsWith('55') && cleanPhone.length >= 10) {
      formattedPhone = '+55' + cleanPhone;
    } else if (cleanPhone.startsWith('55')) {
      formattedPhone = '+' + cleanPhone;
    }

    console.log('[api4com-dial] Making API call:', { extension, formattedPhone });

    // Call API4Com Dialer API - correct endpoint and field names
    const api4comResponse = await fetch('https://api.api4com.com/api/v1/dialer', {
      method: 'POST',
      headers: {
        'Authorization': settings.api4com_api_token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        extension: extension,
        phone: formattedPhone,
        metadata: {
          gateway: 'nina-crm',
          contactId: contactId,
          conversationId: conversationId,
        }
      }),
    });

    const api4comData = await api4comResponse.json();
    
    console.log('[api4com-dial] API4Com response:', { 
      status: api4comResponse.status, 
      data: api4comData 
    });

    if (!api4comResponse.ok) {
      const errorMsg = api4comData?.message || api4comData?.error?.message || JSON.stringify(api4comData) || 'API4Com call failed';
      throw new Error(errorMsg);
    }

    // Create call log entry
    const { data: callLog, error: callLogError } = await supabase
      .from('call_logs')
      .insert({
        contact_id: contactId || null,
        conversation_id: conversationId || null,
        extension: extension,
        phone_number: formattedPhone,
        status: 'dialing',
        api4com_call_id: api4comData.call_id || api4comData.id || null,
        metadata: {
          api4com_response: api4comData,
          initiated_at: new Date().toISOString(),
        }
      })
      .select()
      .single();

    if (callLogError) {
      console.error('[api4com-dial] Call log error:', callLogError);
      // Don't throw - call was initiated successfully
    }

    console.log('[api4com-dial] Call initiated successfully:', { callLogId: callLog?.id });

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Call initiated successfully',
        call_id: callLog?.id,
        api4com_call_id: api4comData.call_id || api4comData.id,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[api4com-dial] Error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      { 
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
