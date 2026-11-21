// Paired experiment on the original held-out images only: isolate the merchant listing inputs.
import {readFile,writeFile} from 'node:fs/promises'
import path from 'node:path'
import {benchDir,prepareShop,shops,hash} from './frames.js'
import {decisionRequest,selectAnswer,sendDecision} from '../decisions.js'
import {jpeg512} from '../common.js'
import type {Trial} from './types.js'
import {previousHeldPrompt} from './baseline.js'

const all:Trial[]=JSON.parse(await readFile(path.join(benchDir,'baseline-trials.json'),'utf8'))
const cacheFile=path.join(benchDir,'listing-trials.json')
type Pair={shop:string;frame:string;method:string;label:string;baseline:string|null;reduced:string|null;error:string|null;fingerprint:string}
let previous:Pair[]=[]
try {previous=JSON.parse(await readFile(cacheFile,'utf8'))} catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e}
const rows:Pair[]=[]
for(const shopKey of shops){
  const {catalog}=await prepareShop(shopKey)
  for(const t of all.filter(t=>t.shop===shopKey && ['source','live-photo'].includes(t.family) && t.input==='image')){
    const jpeg=await jpeg512(await readFile(path.join(benchDir,t.frame)))
    const reduced=catalog.map(p=>({...p,description:'',references:p.references.slice(0,1)}))
    const body=decisionRequest(jpeg,t.method,reduced,'',previousHeldPrompt)
    if(t.method==='choice'){
      const question=body.questions[0]
      if(question.type!=='choice')throw Error('Expected Choice')
      question.choices.forEach((option,i)=>{if(i<catalog.length)option.description=catalog[i].name})
    }
    const fingerprint=hash(JSON.stringify(body))
    const cached=previous.find(r=>r.fingerprint===fingerprint)
    let predicted=cached?.reduced??null
    let error=cached?.error??null
    if(!cached){
      try {predicted=selectAnswer(await sendDecision(body),t.method,catalog).product_id}
      catch(e){error=e instanceof Error?e.message:String(e)}
    }
    rows.push({shop:t.shop,frame:t.frame,method:t.method,label:t.label,baseline:t.predicted,reduced:predicted,error,fingerprint})
    await writeFile(cacheFile,JSON.stringify([...previous.filter(r=>!rows.some(x=>x.fingerprint===r.fingerprint)),...rows],null,2)+'\n')
    if(!cached && error && rows.slice(-3).length===3 && rows.slice(-3).every(r=>r.error))throw Error(error)
  }
}
const lines=['# ทดสอบข้อมูลที่มีในรายการสินค้าของร้าน','',
  'ใช้เฉพาะภาพต้นทางที่แยกจากรูปอ้างอิง รวมภาพร้านจริงที่จำลองด้วยภาพสาธารณะ ใช้เฟรมเดียวกัน ไม่มีคำพูดประกอบ ข้อมูลชุดเต็มมาจากการทดลองหลัก แต่ละช่องแสดงจำนวนที่ทายรหัสหรือ none ถูกต่อจำนวนเคส คำขอผิดพลาดนับเป็นทายไม่สำเร็จ','',
  '| ร้าน | Choice ชื่ออย่างเดียว | Choice ชื่อ + ลักษณะที่มองเห็น | Reference รูปแรก | Reference รูปทั้งหมด |','| --- | ---: | ---: | ---: | ---: |']
for(const shop of [...shops,'รวม']){
  const pairs=rows.filter(r=>shop==='รวม'||r.shop===shop)
  const scores=(method:string,key:'baseline'|'reduced')=>{const a=pairs.filter(r=>r.method===method);return a.filter(r=>r[key]===r.label).length+'/'+a.length}
  lines.push('| '+[shop,scores('choice','reduced'),scores('choice','baseline'),scores('reference','reduced'),scores('reference','baseline')].join(' | ')+' |')
}
lines.push('','รูปอ้างอิงแต่ละ SKU มีจำนวนต่างกัน บางรายการมีเพียงหนึ่งรูปทั้งสองเงื่อนไข ภาพสินค้าและคำพูดไม่เปลี่ยนภายในคู่ การทดลองใช้การเรียกแยกครั้งจึงมีความแปรปรวนจากโมเดลด้วย','')
await writeFile(path.join(benchDir,'listing-inputs.md'),lines.join('\n'))
console.log(lines.join('\n'))
