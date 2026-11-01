/**
 * One-time Google Drive authorization for MOTUS PDF reports, run on the owner's PC:
 *
 *   npm run drive:oauth
 *
 * Opens Google's consent page for the narrow drive.file scope on the same OAuth client as Blogger
 * (BLOGGER_CLIENT_ID / BLOGGER_CLIENT_SECRET in the Windows user environment), then stores the refresh token
 * straight into the repository's Actions secret MOTUS_DRIVE_REFRESH_TOKEN with the GitHub CLI. The token is never
 * printed. Finally it checks that the Drive API answers and creates the "MOTUS Reports" folder.
 */
import {spawn} from 'node:child_process';
import {runBloggerOAuthBootstrap} from './services/blogger-oauth.js';
import {DRIVE_FILE_SCOPE,DRIVE_ROOT_FOLDER,GoogleDriveClient} from './services/google-drive.js';

const REPO='luinbiotech-lab/motus-intelligence',SECRET='MOTUS_DRIVE_REFRESH_TOKEN';
function ghSecretSet(value:string):Promise<void> {
  return new Promise((resolve,reject)=>{
    const child=spawn('gh',['secret','set',SECRET,'--repo',REPO],{stdio:['pipe','ignore','pipe'],shell:process.platform==='win32'});
    let error='';child.stderr.on('data',chunk=>{error+=String(chunk)});
    child.once('error',()=>reject(new Error('GitHub CLI(gh)를 찾을 수 없습니다. https://cli.github.com 설치 후 gh auth login 하고 다시 실행하세요.')));
    child.once('exit',code=>code===0?resolve():reject(new Error('gh secret set 실패: '+error.trim().slice(0,200))));
    child.stdin.end(value);
  });
}

let token='';
console.log('MOTUS 구글 드라이브 승인을 시작합니다. 브라우저에서 luinbiotech@gmail.com으로 "허용"을 눌러 주세요. 토큰은 화면에 출력하지 않습니다.');
try{
  await runBloggerOAuthBootstrap({scope:DRIVE_FILE_SCOPE,persistSecret:async value=>{token=value;await ghSecretSet(value);return value}});
  console.log(`1/3 승인 완료, GitHub Secret ${SECRET} 저장 완료`);
  const drive=new GoogleDriveClient({clientId:process.env.BLOGGER_CLIENT_ID!.trim(),clientSecret:process.env.BLOGGER_CLIENT_SECRET!.trim(),refreshToken:token});
  try{const folder=await drive.ensureFolder([DRIVE_ROOT_FOLDER]);console.log(`2/3 드라이브 API 응답 확인, "${DRIVE_ROOT_FOLDER}" 폴더 준비 (id ${folder.slice(0,6)}…)`)}
  catch(error){const message=error instanceof Error?error.message:String(error);
    if(/accessNotConfigured|SERVICE_DISABLED|has not been used/i.test(message))throw new Error('Google Drive API가 꺼져 있습니다. Google Cloud 콘솔 > API 및 서비스 > 라이브러리에서 "Google Drive API"를 사용 설정한 뒤 다시 실행하세요.');
    throw error}
  console.log('3/3 완료. 이제 GitHub Actions에서 PDF를 드라이브에 올릴 수 있습니다.');
}catch(error){console.error('중단: '+(error instanceof Error?error.message:String(error)));process.exitCode=3}
