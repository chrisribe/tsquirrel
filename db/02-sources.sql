-- Seed default sources
INSERT INTO sources (name, slug, url, feed_url, type) VALUES
  ('Hacker News',    'hackernews',  'https://news.ycombinator.com',          NULL,                                                             'hn'),
  ('BBC News',       'bbc',         'https://www.bbc.com/news',              'https://feeds.bbci.co.uk/news/rss.xml',                          'rss'),
  ('Reuters',        'reuters',     'https://www.reuters.com',               'https://feeds.reuters.com/reuters/topNews',                      'rss'),
  ('The Guardian',   'guardian',    'https://www.theguardian.com',           'https://www.theguardian.com/world/rss',                          'rss'),
  ('Ars Technica',   'arstechnica', 'https://arstechnica.com',               'https://feeds.arstechnica.com/arstechnica/index',                'rss'),
  ('TechCrunch',     'techcrunch',  'https://techcrunch.com',                'https://techcrunch.com/feed/',                                   'rss')
ON CONFLICT (slug) DO NOTHING;
