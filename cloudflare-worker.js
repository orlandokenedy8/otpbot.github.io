export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);
        const targetNumber = url.searchParams.get('number');

        // CORS headers so your GitHub Pages website can securely read it
        const corsHeaders = {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET,HEAD,POST,OPTIONS",
            "Access-Control-Max-Age": "86400",
        };

        // Handle pre-flight browser checks
        if (request.method === "OPTIONS") {
            return new Response(null, { headers: corsHeaders });
        }

        // Security check: Must provide a specific number to query
        if (!targetNumber) {
            return new Response(JSON.stringify({ error: "Missing number parameter" }), {
                status: 400,
                headers: { ...corsHeaders, "Content-Type": "application/json" }
            });
        }

        // Your hidden Koyeb Database URL
        const API_URL = "https://weak-deloris-nothing672434-fe85179d.koyeb.app/api/otps?limit=500";

        try {
            // Securely fetch the massive database list entirely behind the scenes
            const resp = await fetch(API_URL);
            const data = await resp.json();

            if (!data.success || !data.otps) {
                return new Response(JSON.stringify({ error: "Failed to fetch OTPs from Source" }), {
                    status: 500,
                    headers: { ...corsHeaders, "Content-Type": "application/json" }
                });
            }

            // 🚨 CRITICAL PRIVACY FILTER 🚨
            // Filter out all 10,000+ OTPs and ONLY return the messages belonging
            // to the specific user's requested number.
            const userOtps = data.otps.filter(o => o.number === targetNumber);

            // Return only the safe, filtered bundle.
            return new Response(JSON.stringify({ success: true, otps: userOtps }), {
                status: 200,
                headers: { ...corsHeaders, "Content-Type": "application/json" }
            });
        } catch (err) {
            return new Response(JSON.stringify({ error: err.message }), {
                status: 500,
                headers: { ...corsHeaders, "Content-Type": "application/json" }
            });
        }
    },
};
