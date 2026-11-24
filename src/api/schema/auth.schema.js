'use strict';
const { z } = require('zod');

const loginSchema = z.object({
  username: z
    .string()
    .min(3,  'Username must be at least 3 characters')
    .max(64, 'Username must be at most 64 characters')
    .regex(/^[a-zA-Z0-9_-]+$/, 'Username may only contain letters, numbers, _ and -'),
  password: z
    .string()
    .min(8,   'Password must be at least 8 characters')
    .max(128, 'Password must be at most 128 characters'),
});

const createUserSchema = z.object({
  username: z
    .string()
    .min(3,  'Username must be at least 3 characters')
    .max(64, 'Username must be at most 64 characters')
    .regex(/^[a-zA-Z0-9_-]+$/, 'Username may only contain letters, numbers, _ and -'),
  password: z
    .string()
    .min(12,  'Password must be at least 12 characters')
    .max(128, 'Password must be at most 128 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
  role: z.enum(['admin', 'operator', 'viewer']),
});

const updateUserSchema = z.object({
  role:      z.enum(['admin', 'operator', 'viewer']).optional(),
  is_active: z.boolean().optional(),
  confirm:   z.literal(true, { errorMap: () => ({ message: 'High-impact action requires confirm: true' }) }),
});

module.exports = { loginSchema, createUserSchema, updateUserSchema };
