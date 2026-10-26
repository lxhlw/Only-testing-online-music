// Nonfatal provisioning for a private, 24-hour diagnostics KV namespace.
// Uses existing Pages deployment credentials, never prints secrets or raw IDs.
// If the token lacks Workers KV Storage Write, the diagnostic photo card works.
const token=process.env.CLOUDFLARE_API_TOKEN
const account=process.env.CLOUDFLARE_ACCOUNT_ID
const project='only-testing-online-music'
if(!token||!account){
  console.log('Diagnostic KV: missing deployment credentials; photo summary fallback remains available')
  process.exit(0)
}
const base='https://api.cloudflare.com/client/v4/accounts/'+encodeURIComponent(account)
const headers={'Authorization':'Bearer '+token,'Content-Type':'application/json'}
async function api(path,method='GET',body){
  const result=await fetch(base+path,{method,headers,body:body?JSON.stringify(body):undefined})
  const json=await result.json().catch(()=>({}))
  if(!result.ok||!json.success){
    const details=(json.errors||[]).map(e=>e.message).join('; ').slice(0,150)
    throw new Error('Cloudflare status '+result.status+(details?': '+details:''))
  }
  return json.result
}
try{
  const list=await api('/storage/kv/namespaces?per_page=100')
  let namespace=list.find(item=>item.title==='LX_MUSIC_TEMP_DIAGNOSTICS')
  if(!namespace){
    namespace=await api('/storage/kv/namespaces','POST',{title:'LX_MUSIC_TEMP_DIAGNOSTICS'})
    console.log('Diagnostic KV: created private namespace')
  }
  const path='/pages/projects/'+project
  const current=await api(path)
  const production=current.deployment_configs?.production||{}
  const bindings=production.kv_namespaces||{}
  if(bindings.LX_DIAGNOSTICS?.namespace_id!==namespace.id){
    await api(path,'PATCH',{deployment_configs:{
      production:{kv_namespaces:{...bindings,LX_DIAGNOSTICS:{namespace_id:namespace.id}}}
    }})
    const updated=await api(path)
    if(updated.deployment_configs?.production?.kv_namespaces?.LX_DIAGNOSTICS?.namespace_id!==namespace.id)
      throw new Error('Cloudflare did not confirm KV binding')
    console.log('Diagnostic KV: production Pages binding configured')
  }else console.log('Diagnostic KV: production Pages binding already configured')
}catch(e){
  // Keep site deploy healthy; endpoint returns 503 when KV was not provisioned.
  console.log('Diagnostic KV not enabled: '+String(e.message||e).slice(0,180))
  console.log('One-click photo summary stays available; KV needs Workers KV Storage Write permission')
}
