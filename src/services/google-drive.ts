/**
 * Google Drive storage for MOTUS PDF reports.
 *
 * Uses the owner's OAuth client (the same Google Cloud client as Blogger) with the narrow `drive.file` scope:
 * the app can see and change only files and folders it created itself, never the rest of the owner's Drive.
 * Reports live under "MOTUS Reports/<year>/<series>" and are shared as "anyone with the link can view" so the
 * blog post can link them. An upload with the same name in the same folder replaces that file's content instead of
 * adding a duplicate.
 */
export const DRIVE_FILE_SCOPE='https://www.googleapis.com/auth/drive.file';
export const DRIVE_ROOT_FOLDER='MOTUS Reports';
const TOKEN='https://oauth2.googleapis.com/token',API='https://www.googleapis.com/drive/v3',UPLOAD='https://www.googleapis.com/upload/drive/v3';
const FOLDER='application/vnd.google-apps.folder';

type FetchLike=(input:string|URL,init?:RequestInit)=>Promise<Response>;
export interface DriveCredentials {clientId:string;clientSecret:string;refreshToken:string}
export interface DriveUpload {fileId:string;name:string;webViewLink:string;downloadUrl:string;replaced:boolean;folderPath:string[]}

export function driveCredentialsFromEnvironment(env:NodeJS.ProcessEnv=process.env):DriveCredentials|null {
  const clientId=env.BLOGGER_CLIENT_ID?.trim(),clientSecret=env.BLOGGER_CLIENT_SECRET?.trim(),refreshToken=env.MOTUS_DRIVE_REFRESH_TOKEN?.trim();
  return clientId&&clientSecret&&refreshToken?{clientId,clientSecret,refreshToken}:null;
}
/** Drive error text without echoing request bodies or tokens. */
async function failure(response:Response,what:string):Promise<Error> {
  let reason='';try{const body=await response.json() as {error?:{message?:string;errors?:Array<{reason?:string}>}|string;error_description?:string};reason=typeof body.error==='string'?`${body.error} ${body.error_description??''}`:`${body.error?.errors?.[0]?.reason??''} ${body.error?.message??''}`}catch{}
  return new Error(`DRIVE_${what}_${response.status}: ${reason.trim().slice(0,200)}`);
}
const q=(value:string)=>value.replace(/\\/g,'\\\\').replace(/'/g,"\\'");

export class GoogleDriveClient {
  private token:string|null=null;
  constructor(private readonly credentials:DriveCredentials,private readonly fetcher:FetchLike=fetch){}
  private async accessToken():Promise<string> {
    if(this.token)return this.token;
    const response=await this.fetcher(TOKEN,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:this.credentials.clientId,client_secret:this.credentials.clientSecret,refresh_token:this.credentials.refreshToken,grant_type:'refresh_token'})});
    if(!response.ok)throw await failure(response,'TOKEN');
    const body=await response.json() as {access_token?:string;scope?:string};
    if(!body.access_token)throw new Error('DRIVE_TOKEN_EMPTY');
    if(body.scope&&!body.scope.split(' ').includes(DRIVE_FILE_SCOPE))throw new Error('DRIVE_TOKEN_SCOPE_MISSING: the refresh token was not granted drive.file');
    return this.token=body.access_token;
  }
  private async call<T>(url:string,init:RequestInit={},what='CALL'):Promise<T> {
    const response=await this.fetcher(url,{...init,headers:{...(init.headers as Record<string,string>??{}),authorization:`Bearer ${await this.accessToken()}`}});
    if(!response.ok)throw await failure(response,what);
    return await response.json() as T;
  }
  private async find(name:string,parent:string|null,mime?:string):Promise<{id:string}|null> {
    const parts=[`name='${q(name)}'`,'trashed=false',parent?`'${q(parent)}' in parents`:`'root' in parents`,...(mime?[`mimeType='${mime}'`]:[])];
    const body=await this.call<{files?:Array<{id:string}>}>(`${API}/files?${new URLSearchParams({q:parts.join(' and '),fields:'files(id)',spaces:'drive',pageSize:'5'})}`,{},'LIST');
    return body.files?.[0]??null;
  }
  /** Finds or creates each folder of the path below My Drive and returns the last one's id. */
  async ensureFolder(path:string[]):Promise<string> {
    let parent:string|null=null;
    for(const name of path){
      const found:{id:string}|null=await this.find(name,parent,FOLDER);
      parent=found?.id??(await this.call<{id:string}>(`${API}/files?fields=id`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name,mimeType:FOLDER,...(parent?{parents:[parent]}:{})})},'FOLDER')).id;
    }
    return parent!;
  }
  async uploadPdf(input:{name:string;bytes:Uint8Array;folderPath:string[];description?:string}):Promise<DriveUpload> {
    const folder=await this.ensureFolder(input.folderPath),existing=await this.find(input.name,folder);
    const boundary='motus'+Math.random().toString(16).slice(2),meta=existing?{description:input.description??''}:{name:input.name,parents:[folder],mimeType:'application/pdf',description:input.description??''};
    const body=new Blob([`--${boundary}\r\ncontent-type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${boundary}\r\ncontent-type: application/pdf\r\n\r\n`,new Uint8Array(input.bytes),`\r\n--${boundary}--`]);
    const url=existing?`${UPLOAD}/files/${existing.id}?uploadType=multipart&fields=id,name,webViewLink`:`${UPLOAD}/files?uploadType=multipart&fields=id,name,webViewLink`;
    const file=await this.call<{id:string;name:string;webViewLink?:string}>(url,{method:existing?'PATCH':'POST',headers:{'content-type':`multipart/related; boundary=${boundary}`},body},'UPLOAD');
    await this.call(`${API}/files/${file.id}/permissions?fields=id`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({role:'reader',type:'anyone'})},'SHARE');
    return {fileId:file.id,name:file.name,webViewLink:file.webViewLink??`https://drive.google.com/file/d/${file.id}/view`,downloadUrl:`https://drive.google.com/uc?export=download&id=${file.id}`,replaced:Boolean(existing),folderPath:input.folderPath};
  }
  /** Reads a shared file back without authentication, as a blog reader would. */
  async verifyPublic(upload:DriveUpload):Promise<boolean> {
    const response=await this.fetcher(upload.webViewLink,{redirect:'follow'});return response.ok;
  }
}

/** A one-page PDF with an ASCII line, for connection checks only. */
export function minimalPdf(text:string):Uint8Array {
  const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>'];
  const stream=`BT /F1 14 Tf 72 770 Td (${text.replace(/[()\\]/g,'')}) Tj ET`;
  objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  let pdf='%PDF-1.4\n';const offsets:number[]=[];
  objects.forEach((body,index)=>{offsets.push(pdf.length);pdf+=`${index+1} 0 obj\n${body}\nendobj\n`});
  const xref=pdf.length;pdf+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n${offsets.map(offset=>String(offset).padStart(10,'0')+' 00000 n \n').join('')}trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(pdf);
}

