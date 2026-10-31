import fs from 'node:fs';
const out=[];
for(const model of ['openai/gpt-4.1','openai/gpt-4o','openai/gpt-4.1-mini','deepseek/DeepSeek-V3-0324','meta/Llama-4-Maverick-17B-128E-Instruct-FP8']){
  try{const r=await fetch('https://models.github.ai/inference/chat/completions',{method:'POST',headers:{authorization:'Bearer '+process.env.GITHUB_TOKEN,'content-type':'application/json',accept:'application/vnd.github+json'},body:JSON.stringify({model,messages:[{role:'system',content:'한국어로 답하라.'},{role:'user',content:'다음 사실만으로 한 문장 기사 리드를 써라: 나스닥 2.86% 하락, 인텔 28.58% 하락, 4분기 전망 부진.'}],max_tokens:200})});
  const t=await r.text();out.push(model+' '+r.status+' '+(r.headers.get('x-ratelimit-limit-requests')||'')+' '+t.slice(0,400));}catch(e){out.push(model+' ERR '+e)}
}
fs.mkdirSync('out',{recursive:true});fs.writeFileSync('out/probe.txt',out.join('\n'));
