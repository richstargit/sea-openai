import {readFile,writeFile,mkdir} from 'node:fs/promises'
import path from 'node:path'
import {benchDir,prepareShop,hash} from './frames.js'
import {decisionRequest,sendDecision,selectAnswer,heldUpInstructions} from '../decisions.js'
import {previousHeldPrompt} from './baseline.js'
import {jpeg512} from '../common.js'
import type {Trial} from './types.js'

type Photo={id:string;file:string;held:boolean;shop:string;group:string}
type Outcome={id:string;group:string;held:boolean;version:string;p:number|null;sku:string|null;fingerprint:string;error:string|null}
const out=path.join(benchDir,'actions')
await mkdir(out,{recursive:true})
const trials:Trial[]=JSON.parse(await readFile(path.join(benchDir,'baseline-trials.json'),'utf8'))
const originals=trials.filter(t=>t.method==='choice'&&t.input==='image'&&t.family==='live-photo'&&t.expectedHeld!==null)
const photos:Photo[]=originals.map(t=>({id:t.caseId,file:path.join(benchDir,t.frame),held:t.expectedHeld!,shop:t.shop,group:'diagnostic'}))
if(!process.argv.includes('--diagnostic')){
  const incoming:{id:string;file:string;held:boolean}[]=JSON.parse(await readFile(path.join(out,'new/actions.json'),'utf8'))
  photos.push(...incoming.map(t=>({...t,file:path.join(out,'new',t.file),group:'independent',shop:'fashion'})))
}
const cacheFile=path.join(out,'outcomes.json')
let previous:Outcome[]=[]
try {previous=JSON.parse(await readFile(cacheFile,'utf8'))} catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e}
const shops=new Map<string,Awaited<ReturnType<typeof prepareShop>>>()
const rows:Outcome[]=[]
for(const photo of photos){
  if(!shops.has(photo.shop))shops.set(photo.shop,await prepareShop(photo.shop))
  const {catalog}=shops.get(photo.shop)!
  const frame=await jpeg512(await readFile(photo.file))
  for(const [version,instructions] of [['original',previousHeldPrompt],['visible-action',heldUpInstructions]]){
    const body=decisionRequest(frame,'choice',catalog,'',instructions)
    const fingerprint=hash(JSON.stringify(body))
    let row=previous.find(r=>r.fingerprint===fingerprint)
    if(!row){
      const base=version==='original' && photo.group==='diagnostic' ? originals.find(t=>t.caseId===photo.id) : undefined
      row={id:photo.id,group:photo.group,held:photo.held,version,p:null,sku:null,fingerprint,error:null}
      if(base){row.p=base.heldP;row.sku=base.predicted;row.error=base.error}
      else try {
        const answer=selectAnswer(await sendDecision(body),'choice',catalog)
        row.p=answer.held_up_probability
        row.sku=answer.product_id
      }catch(e){row.error=e instanceof Error?e.message:String(e)}
      previous.push(row)
      await writeFile(cacheFile,JSON.stringify(previous,null,2)+'\n')
    }
    rows.push(row)
  }
}
const lines=['# เปรียบเทียบคำถาม held_up','','ใช้ Choice + ภาพอย่างเดียวและเกณฑ์ 0.5 ทั้งสองรอบ ภาพและคลังในแต่ละคู่คงเดิม เปลี่ยนเฉพาะคำถามเรื่องท่าทาง ภาพ diagnostic คือกรณีที่พบปัญหาจากการทดลองหลัก ภาพ independent มาจากคนละเหตุการณ์และแหล่งภาพที่ไม่ได้ใช้สร้างคำถามใหม่','',
  '| ชุด | เคส | เฉลยยก | p เดิม | p ถามท่าทาง |','| --- | --- | --- | ---: | ---: |']
for(const photo of photos){
  const show=(version:string)=>{const row=rows.find(r=>r.id===photo.id&&r.version===version);return row?.p==null?'error':(row.p*100).toFixed(1)+'%'}
  lines.push('| '+[photo.group,photo.id,photo.held?'ยก':'ไม่ได้ยก',show('original'),show('visible-action')].join(' | ')+' |')
}
lines.push('','รอบแรกถามถึงแม่ค้ายกสินค้าให้กล้องดู รอบทดลองถามถึงท่าทางของบุคคลทุกเพศ ให้ตัวอย่างการชูโทรศัพท์และกางเสื้อ แยกจากการใช้ ถือผ่าน หรือสวมใส่ ทั้งภาษาและรายละเอียดคำถามเปลี่ยนพร้อมกัน จึงระบุสาเหตุจากปัจจัยเดียวไม่ได้','')
await writeFile(path.join(out,'results.md'),lines.join('\n'))
console.log(lines.join('\n'))
if(rows.some(r=>r.error))process.exitCode=1
