/**
 * Runs the Claude Code CLI once, headless, on the owner's subscription (CLAUDE_CODE_OAUTH_TOKEN from
 * `claude setup-token`). No tools, no MCP, no settings, no session files, an empty working directory and HOME, and an
 * environment holding only PATH and the token, so no other job secret reaches the child process.
 * Not `--bare`: bare mode reads only ANTHROPIC_API_KEY (paid API), which this project does not use.
 */
import {spawn} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

export type ProviderFailure='NO_TOKEN'|'CLI_MISSING'|'TIMEOUT'|'AUTH'|'RATE_LIMITED'|'CLI_ERROR';
export interface ProviderReply {ok:true;text:string;model:string|null;durationMs:number}
export interface ProviderError {ok:false;reason:ProviderFailure;detail:string}
export interface NarrativeProvider {complete(system:string,user:string):Promise<ProviderReply|ProviderError>}

export const CLAUDE_CLI_ARGS=(system:string,model?:string)=>['-p','--output-format','json','--tools','','--strict-mcp-config','--setting-sources','','--no-session-persistence','--system-prompt',system,...(model?['--model',model]:[])];

/** Classifies a CLI failure without echoing its output (which may carry account details) beyond a short tail. */
export function classifyFailure(text:string):ProviderFailure {
  if(/rate.?limit|usage limit|limit reached|429|overloaded/i.test(text))return 'RATE_LIMITED';
  if(/auth|401|403|token|login|credential/i.test(text))return 'AUTH';
  return 'CLI_ERROR';
}
const redact=(text:string,token:string)=>(token?text.split(token).join('[redacted]'):text).replace(/sk-ant-[A-Za-z0-9_\-]+/g,'[redacted]').slice(-300);

export function claudeCliProvider(options:{token:string|undefined;bin?:string;timeoutMs?:number;model?:string}):NarrativeProvider {
  return {async complete(system,user){
    const token=options.token?.trim()??'';if(!token)return {ok:false,reason:'NO_TOKEN',detail:'CLAUDE_CODE_OAUTH_TOKEN is not set'};
    const home=await mkdtemp(join(tmpdir(),'motus-narrative-'));const started=Date.now();
    try{
      return await new Promise<ProviderReply|ProviderError>(resolve=>{
        const child=spawn(options.bin??'claude',CLAUDE_CLI_ARGS(system,options.model),{cwd:home,env:{PATH:process.env.PATH??'/usr/bin:/bin',HOME:home,CLAUDE_CODE_OAUTH_TOKEN:token,DISABLE_AUTOUPDATER:'1',DISABLE_TELEMETRY:'1'},stdio:['pipe','pipe','pipe']});
        let out='',err='',done=false;const finish=(value:ProviderReply|ProviderError)=>{if(done)return;done=true;clearTimeout(timer);resolve(value)};
        const timer=setTimeout(()=>{child.kill('SIGKILL');finish({ok:false,reason:'TIMEOUT',detail:`no reply within ${options.timeoutMs??240000}ms`})},options.timeoutMs??240000);
        child.stdout.on('data',chunk=>{out+=chunk});child.stderr.on('data',chunk=>{err+=chunk});
        child.on('error',error=>finish({ok:false,reason:(error as NodeJS.ErrnoException).code==='ENOENT'?'CLI_MISSING':'CLI_ERROR',detail:redact(String(error),token)}));
        child.on('close',code=>{
          let parsed:{result?:string;is_error?:boolean;subtype?:string;modelUsage?:Record<string,unknown>}|null=null;try{parsed=JSON.parse(out)}catch{parsed=null}
          if(code!==0||!parsed||parsed.is_error||typeof parsed.result!=='string'){const text=`${parsed?.result??''} ${parsed?.subtype??''} ${err} ${out.slice(-400)}`;finish({ok:false,reason:classifyFailure(text),detail:redact(text,token)});return}
          finish({ok:true,text:parsed.result,model:Object.keys(parsed.modelUsage??{})[0]??null,durationMs:Date.now()-started});
        });
        child.stdin.end(user);
      });
    }finally{await rm(home,{recursive:true,force:true})}
  }};
}
