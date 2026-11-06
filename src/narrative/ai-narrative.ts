/**
 * AI narrative article (2026-11-06, 루치오 "다중검토해보고 진행시켜"; engineering + editorial reviews).
 *
 * The model never sees raw pages: it receives a fact bundle derived deterministically from the article's verified
 * view model, writes a lead, three key points and 3–5 sections in a fixed JSON shape, and cites fact ids per
 * paragraph. The validator below rejects anything the cited facts do not carry (numbers, Latin names, brokers,
 * quotes), unattributed causal claims, advice/hype wording and characters that do not survive Blogger readback.
 * A rejected or missing narrative never blocks publication: the template article stands.
 */
import {createHash} from 'node:crypto';
import type {AIIntelligenceDailyViewModel} from '../intelligence/daily-masters.js';

export type FactKind='official'|'broker'|'price'|'calendar';
export interface NarrativeFact {id:string;kind:FactKind;text:string;publisher?:string;sourceUrl?:string;date?:string}
export interface AIFactBundle {schema:'motus.ai-facts/1';bundleHash:string;operationDate:string;sessionDate:string|null;facts:NarrativeFact[]}
export interface NarrativeParagraph {text:string;factIds:string[]}
export interface AINarrative {schema:'motus.ai-narrative/1';bundleHash:string;lead:NarrativeParagraph;keyPoints:NarrativeParagraph[];sections:Array<{heading:string;paragraphs:NarrativeParagraph[]}>}

const pct=(value:number)=>`${value>0?'+':value<0?'-':''}${Math.abs(value).toFixed(2)}%`;
const hash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0,16);
const publisherOf=(headline:string)=>headline.split(/[,，]/)[0]!.trim();

/** The verified facts of one AI article, in a stable order, as the only material the narrative may use. */
export function buildAIFactBundle(view:AIIntelligenceDailyViewModel):AIFactBundle {
  const facts:Omit<NarrativeFact,'id'>[]=[],deep=view.deepSections??[];
  const stocks=deep.find(item=>item.key==='ai-stocks'),sessionDate=stocks?.intro?.match(/\d{4}-\d{2}-\d{2}/)?.[0]??null;
  facts.push({kind:'calendar',text:`기사 발행일은 ${view.issueDate}이다.${sessionDate?` 주가는 직전 미국 정규장(${sessionDate}, ${Number(sessionDate.slice(5,7))}월 ${Number(sessionDate.slice(8,10))}일) 종가 기준이다.`:''}`,date:view.issueDate});
  for(const issue of view.issues){const text=issue.whatHappened.join(' ').trim();if(text)facts.push({kind:'official',text,publisher:publisherOf(issue.headline),...(issue.evidenceRefs[0]?{sourceUrl:issue.evidenceRefs[0]}:{})})}
  if(stocks?.paragraphs[0]?.text)facts.push({kind:'price',text:stocks.paragraphs[0].text,...(sessionDate?{date:sessionDate}:{})});
  for(const bar of stocks?.bars??[])facts.push({kind:'price',text:`${bar.label}: 직전 정규장 등락 ${pct(bar.value)}`,...(sessionDate?{date:sessionDate}:{})});
  for(const section of deep.filter(item=>item.role==='broker'))for(const paragraph of section.paragraphs){
    if(!paragraph.source)continue;
    const r=paragraph.report,text=r?`${r.company??r.title}: ${r.broker}${r.analysts?` ${r.analysts} 연구원`:''}, ${r.date} 리포트 「${r.title}」${r.rating?`, 투자의견 ${r.rating}`:''}${r.target?`, 목표주가 ${r.target}원`:''}.`:paragraph.text;
    facts.push({kind:'broker',text,publisher:r?.broker??paragraph.source.label.split(' ')[0]!,sourceUrl:paragraph.source.url,...(r?.date?{date:r.date}:{})});
  }
  const numbered=facts.map((fact,index)=>({id:`F${index+1}`,...fact}));
  return {schema:'motus.ai-facts/1',bundleHash:hash({date:view.issueDate,title:view.title,facts:numbered}),operationDate:view.issueDate,sessionDate,facts:numbered};
}

/* ---------------- validation ---------------- */
const CAUSE=/때문|덕분|영향으로|힘입어|배경으로|으로 인해|로 인해|견인|탓에|여파/;
const ATTRIBUTION=/(분석|진단|평가|설명|전망|해석|판단)했다|봤다|짚었다|밝혔다|꼽았다|제시했다|에 따르면|라고 |로 보았다|는 입장/;
export const NARRATIVE_BANNED=['매수 추천','매수 기회','저가 매수 기회','사야','담아라','담아야','비중 확대하라','지금이 기회','수익 보장','확실히 오를','무조건','급등 예상','추천 종목','주목할 종목','오를 것','떨어질 것','귀추가 주목','주목해야 할','결론적으로','이처럼','투자자라면'];
/** Characters that render and read back unchanged (no quotes that Blogger re-encodes, no markup, no links). */
const ALLOWED=/^[가-힣ㄱ-ㅎA-Za-z0-9\s.,%·()“”‘’「」\-+~/:;?!…→↑↓&$]*$/;
const numbersIn=(text:string)=>[...text.matchAll(/\d[\d,]*(?:\.\d+)?/g)].map(match=>match[0].replace(/,/g,'')).map(value=>value.replace(/\.0+$/,''));
const latinIn=(text:string)=>[...text.matchAll(/[A-Za-z][A-Za-z0-9&.\-]*[A-Za-z0-9]|[A-Za-z]/g)].map(match=>match[0].toLowerCase());
const brokersIn=(text:string)=>[...text.matchAll(/([가-힣A-Za-z]{1,12}(?:투자증권|증권))/g)].map(match=>match[1]!);
const quotesIn=(text:string)=>[...text.matchAll(/“([^”]*)”/g)].map(match=>match[1]!);
const sentences=(text:string)=>text.split(/(?<=[.?!])\s+/).filter(Boolean);

export interface NarrativeValidation {ok:boolean;errors:string[]}
/** Every rule a narrative must pass before it may replace any template text. */
export function validateNarrative(bundle:AIFactBundle,value:unknown):NarrativeValidation {
  const errors:string[]=[];const n=value as Partial<AINarrative>;
  if(!n||typeof n!=='object')return {ok:false,errors:['SCHEMA:not an object']};
  if(n.schema!=='motus.ai-narrative/1')errors.push('SCHEMA:schema');
  if(n.bundleHash!==bundle.bundleHash)errors.push('SCHEMA:bundleHash');
  const isParagraph=(p:unknown):p is NarrativeParagraph=>Boolean(p&&typeof (p as NarrativeParagraph).text==='string'&&Array.isArray((p as NarrativeParagraph).factIds));
  if(!isParagraph(n.lead))errors.push('SCHEMA:lead');
  if(!Array.isArray(n.keyPoints)||n.keyPoints.length!==3||!n.keyPoints.every(isParagraph))errors.push('SCHEMA:keyPoints');
  if(!Array.isArray(n.sections)||n.sections.length<3||n.sections.length>5||!n.sections.every(s=>s&&typeof s.heading==='string'&&Array.isArray(s.paragraphs)&&s.paragraphs.length>=1&&s.paragraphs.length<=4&&s.paragraphs.every(isParagraph)))errors.push('SCHEMA:sections');
  if(errors.length)return {ok:false,errors};
  const byId=new Map(bundle.facts.map(fact=>[fact.id,fact])),narrative=n as AINarrative,cited=new Set<string>();
  const check=(where:string,p:NarrativeParagraph,min:number,max:number)=>{
    const text=p.text.trim();
    if(text.length<min||text.length>max)errors.push(`LENGTH:${where}:${text.length}`);
    if(!ALLOWED.test(text))errors.push(`CHARSET:${where}:${[...new Set(text.replace(/[가-힣ㄱ-ㅎA-Za-z0-9\s.,%·()“”‘’「」\-+~/:;?!…→↑↓&$]/g,''))].join('')}`);
    if(/https?:|www\.|<|>|\*\*|#|\[|\]/.test(text))errors.push(`FORMAT:${where}`);
    if(/eventId|claimId|reportId|fixture|placeholder|sample|MOTUS는|MOTUS가 보기|당사/.test(text))errors.push(`INTERNAL:${where}`);
    for(const phrase of NARRATIVE_BANNED)if(text.includes(phrase))errors.push(`BANNED:${where}:${phrase}`);
    if(!p.factIds.length)errors.push(`CITATION:${where}:none`);
    const facts=p.factIds.map(id=>byId.get(id));if(facts.some(fact=>!fact)){errors.push(`CITATION:${where}:unknown`);return}
    p.factIds.forEach(id=>cited.add(id));
    const source=facts.map(fact=>fact!.text).join(' '),sourceNumbers=new Set(numbersIn(source)),rounded=new Set(facts.filter(fact=>fact!.kind==='price').flatMap(fact=>numbersIn(fact!.text).filter(v=>v.includes('.')).map(v=>String(Number(Number(v).toFixed(1))))));
    for(const number of numbersIn(text))if(!sourceNumbers.has(number)&&!rounded.has(number))errors.push(`NUMBER:${where}:${number}`);
    const latin=new Set(latinIn(source));for(const word of latinIn(text))if(!latin.has(word)&&!source.toLowerCase().includes(word))errors.push(`ENTITY:${where}:${word}`);
    for(const broker of brokersIn(text))if(!source.includes(broker))errors.push(`ENTITY:${where}:${broker}`);
    for(const quote of quotesIn(text)){if(quote.length>120)errors.push(`QUOTE_LENGTH:${where}`);if(!source.includes(quote))errors.push(`QUOTE_MISMATCH:${where}`)}
    if(/목표주가|투자의견/.test(text)&&!facts.some(fact=>fact!.kind==='broker'))errors.push(`RATING_UNSOURCED:${where}`);
    for(const sentence of sentences(text))if(CAUSE.test(sentence)&&(!facts.some(fact=>fact!.kind==='broker')||!ATTRIBUTION.test(sentence)))errors.push(`CAUSE_UNATTRIBUTED:${where}`);
  };
  check('lead',narrative.lead,80,420);
  narrative.keyPoints.forEach((p,i)=>check(`key${i+1}`,p,20,160));
  narrative.sections.forEach((section,i)=>{
    if(section.heading.length<6||section.heading.length>40||!ALLOWED.test(section.heading)||/[0-9]/.test(section.heading)&&numbersIn(section.heading).some(v=>!bundle.facts.some(f=>numbersIn(f.text).includes(v))))errors.push(`HEADING:s${i+1}`);
    section.paragraphs.forEach((p,j)=>check(`s${i+1}p${j+1}`,p,80,600));
  });
  const total=[narrative.lead,...narrative.sections.flatMap(s=>s.paragraphs)].reduce((sum,p)=>sum+p.text.length,0);
  if(total<1000||total>4000)errors.push(`LENGTH:total:${total}`);
  for(const fact of bundle.facts.filter(f=>f.kind==='official'))if(!cited.has(fact.id))errors.push(`COVERAGE:${fact.id}`);
  const texts=[narrative.lead,...narrative.keyPoints,...narrative.sections.flatMap(s=>s.paragraphs)].map(p=>p.text.replace(/\s+/g,' ').trim());
  if(new Set(texts).size!==texts.length)errors.push('DUPLICATE');
  return {ok:!errors.length,errors};
}

/* ---------------- prompt ---------------- */
export const NARRATIVE_SYSTEM_PROMPT=[
  '너는 MOTUS 블로그의 한국어 AI 산업 기자다. 입력으로 주어지는 사실 묶음(facts)만 근거로 기사 본문을 쓴다.',
  '절대 규칙:',
  '1. 사실 묶음에 없는 숫자·날짜·회사·제품·증권사·인물 이름을 쓰지 않는다. 숫자는 사실 문장에 적힌 그대로 쓴다(주가 등락률만 소수 첫째 자리 반올림 허용).',
  '2. 모든 문단에 근거로 쓴 사실 id를 factIds로 단다. 문단에 나온 숫자와 이름은 모두 그 문단이 인용한 사실 안에 있어야 한다.',
  '3. 원인(때문, 영향으로, 힘입어, 견인 등)은 증권사 사실을 인용하고 "~라고 분석했다/봤다/짚었다"처럼 출처를 밝힐 때만 쓴다. MOTUS 자신의 단정적 원인·전망을 쓰지 않는다.',
  '4. 매수·매도 권유, 목표가 달성 예측, "기회", "확실", "주목할 종목" 같은 표현을 쓰지 않는다. 정보 정리 기사다.',
  '5. 직접 인용은 “ ”로 사실 문장의 문구를 그대로, 120자 이내로만 쓴다. 가능하면 짧게 풀어서 출처를 밝힌다.',
  '6. URL, HTML, 마크다운, 따옴표(\' ")를 쓰지 않는다. 따옴표가 필요하면 “ ” ‘ ’만 쓴다.',
  '7. 하루의 가장 중요한 이야기 하나를 중심으로 쓴다. 같은 내용을 반복하지 않는다. "귀추가 주목된다", "결론적으로", "이처럼" 같은 상투어를 쓰지 않는다.',
  '8. 공식 발표(kind=official) 사실은 모두 한 번 이상 다룬다. 발표 내용이 사실 문장에 없으면 발표 제목과 날짜만 전하고 지어내지 않는다.',
  '형식: 설명 없이 JSON 객체 하나만 출력한다.',
  '{"schema":"motus.ai-narrative/1","bundleHash":"<입력의 bundleHash>","lead":{"text":"2~3문장 리드(80~420자)","factIds":["F.."]},"keyPoints":[3개 {"text":"20~160자 요약","factIds":[..]}],"sections":[3~5개 {"heading":"주장이나 질문 형태의 소제목(6~40자)","paragraphs":[1~4개 {"text":"80~600자","factIds":[..]}]}]}',
  '본문(리드+섹션 문단) 전체는 1,200~3,000자를 목표로 한다.'
].join('\n');

export function narrativeUserPrompt(bundle:AIFactBundle,feedback?:string[]):string {
  return JSON.stringify({task:'AI 인텔리전스 기사 본문 작성',bundleHash:bundle.bundleHash,operationDate:bundle.operationDate,sessionDate:bundle.sessionDate,facts:bundle.facts.map(({id,kind,text,publisher,date})=>({id,kind,text,...(publisher?{publisher}:{}),...(date?{date}:{})})),...(feedback?.length?{previousAttemptRejected:feedback.slice(0,20),instruction:'위 검증 오류를 모두 고쳐 JSON 전체를 다시 출력하라.'}:{})});
}

/** The first JSON object in the model's reply (it may wrap it in a code fence). */
export function parseNarrativeReply(text:string):unknown {
  const start=text.indexOf('{'),end=text.lastIndexOf('}');if(start<0||end<=start)throw new Error('NARRATIVE_JSON_MISSING');
  return JSON.parse(text.slice(start,end+1));
}

export const NARRATIVE_DISCLAIMER='본 글은 공개된 공식 발표·증권사 리포트·시세를 정리한 정보 제공용 콘텐츠이며 투자 권유가 아닙니다. 증권사 의견은 해당 증권사의 견해이며, 투자 판단과 책임은 투자자 본인에게 있습니다.';

export interface NarrativeOutcome {schema:'motus.ai-narrative-outcome/1';mode:'SHADOW';bundleHash:string;status:'VALID'|'REJECTED'|'PROVIDER_FAILED'|'SKIPPED';reason:string|null;attempts:number;errors:string[];model:string|null;durationMs:number|null}
type Provider=import('./claude-cli-provider.js').NarrativeProvider;
/** One request, and one correction request only when the reply failed validation (never after limits or auth). */
export async function generateNarrative(bundle:AIFactBundle,provider:Provider):Promise<{outcome:NarrativeOutcome;narrative:AINarrative|null;rejected:unknown}> {
  const base={schema:'motus.ai-narrative-outcome/1' as const,mode:'SHADOW' as const,bundleHash:bundle.bundleHash};
  let feedback:string[]|undefined,rejected:unknown=null,errors:string[]=[],model:string|null=null,duration=0;
  for(let attempt=1;attempt<=2;attempt++){
    const reply=await provider.complete(NARRATIVE_SYSTEM_PROMPT,narrativeUserPrompt(bundle,feedback));
    if(!reply.ok)return {outcome:{...base,status:reply.reason==='NO_TOKEN'?'SKIPPED':'PROVIDER_FAILED',reason:`NARRATIVE_${reply.reason}`,attempts:attempt,errors:[reply.detail],model,durationMs:duration||null},narrative:null,rejected};
    model=reply.model;duration+=reply.durationMs;
    let parsed:unknown;try{parsed=parseNarrativeReply(reply.text)}catch{parsed=null}
    const result=parsed?validateNarrative(bundle,parsed):{ok:false,errors:['SCHEMA:json']};
    if(result.ok)return {outcome:{...base,status:'VALID',reason:null,attempts:attempt,errors:[],model,durationMs:duration},narrative:parsed as AINarrative,rejected:null};
    rejected=parsed??reply.text.slice(0,4000);errors=result.errors;feedback=result.errors;
  }
  return {outcome:{...base,status:'REJECTED',reason:`NARRATIVE_INVALID:${errors[0]?.split(':')[0]??'UNKNOWN'}`,attempts:2,errors,model,durationMs:duration},narrative:null,rejected};
}
