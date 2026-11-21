import path from 'node:path'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import sharp from 'sharp'
import { root, jpeg512 } from '../common.js'
import type { Frame, Shop } from './types.js'

export const benchDir = path.join(root, 'bench')
export const shops = ['kitchen', 'electronics', 'fashion']
export const hash = (data: Buffer | string) => createHash('sha256').update(data).digest('hex')

async function sprite(bytes: Buffer, width: number, height: number) {
  // Trim only uniform margins. Preserve product proportions and alpha from web packshots.
  return sharp(bytes).rotate().trim({threshold: 10}).resize(width,height,{fit:'inside'}).png().toBuffer()
}
function canvas() {
  return sharp({ create: { width: 640, height: 840, channels: 3, background: '#e5e1da' } })
}
export async function prepareShop(key: string) {
  const base = path.join(benchDir,'shops',key)
  const shop: Shop = JSON.parse(await readFile(path.join(base,'shop.json'),'utf8'))
  const dest = path.join(benchDir,'frames',key)
  await mkdir(dest,{recursive:true})
  const refHashes = new Set<string>()
  const catalog = await Promise.all(shop.products.map(async p => {
    const references = await Promise.all(p.images.map(async file => {
      const bytes = await readFile(path.join(base,file))
      refHashes.add(hash(bytes))
      return jpeg512(bytes)
    }))
    return {...p, references}
  }))
  const frames: Frame[] = []
  const ids = new Set(shop.products.map(p => p.id))
  if (ids.size !== shop.products.length || ids.has('none')) throw Error('Invalid shop IDs: '+key)
  async function save(id: string, family: string, label: string, text: string, sourceId: string, held: boolean | null, bytes: Buffer) {
    const file = path.join(dest,id+'.jpg')
    if (frames.some(f => f.caseId === id)) throw Error('Duplicate frame '+id)
    await writeFile(file,bytes)
    frames.push({shop:key,caseId:id,family,label,text,sourceId,expectedHeld:held,frame:path.relative(benchDir,file).split(path.sep).join('/')})
  }
  for (const [i, c] of shop.cases.entries()) {
    if (!ids.has(c.label) && c.label !== 'none') throw Error('Unknown label '+c.label)
    const bytes = await readFile(path.join(base,c.image))
    if (refHashes.has(hash(bytes))) throw Error('Identical reference and query '+c.id)
    const held = c.held_up ?? null
    const jpeg = await sharp(bytes).rotate().resize(1000,1000,{fit:'inside',withoutEnlargement:true}).flatten({background:'white'}).jpeg({quality:90}).toBuffer()
    const live = c.scene === 'live-photo' || held === true
    await save(c.id,live ? 'live-photo' : 'source',c.label,c.text,c.id,held,jpeg)
    if (live) continue
    // Rotate the stress condition across independent source photos, with held-out orientations.
    const family = ['small-left','occluded-right','dim-blur'][i%3]
    const tile = await sprite(bytes, family==='small-left'?148:360, family==='small-left'?190:420)
    const {width=1,height=1}=await sharp(tile).metadata()
    const left=family==='occluded-right'?620-width:20
    const top=family==='small-left'?65:320
    const layers: sharp.OverlayOptions[]=[{input:tile,left,top}]
    if (family==='occluded-right') {
      const cover=await sharp({create:{width:Math.max(1,Math.round(width*0.30)),height,channels:3,background:'#9c8f82'}}).png().toBuffer()
      layers.push({input:cover,left:left+Math.round(width*0.48),top})
    }
    let scene=await canvas().composite(layers).jpeg().toBuffer()
    if (family==='dim-blur') scene=await sharp(scene).blur(2.6).modulate({brightness:0.55}).jpeg({quality:53}).toBuffer()
    await save(c.id+'-'+family,family,c.label,c.text,c.id,held,scene)
  }
  // Same pixels, different speech: seller is mentioning another item.
  const focus=shop.cases.find(c=>c.label !== 'none' && c.held_up !== true)!
  const distractor=catalog.find(p=>p.id !== focus.label)!
  const cleanFrame=frames.find(f=>f.caseId===focus.id)!
  const clean=await readFile(path.join(benchDir,cleanFrame.frame))
  await save('previous-item-speech','stale-speech',focus.label,'ตัวเมื่อกี้เป็น'+distractor.name+'ค่ะ',focus.id,focus.held_up??null,clean)
  const main=await sprite(await readFile(path.join(base,focus.image)),365,430)
  const other=await sprite(distractor.references[0],115,140)
  const clutter=await canvas().composite([{input:other,left:30,top:110},{input:main,left:250,top:385}]).jpeg().toBuffer()
  await save('two-products','two-products',focus.label,'ดูตัวใหญ่ด้านขวาล่างนะคะ',focus.id,false,clutter)
  // Oracle crop only: coordinates are supplied by the fixture, not by an automatic locator.
  const crop=await sharp(clutter).extract({left:236,top:370,width:399,height:458}).jpeg().toBuffer()
  await save('two-products-crop','manual-crop',focus.label,'ดูตัวใหญ่ด้านขวาล่างนะคะ',focus.id,false,crop)
  const empty=await canvas().jpeg().toBuffer()
  await save('empty-with-speech','empty', 'none','เดี๋ยวหยิบ'+catalog[0].name+'ให้ดูค่ะ','empty-canvas',false,empty)
  return {shop,catalog,frames}
}
