/**
 * Everything this server needs from movoa.ai: submit a run, read its status,
 * read the credit balance. Plain fetch against the public API with the
 * caller's own key, so a run here is priced, queued and stored exactly like a
 * run made on the website.
 */

export const SITE_URL = 'https://movoa.ai';
export const VERSION = '0.1.0';

/** Overridable for testing against a local build of the site; never needed in use. */
export function baseUrl(): string {
  return process.env.MOVOA_BASE_URL?.replace(/\/$/, '') || SITE_URL;
}

export const credentialsHint =
  'Set MOVOA_API_KEY to run on your own Movoa credits: create a key at https://movoa.ai/settings/apikeys';

export type ErrorKind =
  | 'auth'
  | 'quota'
  | 'plan'
  | 'busy'
  | 'rejected'
  | 'failed'
  | 'timeout'
  | 'network'
  | 'server';

export class MovoaError extends Error {
  constructor(
    message: string,
    readonly kind: ErrorKind,
    readonly taskId?: string
  ) {
    super(message);
    this.name = 'MovoaError';
  }
}

export type Task = {
  id: string;
  status: 'pending' | 'processing' | 'success' | 'failed' | 'canceled' | string;
  videos?: string[];
  errorMessage?: string;
  queued?: boolean;
  queueEta?: number;
};

function apiKey(): string | undefined {
  return process.env.MOVOA_API_KEY?.trim() || undefined;
}

export function hasApiKey(): boolean {
  return Boolean(apiKey());
}

type FetchLike = typeof fetch;
let fetchImpl: FetchLike = (...args) => fetch(...args);

/** Tests swap the transport; nothing else should. */
export function setFetch(f: FetchLike): void {
  fetchImpl = f;
}

type Envelope = { code?: number; message?: string; data?: any };

async function post(path: string, body?: unknown): Promise<Envelope> {
  const key = apiKey();
  if (!key) throw new MovoaError(`No API key set. ${credentialsHint}`, 'auth');
  let res: Response;
  try {
    res = await fetchImpl(`${baseUrl()}${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${key}`,
        'user-agent': `movoa-mcp/${VERSION}`,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (e) {
    throw new MovoaError(`Could not reach movoa.ai: ${(e as Error).message}`, 'network');
  }
  const text = await res.text();
  let json: Envelope;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    throw new MovoaError(`movoa.ai returned a non-JSON response (HTTP ${res.status})`, 'server');
  }
  if (res.status === 401) {
    throw new MovoaError(json.message || `Invalid API key. ${credentialsHint}`, 'auth');
  }
  if (json.code === 0) return json;
  raise(res.status, json);
}

/**
 * movoa.ai answers almost every refusal as HTTP 200 with a non-zero `code`
 * and a `data.reason`, so the status code alone reads a refusal as success.
 */
function raise(status: number, json: Envelope): never {
  const message = json.message || `request failed (HTTP ${status})`;
  if (json.code === -2 || json.code === -3) throw new MovoaError(message, 'rejected');
  switch (json.data?.reason) {
    case 'insufficient_credits':
      throw new MovoaError(message, 'quota');
    case 'plan_required':
      throw new MovoaError(message, 'plan');
    case 'concurrency':
      throw new MovoaError(message, 'busy');
  }
  if (/no auth/i.test(message)) throw new MovoaError(`${message}. ${credentialsHint}`, 'auth');
  throw new MovoaError(message, 'server');
}

export type SubmitInput = {
  prompt: string;
  model?: string;
  imageUrl?: string;
  duration?: number;
  resolution?: string;
  aspectRatio?: string;
};

export const DEFAULT_MODEL = 'minimax-h3';

export async function submit(input: SubmitInput): Promise<Task> {
  const options: Record<string, unknown> = { sound: true };
  if (input.duration !== undefined) options.duration = input.duration;
  if (input.resolution !== undefined) options.resolution = input.resolution;
  if (input.aspectRatio !== undefined) options.aspect_ratio = input.aspectRatio;
  if (input.imageUrl) options.image_input = [input.imageUrl];
  const json = await post('/api/ai/generate', {
    // The server routes by model; this only has to be non-empty.
    provider: 'auto',
    mediaType: 'video',
    model: input.model ?? DEFAULT_MODEL,
    scene: input.imageUrl ? 'image-to-video' : 'text-to-video',
    prompt: input.prompt,
    options,
  });
  if (!json.data?.id) throw new MovoaError('movoa.ai accepted the run but returned no id', 'server');
  return json.data as Task;
}

export async function getStatus(id: string): Promise<Task> {
  const json = await post('/api/ai/query', { taskId: id });
  return json.data as Task;
}

export async function credits(): Promise<number> {
  const json = await post('/api/user/get-user-credits');
  return Number(json.data?.remainingCredits ?? 0);
}

export async function waitFor(
  id: string,
  { timeoutMs = 30 * 60_000, intervalMs = 10_000 } = {}
): Promise<Task> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const task = await getStatus(id);
    if (task.status === 'success') {
      if (!task.videos?.length) throw new MovoaError(`Run ${id} finished with no video`, 'failed', id);
      return task;
    }
    if (task.status === 'failed' || task.status === 'canceled') {
      throw new MovoaError(`Run ${id} ${task.status}${task.errorMessage ? `: ${task.errorMessage}` : ''}`, 'failed', id);
    }
    if (Date.now() + intervalMs > deadline) {
      throw new MovoaError(`Run ${id} is still generating; check it later with check_status.`, 'timeout', id);
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}
