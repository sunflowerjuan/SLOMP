import { BadRequestException } from '@nestjs/common';
import { errorBody } from '../common/errors/error-body.js';
import { ErrorCode } from '../common/errors/error-codes.js';

export const MAX_TEMPLATE_NAME_LENGTH = 120;

// eslint-disable-next-line no-control-regex
const FORBIDDEN = /[/\\\u0000-\u001f\u007f]/;

// The name a saved version keeps: the one the lawyer chose when saving the
// draft, or the uploaded file's when they left it alone. It is also the name
// of the download, so it never carries a path and always ends in .docx.
export function templateFileName(
  chosen: string | undefined,
  uploaded: string,
): string {
  if (chosen === undefined) return uploaded;
  const name = chosen
    .trim()
    .replace(/\.docx$/i, '')
    .replace(/ +/g, ' ')
    .trim();
  if (
    name === '' ||
    name.length > MAX_TEMPLATE_NAME_LENGTH ||
    FORBIDDEN.test(name)
  ) {
    throw new BadRequestException(
      errorBody(
        ErrorCode.TEMPLATE_FILE_NAME_INVALID,
        `The template name must have 1 to ${MAX_TEMPLATE_NAME_LENGTH} characters, without slashes or control characters.`,
        { maxLength: MAX_TEMPLATE_NAME_LENGTH },
      ),
    );
  }
  return `${name}.docx`;
}
