/**
 * One-time Google Drive authorization for MOTUS PDF reports, run on the owner's PC:
 *
 *   npm run drive:oauth -- --client-json <Google Cloud에서 받은 client_secret_….json>
 *
 * The client is a "Desktop app" OAuth client created for Drive (the existing Blogger client is a web client that
 * cannot use a local callback). The consent asks only for drive.file. The client id, client secret and refresh
 * token go straight into the repository's Actions secrets (MOTUS_DRIVE_CLIENT_ID / _CLIENT_SECRET /
 * _REFRESH_TOKEN) through the GitHub CLI; none of them is printed. Finally it checks that the Drive API answers and
 * creates the "MOTUS Reports" folder.
 */
import {spawn} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {runBloggerOAuthBootstrap} from './services/blogger-oauth.js';
import {DRIVE_FILE_SCOPE,DRIVE_ROOT_FOLDER,GoogleDriveClient} from './services/google-drive.js';

const REPO='luinbiotech-lab/motus-intelligence';
function gh(args:string[],input?:string):Promise<void> {
  return new Promise((resolve,reject)=>{
    const child=spawn('gh',args,{stdio:[input===undefined?'ignore':'pipe','ignore','pipe'],shell:process.platform==='win32'});
    let error='';child.stderr?.on('data',chunk=>{error+=String(chunk)});
    child.once('error',()=>reject(new Error('GitHub CLI(gh)가 없습니다. https://cli.github.com 에서 설치하고 gh auth login 후 다시 실행하세요.')));
    child.once('exit',code=>code===0?resolve():reject(new Error(args[0]==='auth'?'GitHub CLI 로그인이 필요합니다. gh auth login 후 다시 실행하세요.':'gh 실패: '+error.trim().slice(0,200))));
    if(input!==undefined)child.stdin!.end(input);
  });
}
const setSecret=(name:string,value:string)=>gh(['secret','set',name,'--repo',REPO],value);

export async function readClientJson(path:string):Promise<{clientId:string;clientSecret:string}> {
  const body=JSON.parse(await readFile(path,'utf8')) as {installed?:{client_id?:string;client_secret?:string};web?:unknown};
  if(!body.installed){throw new Error(body.web?'이 JSON은 "웹 애플리케이션" 클라이언트입니다. 유형을 "데스크톱 앱"으로 새로 만들어 받은 JSON을 쓰세요.':'Google OAuth 클라이언트 JSON 형식이 아닙니다.')}
  const clientId=body.installed.client_id?.trim(),clientSecret=body.installed.client_secret?.trim();
  if(!clientId||!clientSecret)throw new Error('JSON에 client_id 또는 client_secret이 없습니다.');
  return {clientId,clientSecret};
}

const args=process.argv.slice(2),jsonPath=args[args.indexOf('--client-json')+1];
console.log('MOTUS 구글 드라이브 승인을 시작합니다. 비밀번호와 토큰은 화면에 출력하지 않습니다.');
try{
  if(!args.includes('--client-json')||!jsonPath)throw new Error('사용법: npm run drive:oauth -- --client-json <다운로드한 client_secret_….json 경로>');
  const client=await readClientJson(jsonPath);
  // Fail before the consent page, so a granted token is never lost for want of a place to store it.
  await gh(['auth','status']);
  let token='';
  const env:Record<string,string>={BLOGGER_CLIENT_ID:client.clientId,BLOGGER_CLIENT_SECRET:client.clientSecret,BLOGGER_BLOG_ID:'drive'};
  console.log('브라우저가 열리면 luinbiotech@gmail.com으로 "허용"을 눌러 주세요.');
  await runBloggerOAuthBootstrap({environment:name=>env[name],scope:DRIVE_FILE_SCOPE,persistSecret:async value=>{token=value;return value}});
  await setSecret('MOTUS_DRIVE_CLIENT_ID',client.clientId);await setSecret('MOTUS_DRIVE_CLIENT_SECRET',client.clientSecret);await setSecret('MOTUS_DRIVE_REFRESH_TOKEN',token);
  console.log('1/3 승인 완료, GitHub Secret 3개(MOTUS_DRIVE_CLIENT_ID·CLIENT_SECRET·REFRESH_TOKEN) 저장 완료');
  const drive=new GoogleDriveClient({...client,refreshToken:token});
  try{const folder=await drive.ensureFolder([DRIVE_ROOT_FOLDER]);console.log(`2/3 드라이브 API 응답 확인, 앱 전용 "${DRIVE_ROOT_FOLDER}" 폴더 준비 (id ${folder.slice(0,6)}…)`)}
  catch(error){const message=error instanceof Error?error.message:String(error);
    if(/accessNotConfigured|SERVICE_DISABLED|has not been used/i.test(message))throw new Error('Google Drive API가 꺼져 있습니다. Google Cloud 콘솔 > API 및 서비스 > 라이브러리에서 "Google Drive API"를 사용 설정한 뒤 다시 실행하세요.');
    throw error}
  console.log('3/3 완료. 이제 GitHub Actions에서 PDF를 드라이브에 올릴 수 있습니다.');
}catch(error){console.error('중단: '+(error instanceof Error?error.message:String(error)));process.exitCode=3}
