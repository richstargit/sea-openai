import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import { createServer } from 'node:http'
import { test } from 'node:test'
import { setTimeout as wait } from 'node:timers/promises'
import { MongoClient } from 'mongodb'

async function listen(server) {
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  return server.address().port
}

function close(server) {
  return new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  )
}

function readEvents(body) {
  return body
    .split('\n')
    .filter((line) => line.startsWith('data: '))
    .map((line) => JSON.parse(line.slice(6)))
}

async function startBackend(env) {
  const portServer = createServer()
  const port = await listen(portServer)
  await close(portServer)

  const process_ = spawn(process.execPath, ['dist/server.js'], {
    env: { ...process.env, ...env, PORT: String(port) },
    stdio: 'ignore',
  })
  const exited = once(process_, 'close')
  const origin = `http://127.0.0.1:${port}`
  const stop = async () => {
    if (process_.exitCode === null) process_.kill('SIGTERM')
    await exited
  }

  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (process_.exitCode !== null) break
    const health = await fetch(`${origin}/health`).catch(() => null)
    if (health?.ok) return { origin, stop }
    await wait(100)
  }

  await stop()
  throw new Error('Backend did not start')
}

test('persisted agent resumes after a backend restart and reuses completed work', {
  timeout: 120_000,
}, async () => {
  const uri = process.env.TEST_MONGODB_URI || 'mongodb://127.0.0.1:27017'
  const database = `sea_openai_test_${randomUUID().replaceAll('-', '')}`
  const mongo = new MongoClient(uri, { serverSelectionTimeoutMS: 3000 })
  const replies = [
    { action: 'video', skill: 'motion-graphics' },
    null,
    {
      title: 'Special offer',
      subtitle: 'Today only',
      format: 'overlay',
      subject: 'none',
      motion: 'slide',
      color: 'mint',
    },
    { action: 'decline', skill: '' },
  ]
  const calls = []
  const provider = createServer(async (request, response) => {
    let body = ''
    for await (const chunk of request) body += chunk
    calls.push(JSON.parse(body))
    const tool = calls.at(-1).tool_choice?.name
    const reply =
      tool === 'design_motion_scene'
        ? {
            svg: '<g id="badge"><rect x="10" y="10" width="550" height="160" rx="28" fill="#162023"/><text x="48" y="118" font-size="76" fill="#ffffff">Special offer</text></g>',
            moves: [
              {
                target: 'badge',
                property: 'x',
                from: -120,
                to: 0,
                at: 0,
                span: 0.25,
                ease: 'power3.out',
              },
            ],
          }
        : tool === 'review_motion_frames'
          ? { fixes: [] }
          : replies.shift()
    response.setHeader('Content-Type', 'application/json')
    if (reply == null) {
      response
        .writeHead(400)
        .end(JSON.stringify({ error: { message: 'Simulated provider error' } }))
      return
    }
    const output =
      typeof reply === 'string'
        ? {
            type: 'message',
            role: 'assistant',
            content: [{ type: 'output_text', text: reply, annotations: [] }],
          }
        : {
            type: 'function_call',
            call_id: 'call_plan',
            name: calls.at(-1).tool_choice.name,
            arguments: JSON.stringify(reply),
          }
    response.end(
      JSON.stringify({
        object: 'response',
        status: 'completed',
        output: [output],
      }),
    )
  })
  let backend

  try {
    const providerPort = await listen(provider)
    const env = {
      NODE_ENV: 'production',
      APP_ORIGINS: 'http://localhost:3000',
      LOG_LEVEL: 'silent',
      MONGODB_URI: uri,
      MONGODB_DB: database,
      OPENAI_API_KEY: 'mock-only',
      OPENAI_BASE_URL: `http://127.0.0.1:${providerPort}/v1`,
    }
    backend = await startBackend(env)
    const api = (path, method = 'GET', cookie, body, extra = {}) =>
      fetch(backend.origin + path, {
        method,
        headers: {
          ...(cookie ? { Cookie: cookie } : {}),
          ...(body ? { 'Content-Type': 'application/json' } : {}),
          ...extra,
        },
        body: body ? JSON.stringify(body) : undefined,
      })
    const password = 'a-test-passphrase-123'
    const account = async (email) => {
      const response = await api('/auth/register', 'POST', undefined, {
        email,
        password,
      })
      assert.equal(response.status, 201)
      const header = response.headers.get('set-cookie')
      assert.match(header, /HttpOnly/i)
      assert.match(header, /Secure/i)
      assert.match(header, /SameSite=Lax/i)
      const { user } = await response.json()
      return { user, cookie: header.split(';')[0] }
    }
    const alice = await account('Alice@example.test')
    const bob = await account('bob@example.test')
    const markdown =
      '---\nname: neon-3d\ndescription: Neon product motion\n---\nUse violet with a gentle pulse.'
    assert.equal(
      (await api('/agent/skills', 'POST', alice.cookie, { markdown })).status,
      201,
    )
    assert.equal(
      (await api('/agent/skills', 'POST', alice.cookie, { markdown })).status,
      409,
    )
    assert.ok(
      (
        await (await api('/agent/skills', 'GET', alice.cookie)).json()
      ).skills.some((s) => s.name === 'neon-3d'),
    )
    assert.ok(
      !(
        await (await api('/agent/skills', 'GET', bob.cookie)).json()
      ).skills.some((s) => s.name === 'neon-3d'),
    )
    const who = await api('/auth/me', 'GET', alice.cookie)
    assert.deepEqual((await who.json()).user, {
      id: alice.user.id,
      email: 'alice@example.test',
    })
    assert.equal(
      (
        await api('/auth/register', 'POST', undefined, {
          email: 'alice@example.test',
          password,
        })
      ).status,
      409,
    )
    assert.equal(
      (
        await api('/auth/login', 'POST', undefined, {
          email: 'alice@example.test',
          password: 'wrong',
        })
      ).status,
      401,
    )
    assert.equal((await api('/auth/me')).status, 401)
    assert.equal(
      (await api('/agent/threads', 'POST', undefined, { message: 'hello' }))
        .status,
      401,
    )
    assert.equal(
      (
        await api('/auth/logout', 'POST', alice.cookie, undefined, {
          Origin: 'https://untrusted.example',
        })
      ).status,
      403,
    )
    const upload = await fetch(
      `${backend.origin}/agent/files?name=private.txt`,
      {
        method: 'POST',
        headers: {
          Cookie: alice.cookie,
          'Content-Type': 'application/octet-stream',
        },
        body: 'private notes',
      },
    )
    assert.equal(upload.status, 201)
    const { file } = await upload.json()
    assert.equal(
      await mongo
        .db(database)
        .collection('agent_files')
        .countDocuments({ _id: file.id, userId: alice.user.id }),
      1,
    )
    assert.equal(
      await (await api(file.url, 'GET', alice.cookie)).text(),
      'private notes',
    )
    assert.equal((await api(file.url)).status, 401)
    assert.equal(
      (
        await api(file.url, 'GET', bob.cookie, undefined, {
          'X-User-Id': alice.user.id,
        })
      ).status,
      404,
    )
    assert.equal(
      (
        await api('/agent/chat', 'POST', bob.cookie, {
          message: 'read',
          files: [file.id],
        })
      ).status,
      404,
    )
    const post = (path, message) =>
      api(path, 'POST', alice.cookie, message ? { message } : undefined)
    const first = await post('/agent/threads', 'Create a promo video.')
    assert.equal(first.status, 200)
    const initial = readEvents(await first.text())
    assert.equal(initial.at(-1).type, 'error')
    assert.deepEqual(initial[1].tasks, ['ออกแบบช็อตวิดีโอ', 'เรนเดอร์วิดีโอ'])
    const path = `/agent/threads/${initial[0].threadId}`
    const get = async () => {
      const response = await api(path, 'GET', alice.cookie)
      assert.equal(response.status, 200)
      return (await response.json()).thread
    }

    const saved = await get()
    assert.equal(saved.run.status, 'interrupted')
    assert.equal(saved.run.completedSteps, 0)
    const checkpoints = await mongo
      .db(database)
      .collection('checkpoints')
      .countDocuments({
        thread_id: `video:${alice.user.id}:${saved.run.id}`,
      })
    assert.ok(checkpoints > 1)
    for (const [suffix, method, body] of [
      ['', 'GET'],
      ['/resume', 'POST'],
      ['/messages', 'POST', { message: 'other account' }],
    ]) {
      assert.equal(
        (await api(path + suffix, method, bob.cookie, body)).status,
        404,
      )
    }
    const busy = await post(`${path}/messages`, 'New message')
    assert.equal(busy.status, 409)
    await busy.arrayBuffer()

    await backend.stop()
    backend = await startBackend(env)
    const resumed = await post(`${path}/resume`)
    assert.equal(resumed.status, 200)
    const recovery = readEvents(await resumed.text())
    assert.equal(recovery[1].completedSteps, 0)
    const rendered = recovery.at(-1)
    assert.equal(rendered.type, 'done')
    assert.equal(rendered.files[0].name, 'overlay.webm')
    assert.deepEqual(
      calls.slice(2).map((call) => call.tool_choice.name),
      ['design_shot', 'design_motion_scene', 'review_motion_frames'],
    )
    assert.equal(calls[2].tool_choice.name, 'design_shot')
    const video = await api(rendered.files[0].url, 'GET', alice.cookie)
    assert.equal(video.headers.get('content-type'), 'video/webm')
    assert.ok((await video.arrayBuffer()).byteLength > 1000)

    if (process.env.TEST_OBS_URL) {
      const { checkObsPrice } = await import('./overlay-obs.mjs')
      await checkObsPrice({ origin: backend.origin, api, alice })
    }
    if (process.env.TEST_OVERLAY_BROWSER) {
      const { checkOverlayBrowser } = await import('./overlay-browser.mjs')
      await checkOverlayBrowser({
        origin: backend.origin,
        api,
        alice,
        bob,
        clip: rendered.files[0],
      })
    }
    const completed = await get()
    assert.equal(completed.run.completedSteps, 2)
    assert.equal(completed.run.status, 'completed')
    assert.equal(completed.messages.length, 2)

    const continued = await post(`${path}/messages`, 'Do you remember that?')
    assert.equal(continued.status, 200)
    assert.match(readEvents(await continued.text()).at(-1).message, /วิดีโอ/)
    assert.deepEqual(
      JSON.parse(calls.at(-1).input).conversation.history,
      completed.messages,
    )
    const referenceRequest = {
      message: 'Make a video using this reference.',
      referenceFile: rendered.files[0].id,
    }
    assert.equal(
      (await api('/agent/chat', 'POST', bob.cookie, referenceRequest)).status,
      404,
    )
    replies.push(
      { action: 'video', skill: 'neon-3d' },
      {
        title: 'Neon',
        subtitle: 'Live',
        format: 'overlay',
        subject: 'none',
        motion: 'pulse',
        color: 'violet',
      },
    )
    const styled = await api(
      '/agent/chat',
      'POST',
      alice.cookie,
      referenceRequest,
    )
    assert.equal(styled.status, 200)
    assert.deepEqual((await styled.json()).skillsUsed, ['neon-3d'])
    const content = calls.findLast(
      (call) => call.tool_choice.name === 'design_shot',
    ).input[0].content
    assert.match(content[0].text, /Use violet with a gentle pulse/)
    assert.equal(
      content.filter((item) => item.type === 'input_image').length,
      3,
    )
    const secondLogin = await api('/auth/login', 'POST', undefined, {
      email: 'ALICE@example.test',
      password,
    })
    assert.equal(secondLogin.status, 200)
    const secondCookie = secondLogin.headers.get('set-cookie').split(';')[0]
    assert.notEqual(secondCookie, alice.cookie)
    assert.equal((await api('/auth/logout', 'POST', alice.cookie)).status, 204)
    assert.equal((await api(path, 'GET', alice.cookie)).status, 401)
    assert.equal((await api(path, 'GET', secondCookie)).status, 200)
    assert.equal((await api(file.url, 'GET', secondCookie)).status, 200)
    assert.ok(calls.every((call) => call.text?.format === undefined))
  } finally {
    await backend?.stop()
    await close(provider)
    try {
      await mongo.db(database).dropDatabase()
    } finally {
      await mongo.close()
    }
  }
})

test('Mongoose persists owner-scoped file bytes and workspace snapshots across connections', async () => {
  const uri = process.env.TEST_MONGODB_URI || 'mongodb://127.0.0.1:27017'
  const database = `sea_openai_test_${randomUUID().replaceAll('-', '')}`
  const previousDb = process.env.MONGODB_DB
  const previousUri = process.env.MONGODB_URI
  process.env.MONGODB_URI = uri
  process.env.MONGODB_DB = database
  const { getFile, saveFile } = await import(
    '../dist/services/agent-tools/files.js'
  )
  const { createAgentTools } = await import(
    '../dist/services/agent-tools/registry.js'
  )
  const { closeMongo, connectMongo } = await import('../dist/models/mongo.js')
  const owner = randomUUID(),
    other = randomUUID(),
    thread = randomUUID()
  try {
    const data = `${'a'.repeat(6000)}the remaining text`
    const empty = await saveFile(owner, 'empty.txt', Buffer.alloc(0))
    assert.equal((await getFile(owner, empty.id)).bytes.length, 0)
    const file = await saveFile(owner, 'notes.txt', Buffer.from(data))
    const input = {
      message: 'Read the attachment',
      history: [],
      files: [file.id],
    }
    const forUser = (userId) => createAgentTools(input, userId, thread)
    let tools = forUser(owner)
    const call = (name, args) =>
      tools.call(
        { name, arguments: JSON.stringify(args) },
        AbortSignal.timeout(5000),
      )
    const read = await call('file_read', { fileId: file.id })
    assert.equal(read.nextOffset, 6000)
    assert.equal(
      (await call('read_result', { resultId: read.resultId, offset: 6000 }))
        .text,
      'the remaining text',
    )
    assert.ok(
      (await call('open_toolkit', { toolkit: 'sandbox' })).some(
        (t) => t.name === 'sandbox_exec',
      ),
    )
    assert.deepEqual(
      await call('sandbox_import', { fileId: file.id, path: 'docs/notes.txt' }),
      { path: 'docs/notes.txt', bytes: Buffer.byteLength(data) },
    )
    assert.ok(
      (await call('sandbox_write', { path: '../outside', text: 'no' })).error,
    )
    await closeMongo()
    tools = forUser(other)
    assert.deepEqual(await call('sandbox_list', {}), [])
    for (const [name, args] of [
      ['file_read', { fileId: file.id }],
      ['sandbox_import', { fileId: file.id, path: 'copy' }],
      ['sandbox_export', { path: 'docs/notes.txt' }],
    ])
      assert.ok((await call(name, args)).error)
    tools = forUser(owner)
    const output = await call('use_tool', {
      name: 'sandbox_export',
      args: { path: 'docs/notes.txt' },
    })
    assert.equal((await getFile(owner, output.id)).bytes.toString(), data)
    await assert.rejects(
      getFile(other, output.id),
      (error) => error.status === 404,
    )
    const { connection } = await connectMongo()
    assert.equal(
      await connection.db
        .collection('agent_workspaces')
        .countDocuments({ userId: owner, threadId: thread }),
      1,
    )
  } finally {
    const { connection } = await connectMongo()
    try {
      await connection.dropDatabase()
    } finally {
      await closeMongo()
    }
    if (previousDb === undefined) delete process.env.MONGODB_DB
    else process.env.MONGODB_DB = previousDb
    if (previousUri === undefined) delete process.env.MONGODB_URI
    else process.env.MONGODB_URI = previousUri
  }
})
