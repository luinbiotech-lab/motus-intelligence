import { BLOGGER_OAUTH_SCOPE, runBloggerOAuthBootstrap } from './services/blogger-oauth.js';

async function main():Promise<void> {
  console.log('MOTUS Blogger OAuth 승인을 시작합니다. refresh token과 client secret은 콘솔에 출력하지 않습니다.');
  const result=await runBloggerOAuthBootstrap();
  console.log(JSON.stringify({status:'PASS',blogIdConfigured:result.blogIdConfigured,scope:result.scope,loginHint:result.loginHint,refreshToken:'COPIED_TO_CLIPBOARD'},null,2));
  if(process.platform==='win32') {
    console.log("PowerShell에서 다음 명령을 실행해 현재 Windows 사용자 환경변수에 저장하세요:\n[Environment]::SetEnvironmentVariable('BLOGGER_REFRESH_TOKEN', (Get-Clipboard), 'User'); Set-Clipboard ''");
    console.log("저장 후 새 터미널을 열거나 다음 명령으로 현재 세션에 반영하세요:\nSet-Item Env:BLOGGER_REFRESH_TOKEN ([Environment]::GetEnvironmentVariable('BLOGGER_REFRESH_TOKEN','User'))");
  } else {
    console.log('클립보드의 값을 운영체제 secret manager 또는 로컬 shell secret 설정에 BLOGGER_REFRESH_TOKEN으로 저장한 뒤 클립보드를 비우세요.');
  }
  console.log(`승인 scope: ${BLOGGER_OAUTH_SCOPE}`);
}

main().catch(error=>{
  console.error(JSON.stringify({status:'BLOCKED',message:error instanceof Error?error.message:'Blogger OAuth bootstrap failed'}));
  process.exitCode=3;
});
