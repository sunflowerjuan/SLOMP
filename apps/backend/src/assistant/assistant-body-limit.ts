import type { NestExpressApplication } from '@nestjs/platform-express';
import { json, type NextFunction, type Request, type Response } from 'express';

export const ASSISTANT_MESSAGES_PATH =
  '/municipalities/:slug/assistant/messages';

// A message can carry the rows of the payment orders Excel (up to 5000),
// more than the default 100 KB JSON limit. Only this route gets a larger
// one; it is parsed here first and the default parser then skips it.
export function setupAssistantBodyLimit(app: NestExpressApplication): void {
  const parse = json({ limit: '1mb' });
  // Wrapped under its own name: Nest doesn't register its JSON parser for
  // the other routes if a middleware named "jsonParser" (express.json's
  // name) is already in the stack.
  app.use(
    ASSISTANT_MESSAGES_PATH,
    function assistantMessagesJson(
      req: Request,
      res: Response,
      next: NextFunction,
    ) {
      parse(req, res, next);
    },
  );
}
