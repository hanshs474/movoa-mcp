/**
 * movoa-mcp — run Movoa's video models (MiniMax H3, Seedance 2.5, Veo 3.1 Fast
 * and the Seedance 2.0 family) from any MCP client.
 *
 * Every tool goes through movoa.ai's API with the caller's own key, so a run
 * costs the same credits and lands in the same library as a run on the website.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import {
  credits,
  credentialsHint,
  DEFAULT_MODEL,
  getStatus,
  hasApiKey,
  MovoaError,
  submit,
  VERSION,
  waitFor,
  type Task,
} from './client.js';

export const VIDEO_MODELS = [
  'minimax-h3',
  'seedance-2-5',
  'veo-3-1-fast',
  'seedance-2',
  'seedance-2-fast',
  'seedance-2-mini',
] as const;

const text = (body: string) => ({ content: [{ type: 'text' as const, text: body }] });
const fail = (body: string) => ({ ...text(body), isError: true as const });

function explain(e: unknown): string {
  if (!(e instanceof MovoaError)) return String(e);
  switch (e.kind) {
    case 'quota':
      return `${e.message}. Top up at https://movoa.ai/pricing`;
    case 'plan':
      return `${e.message} See https://movoa.ai/pricing`;
    case 'busy':
      return `${e.message}. Wait for the current run to finish (check_status), then try again.`;
    case 'rejected':
      return `${e.message}. Rewrite the prompt and try again.`;
    default:
      return e.message;
  }
}

function report(task: Task): string {
  if (task.status === 'success' && task.videos?.length) {
    return `Video ready:\n\n${task.videos[0]}\n\nRun id: ${task.id}`;
  }
  if (task.status === 'failed' || task.status === 'canceled') {
    return `Run ${task.status}${task.errorMessage ? `: ${task.errorMessage}` : ''}. Run id: ${task.id}`;
  }
  const eta = task.queued && task.queueEta ? ` (queued, about ${Math.ceil(task.queueEta / 60)} min)` : '';
  return `Video is generating${eta}. Check it with check_status and this id: ${task.id}`;
}

export function createServer(): McpServer {
  const server = new McpServer({ name: 'movoa-mcp', version: VERSION });

  server.registerTool(
    'generate_video',
    {
      title: 'Generate a video on Movoa',
      description:
        'Generate a video clip with sound from a text prompt on movoa.ai, or animate a photo by passing image_url (photo to video). Defaults to MiniMax H3 at 480p. Runs cost credits on your Movoa account, at the prices on https://movoa.ai/pricing. Video takes minutes: by default this returns a run id to poll with check_status.',
      inputSchema: {
        prompt: z.string().describe('The shot: what happens, where, how the camera moves, and what it sounds like.'),
        model: z.enum(VIDEO_MODELS).optional().describe(`Default ${DEFAULT_MODEL}, the lowest-cost model.`),
        image_url: z.string().optional().describe('Optional photo (public https URL) used as the first frame — makes this photo to video.'),
        duration: z
          .number()
          .int()
          .optional()
          .describe('Seconds. minimax-h3: 4/5/6/8/10/15; seedance-2-5: 5–30 in steps of 5; seedance-2 family: 4/6/8/10; veo-3-1-fast: 8.'),
        resolution: z.string().optional().describe("minimax-h3: '480p' or '768p'; Seedance: '480p' or '720p'; Veo: '720p'."),
        aspect_ratio: z.string().optional().describe("'16:9' (default), '9:16' or '1:1' (Veo: 16:9 or 9:16)."),
        wait: z.boolean().optional().describe('Block until the clip is ready (up to 30 minutes). Default false.'),
      },
    },
    async ({ prompt, model, image_url, duration, resolution, aspect_ratio, wait = false }) => {
      if (!hasApiKey()) return fail(`No API key set. ${credentialsHint}`);
      try {
        const task = await submit({ prompt, model, imageUrl: image_url, duration, resolution, aspectRatio: aspect_ratio });
        return text(report(wait ? await waitFor(task.id) : task));
      } catch (e) {
        return fail(`Video refused: ${explain(e)}`);
      }
    }
  );

  server.registerTool(
    'check_status',
    {
      title: 'Check a Movoa run',
      description: 'Read the status of a run started with generate_video, and the video URL when it is ready.',
      inputSchema: {
        run_id: z.string().describe('The run id returned by generate_video.'),
        wait: z.boolean().optional().describe('Keep polling every 10 seconds until it finishes. Default false.'),
      },
    },
    async ({ run_id, wait = false }) => {
      if (!hasApiKey()) return fail(`No API key set. ${credentialsHint}`);
      try {
        return text(report(wait ? await waitFor(run_id) : await getStatus(run_id)));
      } catch (e) {
        return fail(`Could not read run ${run_id}: ${explain(e)}`);
      }
    }
  );

  server.registerTool(
    'credits',
    {
      title: 'Movoa credit balance',
      description: 'The credits left on the Movoa account behind MOVOA_API_KEY. Free to call.',
      inputSchema: {},
    },
    async () => {
      if (!hasApiKey()) return fail(`No API key set. ${credentialsHint}`);
      try {
        return text(`${await credits()} credits left on your Movoa account. Plans and top-ups: https://movoa.ai/pricing`);
      } catch (e) {
        return fail(`Could not read credits: ${explain(e)}`);
      }
    }
  );

  return server;
}
