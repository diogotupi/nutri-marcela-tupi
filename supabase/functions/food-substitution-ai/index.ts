// Retired endpoint: cached clients must never launch another paid analysis.
Deno.serve(() => new Response(null, {status:410, headers:{'Cache-Control':'no-store','Access-Control-Allow-Origin':'*'}}));
