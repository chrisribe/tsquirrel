'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { decodeHtmlEntities, plainText } = require('../lib/display');

test('converts encoded feed markup to readable plain text', () => {
  const input = '&lt;p&gt;Six passengers &amp;amp; crew remain missing.&lt;/p&gt;'
    + '&lt;a href=&quot;https://example.com&quot;&gt;Continue reading…&lt;/a&gt;';

  assert.equal(
    plainText(input),
    'Six passengers & crew remain missing. Continue reading…'
  );
});

test('decodes named and numeric HTML entities', () => {
  assert.equal(
    decodeHtmlEntities('Search&nbsp;&mdash;&nbsp;&#x201C;active&#8221;'),
    'Search — “active”'
  );
});

test('removes non-content script and style blocks', () => {
  assert.equal(
    plainText('<style>.hidden{display:none}</style><p>Visible</p><script>alert(1)</script>'),
    'Visible'
  );
});
