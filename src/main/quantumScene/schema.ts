// Pinned copy of Theory Lab quantum-scene/v1 at theory-lab fde58fd.
// Source JSON SHA-256: 90d98ee42cae0f613cf55232f93b3faf91d0936521f156a52db6dfe4887fb237.
// Do not silently broaden this importer.
const schema = {
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "quantum-scene/v1",
  "type": "object", "additionalProperties": false,
  "required": ["schema", "id", "title", "provenance", "coordinates", "camera", "datasets", "objects", "annotations"],
  "properties": {
    "schema": {"const": "quantum-scene/v1"},
    "id": {"$ref": "#/definitions/id"},
    "title": {"$ref": "#/definitions/text"},
    "provenance": {
      "type": "object", "additionalProperties": false,
      "required": ["runId", "jobId", "model", "engine", "engineVersion", "computedAt", "resultSha256", "adapter"],
      "properties": {
        "runId": {"$ref": "#/definitions/id"}, "jobId": {"$ref": "#/definitions/id"},
        "model": {"$ref": "#/definitions/text"}, "engine": {"$ref": "#/definitions/text"},
        "engineVersion": {"$ref": "#/definitions/text"}, "computedAt": {"$ref": "#/definitions/text"},
        "resultSha256": {"$ref": "#/definitions/hash"}, "adapter": {"const": "qvis/1"},
        "kind": {"enum": ["geometry-fixture", "numerical-result"]},
        "parameters": {
          "type": "object", "minProperties": 1, "maxProperties": 20,
          "propertyNames": {"type": "string", "pattern": "^[A-Za-z][A-Za-z0-9]{0,40}$"},
          "additionalProperties": {"anyOf": [{"type": "number"}, {"$ref": "#/definitions/text"}]}
        },
        "source": {
          "type": "object", "additionalProperties": false, "required": ["repository", "revision", "entryId"],
          "properties": {"repository": {"$ref": "#/definitions/text"}, "revision": {"type": "string", "pattern": "^[a-f0-9]{40}$"}, "entryId": {"$ref": "#/definitions/id"}}
        }
      }
    },
    "coordinates": {
      "type": "object", "additionalProperties": false, "required": ["handedness", "axes", "units"],
      "properties": {
        "handedness": {"const": "right"},
        "axes": {"type": "array", "minItems": 3, "maxItems": 3, "items": {"$ref": "#/definitions/text"}},
        "units": {"type": "array", "minItems": 3, "maxItems": 3, "items": {"$ref": "#/definitions/text"}}
      }
    },
    "camera": {
      "type": "object", "additionalProperties": false, "required": ["position", "target", "up"],
      "properties": {"position": {"$ref": "#/definitions/vec3"}, "target": {"$ref": "#/definitions/vec3"}, "up": {"$ref": "#/definitions/vec3"}}
    },
    "datasets": {"type": "array", "minItems": 1, "maxItems": 64, "items": {"$ref": "#/definitions/dataset"}},
    "objects": {"type": "array", "maxItems": 64, "items": {"$ref": "#/definitions/object"}},
    "fields": {"type": "array", "minItems": 1, "maxItems": 4, "items": {"$ref": "#/definitions/field"}},
    "topology": {
      "type": "object", "additionalProperties": false, "required": ["quantities", "invariants", "limitations"],
      "properties": {
        "quantities": {"type": "array", "maxItems": 8, "items": {"type": "object", "additionalProperties": false, "required": ["id", "label", "kind", "object", "dataset", "convention"], "properties": {"id": {"$ref": "#/definitions/id"}, "label": {"$ref": "#/definitions/text"}, "kind": {"enum": ["berry-curvature", "berry-connection", "pseudospin", "berry-phase"]}, "object": {"$ref": "#/definitions/id"}, "dataset": {"$ref": "#/definitions/id"}, "convention": {"$ref": "#/definitions/text"}}}},
        "invariants": {"type": "array", "maxItems": 8, "items": {"type": "object", "additionalProperties": false, "required": ["id", "label", "value", "status", "method"], "properties": {"id": {"$ref": "#/definitions/id"}, "label": {"$ref": "#/definitions/text"}, "value": {"anyOf": [{"type": "number"}, {"const": null}]}, "status": {"enum": ["verified", "supplied", "undefined", "unresolved"]}, "method": {"$ref": "#/definitions/text"}}}},
        "limitations": {"type": "array", "minItems": 1, "maxItems": 8, "items": {"$ref": "#/definitions/text"}}
      }
    },
    "bands": {
      "type": "object", "additionalProperties": false,
      "required": ["kind", "coordinates", "energies", "objects", "labels", "energyUnit", "bulkGap"],
      "properties": {
        "kind": {"enum": ["path", "surface"]}, "coordinates": {"$ref": "#/definitions/id"},
        "energies": {"type": "array", "minItems": 2, "maxItems": 8, "items": {"$ref": "#/definitions/id"}},
        "objects": {"type": "array", "minItems": 2, "maxItems": 8, "items": {"$ref": "#/definitions/id"}},
        "labels": {"type": "array", "minItems": 2, "maxItems": 8, "items": {"$ref": "#/definitions/text"}},
        "energyUnit": {"$ref": "#/definitions/text"}, "bulkGap": {"type": "number", "minimum": 0, "maximum": 1000000},
        "grid": {"type": "array", "minItems": 2, "maxItems": 2, "items": {"type": "integer", "minimum": 2, "maximum": 31}}
      }
    },
    "reciprocal": {
      "type": "object", "additionalProperties": false,
      "required": ["directBasis", "basis", "directUnit", "reciprocalUnit", "pointObject", "points", "paths", "boundaryObjects"],
      "properties": {
        "directBasis": {"type": "array", "minItems": 2, "maxItems": 3, "items": {"$ref": "#/definitions/vec3"}},
        "basis": {"type": "array", "minItems": 2, "maxItems": 3, "items": {"$ref": "#/definitions/vec3"}},
        "directUnit": {"$ref": "#/definitions/text"}, "reciprocalUnit": {"$ref": "#/definitions/text"},
        "pointObject": {"$ref": "#/definitions/id"},
        "points": {"type": "array", "minItems": 1, "maxItems": 16, "items": {"type": "object", "additionalProperties": false, "required": ["id", "label", "position"], "properties": {"id": {"$ref": "#/definitions/id"}, "label": {"$ref": "#/definitions/text"}, "position": {"$ref": "#/definitions/vec3"}}}},
        "paths": {"type": "array", "minItems": 1, "maxItems": 8, "items": {"type": "object", "additionalProperties": false, "required": ["object", "label", "points"], "properties": {"object": {"$ref": "#/definitions/id"}, "label": {"$ref": "#/definitions/text"}, "points": {"type": "array", "minItems": 2, "maxItems": 16, "items": {"$ref": "#/definitions/id"}}}}},
        "boundaryObjects": {"type": "array", "minItems": 1, "maxItems": 8, "items": {"$ref": "#/definitions/id"}}
      }
    },
    "lattice": {
      "type": "object", "additionalProperties": false,
      "required": ["dimensions", "basis", "translations", "repeats", "boundary", "sites", "cells", "basisIndices"],
      "properties": {
        "dimensions": {"enum": [2, 3]},
        "basis": {"type": "array", "minItems": 1, "maxItems": 2, "items": {"type": "object", "additionalProperties": false, "required": ["label", "position"], "properties": {"label": {"$ref": "#/definitions/text"}, "position": {"$ref": "#/definitions/vec3"}}}},
        "translations": {"type": "array", "minItems": 2, "maxItems": 3, "items": {"$ref": "#/definitions/vec3"}},
        "repeats": {"type": "array", "minItems": 3, "maxItems": 3, "items": {"type": "integer", "minimum": 1, "maximum": 8}},
        "boundary": {"const": "open"},
        "sites": {"$ref": "#/definitions/id"}, "cells": {"$ref": "#/definitions/id"}, "basisIndices": {"$ref": "#/definitions/id"}
      }
    },
    "annotations": {
      "type": "array", "maxItems": 32,
      "items": {"type": "object", "additionalProperties": false, "required": ["id", "text", "position"], "properties": {
        "id": {"$ref": "#/definitions/id"}, "text": {"$ref": "#/definitions/text"}, "position": {"$ref": "#/definitions/vec3"}
      }}
    }
  },
  "definitions": {
    "field": {
      "type": "object", "additionalProperties": false, "required": ["id", "label", "kind", "real", "grid"],
      "properties": {
        "id": {"$ref": "#/definitions/id"}, "label": {"$ref": "#/definitions/text"},
        "kind": {"enum": ["scalar-field", "complex-field"]},
        "real": {"$ref": "#/definitions/id"}, "imaginary": {"$ref": "#/definitions/id"},
        "grid": {
          "type": "object", "additionalProperties": false, "required": ["shape", "origin", "spacing", "order"],
          "properties": {
            "shape": {"type": "array", "minItems": 3, "maxItems": 3, "items": {"type": "integer", "minimum": 3, "maximum": 49}},
            "origin": {"$ref": "#/definitions/vec3"}, "spacing": {"$ref": "#/definitions/vec3"},
            "order": {"const": "xyz-z-fastest"}
          }
        }
      }
    },
    "id": {"type": "string", "pattern": "^[A-Za-z0-9_-]{1,100}$"},
    "text": {"type": "string", "minLength": 1, "maxLength": 240},
    "hash": {"type": "string", "pattern": "^[a-f0-9]{64}$"},
    "vec3": {"type": "array", "minItems": 3, "maxItems": 3, "items": {"type": "number", "minimum": -1000000, "maximum": 1000000}},
    "dataset": {
      "type": "object", "additionalProperties": false,
      "required": ["id", "path", "format", "count", "components", "unit", "bytes", "sha256"],
      "properties": {
        "id": {"$ref": "#/definitions/id"}, "path": {"type": "string", "pattern": "^[A-Za-z0-9_-]{1,100}\\.f64$"},
        "format": {"const": "f64le"}, "count": {"type": "integer", "minimum": 1, "maximum": 300000},
        "components": {"enum": [1, 3]}, "unit": {"$ref": "#/definitions/text"},
        "bytes": {"type": "integer", "minimum": 8, "maximum": 16777216}, "sha256": {"$ref": "#/definitions/hash"}
      }
    },
    "object": {
      "type": "object", "additionalProperties": false,
      "required": ["id", "label", "kind", "positions", "style", "visible"],
      "properties": {
        "id": {"$ref": "#/definitions/id"}, "label": {"$ref": "#/definitions/text"},
        "kind": {"enum": ["point-cloud", "polyline", "segments", "vectors", "mesh"]},
        "positions": {"$ref": "#/definitions/id"}, "values": {"$ref": "#/definitions/id"},
        "indices": {"$ref": "#/definitions/id"}, "scalars": {"$ref": "#/definitions/id"},
        "visible": {"type": "boolean"},
        "colorMap": {"const": "phase"},
        "style": {
          "type": "object", "additionalProperties": false, "required": ["color", "opacity", "size"],
          "properties": {"color": {"type": "string", "pattern": "^#[a-fA-F0-9]{6}$"}, "opacity": {"type": "number", "minimum": 0, "maximum": 1}, "size": {"type": "number", "minimum": 0.001, "maximum": 20}}
        }
      }
    }
  }
} as const;
export default schema;
