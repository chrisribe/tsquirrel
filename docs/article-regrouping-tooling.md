# Article regrouping tooling (human + LLM)

## Goal
Reduce feed fragmentation when the same real-world story evolves across phases:
- incident
- investigation
- testimony / whistleblower
- regulatory or legal follow-up

## CLI tool
`tools/article_cluster_tool.js` (Node, primary)\n- `tools/article_cluster_tool.py` (prototype reference)

### Input
JSON array with:
- `id` (optional)
- `title` (required)
- `url` (optional)
- `published_at` ISO timestamp (optional)
- `source_name` (optional)

### Run (human table)
```bash
node tools/article_cluster_tool.js --input tools/sample_articles_boeing.json --table
```

### Run (JSON for pipeline)
```bash
node tools/article_cluster_tool.js --input /tmp/articles.json > /tmp/clusters.json
```

### Scoring
- `+40` shared primary entities
- `+30` shared anchors (flight number, aircraft model, location cues)
- `+20` adjacent lifecycle phases (crash -> investigation -> hearing -> regulatory)
- `+15` same event type
- penalties for weak linkage and distant time windows without anchors

Default merge threshold: `55`.

## Recommended story schema extension
When SummaryService writes story rows, include:

```json
{
  "story_cluster_id": "stable id per evolving story thread",
  "story_phase": "incident|investigation|whistleblower|hearing|regulatory|lawsuit|other",
  "event_anchor": "flight/model/case/location anchor",
  "canonical_title": "stable thread title",
  "display_title": "latest phase headline"
}
```

## Prompt update (clustering step)
Current clustering prompt can be extended to require:

```json
{
  "stories": [
    {
      "indices": [0,2,5],
      "title": "Boeing safety case: crash fallout and investigation",
      "category": "World",
      "story_cluster_id": "boeing-737max-case-2026",
      "story_phase": "investigation",
      "event_anchor": "model:737MAX"
    }
  ]
}
```

This keeps evolving sub-events grouped while preserving phase metadata for the UI timeline.
