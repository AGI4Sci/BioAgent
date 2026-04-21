# View Composition Schema

View Composition lets BioAgent change presentation without generating new UI code. A UIManifest slot can include these optional fields:

```json
{
  "componentId": "umap-viewer",
  "artifactRef": "omics-differential-expression",
  "encoding": {
    "colorBy": "cellCycle",
    "splitBy": "batch",
    "overlayBy": "treatment",
    "facetBy": "donor",
    "compareWith": ["run-a", "run-b"],
    "highlightSelection": ["TP53"],
    "syncViewport": true,
    "x": "umap1",
    "y": "umap2",
    "label": "sample"
  },
  "layout": {
    "mode": "side-by-side",
    "columns": 2,
    "height": 360
  },
  "selection": {
    "id": "selected-cells",
    "field": "cellId",
    "values": []
  },
  "sync": {
    "selectionIds": ["selected-cells"],
    "viewportIds": ["main-umap"]
  },
  "transform": [
    { "type": "filter", "field": "fdr", "op": "<=", "value": 0.05 },
    { "type": "limit", "value": 50 }
  ],
  "compare": {
    "artifactRefs": ["run-a", "run-b"],
    "mode": "side-by-side"
  }
}
```

Phase 1 behavior:

- `colorBy` is honored for UMAP point clusters and network node types.
- Composition settings are displayed in each slot so unsupported parameters are visible rather than silently ignored.
- Unknown or unsupported component ids render with UnknownArtifactInspector.
- Dynamic UI plugins remain disabled by default.

