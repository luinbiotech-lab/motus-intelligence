/**
 * Evidence-bound Korean synthesis for official AI announcements without an LLM.
 *
 * Facts are limited to what can be read mechanically from the official text: who published it, when,
 * the announcement title, the event type named in the title/body, products, organisations, places and
 * explicit figures (amounts, counts, power, speed-ups). Everything interpretive is emitted separately
 * and prefixed "MOTUS 분석", so facts and analysis never blend. No figure is attributed a meaning the
 * text does not give it.
 */
import type {KoreanAIEvent} from './ai-editorial-synthesis.js';
import type {AIEvidenceBasis} from './ai-sources.js';

export interface EvidenceBoundAIInput {
  topicId:string;publisher:string;sourceId:string;title:string;link:string;publishedAt:string;
  evidence:string;basis:AIEvidenceBasis;
  /** Why the official page itself was not used as evidence (only for RSS-based evidence). */
  fallbackReason?:'PAGE_BLOCKED'|'PAGE_TEXT_INSUFFICIENT';
}

export type AIEventType='infrastructure'|'launch'|'partnership'|'adoption'|'investment'|'research'|'security'|'policy'|'education';

const TYPE_RULES:Array<{type:AIEventType;pattern:RegExp}>=[
  {type:'infrastructure',pattern:/\b(?:data ?cent(?:er|re)s?|supercomput\w*|compute capacity|expands? compute|ai factor(?:y|ies)|gpu clusters?|gigawatts?|infrastructure|sovereign (?:ai|cloud)|compute for)\b/i},
  {type:'security',pattern:/\b(?:secur\w*|safety|vulnerabilit\w*|threats?|cyber\w*|fraud|abuse)\b/i},
  {type:'partnership',pattern:/\b(?:partner(?:s|ship|ships)?|collaborat\w*|teams? up|alliance|joins? forces|agreement with)\b/i},
  {type:'investment',pattern:/\b(?:invest(?:s|ment|ments|ing)?|funding|fund\b|commits? \$|\$\d[\d.,]* (?:billion|million|trillion))\b/i},
  {type:'education',pattern:/\b(?:literacy|skilling|upskill\w*|training programs?|skills? (?:training|programs?)|curricul\w*|educators?|teachers?|classrooms?|librar(?:y|ies))\b/i},
  {type:'launch',pattern:/\b(?:launch(?:es|ed)?|introduc(?:es|ed|ing)|unveil(?:s|ed)?|announc(?:es|ed|ing)|now (?:generally )?available|general availability|now supports?|adds? support|releas(?:es|ed)|debuts?|rolls? out)\b/i},
  {type:'adoption',pattern:/\b(?:deploy(?:s|ed|ing|ment)? (?:across|to|at)|adopt(?:s|ed|ion)?|putting [\w\s]+ to work|selects?|chooses?|case study)\b/i},
  {type:'research',pattern:/\b(?:research|paper|study|benchmark|scientists?|discover(?:y|ies)|breakthrough|mapping)\b/i},
  {type:'policy',pattern:/\b(?:government|public sector|policy|regulat\w*|nation(?:al|s)?|sovereignty|ministry)\b/i},
];

const TYPE_KO:Record<AIEventType,{topic:string;short:string;analysis:(ctx:AnalysisContext)=>string;watch:string}>={
  infrastructure:{topic:'AI 컴퓨팅 인프라 확충',short:'AI 인프라',watch:'실제 가동 시점, 전력·부지 확보, 확보된 고객 계약과 가동률 자료를 확인할 필요가 있다.',
    analysis:ctx=>`MOTUS 분석: AI 인프라 발표의 가치는 발표 규모보다 실제 가동 시점과 전력·부지 확보, 그리고 그 위에서 돌아갈 고객 수요가 확인되는지에 달려 있다.${ctx.place?` ${ctx.place}처럼 국가·지역 단위로 컴퓨팅 자원을 확보하려는 움직임이 이어지면 GPU·네트워크·전력 설비 공급망 전반의 수요가 함께 움직일 수 있다.`:''}`},
  launch:{topic:'신규 AI 제품·기능',short:'신규 AI 제품',watch:'제공 지역과 가격, 기존 고객의 실제 사용량과 경쟁 서비스 대비 차별점을 확인할 필요가 있다.',
    analysis:ctx=>`MOTUS 분석: 신규 기능 공개의 의미는 기술 사양보다 실제로 쓰는 고객이 얼마나 빨리 늘어나는지와 과금 구조에 달려 있다.${ctx.product?` ${ctx.product} 같은 제품이 기존 고객 기반에 기본 기능으로 붙으면 확산 속도가 빨라질 수 있지만, 사용량 지표가 공개되기 전까지는 효과를 단정하기 어렵다.`:''}`},
  partnership:{topic:'AI 협력 확대',short:'AI 협력',watch:'협력의 계약 기간과 범위, 공동 고객 사례와 매출 기여가 공개되는지 확인할 필요가 있다.',
    analysis:ctx=>`MOTUS 분석: 협력 발표는 실제 공동 고객과 매출로 이어질 때 의미가 커진다.${ctx.orgs?` ${ctx.orgs} 등이 함께 언급된 만큼, 각 사의 제품이 어떤 고객층에 함께 공급되는지가 후속 판단의 기준이 된다.`:''}`},
  adoption:{topic:'기업 AI 도입 사례',short:'AI 도입',watch:'도입 범위와 비용 절감·생산성 지표, 다른 고객으로의 확산 여부를 확인할 필요가 있다.',
    analysis:ctx=>`MOTUS 분석: 도입 사례는 AI가 시범 단계를 넘어 실제 업무 흐름에 들어가는지를 보여 주는 신호다.${ctx.orgs?` ${ctx.orgs}의 사례가 반복 가능한 성과로 확인되면 같은 산업의 다른 기업으로 확산될 여지가 있다.`:''} 다만 공개된 성과 지표가 없다면 효과는 아직 검증 전 단계로 봐야 한다.`},
  investment:{topic:'AI 투자 확대',short:'AI 투자',watch:'투자 집행 일정과 자금 사용처, 실제 설비·인력 확충 진행 상황을 확인할 필요가 있다.',
    analysis:()=>'MOTUS 분석: 투자 발표는 집행 일정과 사용처가 구체화될수록 신뢰도가 높아진다. 발표 금액이 실제 설비 발주와 인력 채용으로 이어지는지 확인해야 관련 공급망에 미치는 영향을 판단할 수 있다.'},
  research:{topic:'AI 연구 성과 공개',short:'AI 연구',watch:'재현 가능성, 공개 데이터·모델 여부, 실제 제품 적용 계획을 확인할 필요가 있다.',
    analysis:()=>'MOTUS 분석: 연구 성과는 곧바로 매출로 이어지지는 않지만, 공개된 데이터·모델이 다른 연구자와 기업에 활용될 때 산업적 의미가 생긴다. 제품 적용 일정이 제시되는지가 다음 확인 지점이다.'},
  security:{topic:'AI 보안·안전 강화',short:'AI 보안',watch:'적용 대상 서비스와 시점, 외부 검증 결과가 공개되는지 확인할 필요가 있다.',
    analysis:()=>'MOTUS 분석: AI 서비스 이용자가 늘수록 보안과 안전 체계는 기업 고객의 도입 여부를 가르는 조건이 된다. 공개된 조치가 실제 사고 예방이나 인증 획득으로 이어지는지가 신뢰도의 기준이다.'},
  education:{topic:'AI 교육·역량 강화',short:'AI 교육',watch:'교육 대상과 규모, 참여 기관 확대와 이수·활용 성과가 공개되는지 확인할 필요가 있다.',
    analysis:ctx=>`MOTUS 분석: AI 교육 프로그램은 당장의 매출보다 이용자 저변과 기업·공공 부문의 도입 준비도를 넓히는 장기 투자에 가깝다.${ctx.orgs?` ${ctx.orgs} 등 참여 기관이 늘어나는지가 프로그램의 실제 파급력을 가늠하는 기준이 된다.`:''}`},
  policy:{topic:'공공·주권 AI 협력',short:'공공 AI',watch:'정부 예산과 조달 일정, 참여 기업과 실제 서비스 적용 범위를 확인할 필요가 있다.',
    analysis:ctx=>`MOTUS 분석: 공공·국가 단위 AI 사업은 예산 집행과 조달 일정에 따라 속도가 정해진다.${ctx.place?` ${ctx.place}의 사례는 각국이 AI 역량을 자국 내에 확보하려는 흐름의 연장선으로 볼 수 있다.`:''}`},
};

interface AnalysisContext {place:string|null;product:string|null;orgs:string|null}

const COMPANIES:Array<[RegExp,string]>=[
  [/\bNVIDIA\b/,'엔비디아'],[/\bMicrosoft\b/,'마이크로소프트'],[/\bGoogle DeepMind\b/,'구글 딥마인드'],[/\bGoogle\b/,'구글'],[/\bAmazon Web Services\b|\bAWS\b/,'아마존웹서비스(AWS)'],[/\bAmazon\b/,'아마존'],
  [/\bMeta\b/,'메타'],[/\bOpenAI\b/,'오픈AI'],[/\bAnthropic\b/,'앤트로픽'],[/\bApple\b/,'애플'],[/\bOracle\b/,'오라클'],[/\bIBM\b/,'IBM'],[/\bIntel\b/,'인텔'],[/\bAMD\b/,'AMD'],
  [/\bQualcomm\b/,'퀄컴'],[/\bSamsung\b/,'삼성'],[/\bSK hynix\b/i,'SK하이닉스'],[/\bTSMC\b/,'TSMC'],[/\bDell\b/,'델'],[/\bHPE\b|Hewlett Packard Enterprise/,'HPE'],[/\bCisco\b/,'시스코'],
  [/\bSalesforce\b/,'세일즈포스'],[/\bSAP\b/,'SAP'],[/\bServiceNow\b/,'서비스나우'],[/\bAdobe\b/,'어도비'],[/\bVolkswagen\b/,'폭스바겐'],[/\bToyota\b/,'도요타'],[/\bSiemens\b/,'지멘스'],
  [/\bMercedes-Benz\b/,'메르세데스-벤츠'],[/\bBMW\b/,'BMW'],[/\bAccenture\b/,'액센츄어'],[/\bDeloitte\b/,'딜로이트'],[/\bHugging Face\b/,'허깅페이스'],[/\bMistral\b/,'미스트랄'],[/\bxAI\b/,'xAI'],
  [/\bDatabricks\b/,'데이터브릭스'],[/\bSnowflake\b/,'스노우플레이크'],[/\bCoreWeave\b/,'코어위브'],[/\bFoxconn\b/,'폭스콘'],[/\bArm\b/,'Arm'],[/\bBroadcom\b/,'브로드컴'],[/\bMicron\b/,'마이크론'],
  [/\bSupermicro\b/,'슈퍼마이크로'],[/\bLenovo\b/,'레노버'],[/\bNokia\b/,'노키아'],[/\bEricsson\b/,'에릭슨'],[/\bHyundai\b/,'현대자동차'],[/\bSoftBank\b/,'소프트뱅크'],[/\bLG\b/,'LG'],[/\bNaver\b/,'네이버'],
  [/\bKakao\b/,'카카오'],[/\bTesla\b/,'테슬라'],[/\bUber\b/,'우버'],[/\bNetflix\b/,'넷플릭스'],[/\bPfizer\b/,'화이자'],[/\bNovartis\b/,'노바티스'],[/\bMayo Clinic\b/,'메이요 클리닉'],[/\bWalmart\b/,'월마트'],
];

const PLACES:Array<[RegExp,string]>=[
  [/\bSouth Korea\b|(?<!North )\bKorea\b/,'한국'],[/\bJapan\b/,'일본'],[/\bChina\b/,'중국'],[/\bIndia\b/,'인도'],[/\bKazakhstan\b/,'카자흐스탄'],[/\bUnited States\b|\bU\.S\.(?=[\s,])/,'미국'],[/\bUnited Kingdom\b|\bU\.K\.(?=[\s,])|\bUK\b|\bBritain\b/,'영국'],
  [/\bGermany\b/,'독일'],[/\bFrance\b/,'프랑스'],[/\bItaly\b/,'이탈리아'],[/\bSpain\b/,'스페인'],[/\bCanada\b/,'캐나다'],[/\bAustralia\b/,'호주'],[/\bSingapore\b/,'싱가포르'],[/\bIndonesia\b/,'인도네시아'],
  [/\bVietnam\b/,'베트남'],[/\bThailand\b/,'태국'],[/\bMalaysia\b/,'말레이시아'],[/\bPhilippines\b/,'필리핀'],[/\bTaiwan\b/,'대만'],[/\bSaudi Arabia\b/,'사우디아라비아'],[/\bUnited Arab Emirates\b|\bUAE\b/,'아랍에미리트'],
  [/\bIsrael\b/,'이스라엘'],[/\bBrazil\b/,'브라질'],[/\bMexico\b/,'멕시코'],[/\bNetherlands\b/,'네덜란드'],[/\bSweden\b/,'스웨덴'],[/\bNorway\b/,'노르웨이'],[/\bDenmark\b/,'덴마크'],[/\bFinland\b/,'핀란드'],
  [/\bPoland\b/,'폴란드'],[/\bSwitzerland\b/,'스위스'],[/\bTurkey\b|\bTürkiye\b/,'튀르키예'],[/\bQatar\b/,'카타르'],[/\bGreece\b/,'그리스'],[/\bIreland\b/,'아일랜드'],[/\bBelgium\b/,'벨기에'],[/\bAustria\b/,'오스트리아'],
  [/\bPortugal\b/,'포르투갈'],[/\bChile\b/,'칠레'],[/\bArgentina\b/,'아르헨티나'],[/\bColombia\b/,'콜롬비아'],[/\bNew Zealand\b/,'뉴질랜드'],[/\bNigeria\b/,'나이지리아'],[/\bKenya\b/,'케냐'],[/\bEgypt\b/,'이집트'],
  [/\bSoutheast Asia\b/,'동남아시아'],[/\bEurope(?:an Union)?\b|\bEU\b/,'유럽'],[/\bMiddle East\b/,'중동'],[/\bAfrica\b/,'아프리카'],[/\bLatin America\b/,'중남미'],
];

const PRODUCT=/\b(?:Vera Rubin|Blackwell(?: Ultra)?|Rubin|DGX(?: [A-Z0-9]+)?|NIM|Omniverse|Cosmos|Isaac|Jetson(?: [A-Z][a-z]+)?|CUDA|Gemini(?: (?:Enterprise|Pro|Flash|Ultra|Nano|\d[\w.]*))*|Gemma(?: \d[\w.]*)?|Veo(?: \d[\w.]*)?|Imagen(?: \d[\w.]*)?|NotebookLM|Microsoft 365 Copilot|GitHub Copilot|Copilot(?: Studio)?|Azure AI Foundry|Microsoft Foundry|Azure|Claude(?: (?:Opus|Sonnet|Haiku)(?: \d[\w.]*)?| Code)?|ChatGPT(?: (?:Enterprise|Edu|Pro|Atlas))?|GPT-\d[\w.]*|Codex|Sora(?: \d)?|Llama(?: \d[\w.]*)?|Meta AI|Amazon Bedrock(?: AgentCore)?|Bedrock(?: AgentCore)?|SageMaker(?: AI)?|Amazon Nova(?: [A-Z][a-z]+)?|Amazon Q|Trainium\d?|Inferentia\d?|Kiro)\b/;

const COUNT_NOUNS:Array<[RegExp,string,string]>=[
  [/GPUs?/i,'GPU','개'],[/chips?/i,'칩','개'],[/countries/i,'국가','개국'],[/languages/i,'언어','개'],[/customers/i,'고객','곳'],[/users/i,'이용자','명'],[/developers/i,'개발자','명'],
  [/startups/i,'스타트업','곳'],[/employees/i,'직원','명'],[/students/i,'학생','명'],[/businesses|companies|organizations/i,'기업·기관','곳'],[/partners/i,'파트너','곳'],[/data cent(?:er|re)s/i,'데이터센터','곳'],
  [/hospitals/i,'병원','곳'],[/schools/i,'학교','곳'],[/cities/i,'도시','곳'],[/people/i,'명','명'],
];

export function josa(word:string,withBatchim:string,withoutBatchim:string):string {
  const last=word.trim().replace(/[)\]」』"'”’.,]+$/u,'').slice(-1);
  if(/[가-힣]/u.test(last)){const code=last.charCodeAt(0)-0xac00;return word+((code%28)!==0?withBatchim:withoutBatchim)}
  if(/[0-9]/.test(last))return word+('013678'.includes(last)?withBatchim:withoutBatchim);
  if(/[A-Za-z]/.test(last))return word+(/[lmnrkptbgd]/i.test(last)?withBatchim:withoutBatchim);
  return word+withoutBatchim;
}

function koreanCount(value:number):string {
  if(value>=100000000)return `${trim(value/100000000)}억`;
  if(value>=10000)return `${trim(value/10000)}만`;
  return value.toLocaleString('en-US');
}
function trim(value:number){return Number.isInteger(value)?String(value):value.toFixed(1).replace(/\.0$/,'')}

/** Explicit figures stated in the text, rendered in Korean units. Figures without a recognisable noun are ignored. */
export function extractFigures(text:string):string[] {
  const out:string[]=[];
  for(const match of text.matchAll(/(?<![A-Za-z0-9])\$\s?(\d+(?:\.\d+)?)\s*(trillion|billion|million)\b/gi)){
    const value=Number(match[1]),unit=match[2]!.toLowerCase();
    out.push(unit==='trillion'?`${trim(value)}조 달러`:unit==='billion'?(value*10>=10000?`${trim(value/1000)}조 달러`:`${trim(value*10)}억 달러`):`${koreanCount(value*1000000)} 달러`);
  }
  // The noun must directly follow the number, optionally after a known qualifier or product/brand token;
  // arbitrary words are never skipped ("10 tools for developers" yields nothing).
  const qualifier='(?:(?:new|more|additional|NVIDIA|AMD|Intel|Arm|Google|Microsoft|AWS|Amazon|Meta|Blackwell|Hopper|Rubin|Vera Rubin|Grace|H100|H200|B200|B300|GB200|GB300|TPU|AI|Copilot|ChatGPT|Gemini|Claude|Bedrock)\\s+){0,2}';
  // A number right after a capitalised token is usually a model/version identifier ("Gemini 3 users"), not a count.
  const counted=new RegExp(`(?<![A-Za-z0-9.,$-])(?<![A-Z][\\w-]*\\s)(\\d{1,3}(?:,\\d{3})+|\\d+(?:\\.\\d+)?)\\s*(billion|million|thousand)?\\+?\\s+${qualifier}([Gg][Pp][Uu]s?|[Cc]hips?|[Cc]ountries|[Ll]anguages|[Cc]ustomers|[Uu]sers|[Dd]evelopers|[Ss]tartups|[Ee]mployees|[Ss]tudents|[Bb]usinesses|[Cc]ompanies|[Oo]rganizations|[Pp]artners|[Dd]ata cent(?:er|re)s|[Hh]ospitals|[Ss]chools|[Cc]ities|[Pp]eople)\\b`,'g');
  for(const match of text.matchAll(counted)){
    let value=Number(match[1]!.replaceAll(',',''));const scale=match[2]?.toLowerCase();if(scale==='billion')value*=1000000000;if(scale==='million')value*=1000000;if(scale==='thousand')value*=1000;
    const noun=COUNT_NOUNS.find(([pattern])=>pattern.test(match[3]!));if(!noun||!Number.isFinite(value)||value<2)continue;
    out.push(noun[1]==='명'?`${koreanCount(value)}명`:`${noun[1]} ${koreanCount(value)}${noun[2]}`);
  }
  for(const match of text.matchAll(/(?<![A-Za-z0-9.,])(\d+(?:\.\d+)?)\s*(gigawatts?|GW|megawatts?|MW)\b/g)){out.push(`${trim(Number(match[1]))}${/^g/i.test(match[2]!)?'기가와트':'메가와트'}`)}
  for(const match of text.matchAll(/(?<![A-Za-z0-9.,])(\d+(?:\.\d+)?)\s*(?:x|times)\s+(faster|more efficient|more energy[- ]efficient|lower cost|cheaper|higher throughput)/gi)){
    const kind=match[2]!.toLowerCase();out.push(`${trim(Number(match[1]))}배 ${kind.startsWith('faster')?'빠른 처리':kind.includes('efficient')?'높은 효율':kind.includes('throughput')?'높은 처리량':'낮은 비용'}`);
  }
  return [...new Set(out)].slice(0,4);
}

export function classifyAIEvent(title:string,text:string,link=''):{type:AIEventType;fromTitle:boolean}|null {
  if(/^[A-Z][\w.&-]*(?: [A-Z][\w.&-]*)* and (?:the )?[A-Z][\w.&-]*(?: [A-Z][\w.&-]*)* [a-z]+s\b/.test(title)&&!/\b(?:data ?cent|supercomput|compute)\w*/i.test(title))return {type:'partnership',fromTitle:true};
  if(/\/research\//i.test(link)&&!/\b(?:launch|available|introduc\w*|announc\w*)\b/i.test(title))return {type:'research',fromTitle:false};
  for(const rule of TYPE_RULES)if(rule.pattern.test(title))return {type:rule.type,fromTitle:true};
  let best:{type:AIEventType;hits:number}|null=null;
  for(const rule of TYPE_RULES){const hits=(text.match(new RegExp(rule.pattern.source,'gi'))??[]).length;if(hits>=2&&(!best||hits>best.hits))best={type:rule.type,hits}}
  return best?{type:best.type,fromTitle:false}:null;
}

function findAll(text:string,table:Array<[RegExp,string]>,exclude:string[]=[]):string[] {
  const hits:Array<{index:number;name:string}>=[];
  for(const [pattern,name] of table){if(exclude.includes(name))continue;const match=new RegExp(pattern.source,pattern.flags.includes('g')?pattern.flags:pattern.flags+'g').exec(text);if(match)hits.push({index:match.index,name})}
  return [...new Set(hits.sort((a,b)=>a.index-b.index).map(hit=>hit.name))];
}

export function companyKorean(publisher:string):string {
  return ({OpenAI:'오픈AI','Google AI':'구글','Google DeepMind':'구글 딥마인드',NVIDIA:'엔비디아',Microsoft:'마이크로소프트',Anthropic:'앤트로픽','Amazon AWS':'아마존웹서비스(AWS)',Meta:'메타'} as Record<string,string>)[publisher]??publisher;
}

/** The channel is named from the article URL itself, since one feed can carry posts from several of the publisher's sites. */
export function channelLabel(link:string,sourceId:string):string {
  let host='',path='';try{const url=new URL(link);host=url.hostname.toLowerCase();path=url.pathname}catch{}
  if(host==='aws.amazon.com')return path.startsWith('/about-aws/whats-new/')?'What’s New 공지':'블로그';
  if(/^(?:news\.microsoft\.com|nvidianews\.nvidia\.com|about\.fb\.com)$/.test(host))return '뉴스룸';
  if(host.endsWith('anthropic.com'))return '뉴스 페이지';
  if(host)return '블로그';
  return ({'aws-whats-new':'What’s New 공지','nvidia-newsroom':'뉴스룸','microsoft-source':'뉴스룸',meta:'뉴스룸',anthropic:'뉴스 페이지'} as Record<string,string>)[sourceId]??'블로그';
}

/** A company named only as part of an API or SDK name ("OpenAI Responses API") is a compatibility detail, not a party to the announcement. */
function withoutApiMentions(text:string):string {
  return text.replace(/\b(?:OpenAI|Anthropic|Google|Microsoft|Meta|NVIDIA|Amazon)(?:[-‑ ]compatible|(?:'s)? (?:Responses |Chat Completions |Messages |Agents )?(?:API|SDK)s?)\b/g,' ');
}

export function kstDateLabel(iso:string):string {
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'numeric',day:'numeric'}).formatToParts(new Date(iso)),get=(type:string)=>parts.find(part=>part.type===type)?.value??'';
  return `${get('year')}년 ${get('month')}월 ${get('day')}일`;
}

export function synthesizeEvidenceBoundAIEvent(input:EvidenceBoundAIInput):(KoreanAIEvent&{basis:AIEvidenceBasis;eventType:AIEventType;evidenceBound:true;richness:number})|null {
  // Entities and figures are read from the title and the opening of the official body only, so page
  // chrome (related posts, footers, region lists) cannot be presented as part of the announcement.
  const text=`${input.title}. ${input.evidence.slice(0,1500)}`,classified=classifyAIEvent(input.title,input.evidence,input.link);
  if(!classified)return null;
  const company=companyKorean(input.publisher),type=TYPE_KO[classified.type];
  const places=findAll(text,PLACES),orgs=findAll(withoutApiMentions(text),COMPANIES).filter(name=>name!==company&&!company.startsWith(name)&&!name.startsWith(company));
  const product=(input.title.match(PRODUCT)??input.evidence.match(PRODUCT))?.[0]??null,figures=extractFigures(text);
  const place=places[0]??null,org=orgs[0]??null;
  const productInTitle=Boolean(product&&input.title.includes(product));
  const newProduct=productInTitle&&/^(?:introducing|meet|announcing|launching)\b/i.test(input.title);
  const topic=classified.type==='launch'&&productInTitle?(newProduct?`${product}`:`${product} 신규 기능`)
    :(classified.type==='infrastructure'||classified.type==='policy')&&place?`${place} ${type.topic}`
    :classified.type==='partnership'&&org?`${josa(org,'과','와')}의 AI 협력`
    :classified.type==='adoption'&&org?`${org}의 AI 도입`
    :productInTitle&&classified.type!=='research'?`${product} 관련 ${type.short}`
    :type.topic;
  const channel=channelLabel(input.link,input.sourceId);
  const facts:string[]=[`${josa(company,'은','는')} ${kstDateLabel(input.publishedAt)}(한국 시간) 공식 ${channel}에 「${input.title}」 제목의 발표를 게시했다.`];
  const subjects=[...places.slice(0,3),...orgs.slice(0,3)],detail=[`${classified.fromTitle?'발표 제목과 본문은':'원문 본문은'} ${type.topic}${classified.type==='launch'?' 공개':''}에 관한 내용을 다룬다.`];
  if(product)detail.push(productInTitle?`발표의 중심 제품·플랫폼은 ${product}이다.`:`원문에서 언급된 제품·플랫폼은 ${product}이다.`);
  if(subjects.length)detail.push(`원문에서 함께 언급된 국가·기업은 ${subjects.join(', ')}이다.`);
  facts.push(detail.join(' '));
  if(figures.length)facts.push(`원문은 ${figures.join(', ')} 등의 수치를 명시했다.`);
  if(input.basis==='OFFICIAL_PAGE_SUMMARY')facts.push(`원문 페이지에서 기사 본문을 추출하지 못해 이 항목은 ${company} 공식 페이지의 요약 설명을 근거로 정리했다.`);
  else if(input.basis!=='OFFICIAL_PAGE')facts.push(`${input.fallbackReason==='PAGE_TEXT_INSUFFICIENT'?'원문 페이지에서 본문을 충분히 추출하지 못해':'원문 페이지가 자동 수집을 허용하지 않아'} 이 항목은 ${company} 공식 RSS에 게시된 ${input.basis==='OFFICIAL_RSS_FULLTEXT'?'본문':'요약'}을 근거로 정리했으며, 발표일은 공식 RSS 기록으로 확인했다.`);
  const richness=(productInTitle?1:product?0.5:0)+(place?1:0)+(org?1:0)+Math.min(figures.length,2);
  // Short product-update notices (e.g. AWS What's New) rank below announcements from blogs and newsrooms.
  const priority=input.sourceId==='aws-whats-new'?-2:0;
  // Too little first-party detail to state anything beyond the headline: not an article item.
  if(richness===0)return null;
  const interpretation=type.analysis({place,product,orgs:orgs.slice(0,2).join('·')||null});
  return {topicId:input.topicId,publisher:input.publisher,company,topic,headline:`${company}, ${topic}${classified.type==='launch'?' 공개':''}`,facts,interpretation,watch:type.watch,link:input.link,publishedAt:input.publishedAt,basis:input.basis,eventType:classified.type,evidenceBound:true,richness:richness+priority};
}
