import assert from 'node:assert/strict'
import { chromium } from 'playwright-core'

export async function checkOverlayBrowser({ origin, api, alice, bob, clip }) {
  const browser = await chromium.launch({
    channel: 'chrome',
    executablePath: process.env.AGENT_BROWSER_EXECUTABLE || undefined,
  })
  const issue = async (user) =>
    (await (await api('/agent/overlay/link', 'POST', user.cookie, {})).json())
      .path
  const publish = async (user, event) =>
    await (
      await api('/agent/overlay/events', 'POST', user.cookie, event)
    ).json()
  try {
    const page = await browser.newPage({
      viewport: { width: 1920, height: 1080 },
    })
    page.setDefaultTimeout(5000)
    const link = await issue(alice)
    await page.goto(origin + link)
    await page.waitForSelector('body[data-connected=true]', {
      state: 'attached',
    })
    const connected = async (user) =>
      (await (await api('/agent/overlay/status', 'GET', user.cookie)).json())
        .connected
    assert.equal(await connected(alice), 1)
    assert.equal(await connected(bob), 0)
    assert.equal(
      (await publish(bob, { type: 'sales', total: 9999 })).delivered,
      0,
    )
    assert.equal(
      (await publish(alice, { type: 'price', sku: 'A1', price: 299 }))
        .delivered,
      1,
    )
    await page.getByText('฿299', { exact: true }).waitFor()
    await page.waitForFunction(
      () => window.__timelines['live-card-0'].time() > 0.15,
    )
    await publish(alice, { type: 'promo' })
    await page.getByText('โปรพิเศษ', { exact: true }).waitFor()
    assert.equal(
      (
        await api('/agent/overlay/events', 'POST', alice.cookie, {
          type: 'unknown',
        })
      ).status,
      400,
    )
    await publish(alice, { type: 'default' })
    await page.getByText('กำลังไลฟ์', { exact: true }).waitFor()
    assert.equal(await page.locator('.slot.playing').count(), 2)
    await publish(alice, { type: 'clip', fileId: clip.id })
    await page.waitForFunction(() =>
      [...document.querySelectorAll('video')].some(
        (v) => v.src.startsWith('blob:') && v.currentTime > 0.1,
      ),
    )
    const token = (await issue(bob)).split('#')[1]
    assert.equal(
      (
        await api(`/overlay/media/${clip.id}`, 'GET', undefined, undefined, {
          Authorization: `Bearer ${token}`,
        })
      ).status,
      404,
    )
    await issue(alice)
    await page.waitForFunction(() => !document.body.dataset.connected)
    assert.equal(await connected(alice), 0)
    assert.equal(
      (
        await api(`/overlay/media/${clip.id}`, 'GET', undefined, undefined, {
          Authorization: `Bearer ${link.split('#')[1]}`,
        })
      ).status,
      401,
    )
  } finally {
    await browser.close()
  }
}
