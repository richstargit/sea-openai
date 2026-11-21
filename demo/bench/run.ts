import path from 'node:path'
import { readFile, appendFile, writeFile } from 'node:fs/promises'
import { benchDir, prepareShop, shops, hash } from './frames.js'
import { jpeg512, DemoError } from '../common.js'
import { decisionRequest, selectAnswer, sendDecision } from '../decisions.js'
import type { Frame, Trial } from './types.js'
import {report} from './report.js'
import {policyReport} from './gates.js'
import {gallery} from './gallery.js'

async function renderReports(rows:Trial[]) {
  await Promise.all([report(rows,benchDir),policyReport(rows,benchDir),gallery(rows,benchDir)])
}
if(process.argv.includes('--report-only')){
  const rows:Trial[]=JSON.parse(await readFile(path.join(benchDir,'trials.json'),'utf8'))
  await renderReports(rows)
  console.log('Regenerated reports from',rows.length,'saved trials')
  process.exit(0)
}

const selection=process.argv.find(s=>s.startsWith('--shop='))?.slice(7).split(',') ?? shops
if (selection.some(shop=>!shops.includes(shop))) throw Error('Unknown shop')
const selected=await Promise.all(selection.map(prepareShop))
const allFrames=selected.flatMap(s=>s.frames)
console.log('Prepared',allFrames.length,'frames in',selection.join(', '),'|',allFrames.length*4,'paired trials')
if (process.argv.includes('--prepare')) process.exit(0)

const history=path.join(benchDir,'measurements.jsonl')
type RecordRow = { fingerprint:string; trial:Trial; at:string }
const cache=new Map<string,Trial>()
try {
  const lines=(await readFile(history,'utf8')).trim().split('\n').filter(Boolean)
  for (const line of lines) {
    const row: RecordRow=JSON.parse(line)
    // Keep observed refusals/errors in the experiment instead of retrying for better outcomes.
    cache.set(row.fingerprint,row.trial)
  }
} catch(e) { if((e as NodeJS.ErrnoException).code!=='ENOENT') throw e }
const parserVersion=hash(await readFile(path.join(benchDir,'../decisions.ts')))
const jobs=selected.flatMap(s=>s.frames.flatMap(frame=>
  (['choice','reference'] as const).flatMap(method=>(['image','caption'] as const).map(input=>({s,frame,method,input})))))
const results: Trial[]=[]
let checkpoint=Promise.resolve()
let next=0
let sent=0
let cached=0
let fatal:unknown
function baseline(frame:Frame,method:Trial['method'],input:Trial['input']):Trial {
  return {...frame,method,input,predicted:null,held:null,confidence:null,heldP:null,scores:[],latency:0,error:null}
}
async function worker() {
  while (!fatal && next<jobs.length) {
    const {s,frame,method,input}=jobs[next++]
    const jpeg=await jpeg512(await readFile(path.join(benchDir,frame.frame)))
    const body=decisionRequest(jpeg,method,s.catalog,input==='caption'?frame.text:'')
    const fingerprint=hash(parserVersion+JSON.stringify([frame,method,input])+JSON.stringify(body))
    const previous=process.argv.includes('--fresh') ? undefined : cache.get(fingerprint)
    if(previous){results.push(previous);cached++;continue}
    if(!process.env.OPENAI_API_KEY?.trim()) throw Error('Missing OPENAI_API_KEY')
    sent++
    const trial=baseline(frame,method,input)
    const start=performance.now()
    try {
      const answer=selectAnswer(await sendDecision(body),method,s.catalog)
      Object.assign(trial,{predicted:answer.product_id,held:answer.held_up,confidence:answer.confidence,
        heldP:answer.held_up_probability,scores:answer.probabilities.map(({id,p})=>({id,p}))})
    } catch(e) {
      trial.error=e instanceof Error?e.message:String(e)
      console.warn(frame.shop, frame.caseId, method,input,trial.error)
      if(e instanceof DemoError && [429,503].includes(e.status)) fatal=e
      if(results.length>=3 && results.slice(-3).every(r=>r.error)) fatal=e
    }
    trial.latency=Math.round(performance.now()-start)
    const row:RecordRow={fingerprint,trial,at:new Date().toISOString()}
    checkpoint=checkpoint.then(()=>appendFile(history,JSON.stringify(row)+'\n'))
    await checkpoint
    results.push(trial)
    if(results.length%20===0) console.log('Measured',results.length,'/',jobs.length)
  }
}
await Promise.all(Array.from({length:3},worker))
if(fatal) throw fatal
console.log('Success',results.filter(t=>!t.error).length,'/',jobs.length,'| new requests',sent,'| cached',cached)
if(shops.every(s=>selection.includes(s))) {
  results.sort((a,b)=>a.shop.localeCompare(b.shop)||a.caseId.localeCompare(b.caseId)||a.method.localeCompare(b.method)||a.input.localeCompare(b.input))
  await writeFile(path.join(benchDir,'trials.json'),JSON.stringify(results,null,2)+'\n')
  await renderReports(results)
}
if(results.some(t=>t.error)) process.exitCode=1
