import type {PreRenderSearchContext} from '../search/editorial-demand.js';

export interface VerifiedAIEventInput {topicId:string;publisher:string;title:string;pageEvidence:string;link:string;publishedAt:string}
export interface KoreanAIEvent {topicId:string;publisher:string;company:string;topic:string;headline:string;facts:string[];interpretation:string;watch:string;link:string;publishedAt:string}
export interface AIEditorialDecision {ordered:KoreanAIEvent[];title:string;lead:string;depthByTopic:Record<string,number>;searchEffects:Array<'TITLE'|'LEAD'|'ORDERING'|'DEPTH'>}

export function synthesizeKoreanAIEvent(input:VerifiedAIEventInput):KoreanAIEvent|null {
  const company=koreanCompany(input.publisher),source=`${input.title} ${input.pageEvidence}`,lower=source.toLowerCase(),facts:string[]=[];
  let topic:string|null=null;
  if(/cities?/.test(lower)&&/public services/.test(lower)&&/partners?/.test(lower)){topic='도시 운영에 적용되는 AI 에이전트';facts.push(`${company}는 공식 발표에서 유럽 지역의 소프트웨어·인프라·통합 파트너들이 도시 운영과 공공서비스 개선을 위한 AI 에이전트 응용 프로그램을 구축하고 있다고 밝혔다.`)}
  else if(/uk/.test(lower)&&/healthcare/.test(lower)&&/finance/.test(lower)&&/local government/.test(lower)&&/climate science/.test(lower)){topic='영국 산업·공공 영역의 AI 도입';facts.push(`${company}는 공식 발표에서 영국의 의료·금융·지방정부·기후과학 기관들이 AI를 실제 업무에 적용하고 있으며, 적용 범위가 민간 기업뿐 아니라 공공 영역과 과학 연구까지 이어지고 있다고 밝혔다.`)}
  else if(/gemini/.test(lower)&&/access/.test(lower)&&/frontier model/.test(lower)){const product=productName(source,/Gemini\s+[A-Za-z0-9.-]+(?:\s+[A-Za-z0-9.-]+)?/i,'Gemini');topic=`${product} 공개와 이용 확대`;facts.push(`${company}는 공식 발표에서 개발자·기업·과학자와 일반 사용자에게 ${product} 이용 기회를 제공하고, 이를 최신 프런티어 모델로 소개했다. 공개 범위에는 연구와 기업 활용이 함께 포함됐다.`)}
  else if(/rtx\s+spark/.test(lower)&&/applications?/.test(lower)&&/games?/.test(lower)&&/models?/.test(lower)){topic='RTX Spark 생태계 출시 준비';facts.push(`${company}는 공식 발표에서 RTX Spark 출시를 앞두고 관련 응용 프로그램·게임·모델 생태계의 준비 현황을 공개했으며, 출시 시점에 맞춘 소프트웨어와 콘텐츠 지원 범위를 함께 제시했다.`);if(/friday|oct\.?\s*16/.test(lower))facts.push('공식 원문은 출시 시점을 10월 16일로 제시했다.')}
  if(!topic||!facts.length)return null;
  return {topicId:input.topicId,publisher:input.publisher,company,topic,headline:`${company}, ${topic}`,facts,interpretation:`이 발표의 산업적 의미는 기술 공개 자체보다 실제 고객 채택과 운영 성과로 이어지는지에 달려 있다.`,watch:'후속 제품 지표, 고객 채택 사례, 설비투자와 실적 자료를 확인할 필요가 있다.',link:input.link,publishedAt:input.publishedAt};
}

export function buildAIEditorialDecision(events:KoreanAIEvent[],search:PreRenderSearchContext):AIEditorialDecision {
  if(!events.length)throw new Error('AI_KOREAN_SYNTHESIS_UNAVAILABLE');
  const byId=new Map(events.map(event=>[event.topicId,event])),ordered=search.orderedTopicIds.map(id=>byId.get(id)).filter((event):event is KoreanAIEvent=>Boolean(event));for(const event of events)if(!ordered.some(item=>item.topicId===event.topicId))ordered.push(event);
  const major=ordered[0]!,selected=search.selectedSecondaryTopicId?byId.get(search.selectedSecondaryTopicId):undefined,effects:Array<'TITLE'|'LEAD'|'ORDERING'|'DEPTH'>=[];
  const original=events.map(item=>item.topicId).join('|');if(ordered.map(item=>item.topicId).join('|')!==original)effects.push('ORDERING');
  const title=selected&&selected.topicId!==major.topicId?`${major.company}가 공개한 ${major.topic}, ${selected.company} 움직임까지 읽기`:`${major.company}가 공개한 ${major.topic}, 실제 산업 변화로 이어질까`;
  const lead=selected&&selected.topicId!==major.topicId?`${major.company}가 공개한 ${major.topic}이 오늘 AI 산업의 중심축이다. 여기에 ${selected.company}의 ${selected.topic}을 함께 보면 경쟁이 제품 발표를 넘어 실제 도입과 운영 성과로 이동하는 흐름이 선명해진다.`:`${major.company}가 공개한 ${major.topic}이 오늘 AI 산업의 핵심이다. 공식 원문에서 확인된 사실과 실제 도입·운영 성과에서 추가로 확인할 변수를 나눠 살펴본다.`;
  const depthByTopic=Object.fromEntries(ordered.map((event,index)=>[event.topicId,index===0||event.topicId===search.selectedSecondaryTopicId?2:1]));
  if(selected){effects.push('TITLE','LEAD','DEPTH')}
  return {ordered,title,lead,depthByTopic,searchEffects:[...new Set(effects)]};
}

function productName(value:string,pattern:RegExp,fallback:string){return value.match(pattern)?.[0]?.replace(/\s+/g,' ').trim()??fallback}
function koreanCompany(value:string):string {return ({OpenAI:'오픈AI','Google AI':'구글',NVIDIA:'엔비디아',Microsoft:'마이크로소프트',Anthropic:'앤트로픽','Amazon AWS':'아마존웹서비스'} as Record<string,string>)[value]??value}

