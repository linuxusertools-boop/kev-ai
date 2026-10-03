const o = location.origin
const id = 'KEVAI7QX2M9T'
const set = (k, v) => { document.getElementById(k).textContent = v }
set('d1', `curl -X POST ${o}/api \\\n  -H "x-session-id: ${id}" \\\n  -H "content-type: application/json" \\\n  -d '{"text":"Halo, kamu siapa?"}'`)
set('d2', `curl "${o}/api/${id}?text=Halo"`)
set('d3', `curl -X PUT ${o}/api/config \\\n  -H "x-session-id: ${id}" \\\n  -H "content-type: application/json" \\\n  -d '{"systemPrompt":"Kamu Kevin, asisten ramah.","knowledge":["Pembuatmu bernama Kev"]}'`)
