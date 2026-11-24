'use strict';
/**
 * Zod validation middleware factory.
 * Usage: router.post('/path', validate(mySchema), handler)
 *
 * On failure returns E_VALIDATION with a fields array — no stack trace.
 * On success attaches req.validated = parsed data (safe, coerced values).
 */

const { createError } = require('../errorHandler');

function validate(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const fields = result.error.errors.map((e) => ({
        field:   e.path.join('.'),
        message: e.message,
      }));
      return next(createError('E_VALIDATION', 'Input validation failed.', { fields }));
    }
    req.validated = result.data;
    next();
  };
}

module.exports = { validate };
