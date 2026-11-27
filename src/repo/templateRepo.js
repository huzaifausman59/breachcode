'use strict';
const { v4: uuid } = require('uuid');
const { getDb }    = require('./db');

function now() { return new Date().toISOString(); }

function listTemplates() {
  return getDb().prepare(`
    SELECT id, name, subject, sender_name, sender_email,
           indicator_result, created_by, created_at, updated_at
    FROM templates ORDER BY created_at DESC
  `).all();
}

function findById(id) {
  return getDb().prepare('SELECT * FROM templates WHERE id = ?').get(id) ?? null;
}

function createTemplate({ name, subject, sender_name, sender_email, html_body, text_body, created_by }) {
  const id = uuid();
  const ts = now();
  getDb().prepare(`
    INSERT INTO templates
      (id, name, subject, sender_name, sender_email, html_body, text_body, created_by, created_at, updated_at)
    VALUES
      (@id,@name,@subject,@sender_name,@sender_email,@html_body,@text_body,@created_by,@ts,@ts)
  `).run({ id, name, subject, sender_name, sender_email, html_body, text_body: text_body || null, created_by, ts });
  return findById(id);
}

function updateTemplate(id, { name, subject, sender_name, sender_email, html_body, text_body }) {
  getDb().prepare(`
    UPDATE templates SET name=@name, subject=@subject, sender_name=@sender_name,
      sender_email=@sender_email, html_body=@html_body, text_body=@text_body, updated_at=@ts
    WHERE id=@id
  `).run({ id, name, subject, sender_name, sender_email, html_body, text_body: text_body || null, ts: now() });
  return findById(id);
}

function saveIndicatorResult(id, resultJson) {
  getDb().prepare('UPDATE templates SET indicator_result=@r, updated_at=@ts WHERE id=@id')
    .run({ id, r: resultJson, ts: now() });
}

function deleteTemplate(id) {
  getDb().prepare('DELETE FROM templates WHERE id=?').run(id);
}

module.exports = { listTemplates, findById, createTemplate, updateTemplate, saveIndicatorResult, deleteTemplate };
