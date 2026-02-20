import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Minimal valid SDP offer for testing (audio-only)
const FAKE_SDP_OFFER = `v=0
o=- 1234567890 2 IN IP4 127.0.0.1
s=-
t=0 0
a=group:BUNDLE audio
m=audio 9 UDP/TLS/RTP/SAVPF 111
c=IN IP4 0.0.0.0
a=rtcp:9 IN IP4 0.0.0.0
a=ice-ufrag:fakeufrag123
a=ice-pwd:fakepwd456789012345678901
a=fingerprint:sha-256 AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99
a=setup:actpass
a=mid:audio
a=sendrecv
a=rtcp-mux
a=rtpmap:111 opus/48000/2
a=fmtp:111 minptime=10;useinbandfec=1
`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const body = await req.json().catch(() => ({}));
    const direction = body.direction || "inbound";
    const fromNumber = body.from_number || "5511999998888";
    const toNumber = body.to_number || "5511888887777";
    const contactId = body.contact_id || null;

    if (direction === "inbound") {
      // Simulate inbound ringing call with SDP offer
      const { data, error } = await supabase
        .from("whatsapp_calls")
        .insert({
          whatsapp_call_id: `fake_call_${Date.now()}`,
          direction: "inbound",
          status: "ringing",
          from_number: fromNumber,
          to_number: toNumber,
          contact_id: contactId,
          sdp_offer: FAKE_SDP_OFFER,
          phone_number_id: "fake_phone_number_id",
          metadata: { simulated: true, created_by: "simulate-whatsapp-call" },
        })
        .select()
        .single();

      if (error) throw error;

      return new Response(
        JSON.stringify({
          success: true,
          message: "Simulated inbound call created (status: ringing)",
          call_id: data.id,
          direction: "inbound",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } else {
      // Simulate outbound pending_bridge call
      const { data, error } = await supabase
        .from("whatsapp_calls")
        .insert({
          whatsapp_call_id: `fake_outbound_${Date.now()}`,
          direction: "outbound",
          status: "pending_bridge",
          from_number: toNumber,
          to_number: fromNumber,
          contact_id: contactId,
          phone_number_id: "fake_phone_number_id",
          metadata: { simulated: true, created_by: "simulate-whatsapp-call" },
        })
        .select()
        .single();

      if (error) throw error;

      return new Response(
        JSON.stringify({
          success: true,
          message: "Simulated outbound call created (status: pending_bridge)",
          call_id: data.id,
          direction: "outbound",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
