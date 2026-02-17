import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { vq_id, elevenlabs_conversation_id } = await req.json()

    if (!vq_id || !elevenlabs_conversation_id) {
      return new Response(
        JSON.stringify({ error: 'vq_id and elevenlabs_conversation_id are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get ElevenLabs API key from vault
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, serviceRoleKey)

    const { data: apiKeyData } = await supabase.rpc('get_vault_secret', { secret_name: 'ELEVENLABS_API_KEY' })
    const elevenlabsApiKey = apiKeyData || Deno.env.get('ELEVENLABS_API_KEY')

    if (!elevenlabsApiKey) {
      return new Response(
        JSON.stringify({ error: 'ElevenLabs API key not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Connect to ElevenLabs monitor WebSocket and send end_call
    const wsUrl = `wss://api.us.elevenlabs.io/v1/convai/conversations/${elevenlabs_conversation_id}/monitor`

    const endCallResult = await new Promise<{ success: boolean; error?: string }>((resolve) => {
      const timeout = setTimeout(() => {
        resolve({ success: false, error: 'WebSocket connection timeout' })
      }, 10000)

      try {
        const ws = new WebSocket(wsUrl, ['xi-api-key', elevenlabsApiKey])

        ws.onopen = () => {
          console.log('WebSocket connected, sending end_call command')
          ws.send(JSON.stringify({ command_type: 'end_call' }))
          // Give it a moment then close
          setTimeout(() => {
            ws.close()
            clearTimeout(timeout)
            resolve({ success: true })
          }, 1000)
        }

        ws.onerror = (e) => {
          console.error('WebSocket error:', e)
          clearTimeout(timeout)
          resolve({ success: false, error: 'WebSocket connection failed' })
        }

        ws.onclose = () => {
          clearTimeout(timeout)
        }
      } catch (err) {
        clearTimeout(timeout)
        resolve({ success: false, error: String(err) })
      }
    })

    // Also try the REST API as fallback
    if (!endCallResult.success) {
      console.log('WebSocket failed, trying REST API to end conversation')
      try {
        const restResponse = await fetch(
          `https://api.us.elevenlabs.io/v1/convai/conversations/${elevenlabs_conversation_id}/end`,
          {
            method: 'POST',
            headers: {
              'xi-api-key': elevenlabsApiKey,
              'Content-Type': 'application/json',
            },
          }
        )
        if (restResponse.ok) {
          console.log('REST API end call succeeded')
        } else {
          console.log('REST API end call status:', restResponse.status)
        }
      } catch (restErr) {
        console.log('REST fallback also failed:', restErr)
      }
    }

    // Update voice_qualifications status regardless
    const { error: updateError } = await supabase
      .from('voice_qualifications')
      .update({
        status: 'cancelled',
        completed_at: new Date().toISOString(),
        observations: 'Encerrada manualmente pelo operador',
      })
      .eq('id', vq_id)

    if (updateError) {
      console.error('Error updating voice_qualification:', updateError)
      return new Response(
        JSON.stringify({ error: 'Failed to update status', details: updateError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({ success: true, ws_result: endCallResult }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('elevenlabs-hangup error:', err)
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
