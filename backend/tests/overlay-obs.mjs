import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { writeFile } from 'node:fs/promises'
import { setTimeout as wait } from 'node:timers/promises'
import { createCanvas, loadImage } from '@napi-rs/canvas'
import OBSWebSocket from 'obs-websocket-js/json'

async function captureSource(obs, sourceName) {
  const { imageData } = await obs.call('GetSourceScreenshot', {
    sourceName,
    imageFormat: 'png',
    imageWidth: 1920,
    imageHeight: 1080,
  })
  const png = Buffer.from(imageData.split(',')[1], 'base64')
  const image = await loadImage(png)
  const canvas = createCanvas(image.width, image.height)
  const context = canvas.getContext('2d')
  context.drawImage(image, 0, 0)
  const { data } = context.getImageData(0, 0, image.width, image.height)
  let visible = 0
  let mint = 0
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 100) continue
    visible++
    if (data[i + 1] > 200 && data[i] < 180 && data[i + 2] > 150) mint++
  }
  return { png, visible, mint }
}

export async function checkObsPrice({ origin, api, alice }) {
  const obs = new OBSWebSocket()
  await obs.connect(process.env.TEST_OBS_URL, process.env.TEST_OBS_PASSWORD, {
    eventSubscriptions: 0,
  })
  const inputName = `Price overlay test ${randomUUID()}`
  let created = false
  try {
    const { currentProgramSceneName: sceneName } = await obs.call(
      'GetCurrentProgramScene',
    )
    const { path } = await (
      await api('/agent/overlay/link', 'POST', alice.cookie, {})
    ).json()
    await obs.call('CreateInput', {
      sceneName,
      inputName,
      inputKind: 'browser_source',
      sceneItemEnabled: true,
      inputSettings: {
        url: new URL(path, origin).href,
        width: 1920,
        height: 1080,
        shutdown: false,
      },
    })
    created = true
    const deadline = Date.now() + 18000
    let connected = 0
    while (!connected && Date.now() < deadline) {
      await wait(350)
      const response = await api('/agent/overlay/status', 'GET', alice.cookie)
      assert.equal(response.status, 200)
      connected = (await response.json()).connected
    }
    assert.equal(
      connected,
      1,
      'OBS Browser Source must subscribe to the backend',
    )
    assert.equal((await captureSource(obs, inputName)).visible, 0)
    const published = await api('/agent/overlay/events', 'POST', alice.cookie, {
      type: 'price',
      sku: 'A1',
      price: 299,
    })
    assert.equal(published.status, 200)
    assert.equal((await published.json()).delivered, 1)
    await wait(700)
    const frame = await captureSource(obs, inputName)
    assert.ok(
      frame.visible > 1000 &&
        frame.visible < (1920 * 1080) / 4 &&
        frame.mint > 80,
      'OBS must render the price badge on transparency',
    )
    if (process.env.TEST_OBS_SCREENSHOT)
      await writeFile(process.env.TEST_OBS_SCREENSHOT, frame.png)
    await wait(4000)
    assert.equal(
      (await captureSource(obs, inputName)).visible,
      0,
      'OBS must clear the expired badge',
    )
  } finally {
    try {
      if (created) await obs.call('RemoveInput', { inputName })
    } finally {
      await obs.disconnect()
    }
  }
}
