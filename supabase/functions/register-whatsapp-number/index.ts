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
    console.log('🔧 Registering WhatsApp number...');

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get WhatsApp credentials from nina_settings
    const { data: settings, error: settingsError } = await supabase
      .from('nina_settings')
      .select('whatsapp_access_token, whatsapp_phone_number_id')
      .single();

    if (settingsError || !settings) {
      console.error('❌ Error fetching settings:', settingsError);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to fetch WhatsApp settings' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { whatsapp_access_token, whatsapp_phone_number_id } = settings;

    if (!whatsapp_access_token || !whatsapp_phone_number_id) {
      return new Response(
        JSON.stringify({ success: false, error: 'WhatsApp credentials not configured' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`📱 Phone Number ID: ${whatsapp_phone_number_id}`);

    // Register the phone number
    const registerUrl = `https://graph.facebook.com/v19.0/${whatsapp_phone_number_id}/register`;
    
    console.log('📤 Sending register request to:', registerUrl);

    const response = await fetch(registerUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${whatsapp_access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        pin: '123456'
      }),
    });

    const result = await response.json();
    console.log('📥 Register response:', JSON.stringify(result, null, 2));

    if (!response.ok) {
      console.error('❌ Register error:', result);
      return new Response(
        JSON.stringify({ success: false, error: result.error?.message || 'Registration failed', details: result }),
        { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('✅ Phone number registered successfully!');

    return new Response(
      JSON.stringify({ success: true, message: 'Phone number registered successfully', result }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('❌ Unexpected error:', error);
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
