# Movoa

This extension adds Movoa's video models as tools: `generate_video`, `check_status`, `credits`.

- It needs `MOVOA_API_KEY` in the environment (create one at https://movoa.ai/settings/apikeys). If a tool says no key is set, tell the user that, with the link.
- Every run costs credits on the user's Movoa account. Say which model, length and resolution you are about to use before you call `generate_video`.
- Video takes minutes: `generate_video` returns a run id; call `check_status` later rather than waiting in a loop.
- `minimax-h3` is the default (lowest-cost) model. Pass `image_url` to animate a photo.
- Call `credits` before a batch; it is free.
