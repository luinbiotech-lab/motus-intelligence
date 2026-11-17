import {handleRequest,sendDaily,type PushEnv} from '../../src/push/briefing-push.js';
export default {
  fetch:(request:Request,env:PushEnv)=>handleRequest(request,env),
  scheduled:async(_event:unknown,env:PushEnv,ctx:{waitUntil(promise:Promise<unknown>):void})=>{ctx.waitUntil(sendDaily(env).then(result=>console.log(JSON.stringify(result))))},
};
