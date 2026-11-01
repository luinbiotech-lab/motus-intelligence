import test from 'node:test';
import assert from 'node:assert/strict';
import {DRIVE_FILE_SCOPE,GoogleDriveClient,minimalPdf} from '../src/services/google-drive.js';
import {buildBloggerAuthorizationUrl} from '../src/services/blogger-oauth.js';

test('drive consent asks only for drive.file on the existing OAuth client', () => {
  const url=buildBloggerAuthorizationUrl({clientId:'cid',redirectUri:'http://127.0.0.1:1/oauth2/callback',state:'s',scope:DRIVE_FILE_SCOPE});
  assert.equal(url.searchParams.get('scope'),DRIVE_FILE_SCOPE);assert.equal(url.searchParams.get('access_type'),'offline');
  assert.equal(buildBloggerAuthorizationUrl({clientId:'cid',redirectUri:'r',state:'s'}).searchParams.get('scope'),'https://www.googleapis.com/auth/blogger');
});

test('upload creates the folder path once, replaces a same-name file, and shares it by link', async () => {
  const calls:string[]=[];const files=new Map<string,string>([['root/MOTUS Reports','F1']]);let created=0;
  const fetcher=async(input:string|URL,init:RequestInit={})=>{const url=String(input),method=init.method??'GET';calls.push(method+' '+url.replace(/\?.*/,''));
    const json=(body:unknown)=>new Response(JSON.stringify(body),{status:200});
    if(url.startsWith('https://oauth2.googleapis.com/token'))return json({access_token:'at',scope:DRIVE_FILE_SCOPE});
    if(method==='GET'&&url.includes('/drive/v3/files?')){const qs=new URL(url).searchParams.get('q')!;const name=/name='([^']+)'/.exec(qs)![1]!,parent=/'([^']+)' in parents/.exec(qs)![1]!;const id=files.get(parent+'/'+name);return json({files:id?[{id}]:[]})}
    if(method==='POST'&&url.includes('/drive/v3/files?fields=id')){const body=JSON.parse(String(init.body));const id='F'+(10+created++);files.set((body.parents?.[0]??'root')+'/'+body.name,id);return json({id})}
    if(url.includes('/upload/drive/v3/files'))return json({id:method==='PATCH'?'P1':'N1',name:'w.pdf',webViewLink:'https://drive.google.com/file/d/x/view'});
    if(url.includes('/permissions'))return json({id:'anyoneWithLink'});
    return new Response('{}',{status:404});};
  const drive=new GoogleDriveClient({clientId:'c',clientSecret:'s',refreshToken:'r'},fetcher);
  const first=await drive.uploadPdf({name:'w.pdf',bytes:minimalPdf('x'),folderPath:['MOTUS Reports','2026','Weekly']});
  assert.equal(first.replaced,false);assert.equal(created,2,'only the missing folders are created');
  assert.ok(calls.some(call=>call.startsWith('POST https://www.googleapis.com/drive/v3/files/N1/permissions')));
  files.set(`${[...files.entries()].find(([k])=>k.endsWith('/Weekly'))![1]}/w.pdf`,'P1');
  const second=await drive.uploadPdf({name:'w.pdf',bytes:minimalPdf('y'),folderPath:['MOTUS Reports','2026','Weekly']});
  assert.equal(second.replaced,true);assert.equal(created,2);assert.ok(calls.some(call=>call==='PATCH https://www.googleapis.com/upload/drive/v3/files/P1'));
});

test('a token without drive.file is refused', async () => {
  const drive=new GoogleDriveClient({clientId:'c',clientSecret:'s',refreshToken:'r'},async()=>new Response(JSON.stringify({access_token:'at',scope:'https://www.googleapis.com/auth/blogger'}),{status:200}));
  await assert.rejects(()=>drive.ensureFolder(['MOTUS Reports']),/DRIVE_TOKEN_SCOPE_MISSING/);
});
