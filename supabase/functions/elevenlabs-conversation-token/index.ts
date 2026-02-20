import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify auth
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Get ElevenLabs config from secrets
    const elevenlabsApiKey = Deno.env.get('ELEVENLABS_API_KEY');
    const elevenlabsAgentId = Deno.env.get('ELEVENLABS_AGENT_ID_IRIS');

    if (!elevenlabsApiKey || !elevenlabsAgentId) {
      console.error('[ElevenLabs Token] Missing ELEVENLABS_API_KEY or ELEVENLABS_AGENT_ID_IRIS');
      return new Response(JSON.stringify({ error: 'Missing ElevenLabs configuration' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Parse optional dynamic variables from request body
    let dynamicVars: Record<string, string> = {};
    try {
      const body = await req.json();
      dynamicVars = body.dynamic_variables || {};
    } catch { /* empty body is fine */ }

    console.log(`[ElevenLabs Token] Requesting conversation token for agent ${elevenlabsAgentId}`);

    // Request conversation token from ElevenLabs
    const response = await fetch(
      `https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${elevenlabsAgentId}`,
      {
        headers: {
          'xi-api-key': elevenlabsApiKey,
        },
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[ElevenLabs Token] API error ${response.status}:`, errorText);
      return new Response(JSON.stringify({ error: `ElevenLabs API error: ${response.status}` }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const data = await response.json();
    console.log(`[ElevenLabs Token] Token obtained successfully`);

    return new Response(JSON.stringify({ 
      signed_url: data.signed_url,
      agent_id: elevenlabsAgentId,
    }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[ElevenLabs Token] Unexpected error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
