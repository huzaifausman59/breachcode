'use strict';
const { v4: uuid } = require('uuid');
const { getDb }    = require('./db');

function now() { return new Date().toISOString(); }

function listLessons() {
  return getDb().prepare(`
    SELECT id, template_id, title, indicators, created_by, created_at, updated_at
    FROM lessons ORDER BY created_at DESC
  `).all();
}

function findById(id) {
  return getDb().prepare('SELECT * FROM lessons WHERE id=?').get(id) ?? null;
}

function findByTemplateId(template_id) {
  return getDb().prepare('SELECT * FROM lessons WHERE template_id=? LIMIT 1').get(template_id) ?? null;
}

function createLesson({ template_id, title, content_html, indicators, created_by }) {
  const id = uuid();
  const ts = now();
  getDb().prepare(`
    INSERT INTO lessons (id, template_id, title, content_html, indicators, created_by, created_at, updated_at)
    VALUES (@id,@template_id,@title,@content_html,@indicators,@created_by,@ts,@ts)
  `).run({ id, template_id, title, content_html, indicators: JSON.stringify(indicators || []), created_by, ts });
  return findById(id);
}

function updateLesson(id, { title, content_html, indicators }) {
  getDb().prepare(`
    UPDATE lessons SET title=@title, content_html=@content_html,
      indicators=@indicators, updated_at=@ts WHERE id=@id
  `).run({ id, title, content_html, indicators: JSON.stringify(indicators || []), ts: now() });
  return findById(id);
}

module.exports = { listLessons, findById, findByTemplateId, createLesson, updateLesson };
