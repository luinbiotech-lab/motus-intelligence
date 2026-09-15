import { createServer, type Server } from 'node:http';
import { createHash, randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';

export const BLOGGER_OAUTH_SCOPE='https://www.googleapis.com/auth/blogger';
export const BLOGGER_AUTHORIZATION_ENDPOINT='https://accounts.google.com/o/oauth2/v2/auth';
export const BLOGGER_TOKEN_ENDPOINT='https://oauth2.googleapis.com/token';
export const BLOGGER_LOGIN_HINT='luinbiotech@gmail.com';

type FetchLike=(input:string|URL,init?:RequestInit)=>Promise<Response>;
type EnvironmentReader=(name:string)=>string|undefined;
type OAuthTokenResponse={refresh_token?:string;access_token?:string;scope?:string;token_type?:string;expires_in?:number};

export interface BloggerOAuthEnvironment {
  clientId:string;
  clientSecret:string;
  blogId:string;
}

export interface BloggerOAuthBootstrapDependencies {
  environment?:EnvironmentReader;
  fetcher?:FetchLike;
  openUrl?:(url:string)=>Promise<void>;
  persistSecret?:(secret:string)=>Promise<string>;
  timeoutMs?:number;
  loginHint?:string;
}

export interface BloggerOAuthBootstrapResult {
  blogIdConfigured:true;
  oauthCodeExchange:'PASS';
  refreshTokenReceived:'YES';
  immediateRefreshSelfTest:'PASS';
  expiresIn:number;
  scope:string;
  loginHint:string;
  refreshTokenStored:true;
  tokenFingerprintMatch:'YES'|'NO';
  storedTokenCrLfContamination:'YES'|'NO';
  storedTokenSurroundingQuoteContamination:'YES'|'NO';
}

export function readBloggerOAuthEnvironment(environment:EnvironmentReader=(name)=>process.env[name]):BloggerOAuthEnvironment {
  const values={
    clientId:environment('BLOGGER_CLIENT_ID')?.trim(),
    clientSecret:environment('BLOGGER_CLIENT_SECRET')?.trim(),
    blogId:environment('BLOGGER_BLOG_ID')?.trim()
  };
  const missing:string[]=[];
  if(!values.clientId) missing.push('BLOGGER_CLIENT_ID');
  if(!values.clientSecret) missing.push('BLOGGER_CLIENT_SECRET');
  if(!values.blogId) missing.push('BLOGGER_BLOG_ID');
  if(missing.length) throw new Error(`missing Blogger OAuth environment: ${missing.join(', ')}`);
  return values as BloggerOAuthEnvironment;
}

export function buildBloggerAuthorizationUrl(input:{clientId:string;redirectUri:string;state:string;loginHint?:string}):URL {
  const url=new URL(BLOGGER_AUTHORIZATION_ENDPOINT);
  url.search=new URLSearchParams({
    client_id:input.clientId,
    redirect_uri:input.redirectUri,
    response_type:'code',
    scope:BLOGGER_OAUTH_SCOPE,
    access_type:'offline',
    prompt:'consent',
    state:input.state,
    login_hint:input.loginHint??BLOGGER_LOGIN_HINT
  }).toString();
  return url;
}

export async function exchangeAuthorizationCode(input:{code:string;clientId:string;clientSecret:string;redirectUri:string},fetcher:FetchLike=fetch):Promise<string> {
  const body=new URLSearchParams({
    code:input.code,
    client_id:input.clientId,
    client_secret:input.clientSecret,
    redirect_uri:input.redirectUri,
    grant_type:'authorization_code'
  });
  const response=await fetcher(BLOGGER_TOKEN_ENDPOINT,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body});
  if(!response.ok) throw new Error(`Blogger OAuth token exchange failed (${response.status})`);
  const token=await response.json() as OAuthTokenResponse;
  if(typeof token.refresh_token!=='string'||token.refresh_token.length===0) throw new Error('Blogger OAuth did not issue a refresh token; revoke the prior grant and retry with consent');
  return token.refresh_token;
}

export async function testRefreshTokenImmediately(input:{refreshToken:string;clientId:string;clientSecret:string},fetcher:FetchLike=fetch):Promise<{expiresIn:number;scope:string}> {
  const body=new URLSearchParams({client_id:input.clientId,client_secret:input.clientSecret,refresh_token:input.refreshToken,grant_type:'refresh_token'});
  const response=await fetcher(BLOGGER_TOKEN_ENDPOINT,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body});
  if(!response.ok) {
    const error=await safeOAuthError(response);
    throw new Error(`Blogger OAuth immediate refresh self-test failed (${response.status}): ${error}`);
  }
  const token=await response.json() as OAuthTokenResponse;
  if(!token.access_token?.trim()) throw new Error('Blogger OAuth immediate refresh self-test returned no access token');
  if(!Number.isFinite(token.expires_in)||token.expires_in!<=0) throw new Error('Blogger OAuth immediate refresh self-test returned invalid expires_in');
  return {expiresIn:token.expires_in!,scope:token.scope?.trim()||BLOGGER_OAUTH_SCOPE};
}

export async function runBloggerOAuthBootstrap(dependencies:BloggerOAuthBootstrapDependencies={}):Promise<BloggerOAuthBootstrapResult> {
  const environment=readBloggerOAuthEnvironment(dependencies.environment);
  const state=randomBytes(32).toString('hex');
  const callback=await startLoopbackCallback(state,dependencies.timeoutMs??300_000);
  try {
    const authorizationUrl=buildBloggerAuthorizationUrl({clientId:environment.clientId,redirectUri:callback.redirectUri,state,...(dependencies.loginHint?{loginHint:dependencies.loginHint}:{})});
    callback.code.catch(()=>undefined);
    await (dependencies.openUrl??openExternalUrl)(authorizationUrl.toString());
    const code=await callback.code;
    const refreshToken=await exchangeAuthorizationCode({code,clientId:environment.clientId,clientSecret:environment.clientSecret,redirectUri:callback.redirectUri},dependencies.fetcher);
    const selfTest=await testRefreshTokenImmediately({refreshToken,clientId:environment.clientId,clientSecret:environment.clientSecret},dependencies.fetcher);
    const storedToken=await (dependencies.persistSecret??persistRefreshTokenToWindowsUserEnvironment)(refreshToken);
    const inspection=inspectStoredRefreshToken(storedToken);
    return {
      blogIdConfigured:true,
      oauthCodeExchange:'PASS',
      refreshTokenReceived:'YES',
      immediateRefreshSelfTest:'PASS',
      expiresIn:selfTest.expiresIn,
      scope:selfTest.scope,
      loginHint:dependencies.loginHint??BLOGGER_LOGIN_HINT,
      refreshTokenStored:true,
      tokenFingerprintMatch:fingerprint(refreshToken)===fingerprint(storedToken)?'YES':'NO',
      storedTokenCrLfContamination:inspection.crLf?'YES':'NO',
      storedTokenSurroundingQuoteContamination:inspection.surroundingQuote?'YES':'NO'
    };
  } finally {
    callback.close();
  }
}

type LoopbackCallback={redirectUri:string;code:Promise<string>;close:()=>void};

async function startLoopbackCallback(expectedState:string,timeoutMs:number):Promise<LoopbackCallback> {
  let settle:(value:string)=>void=()=>undefined;
  let reject:(reason:Error)=>void=()=>undefined;
  const code=new Promise<string>((resolve,rejectPromise)=>{settle=resolve;reject=rejectPromise;});
  let settled=false;
  const finish=(error:Error|null,value?:string)=>{
    if(settled) return;
    settled=true;
    clearTimeout(timer);
    if(error) reject(error); else settle(value!);
  };
  const server:Server=createServer((request,response)=>{
    const requestUrl=new URL(request.url??'/',`http://${request.headers.host??'127.0.0.1'}`);
    if(request.method!=='GET'||requestUrl.pathname!=='/oauth2/callback') {
      response.writeHead(404,{'content-type':'text/plain; charset=utf-8'}).end('Not found');
      return;
    }
    const returnedState=requestUrl.searchParams.get('state');
    const oauthError=requestUrl.searchParams.get('error');
    const authorizationCode=requestUrl.searchParams.get('code');
    if(returnedState!==expectedState) {
      response.writeHead(400,{'content-type':'text/plain; charset=utf-8'}).end('OAuth state validation failed. Return to the terminal.');
      finish(new Error('Blogger OAuth callback state mismatch'));
      return;
    }
    if(oauthError) {
      response.writeHead(400,{'content-type':'text/plain; charset=utf-8'}).end('Authorization was not completed. Return to the terminal.');
      finish(new Error(oauthError==='access_denied'?'Blogger OAuth authorization was denied':'Blogger OAuth callback returned an error'));
      return;
    }
    if(!authorizationCode) {
      response.writeHead(400,{'content-type':'text/plain; charset=utf-8'}).end('Authorization code is missing. Return to the terminal.');
      finish(new Error('Blogger OAuth callback missing authorization code'));
      return;
    }
    response.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'}).end('<!doctype html><html lang="ko"><meta charset="utf-8"><title>MOTUS OAuth 완료</title><body><p>승인이 완료되었습니다. 이 창을 닫고 터미널로 돌아가세요.</p></body></html>');
    finish(null,authorizationCode);
  });
  const timer=setTimeout(()=>finish(new Error('Blogger OAuth callback timed out')),timeoutMs);
  try {
    await new Promise<void>((resolve,rejectListen)=>{
      server.once('error',rejectListen);
      server.listen(0,'127.0.0.1',()=>{server.off('error',rejectListen);resolve();});
    });
  } catch(error) {
    clearTimeout(timer);
    server.close();
    throw error;
  }
  const address=server.address();
  if(!address||typeof address==='string') { server.close(); throw new Error('Blogger OAuth callback server did not bind to a loopback port'); }
  return {redirectUri:`http://127.0.0.1:${address.port}/oauth2/callback`,code,close:()=>{finish(new Error('Blogger OAuth callback server closed'));server.close();}};
}

async function openExternalUrl(url:string):Promise<void> {
  const command=process.platform==='win32'?'rundll32.exe':process.platform==='darwin'?'open':'xdg-open';
  const args=process.platform==='win32'?['url.dll,FileProtocolHandler',url]:[url];
  await spawnAndWait(command,args);
}

async function persistRefreshTokenToWindowsUserEnvironment(secret:string):Promise<string> {
  if(process.platform!=='win32') throw new Error('automatic BLOGGER_REFRESH_TOKEN storage requires Windows');
  const script="[Console]::OutputEncoding=[System.Text.UTF8Encoding]::new($false); $value=[Console]::In.ReadToEnd(); [Environment]::SetEnvironmentVariable('BLOGGER_REFRESH_TOKEN',$value,'User'); $stored=[Environment]::GetEnvironmentVariable('BLOGGER_REFRESH_TOKEN','User'); [Console]::Out.Write($stored)";
  return await new Promise<string>((resolve,reject)=>{
    const child=spawn('powershell.exe',['-NoLogo','-NoProfile','-NonInteractive','-Command',script],{stdio:['pipe','pipe','ignore'],windowsHide:true});
    const output:Buffer[]=[];
    let settled=false;
    const fail=()=>{if(!settled){settled=true;reject(new Error('refresh token self-test passed but Windows User environment storage failed'));}};
    child.stdout.on('data',(chunk:Buffer)=>output.push(chunk));
    child.once('error',fail);
    child.once('exit',code=>{
      if(code!==0) return fail();
      if(!settled){settled=true;resolve(Buffer.concat(output).toString('utf8'));}
    });
    child.stdin.end(secret);
  });
}

function fingerprint(value:string):string { return createHash('sha256').update(value,'utf8').digest('hex').slice(0,8); }
function inspectStoredRefreshToken(value:string):{crLf:boolean;surroundingQuote:boolean} {
  const first=value[0];
  const last=value[value.length-1];
  return {crLf:value.includes('\r')||value.includes('\n'),surroundingQuote:first==='"'||first==="'"||last==='"'||last==="'"};
}
async function safeOAuthError(response:Response):Promise<string> {
  try {
    const parsed=JSON.parse(await response.text()) as {error?:string;error_description?:string};
    return [parsed.error,parsed.error_description].filter(value=>typeof value==='string').join(' - ').slice(0,240)||'request failed';
  } catch { return 'request failed'; }
}

async function spawnAndWait(command:string,args:string[]):Promise<void> {
  await new Promise<void>((resolve,reject)=>{
    const child=spawn(command,args,{detached:true,stdio:'ignore',windowsHide:true});
    child.once('error',()=>reject(new Error('could not open the Google OAuth authorization page')));
    child.once('spawn',()=>{child.unref();resolve();});
  });
}
