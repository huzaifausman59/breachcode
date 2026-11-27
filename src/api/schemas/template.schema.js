'use strict';
const { z } = require('zod');

const templateSchema = z.object({
  name:         z.string().min(3).max(100),
  subject:      z.string().min(3).max(200),
  sender_name:  z.string().min(1).max(100),
  sender_email: z.string().email().max(200),
  html_body:    z.string().min(10).max(50000),
  text_body:    z.string().max(50000).optional(),
});

const campaignSchema = z.object({
  name:            z.string().min(3).max(100),
  template_id:     z.string().uuid(),
  phase:           z.enum(['pre', 'post']),
  pre_campaign_id: z.string().uuid().optional(),
  confirm:         z.literal(true, { errorMap: () => ({ message: 'confirm must be true to send' }) }).optional(),
}).refine(
  (d) => d.phase !== 'post' || !!d.pre_campaign_id,
  { message: 'pre_campaign_id is required for post-training campaigns', path: ['pre_campaign_id'] },
);

const lessonSchema = z.object({
  template_id:  z.string().uuid(),
  title:        z.string().min(3).max(200),
  content_html: z.string().min(10).max(100000),
  indicators:   z.array(z.string()).max(20).optional(),
});

const ruleUpdateSchema = z.object({
  weight:    z.number().min(0).max(10).optional(),
  threshold: z.number().min(0).max(100).optional(),
  is_active: z.boolean().optional(),
  confirm:   z.literal(true, { errorMap: () => ({ message: 'confirm must be true to update a rule' }) }),
});

module.exports = { templateSchema, campaignSchema, lessonSchema, ruleUpdateSchema };
