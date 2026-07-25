'use strict';

const crypto = require('crypto');

// URL-safe slug from a title, with a short random suffix to guarantee uniqueness.
function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 80)
    + '-' + crypto.randomBytes(3).toString('hex');
}

module.exports = { slugify };
