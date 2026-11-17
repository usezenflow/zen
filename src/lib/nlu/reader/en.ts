import { fold } from "./fold";
import { isSyllable } from "./syllables";
// English words and tech/work/life terms people type in a task. The Telex and VNI decoders keep these as typed:
// "tree" is not "trê", "os" is not "ó", "bus" is not "bú". Lowercase, one per entry. Every TELEX_TERMS word and
// every word the decoder used to keep is in here too. Do not add a common Telex spelling of a Vietnamese syllable
// ("car" is "cả", "sex" is "sẽ", "mais" is "mãi"): those words stay decoded.
const WORDS = `
assignment booking cafe checkin classroom download football framework google grammar homework intern internship
laptop listening mentor notes offline outline password poster powerpoint presentation proposal reading sales security
seminar shopping speaking startup swimming teams teamwork thesis training tutor tutorial wednesday weekly wifi
workflow workout worksheet workshop writing days weeks fri sat sun mon tue tues wed thu thur thurs
api apis app ap backend frontend fullstack devops sdk cli ui ux ux ci cd cdn cms ios macos android linux unix windows
os osx ram cpu gpu ssd usb hdd sql nosql db orm mvc mvp poc pr prs qa qc uat spec specs bug bugs fix fixes hotfix
patch release deploy deployment rollback merge rebase commit push pull clone fork branch repo repository git github
gitlab bitbucket jira trello notion slack discord zalo facebook messenger instagram tiktok youtube shopee lazada
grab momo viettel vnpt figma canva photoshop illustrator excel sheet sheets slide slides docs doc pdf csv json xml
yaml html css js ts jsx tsx javascript typescript python java kotlin swift rust golang go ruby php perl scala dart flutter
react vue angular svelte next nuxt node nodejs express django flask spring laravel rails docker kubernetes k8s helm
terraform ansible nginx apache redis kafka rabbitmq mongo mongodb postgres postgresql mysql sqlite oracle elastic
elasticsearch lucene lsm btree tree trie heap stack queue hash graph list array map set tuple struct class object
function method variable constant loop recursion sort search index cache buffer thread process mutex lock deadlock
kernel driver bootloader compiler interpreter parser lexer token syntax semantic runtime garbage collector heap
algorithm complexity bigo sorting hashing hashmap linked tree binary bst avl red black ui ux wireframe mockup prototype
storyboard persona journey kanban scrum sprint standup retro backlog epic story ticket issue roadmap milestone
oauth jwt token session cookie login logout signup auth authz authn ssl tls https http tcp udp dns ip vpn proxy
firewall router switch modem socket port packet frame header body payload request response endpoint route rest graphql
grpc websocket webhook micro service microservice monolith container image volume pod cluster node server client
browser chrome firefox safari edge extension plugin addon widget component hook state prop props render dom
jquery bootstrap tailwind sass less webpack vite babel eslint prettier jest vitest mocha cypress playwright selenium
unit integration e2e regression smoke load stress benchmark profile trace log logs metric metrics dashboard grafana
prometheus alert incident outage downtime uptime backup restore migration seed schema table column row key foreign
primary join view trigger procedure transaction commit rollback query select insert update delete create drop alter
machine learning ai ml llm gpt model dataset train inference prompt embedding vector chatbot bot assistant
crypto wallet blockchain nft token coin bitcoin ethereum
ielts toeic toefl sat gre gmat lsat cfa cpa pmp aws azure gcp
pm po ba bd hr it cs ee me ce se bio chem phys econ acc fin mgmt mkt lit hist geo psych soc
ok okay thanks thank please sorry hi hey hello bye yo lol btw fyi asap eta tbd tba todo wip faq
mr mrs ms dr prof sir madam
gym yoga run jog swim bike hike cook clean wash shop buy sell pay bill rent
a about above across act action active activity add address admin after again against age agent ago agree ahead
aid aim air all allow almost alone along already also always am amazing among amount an analysis analyst and angle
animal announce annual another answer any anyone anything anyway app apple apply approach appropriate area argue
arm around arrange arrive art article artist as ask asleep aspect assess asset assign assist assume at attach attack
attempt attend attention audio author auto available average avoid award aware away awesome axis

baby back background bad bag balance ball band bank bar base basic basis basket bath battery be beach bear beat beauty
because become bed before begin behavior behind being believe bell below benefit best bet better between beyond big
bike bill bind bird birth bit bite black blank blind block blog blood blue board boat body bold bomb bonus book boot
border boring born borrow boss both bottle bottom bound bowl box boy brain branch brand brave bread break breakfast
breath brick bridge brief bright bring broad broken brother brown brush bubble budget bug build bulb bundle burn
bus business busy but button buy buyer by byte

cab cable cache cake calendar call calm camera camp campus can cancel candle candy cap capital captain car card care
career careful cart case cash cast cat catch category cause cell center central century certain chain chair chalk
challenge chance change channel chapter char chart chat cheap check cheese chef chemistry chess chest chicken chief
child chip choice choose chunk circle citizen city claim class classic clean clear clerk click client cliff climb
clock clone close cloud club clue cluster coach coast coat code coding coffee cold collect college color column
combine come comedy comment commit common community company compare compile complete complex component compose
compute concept concern concert conclude condition conf config connect consider consist constant contact contain
content context continue contract control convert cook cool copy core corner correct cost couch count counter country
couple course cover crack craft crash crazy cream create credit crew crime cross crowd crown crucial cry cube cup
curious current curve custom customer cut cycle

daily dance dark dash data database date day dead deadline deal dealer dear debug debt decade decide deck declare
decrease deep default defend define degree delay delete delivery demo demand deny depend deploy depth describe desert
design desk detail detect develop device dialog diagram diary dictionary die diet difference different difficult
dinner direct direction dirty disable discover discuss dish disk display distance divide doc dock doctor document dog
doll dollar domain done door dot double doubt down draft drag drama draw dream dress drink drive drop drum dry duck
due dump duration during dust duty dynamic

each eager ear early earn earth ease easy eat echo economy edge edit edition editor effect effort egg eight either
elbow elder electric element elephant else email embed emerge emit emotion employ empty enable end energy engine
enjoy enough enter entire entry environment equal equip error escape essay estimate even event ever every evidence
evil exact exam example excel except exchange excite exclude execute exercise exist exit expand expect expense
expert explain export expose extend extra eye

fabric face fact factor fail fair faith fall false family fan fancy far farm fashion fast fat father fault favor feature
fee feed feedback feel female fence festival fetch fever few field fight figure file fill film filter final find fine
finger finish fire firm first fish fit five fix flag flat flavor flight float flood floor flow flower fly focus fog
fold follow food foot force forest forget fork form format formula forward fountain four fox frame free freedom
freeze fresh friend fries front frozen fruit fuel full fun function fund funny furniture future

gain galaxy game gap garage garden gas gate gather gear general gift girl give glad glass glide global glove go goal
goat god gold golf good goods govern grade grain grand grant grape grass gray great green grid grip ground group grow
guard guess guest guide guitar gym

habit hair half hall hammer hand handle hang happen happy hard hardware harm hat hate have he head health heart heat
heavy hello help hen her here hero hide high hike hill him hint hip hire history hit hobby hold hole holiday hollow
home honey hook hope horse hospital host hot hotel hour house how hub huge human humor hundred hunt hurry husband

ice icon idea identify idle if ignore image impact import important improve in include income increase index
indicate industry info inform inject inner input insert inside install instance instead intent interest interface
internal internet interview intro invest invite iron island issue item its

jacket jail jam jar jazz jeans job join joke journal journey judge juice jump jungle junior just

keep key keyboard keyword kick kid kill kind king kiss kit kitchen knee knife knock know knowledge

label labor lab lack ladder lady lake lamp land language large last late later latest laugh launch law lawn lay layer
lazy lead leaf learn least leave lecture left leg legal lemon length lesson let letter level library license lid
lie life lift light like limit line link lion list listen literal little live load loan local lock log logic long
look loop loose lose loss lot loud love low luck lunch lung

machine magic mail main major make male mall man manage manager map mark market marketing marriage mass master match
material math matter max may maybe mayor meal mean measure meat media medium meet meeting member memo memory mental
menu mention merge mess message metal method middle midterm might mile milk mind mine minor minus minute mirror miss
mistake mix mixed mobile mode model modern module moment money monitor month mood moon moral more morning most
mother motion motor mountain mouse mouth move movie much mud multiply music must my myself mystery

nail name narrow nation native natural nature near neck need negative neither nerve nest net network neutral never new
news next nice night nine no noise none noon normal north nose not note nothing notice notify novel now number nurse
nut

object observe obtain obvious occur ocean odd of off offer office often oil ok old omit on once one online only
open operate opinion option or orange order ordinary organ organize origin other our out outcome output outside over
own owner

pack page pain paint pair palace pan panel paper parent park part party pass past paste patch path patient pattern
pause pay peace peak pen penalty people pepper per perfect perform period permit person phase phone photo phrase
piano pick picture piece pig pile pill pilot pin pink pipe pitch pizza place plan plane planet plant plate platform
play player plot plug plus pocket poem point poll pool poor pop popular port portal portfolio position post pot
potato pound power practice praise predict prefer prepare present press pretty prevent price pride primary print
prior priority private prize problem process produce product profile program progress project promise prompt proof
proper protect protocol prototype proud provide public pull pump punch pupil puppy purchase pure purple purpose push
put puzzle

quality quarter queen question queue quick quiet quit quite quiz quote

race radio rail rain raise range rank rapid rare rate rather raw ray reach read ready real reason rebuild receipt
receive record recover red reduce refer reflect reform refresh region register regular reject relate release
relevant remain remember remind remote remove rent repair repeat replace reply report request require rescue
research reserve reset resist resource respond rest result resume retain retry return reveal review reward rhythm
rice rich ride ridge right ring rise risk river road roast rock role roll roof room root rope rose rough round route
row royal rub rude rule run rush

sad safe sail salad salary sale salt same sample sand save say scale scan scene schedule school science score scope
screen script sea search season seat second secret section secure see seed seek seem segment select self sell send
senior sense sentence separate series serve server service session set setup seven several shade shadow shake shall
shape share sharp shed sheet shelf shell shift shine ship shirt shock shoe shop short shot should shoulder show shower
shrink shut sick side sight sign signal silent silver simple since sing sink sister sit site situation six size skill
skin skip sky sleep slice slide slim slip slow small smart smell smile smooth snack snap snow soap social sock soft
software soil solar soldier solid solution solve some son song soon sort sound soup source south space spare speak
special speech speed spell spend spirit split sport spot spread spring square squad stable staff stage stair stamp
stand star start state station status stay steady steal steel step stick still stock stone stop store storm story
straight strange stream street stress stretch strike string strong student study stuff style subject submit success
such sudden sugar suggest suit summary summer sun supply support sure surface surprise survey swap swear sweet swim
switch sword symbol system

table tablet tag tail take tale talk tall tank tap target task taste tax tea teach team tear tech technical teen
tell temp temple ten tend tennis term test text thank that the theme then theory there thick thin thing think
third thirty this thought three throw thumb ticket tide tie tiger tight time tiny tip tire title to today toe
together toilet token told tomorrow tone tongue tool tooth top topic total touch tour towel tower town toy trace track
trade traffic trail train transfer travel tray treat tree trend trial trick trip truck true trust truth try tube tune
turn twelve twenty twice twin two type typical

ugly umbrella uncle under understand unit universe unless until up update upgrade upload upper upset urban urgent us
usage use useful user usual

vacation vaccine valid valley value van vault vector vehicle venue verbal verify version very vessel veteran video view
village virus visa visit visual voice volume vote voyage

wage wait wake walk wall want war warm warn wash waste watch water wave way we weak wealth wear weather web
website wedding week weekend weight weird welcome well west wet what wheel when where which while white whole wide
wife wild will win wind window wine wing winter wire wise wish with within without woman wonder wood word work world
worry worth wrap wrist write wrong

yard year yellow yes yesterday yet yield you young your youth

zero zone zoo zoom
`;


/**
 * Work, marketing, tech, study and product terms with their display form, one per entry: "key" when the display is the key,
 * "key=Display" otherwise. Single tokens only. A key that reads as a Vietnamese syllable ("ai", "ba", "ui") stays out of
 * EN_CANON (its casing and typos are Vietnamese) but is still in EN_WORDS.
 */
const CANON = `
okr=OKR kpi=KPI kr=KR gtm=GTM pr=PR mr=MR cr=CR pm=PM po=PO ba=BA bd=BD qa=QA qc=QC hr=HR ceo=CEO cto=CTO cfo=CFO coo=COO
b2b=B2B b2c=B2C roi=ROI sop=SOP sla=SLA mvp=MVP poc=POC pic=PIC ot=OT wfh=WFH cv=CV jd=JD payroll invoice budget
forecast pipeline lead deal client partner vendor stakeholder meeting call workshop webinar event booth launch release
standup sync retro sprint backlog roadmap milestone deadline timeline scope spec brief proposal pitch deck report
review feedback onboarding offboarding interview offer
marketing branding brand content copy caption post story reel short video livestream kol=KOL koc=KOC influencer
campaign ads seo=SEO sem=SEM ctr=CTR cpc=CPC cpm=CPM crm=CRM funnel persona insight trend viral engagement follower
media social fanpage page inbox comment hashtag thumbnail edit render mockup banner poster logo layout template design
ui=UI ux=UX figma=Figma canva=Canva capcut=CapCut
code coding debug bug fix test deploy build merge commit push pull branch repo refactor api=API backend frontend
fullstack database db=DB sql=SQL server cloud aws=AWS gcp=GCP azure=Azure docker=Docker app web website mobile
ios=iOS android=Android data dashboard model ai=AI ml=ML llm=LLM prompt workspace sequence flow workflow script
crawl tool plugin slide
deadline assignment quiz midterm final project essay thesis presentation group team lab tutorial lecture zoom=Zoom
meet=Meet teams=Teams lms=LMS gpa=GPA ielts=IELTS toeic=TOEIC toefl=TOEFL speaking writing listening reading vocab
grammar homework note mindmap notion=Notion quizlet=Quizlet duolingo=Duolingo
gym yoga cardio workout healthy diet order bill card visa banking momo=Momo zalopay=ZaloPay vnpay=VNPay grab=Grab
shopee=Shopee lazada=Lazada tiki=Tiki cashback voucher sale ship shipper cod=COD checkin
google=Google gmail=Gmail drive=Drive docs=Docs sheets=Sheets youtube=YouTube facebook=Facebook messenger=Messenger
instagram=Instagram threads=Threads zalo=Zalo tiktok=TikTok telegram=Telegram discord=Discord slack=Slack jira=Jira
trello=Trello asana=Asana clickup=ClickUp github=GitHub gitlab=GitLab chatgpt=ChatGPT openai=OpenAI claude=Claude
gemini=Gemini microsoft=Microsoft excel=Excel word=Word powerpoint=PowerPoint outlook=Outlook apple=Apple
samsung=Samsung viettel=Viettel vnpt=VNPT fpt=FPT vng=VNG vingroup=Vingroup vinfast=VinFast vinamilk=Vinamilk
techcombank=Techcombank vietcombank=Vietcombank vpbank=VPBank mb=MB acb=ACB bidv=BIDV tpbank=TPBank zen=Zen flow
orca=Orca dlu=DLU
cpu=CPU gpu=GPU ssd=SSD hdd=HDD usb=USB vpn=VPN dns=DNS url=URL html=HTML css=CSS js=JS ts=TS json=JSON pdf=PDF
pc=PC iot!=IoT nas=NAS wan=WAN 4g=4G 5g=5G wifi=Wi-Fi bluetooth=Bluetooth hdmi=HDMI linux=Linux windows=Windows
macos=macOS iphone=iPhone ipad=iPad macbook=MacBook
ram!=RAM lan!=LAN os!=OS ip!=IP
`;

/**
 * Multi-word terms, matched across spaces, hyphens, slashes, ampersands and colons, case-insensitive, and written in the display
 * form. The English term keeps its own letters: "check in" "check-in" are one term.
 */
const PHRASES: [string, string][] = [
  ["A/B test", "A/B test"], ["landing page", "Landing page"], ["all hands", "All-hands"], ["check in", "Check-in"],
  ["check out", "Check-out"], ["unit test", "Unit test"], ["1:1", "1:1"], ["CI/CD", "CI/CD"], ["P&L", "P&L"],
  ["TikTok Shop", "TikTok Shop"], ["Xanh SM", "Xanh SM"], ["meal prep", "Meal prep"],
];
const PHRASE_RES = PHRASES.map(([term, display]) => {
  const toks = term.split(/[\s\/&:]+/).map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return [new RegExp(`(?<![\\p{L}\\d])${toks.join("[\\s\\-\\/&:]+")}(?![\\p{L}\\d])`, "giu"), display] as const;
});
/** The display form of every multi-word term in a title. */
export function canonPhrases(title: string): string {
  // same length only: the caller's word offsets (spans) stay valid
  return PHRASE_RES.reduce((t, [re, display]) => t.replace(re, (m) => (m.length === display.length ? display : m)), title);
}

/** Every term key of CANON, syllable or not. */
function CANON_KEYS(): string[] {
  return CANON.split(/\s+/).filter(Boolean).map((e) => e.split(/[=!]/)[0]);
}

/** Keys marked "!" in CANON (ram, lan, os, ip, iot) read as Vietnamese syllables: they apply only to an unaccented token typed in lower case. */
const FORCED: Record<string, string> = Object.fromEntries(
  CANON.split(/\s+/).filter((e) => e.includes("!=")).map((e) => {
    const [k, d] = e.split("!=");
    return [k, d] as const;
  }),
);

/** Folded key to display form. Keys that read as Vietnamese syllables are left out (see CANON). */
export const EN_CANON: Record<string, string> = Object.fromEntries(
  CANON.split(/\s+/)
    .filter((e) => e && !e.includes("!"))
    .map((e) => {
      const [k, d] = e.split("=");
      return [k, d ?? k] as const;
    })
    .filter(([k]) => !isSyllable(k)),
);

/** English words and tech terms a Telex or VNI reading must not change: every word above and every term of CANON. */
export const EN_WORDS = new Set([...WORDS.split(/\s+/), ...CANON_KEYS()].filter(Boolean));

/** Edit distance, stopping early once it passes `max`. */
function editsWithin(a: string, b: string, max: number): boolean {
  if (Math.abs(a.length - b.length) > max) return false;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++)
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    if (Math.min(...cur) > max) return false;
    prev = cur;
  }
  return prev[b.length] <= max;
}

const CANON_TYPO_KEYS = Object.keys(EN_CANON).filter((k) => k.length >= 4);

/**
 * The display form of one word that is an English term: its casing ("markeTing"), or a typo of exactly one term: a word of
 * 4+ letters that is no Vietnamese syllable and is within one edit of one term (two for 8+ letters). Undefined otherwise.
 */
export function canonWord(word: string): string | undefined {
  const f = fold(word).text;
  if (!/^[a-z\d]+$/.test(f)) return undefined;
  // a lowercase display keeps the typed case ("Web" stays); only a display with capitals is the casing
  if (Object.hasOwn(FORCED, f) && /^[a-z\d]+$/.test(word)) return FORCED[f];
  if (Object.hasOwn(EN_CANON, f)) return EN_CANON[f] === f ? undefined : EN_CANON[f];
  // an English word of its own ("memo", "store") is no typo of a term
  if (!/^[a-z]+$/.test(f) || f.length < 4 || isSyllable(word) || EN_WORDS.has(f)) return undefined;
  const max = f.length >= 8 ? 2 : 1;
  const hits = CANON_TYPO_KEYS.filter((k) => editsWithin(f, k, max));
  return hits.length === 1 ? EN_CANON[hits[0]] : undefined;
}

/** `canonWord` on a token, keeping the punctuation around it. */
export function canonToken(tok: string): string {
  const m = /^([^\p{L}\d]*)(.*?)([^\p{L}\d]*)$/u.exec(tok);
  if (!m || !m[2]) return tok;
  const d = canonWord(m[2]);
  return d ? m[1] + d + m[3] : tok;
}
