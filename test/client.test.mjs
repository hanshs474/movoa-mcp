// Unit tests against the real response shapes of movoa.ai's API (mocked transport; no network).
import test from 'node:test';
import assert from 'node:assert/strict';
import { submit, getStatus, credits, waitFor, setFetch, MovoaError } from '../dist/client.js';

process.env.MOVOA_API_KEY = 'sk-test';
const reply = (status, body) => async () => new Response(JSON.stringify(body), { status });

test('submit sends the site contract and returns the task', async () => {
  let sent;
  setFetch(async (url, init) => {
    sent = { url, init, body: JSON.parse(init.body) };
    return new Response(JSON.stringify({ code: 0, message: 'ok', data: { id: 't1', status: 'processing' } }));
  });
  const task = await submit({ prompt: 'a cat', imageUrl: 'https://x/y.jpg', duration: 4 });
  assert.equal(task.id, 't1');
  assert.equal(sent.url, 'https://movoa.ai/api/ai/generate');
  assert.equal(sent.init.headers.authorization, 'Bearer sk-test');
  assert.deepEqual(sent.body, {
    provider: 'auto', mediaType: 'video', model: 'minimax-h3', scene: 'image-to-video', prompt: 'a cat',
    options: { sound: true, duration: 4, image_input: ['https://x/y.jpg'] },
  });
});

for (const [status, body, kind] of [
  [401, { code: -1, message: 'Invalid API key. Create one at https://movoa.ai/settings/apikeys', data: { reason: 'invalid_api_key' } }, 'auth'],
  [200, { code: -1, message: 'insufficient credits', data: { reason: 'insufficient_credits' } }, 'quota'],
  [200, { code: -1, message: 'This model or quality needs a plan.', data: { reason: 'plan_required' } }, 'plan'],
  [200, { code: -1, message: 'busy', data: { reason: 'concurrency' } }, 'busy'],
  [200, { code: -2, message: 'blocked' }, 'rejected'],
  [200, { code: -3, message: 'cooldown' }, 'rejected'],
  [200, { code: -1, message: 'no auth, please sign in' }, 'auth'],
  [200, { code: -1, message: 'generation failed, please try again' }, 'server'],
]) {
  test(`submit ${status} ${body.code} ${body.data?.reason ?? body.message} -> ${kind}`, async () => {
    setFetch(reply(status, body));
    await assert.rejects(submit({ prompt: 'x' }), (e) => e instanceof MovoaError && e.kind === kind);
  });
}

test('status success carries the video', async () => {
  setFetch(reply(200, { code: 0, data: { id: 't1', status: 'success', videos: ['https://cdn/v.mp4'] } }));
  assert.equal((await getStatus('t1')).videos[0], 'https://cdn/v.mp4');
});

test('waitFor resolves on success and throws on failure', async () => {
  setFetch(reply(200, { code: 0, data: { id: 't1', status: 'success', videos: ['https://cdn/v.mp4'] } }));
  assert.equal((await waitFor('t1', { intervalMs: 1 })).videos[0], 'https://cdn/v.mp4');
  setFetch(reply(200, { code: 0, data: { id: 't1', status: 'failed', errorMessage: 'provider down' } }));
  await assert.rejects(waitFor('t1', { intervalMs: 1 }), (e) => e.kind === 'failed' && /provider down/.test(e.message));
});

test('waitFor times out with the id', async () => {
  setFetch(reply(200, { code: 0, data: { id: 't1', status: 'processing', queued: true, queueEta: 60 } }));
  await assert.rejects(waitFor('t1', { intervalMs: 5, timeoutMs: 1 }), (e) => e.kind === 'timeout' && e.taskId === 't1');
});

test('credits reads remainingCredits', async () => {
  setFetch(reply(200, { code: 0, data: { remainingCredits: 42 } }));
  assert.equal(await credits(), 42);
});

test('no key -> auth without a request', async () => {
  delete process.env.MOVOA_API_KEY;
  setFetch(async () => { throw new Error('should not be called'); });
  await assert.rejects(credits(), (e) => e.kind === 'auth');
  process.env.MOVOA_API_KEY = 'sk-test';
});
