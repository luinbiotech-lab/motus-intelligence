import { runBloggerOAuthBootstrap } from './services/blogger-oauth.js';

async function main():Promise<void> {
  console.log('MOTUS Blogger OAuth 승인을 시작합니다. refresh token과 client secret은 콘솔에 출력하지 않습니다.');
  const result=await runBloggerOAuthBootstrap();
  console.log(JSON.stringify({
    OAUTH_CODE_EXCHANGE:result.oauthCodeExchange,
    REFRESH_TOKEN_RECEIVED:result.refreshTokenReceived,
    IMMEDIATE_REFRESH_SELF_TEST:result.immediateRefreshSelfTest,
    expires_in:result.expiresIn,
    scope:result.scope,
    TOKEN_FINGERPRINT_MATCH:result.tokenFingerprintMatch,
    stored_token_crlf_contamination:result.storedTokenCrLfContamination,
    stored_token_surrounding_quote_contamination:result.storedTokenSurroundingQuoteContamination
  },null,2));
}

main().catch(error=>{
  console.error(JSON.stringify({status:'BLOCKED',message:error instanceof Error?error.message:'Blogger OAuth bootstrap failed'}));
  process.exitCode=3;
});
