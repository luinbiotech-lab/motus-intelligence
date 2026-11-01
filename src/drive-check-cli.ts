/**
 * Verifies the Google Drive connection from GitHub Actions without publishing a report: uploads a one-page
 * connection-check PDF to "MOTUS Reports/_connection-check", shares it by link, reads it back without
 * authentication, and records the result in data/report-storage/drive-check.json (no token or id is printed in full).
 */
import {mkdir,writeFile} from 'node:fs/promises';
import {DRIVE_ROOT_FOLDER,GoogleDriveClient,driveCredentialsFromEnvironment,minimalPdf} from './services/google-drive.js';

const at=new Date().toISOString(),result:Record<string,unknown>={checkedAt:at};
const credentials=driveCredentialsFromEnvironment();
try{
  if(!credentials)throw new Error('DRIVE_NOT_CONFIGURED: MOTUS_DRIVE_REFRESH_TOKEN (or the Blogger OAuth client) is missing');
  const drive=new GoogleDriveClient(credentials);
  const upload=await drive.uploadPdf({name:'motus-drive-connection-check.pdf',bytes:minimalPdf(`MOTUS Drive connection check ${at}`),folderPath:[DRIVE_ROOT_FOLDER,'_connection-check'],description:'MOTUS connection check (safe to delete)'});
  const publicOk=await drive.verifyPublic(upload);
  Object.assign(result,{state:publicOk?'PASS':'FAIL',upload:'PASS',replaced:upload.replaced,share:'anyone-with-link',publicRead:publicOk?'PASS':'FAIL',fileIdPrefix:upload.fileId.slice(0,6),folder:upload.folderPath.join('/')});
}catch(error){Object.assign(result,{state:'FAIL',error:error instanceof Error?error.message:String(error)})}
await mkdir('data/report-storage',{recursive:true});await writeFile('data/report-storage/drive-check.json',JSON.stringify(result,null,2)+'\n','utf8');
console.log(JSON.stringify(result));if(result.state!=='PASS')process.exitCode=1;
