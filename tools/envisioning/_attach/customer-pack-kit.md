# 顧客パックの kit（schema とお手本）

このファイル 1 つを M365 Copilot のチャットに添付するか、中身を貼り付けてください。`schema/*.json` は顧客パックの JSON が従う JSON Schema、`examples/mono/` はお手本（デモ）パックです。
各ファイルは「パスの見出し＋コードブロック」で、省略せず全文を載せています。`npm run pack:kit` で再生成できます。

## schema/architecture.json

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "nodes": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string",
            "pattern": "^[a-z0-9][a-z0-9-]*$"
          },
          "createdBy": {
            "type": "string",
            "enum": [
              "ai",
              "human",
              "sample"
            ]
          },
          "classification": {
            "type": "string",
            "enum": [
              "internal",
              "shareable"
            ]
          },
          "sourceIds": {
            "type": "array",
            "items": {
              "type": "string",
              "pattern": "^[a-z0-9][a-z0-9-]*$"
            }
          },
          "label": {
            "type": "string",
            "minLength": 1
          },
          "layer": {
            "type": "string"
          },
          "productId": {
            "type": "string",
            "pattern": "^[a-z0-9][a-z0-9-]*$"
          }
        },
        "required": [
          "id",
          "createdBy",
          "label"
        ],
        "additionalProperties": {}
      }
    },
    "edges": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string",
            "pattern": "^[a-z0-9][a-z0-9-]*$"
          },
          "createdBy": {
            "type": "string",
            "enum": [
              "ai",
              "human",
              "sample"
            ]
          },
          "classification": {
            "type": "string",
            "enum": [
              "internal",
              "shareable"
            ]
          },
          "sourceIds": {
            "type": "array",
            "items": {
              "type": "string",
              "pattern": "^[a-z0-9][a-z0-9-]*$"
            }
          },
          "from": {
            "type": "string",
            "pattern": "^[a-z0-9][a-z0-9-]*$"
          },
          "to": {
            "type": "string",
            "pattern": "^[a-z0-9][a-z0-9-]*$"
          },
          "label": {
            "type": "string"
          }
        },
        "required": [
          "id",
          "createdBy",
          "from",
          "to"
        ],
        "additionalProperties": {}
      }
    },
    "asis": {
      "type": "object",
      "properties": {
        "elements": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "id": {
                "type": "string",
                "pattern": "^[a-z0-9][a-z0-9-]*$"
              },
              "createdBy": {
                "type": "string",
                "enum": [
                  "ai",
                  "human",
                  "sample"
                ]
              },
              "name": {
                "type": "string",
                "minLength": 1
              },
              "kind": {
                "type": "string",
                "enum": [
                  "capability",
                  "stream",
                  "app",
                  "system",
                  "data",
                  "external"
                ]
              },
              "layer": {
                "type": "string"
              },
              "productId": {
                "type": "string",
                "pattern": "^[a-z0-9][a-z0-9-]*$"
              },
              "solutionIds": {
                "type": "array",
                "items": {
                  "type": "string",
                  "pattern": "^[a-z0-9][a-z0-9-]*$"
                }
              }
            },
            "required": [
              "id",
              "createdBy",
              "name"
            ],
            "additionalProperties": {}
          }
        },
        "links": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "from": {
                "type": "string",
                "pattern": "^[a-z0-9][a-z0-9-]*$"
              },
              "to": {
                "type": "string",
                "pattern": "^[a-z0-9][a-z0-9-]*$"
              },
              "label": {
                "type": "string"
              }
            },
            "required": [
              "from",
              "to"
            ],
            "additionalProperties": {}
          }
        }
      },
      "required": [
        "elements"
      ],
      "additionalProperties": {}
    },
    "tobe": {
      "type": "object",
      "properties": {
        "elements": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "id": {
                "type": "string",
                "pattern": "^[a-z0-9][a-z0-9-]*$"
              },
              "createdBy": {
                "type": "string",
                "enum": [
                  "ai",
                  "human",
                  "sample"
                ]
              },
              "name": {
                "type": "string",
                "minLength": 1
              },
              "kind": {
                "type": "string",
                "enum": [
                  "capability",
                  "stream",
                  "app",
                  "system",
                  "data",
                  "external"
                ]
              },
              "layer": {
                "type": "string"
              },
              "productId": {
                "type": "string",
                "pattern": "^[a-z0-9][a-z0-9-]*$"
              },
              "solutionIds": {
                "type": "array",
                "items": {
                  "type": "string",
                  "pattern": "^[a-z0-9][a-z0-9-]*$"
                }
              }
            },
            "required": [
              "id",
              "createdBy",
              "name"
            ],
            "additionalProperties": {}
          }
        },
        "links": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "from": {
                "type": "string",
                "pattern": "^[a-z0-9][a-z0-9-]*$"
              },
              "to": {
                "type": "string",
                "pattern": "^[a-z0-9][a-z0-9-]*$"
              },
              "label": {
                "type": "string"
              }
            },
            "required": [
              "from",
              "to"
            ],
            "additionalProperties": {}
          }
        }
      },
      "required": [
        "elements"
      ],
      "additionalProperties": {}
    }
  },
  "required": [
    "nodes",
    "edges"
  ],
  "additionalProperties": {}
}
```

## schema/brand-profile.json

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "name": {
      "type": "string",
      "minLength": 1
    },
    "colors": {
      "type": "object",
      "properties": {
        "source": {
          "type": "string",
          "minLength": 1
        },
        "retrievedAt": {
          "type": "string",
          "pattern": "^\\d{4}-\\d{2}-\\d{2}$"
        },
        "confidence": {
          "type": "string",
          "enum": [
            "高",
            "中",
            "低",
            "推定"
          ]
        },
        "primary": {
          "type": "string",
          "pattern": "^#[0-9a-fA-F]{6}$"
        }
      },
      "required": [
        "source",
        "retrievedAt",
        "confidence",
        "primary"
      ],
      "additionalProperties": {}
    },
    "logo": {
      "type": "object",
      "properties": {
        "source": {
          "type": "string",
          "minLength": 1
        },
        "retrievedAt": {
          "type": "string",
          "pattern": "^\\d{4}-\\d{2}-\\d{2}$"
        },
        "confidence": {
          "type": "string",
          "enum": [
            "高",
            "中",
            "低",
            "推定"
          ]
        },
        "status": {
          "type": "string",
          "enum": [
            "confirmed",
            "unknown"
          ]
        },
        "path": {
          "type": "string"
        }
      },
      "required": [
        "source",
        "retrievedAt",
        "confidence",
        "status"
      ],
      "additionalProperties": {}
    },
    "fonts": {
      "type": "object",
      "properties": {
        "source": {
          "type": "string",
          "minLength": 1
        },
        "retrievedAt": {
          "type": "string",
          "pattern": "^\\d{4}-\\d{2}-\\d{2}$"
        },
        "confidence": {
          "type": "string",
          "enum": [
            "高",
            "中",
            "低",
            "推定"
          ]
        },
        "primary": {
          "type": "string",
          "minLength": 1
        }
      },
      "required": [
        "source",
        "retrievedAt",
        "confidence",
        "primary"
      ],
      "additionalProperties": {}
    },
    "tone": {
      "type": "object",
      "properties": {
        "source": {
          "type": "string",
          "minLength": 1
        },
        "retrievedAt": {
          "type": "string",
          "pattern": "^\\d{4}-\\d{2}-\\d{2}$"
        },
        "confidence": {
          "type": "string",
          "enum": [
            "高",
            "中",
            "低",
            "推定"
          ]
        },
        "value": {
          "type": "string",
          "minLength": 1
        }
      },
      "required": [
        "source",
        "retrievedAt",
        "confidence",
        "value"
      ],
      "additionalProperties": {}
    }
  },
  "required": [
    "name",
    "colors",
    "logo",
    "fonts",
    "tone"
  ],
  "additionalProperties": {}
}
```

## schema/customer.json

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "screenGuides": {
      "type": "object",
      "properties": {
        "issue-solution": {
          "type": "string",
          "minLength": 1,
          "maxLength": 120
        },
        "priority": {
          "type": "string",
          "minLength": 1,
          "maxLength": 120
        },
        "summary": {
          "type": "string",
          "minLength": 1,
          "maxLength": 120
        },
        "matrix": {
          "type": "string",
          "minLength": 1,
          "maxLength": 120
        },
        "ranking": {
          "type": "string",
          "minLength": 1,
          "maxLength": 120
        },
        "knowledge-graph": {
          "type": "string",
          "minLength": 1,
          "maxLength": 120
        },
        "business-graph": {
          "type": "string",
          "minLength": 1,
          "maxLength": 120
        },
        "architecture": {
          "type": "string",
          "minLength": 1,
          "maxLength": 120
        },
        "discussion-tree": {
          "type": "string",
          "minLength": 1,
          "maxLength": 120
        },
        "table": {
          "type": "string",
          "minLength": 1,
          "maxLength": 120
        },
        "gantt": {
          "type": "string",
          "minLength": 1,
          "maxLength": 120
        },
        "map": {
          "type": "string",
          "minLength": 1,
          "maxLength": 120
        },
        "kpi-okr": {
          "type": "string",
          "minLength": 1,
          "maxLength": 120
        },
        "twin-view": {
          "type": "string",
          "minLength": 1,
          "maxLength": 120
        },
        "sources": {
          "type": "string",
          "minLength": 1,
          "maxLength": 120
        },
        "usecase": {
          "type": "string",
          "minLength": 1,
          "maxLength": 120
        },
        "data-catalog": {
          "type": "string",
          "minLength": 1,
          "maxLength": 120
        },
        "spatial-view": {
          "type": "string",
          "minLength": 1,
          "maxLength": 120
        },
        "whiteboard": {
          "type": "string",
          "minLength": 1,
          "maxLength": 120
        },
        "themes": {
          "type": "string",
          "minLength": 1,
          "maxLength": 120
        },
        "settings": {
          "type": "string",
          "minLength": 1,
          "maxLength": 120
        },
        "genai-scenario": {
          "type": "string",
          "minLength": 1,
          "maxLength": 120
        },
        "chat": {
          "type": "string",
          "minLength": 1,
          "maxLength": 120
        },
        "mock-app": {
          "type": "string",
          "minLength": 1,
          "maxLength": 120
        }
      },
      "required": [
        "issue-solution",
        "priority",
        "summary",
        "matrix",
        "ranking",
        "knowledge-graph",
        "business-graph",
        "architecture",
        "discussion-tree",
        "table",
        "gantt",
        "map",
        "kpi-okr",
        "twin-view",
        "sources",
        "usecase",
        "data-catalog",
        "spatial-view",
        "whiteboard",
        "themes",
        "settings",
        "genai-scenario",
        "chat"
      ],
      "additionalProperties": false
    },
    "discussionTheme": {
      "type": "object",
      "properties": {
        "id": {
          "type": "string",
          "pattern": "^[a-z0-9][a-z0-9-]*$"
        },
        "title": {
          "type": "string",
          "minLength": 1
        },
        "issueId": {
          "type": "string",
          "pattern": "^[a-z0-9][a-z0-9-]*$"
        },
        "options": {
          "type": "string",
          "minLength": 1
        },
        "recommendation": {
          "type": "string",
          "minLength": 1
        },
        "decisions": {
          "type": "string",
          "minLength": 1
        },
        "actions": {
          "minItems": 1,
          "type": "array",
          "items": {
            "type": "string",
            "minLength": 1
          }
        }
      },
      "required": [
        "id",
        "title",
        "options",
        "recommendation",
        "decisions",
        "actions"
      ],
      "additionalProperties": {}
    },
    "name": {
      "type": "string",
      "minLength": 1
    },
    "projectName": {
      "type": "string",
      "minLength": 1
    },
    "templateVersion": {
      "type": "string",
      "minLength": 1
    },
    "locale": {
      "default": "ja",
      "type": "string"
    },
    "industryPreset": {
      "type": "string"
    },
    "createdBy": {
      "type": "string",
      "enum": [
        "ai",
        "human",
        "sample"
      ]
    },
    "coreObject": {
      "type": "object",
      "properties": {
        "candidates": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "id": {
                "type": "string",
                "pattern": "^[a-z0-9][a-z0-9-]*$"
              },
              "label": {
                "type": "string",
                "minLength": 1
              },
              "name": {
                "type": "string",
                "minLength": 1
              },
              "summary": {
                "type": "string"
              },
              "scores": {
                "type": "object",
                "propertyNames": {
                  "type": "string"
                },
                "additionalProperties": {
                  "type": "string"
                }
              }
            },
            "required": [
              "id",
              "label"
            ],
            "additionalProperties": {}
          }
        },
        "selectedId": {
          "type": "string",
          "pattern": "^[a-z0-9][a-z0-9-]*$"
        },
        "criteria": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "id": {
                "type": "string",
                "pattern": "^[a-z0-9][a-z0-9-]*$"
              },
              "label": {
                "type": "string",
                "minLength": 1
              }
            },
            "required": [
              "id",
              "label"
            ],
            "additionalProperties": {}
          }
        },
        "reason": {
          "type": "string"
        }
      },
      "required": [
        "candidates"
      ],
      "additionalProperties": {}
    },
    "glossary": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "term": {
            "type": "string",
            "minLength": 1
          },
          "definition": {
            "type": "string",
            "minLength": 1
          }
        },
        "required": [
          "term",
          "definition"
        ],
        "additionalProperties": {}
      }
    },
    "okr": {
      "type": "object",
      "properties": {
        "updatedAt": {
          "type": "string",
          "minLength": 1
        },
        "objectives": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "objective": {
                "type": "string",
                "minLength": 1
              },
              "keyResults": {
                "type": "array",
                "items": {
                  "type": "object",
                  "properties": {
                    "id": {
                      "type": "string",
                      "pattern": "^[a-z0-9][a-z0-9-]*$"
                    },
                    "name": {
                      "type": "string",
                      "minLength": 1
                    },
                    "solutionIds": {
                      "type": "array",
                      "items": {
                        "type": "string",
                        "pattern": "^[a-z0-9][a-z0-9-]*$"
                      }
                    },
                    "kpi": {
                      "type": "object",
                      "properties": {
                        "name": {
                          "type": "string",
                          "minLength": 1
                        },
                        "unit": {
                          "type": "string",
                          "minLength": 1
                        },
                        "baseline": {
                          "type": "number"
                        },
                        "current": {
                          "type": "number"
                        },
                        "target": {
                          "type": "number"
                        },
                        "due": {
                          "type": "string"
                        },
                        "stages": {
                          "type": "object",
                          "properties": {
                            "boundaries": {
                              "type": "array",
                              "prefixItems": [
                                {
                                  "type": "number"
                                },
                                {
                                  "type": "number"
                                }
                              ],
                              "items": false,
                              "minItems": 2,
                              "maxItems": 2
                            },
                            "betterWhen": {
                              "type": "string",
                              "enum": [
                                "high",
                                "low"
                              ]
                            }
                          },
                          "required": [
                            "boundaries"
                          ],
                          "additionalProperties": {}
                        }
                      },
                      "required": [
                        "name",
                        "unit",
                        "baseline",
                        "current",
                        "target"
                      ],
                      "additionalProperties": {}
                    }
                  },
                  "required": [
                    "name",
                    "kpi"
                  ],
                  "additionalProperties": {}
                }
              }
            },
            "required": [
              "objective",
              "keyResults"
            ],
            "additionalProperties": {}
          }
        }
      },
      "required": [
        "objectives"
      ],
      "additionalProperties": {}
    },
    "useCases": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string",
            "pattern": "^[a-z0-9][a-z0-9-]*$"
          },
          "name": {
            "type": "string",
            "minLength": 1
          },
          "summary": {
            "type": "string",
            "minLength": 1
          },
          "persona": {
            "type": "string",
            "enum": [
              "経営層",
              "事業部門",
              "IT",
              "現場"
            ]
          },
          "steps": {
            "minItems": 1,
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "title": {
                  "type": "string",
                  "minLength": 1
                },
                "description": {
                  "type": "string"
                }
              },
              "required": [
                "title"
              ],
              "additionalProperties": {}
            }
          },
          "effect": {
            "type": "string",
            "minLength": 1
          },
          "solutionId": {
            "type": "string",
            "pattern": "^[a-z0-9][a-z0-9-]*$"
          },
          "kpiNames": {
            "minItems": 1,
            "type": "array",
            "items": {
              "type": "string",
              "minLength": 1
            }
          }
        },
        "required": [
          "id",
          "name",
          "summary",
          "persona",
          "steps",
          "effect",
          "solutionId",
          "kpiNames"
        ],
        "additionalProperties": {}
      }
    },
    "fictionalNote": {
      "type": "string",
      "minLength": 1
    }
  },
  "required": [
    "name",
    "projectName",
    "templateVersion",
    "createdBy",
    "coreObject"
  ],
  "additionalProperties": {}
}
```

## schema/entities.json

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "levels": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "depth": {
            "type": "integer",
            "minimum": 0,
            "maximum": 9007199254740991
          },
          "name": {
            "type": "string",
            "minLength": 1
          },
          "lodThreshold": {
            "type": "number",
            "exclusiveMinimum": 0
          },
          "description": {
            "type": "string",
            "minLength": 1
          },
          "color": {
            "type": "string",
            "pattern": "^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$"
          },
          "kpi": {
            "type": "string",
            "minLength": 1
          },
          "sourceIds": {
            "minItems": 1,
            "type": "array",
            "items": {
              "type": "string",
              "pattern": "^[a-z0-9][a-z0-9-]*$"
            }
          }
        },
        "required": [
          "depth",
          "lodThreshold",
          "description",
          "color",
          "kpi",
          "sourceIds"
        ],
        "additionalProperties": {}
      }
    },
    "entities": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string",
            "pattern": "^[a-z0-9][a-z0-9-]*$"
          },
          "createdBy": {
            "type": "string",
            "enum": [
              "ai",
              "human",
              "sample"
            ]
          },
          "classification": {
            "type": "string",
            "enum": [
              "internal",
              "shareable"
            ]
          },
          "sourceIds": {
            "type": "array",
            "items": {
              "type": "string",
              "pattern": "^[a-z0-9][a-z0-9-]*$"
            }
          },
          "type": {
            "type": "string",
            "minLength": 1
          },
          "name": {
            "type": "string",
            "minLength": 1
          },
          "parentId": {
            "anyOf": [
              {
                "type": "string",
                "pattern": "^[a-z0-9][a-z0-9-]*$"
              },
              {
                "type": "null"
              }
            ]
          },
          "location": {
            "type": "object",
            "properties": {
              "lat": {
                "type": "number",
                "minimum": -90,
                "maximum": 90
              },
              "lng": {
                "type": "number",
                "minimum": -180,
                "maximum": 180
              }
            },
            "required": [
              "lat",
              "lng"
            ],
            "additionalProperties": {}
          },
          "metrics": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "label": {
                  "type": "string",
                  "minLength": 1
                },
                "value": {
                  "type": "number"
                },
                "unit": {
                  "type": "string"
                },
                "stages": {
                  "type": "object",
                  "properties": {
                    "boundaries": {
                      "type": "array",
                      "prefixItems": [
                        {
                          "type": "number"
                        },
                        {
                          "type": "number"
                        }
                      ],
                      "items": false,
                      "minItems": 2,
                      "maxItems": 2
                    },
                    "betterWhen": {
                      "type": "string",
                      "enum": [
                        "high",
                        "low"
                      ]
                    }
                  },
                  "required": [
                    "boundaries"
                  ],
                  "additionalProperties": {}
                },
                "sourceIds": {
                  "minItems": 1,
                  "type": "array",
                  "items": {
                    "type": "string",
                    "pattern": "^[a-z0-9][a-z0-9-]*$"
                  }
                }
              },
              "required": [
                "label",
                "value",
                "sourceIds"
              ],
              "additionalProperties": {}
            }
          },
          "world": {
            "type": "string",
            "enum": [
              "real",
              "digital"
            ]
          },
          "kind": {
            "type": "string",
            "enum": [
              "site",
              "equipment",
              "person",
              "organization",
              "operation",
              "thing",
              "event",
              "floor",
              "room",
              "data",
              "model",
              "system",
              "ui-component",
              "metric"
            ]
          },
          "layer": {
            "type": "string",
            "enum": [
              "operations",
              "experience",
              "insights"
            ]
          }
        },
        "required": [
          "id",
          "createdBy",
          "type",
          "name"
        ],
        "additionalProperties": {}
      }
    },
    "relations": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string",
            "pattern": "^[a-z0-9][a-z0-9-]*$"
          },
          "from": {
            "type": "string",
            "pattern": "^[a-z0-9][a-z0-9-]*$"
          },
          "to": {
            "type": "string",
            "pattern": "^[a-z0-9][a-z0-9-]*$"
          },
          "meaning": {
            "type": "string",
            "enum": [
              "influences",
              "dependsOn",
              "causes",
              "owns",
              "derivedFrom",
              "memberOf",
              "locatedIn",
              "measures",
              "controls"
            ]
          },
          "label": {
            "type": "string",
            "minLength": 1
          },
          "sourceIds": {
            "type": "array",
            "items": {
              "type": "string",
              "pattern": "^[a-z0-9][a-z0-9-]*$"
            }
          }
        },
        "required": [
          "from",
          "to",
          "meaning"
        ],
        "additionalProperties": {}
      }
    },
    "twins": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "realId": {
            "type": "string",
            "pattern": "^[a-z0-9][a-z0-9-]*$"
          },
          "digitalId": {
            "type": "string",
            "pattern": "^[a-z0-9][a-z0-9-]*$"
          },
          "relation": {
            "type": "string",
            "enum": [
              "represents",
              "measures",
              "records",
              "displays"
            ]
          },
          "sourceIds": {
            "minItems": 1,
            "type": "array",
            "items": {
              "type": "string",
              "pattern": "^[a-z0-9][a-z0-9-]*$"
            }
          }
        },
        "required": [
          "realId",
          "digitalId",
          "relation",
          "sourceIds"
        ],
        "additionalProperties": {}
      }
    },
    "flows": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string",
            "pattern": "^[a-z0-9][a-z0-9-]*$"
          },
          "createdBy": {
            "type": "string",
            "enum": [
              "ai",
              "human",
              "sample"
            ]
          },
          "classification": {
            "type": "string",
            "enum": [
              "internal",
              "shareable"
            ]
          },
          "sourceIds": {
            "type": "array",
            "items": {
              "type": "string",
              "pattern": "^[a-z0-9][a-z0-9-]*$"
            }
          },
          "from": {
            "type": "string",
            "pattern": "^[a-z0-9][a-z0-9-]*$"
          },
          "to": {
            "type": "string",
            "pattern": "^[a-z0-9][a-z0-9-]*$"
          },
          "label": {
            "type": "string",
            "minLength": 1
          },
          "kind": {
            "type": "string"
          },
          "volume": {
            "type": "number",
            "minimum": 0
          },
          "unit": {
            "type": "string"
          },
          "peakHour": {
            "type": "number",
            "minimum": 0,
            "maximum": 23
          }
        },
        "required": [
          "id",
          "createdBy",
          "from",
          "to",
          "label"
        ],
        "additionalProperties": {}
      }
    }
  },
  "required": [
    "entities"
  ],
  "additionalProperties": {}
}
```

## schema/issues.json

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "issues": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string",
            "pattern": "^[a-z0-9][a-z0-9-]*$"
          },
          "createdBy": {
            "type": "string",
            "enum": [
              "ai",
              "human",
              "sample"
            ]
          },
          "classification": {
            "type": "string",
            "enum": [
              "internal",
              "shareable"
            ]
          },
          "sourceIds": {
            "type": "array",
            "items": {
              "type": "string",
              "pattern": "^[a-z0-9][a-z0-9-]*$"
            }
          },
          "parentId": {
            "anyOf": [
              {
                "type": "string",
                "pattern": "^[a-z0-9][a-z0-9-]*$"
              },
              {
                "type": "null"
              }
            ]
          },
          "title": {
            "type": "string",
            "minLength": 1
          },
          "hypothesis": {
            "type": "string"
          },
          "origin": {
            "type": "string"
          },
          "audience": {
            "type": "string",
            "enum": [
              "internal",
              "external"
            ]
          },
          "personas": {
            "type": "array",
            "items": {
              "type": "string",
              "minLength": 1
            }
          },
          "evaluation": {
            "type": "object",
            "properties": {
              "priority": {
                "type": "object",
                "properties": {
                  "value": {
                    "anyOf": [
                      {
                        "type": "number"
                      },
                      {
                        "type": "string",
                        "minLength": 1
                      }
                    ]
                  },
                  "unit": {
                    "type": "string"
                  },
                  "sourceIds": {
                    "minItems": 1,
                    "type": "array",
                    "items": {
                      "type": "string",
                      "pattern": "^[a-z0-9][a-z0-9-]*$"
                    }
                  }
                },
                "required": [
                  "value",
                  "sourceIds"
                ],
                "additionalProperties": {}
              },
              "cost": {
                "type": "object",
                "properties": {
                  "value": {
                    "anyOf": [
                      {
                        "type": "number"
                      },
                      {
                        "type": "string",
                        "minLength": 1
                      }
                    ]
                  },
                  "unit": {
                    "type": "string"
                  },
                  "sourceIds": {
                    "minItems": 1,
                    "type": "array",
                    "items": {
                      "type": "string",
                      "pattern": "^[a-z0-9][a-z0-9-]*$"
                    }
                  }
                },
                "required": [
                  "value",
                  "sourceIds"
                ],
                "additionalProperties": {}
              },
              "roi": {
                "type": "object",
                "properties": {
                  "value": {
                    "anyOf": [
                      {
                        "type": "number"
                      },
                      {
                        "type": "string",
                        "minLength": 1
                      }
                    ]
                  },
                  "unit": {
                    "type": "string"
                  },
                  "sourceIds": {
                    "minItems": 1,
                    "type": "array",
                    "items": {
                      "type": "string",
                      "pattern": "^[a-z0-9][a-z0-9-]*$"
                    }
                  }
                },
                "required": [
                  "value",
                  "sourceIds"
                ],
                "additionalProperties": {}
              },
              "feasibility": {
                "type": "object",
                "properties": {
                  "value": {
                    "anyOf": [
                      {
                        "type": "number"
                      },
                      {
                        "type": "string",
                        "minLength": 1
                      }
                    ]
                  },
                  "unit": {
                    "type": "string"
                  },
                  "sourceIds": {
                    "minItems": 1,
                    "type": "array",
                    "items": {
                      "type": "string",
                      "pattern": "^[a-z0-9][a-z0-9-]*$"
                    }
                  }
                },
                "required": [
                  "value",
                  "sourceIds"
                ],
                "additionalProperties": {}
              },
              "risk": {
                "type": "object",
                "properties": {
                  "value": {
                    "anyOf": [
                      {
                        "type": "number"
                      },
                      {
                        "type": "string",
                        "minLength": 1
                      }
                    ]
                  },
                  "unit": {
                    "type": "string"
                  },
                  "sourceIds": {
                    "minItems": 1,
                    "type": "array",
                    "items": {
                      "type": "string",
                      "pattern": "^[a-z0-9][a-z0-9-]*$"
                    }
                  }
                },
                "required": [
                  "value",
                  "sourceIds"
                ],
                "additionalProperties": {}
              },
              "scores": {
                "type": "object",
                "propertyNames": {
                  "type": "string"
                },
                "additionalProperties": {
                  "type": "object",
                  "properties": {
                    "ai": {
                      "type": "number",
                      "minimum": 1,
                      "maximum": 5
                    },
                    "decided": {
                      "type": "number",
                      "minimum": 1,
                      "maximum": 5
                    },
                    "sourceIds": {
                      "type": "array",
                      "items": {
                        "type": "string",
                        "pattern": "^[a-z0-9][a-z0-9-]*$"
                      }
                    }
                  },
                  "additionalProperties": {}
                }
              }
            },
            "additionalProperties": {}
          },
          "causes": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "id": {
                  "type": "string",
                  "pattern": "^[a-z0-9][a-z0-9-]*$"
                },
                "title": {
                  "type": "string",
                  "minLength": 1
                }
              },
              "required": [
                "id",
                "title"
              ],
              "additionalProperties": {}
            }
          }
        },
        "required": [
          "id",
          "createdBy",
          "title",
          "audience"
        ],
        "additionalProperties": {}
      }
    },
    "solutions": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string",
            "pattern": "^[a-z0-9][a-z0-9-]*$"
          },
          "createdBy": {
            "type": "string",
            "enum": [
              "ai",
              "human",
              "sample"
            ]
          },
          "classification": {
            "type": "string",
            "enum": [
              "internal",
              "shareable"
            ]
          },
          "sourceIds": {
            "type": "array",
            "items": {
              "type": "string",
              "pattern": "^[a-z0-9][a-z0-9-]*$"
            }
          },
          "issueId": {
            "type": "string",
            "pattern": "^[a-z0-9][a-z0-9-]*$"
          },
          "issueIds": {
            "type": "array",
            "items": {
              "type": "string",
              "pattern": "^[a-z0-9][a-z0-9-]*$"
            }
          },
          "title": {
            "type": "string",
            "minLength": 1
          },
          "effects": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "id": {
                  "type": "string",
                  "pattern": "^[a-z0-9][a-z0-9-]*$"
                },
                "title": {
                  "type": "string",
                  "minLength": 1
                }
              },
              "required": [
                "id",
                "title"
              ],
              "additionalProperties": {}
            }
          },
          "genAiValues": {
            "type": "array",
            "items": {
              "type": "string",
              "enum": [
                "parameter",
                "fusion",
                "chatRag",
                "workflow"
              ]
            }
          },
          "productIds": {
            "type": "array",
            "items": {
              "type": "string",
              "pattern": "^[a-z0-9][a-z0-9-]*$"
            }
          },
          "productFits": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "productId": {
                  "type": "string",
                  "pattern": "^[a-z0-9][a-z0-9-]*$"
                },
                "reason": {
                  "type": "string",
                  "minLength": 1
                }
              },
              "required": [
                "productId",
                "reason"
              ],
              "additionalProperties": {}
            }
          }
        },
        "required": [
          "id",
          "createdBy",
          "issueId",
          "title"
        ],
        "additionalProperties": {}
      }
    }
  },
  "required": [
    "issues",
    "solutions"
  ],
  "additionalProperties": {}
}
```

## schema/mocks.json

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "mocks": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string",
            "pattern": "^[a-z0-9][a-z0-9-]*$"
          },
          "createdBy": {
            "type": "string",
            "enum": [
              "ai",
              "human",
              "sample"
            ]
          },
          "classification": {
            "type": "string",
            "enum": [
              "internal",
              "shareable"
            ]
          },
          "sourceIds": {
            "type": "array",
            "items": {
              "type": "string",
              "pattern": "^[a-z0-9][a-z0-9-]*$"
            }
          },
          "title": {
            "type": "string",
            "minLength": 1
          },
          "featureId": {
            "type": "string",
            "pattern": "^[a-z0-9][a-z0-9-]*$"
          },
          "solutionId": {
            "type": "string",
            "pattern": "^[a-z0-9][a-z0-9-]*$"
          },
          "screens": {
            "minItems": 1,
            "maxItems": 3,
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "title": {
                  "type": "string",
                  "minLength": 1
                },
                "description": {
                  "type": "string"
                },
                "fields": {
                  "type": "array",
                  "items": {
                    "type": "object",
                    "properties": {
                      "label": {
                        "type": "string",
                        "minLength": 1
                      },
                      "kind": {
                        "type": "string",
                        "enum": [
                          "text",
                          "number",
                          "select",
                          "date",
                          "textarea"
                        ]
                      },
                      "value": {
                        "type": "string"
                      },
                      "options": {
                        "type": "array",
                        "items": {
                          "type": "string",
                          "minLength": 1
                        }
                      }
                    },
                    "required": [
                      "label"
                    ],
                    "additionalProperties": {}
                  }
                },
                "items": {
                  "type": "array",
                  "items": {
                    "type": "string",
                    "minLength": 1
                  }
                }
              },
              "required": [
                "title"
              ],
              "additionalProperties": {}
            }
          }
        },
        "required": [
          "id",
          "createdBy",
          "title"
        ],
        "additionalProperties": {}
      }
    }
  },
  "required": [
    "mocks"
  ],
  "additionalProperties": {}
}
```

## schema/plan.json

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "features": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string",
            "pattern": "^[a-z0-9][a-z0-9-]*$"
          },
          "createdBy": {
            "type": "string",
            "enum": [
              "ai",
              "human",
              "sample"
            ]
          },
          "classification": {
            "type": "string",
            "enum": [
              "internal",
              "shareable"
            ]
          },
          "sourceIds": {
            "type": "array",
            "items": {
              "type": "string",
              "pattern": "^[a-z0-9][a-z0-9-]*$"
            }
          },
          "title": {
            "type": "string",
            "minLength": 1
          },
          "issueIds": {
            "type": "array",
            "items": {
              "type": "string",
              "pattern": "^[a-z0-9][a-z0-9-]*$"
            }
          }
        },
        "required": [
          "id",
          "createdBy",
          "title"
        ],
        "additionalProperties": {}
      }
    },
    "tasks": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string",
            "pattern": "^[a-z0-9][a-z0-9-]*$"
          },
          "createdBy": {
            "type": "string",
            "enum": [
              "ai",
              "human",
              "sample"
            ]
          },
          "classification": {
            "type": "string",
            "enum": [
              "internal",
              "shareable"
            ]
          },
          "sourceIds": {
            "type": "array",
            "items": {
              "type": "string",
              "pattern": "^[a-z0-9][a-z0-9-]*$"
            }
          },
          "title": {
            "type": "string",
            "minLength": 1
          },
          "featureId": {
            "type": "string",
            "pattern": "^[a-z0-9][a-z0-9-]*$"
          },
          "parentId": {
            "anyOf": [
              {
                "type": "string",
                "pattern": "^[a-z0-9][a-z0-9-]*$"
              },
              {
                "type": "null"
              }
            ]
          },
          "start": {
            "type": "string"
          },
          "end": {
            "type": "string"
          },
          "owner": {
            "type": "string",
            "minLength": 1
          },
          "work": {
            "type": "string",
            "minLength": 1
          },
          "dependsOn": {
            "type": "array",
            "items": {
              "type": "string",
              "pattern": "^[a-z0-9][a-z0-9-]*$"
            }
          }
        },
        "required": [
          "id",
          "createdBy",
          "title"
        ],
        "additionalProperties": {}
      }
    }
  },
  "required": [
    "features",
    "tasks"
  ],
  "additionalProperties": {}
}
```

## schema/products.json

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "products": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string",
            "pattern": "^[a-z0-9][a-z0-9-]*$"
          },
          "createdBy": {
            "type": "string",
            "enum": [
              "ai",
              "human",
              "sample"
            ]
          },
          "classification": {
            "type": "string",
            "enum": [
              "internal",
              "shareable"
            ]
          },
          "sourceIds": {
            "type": "array",
            "items": {
              "type": "string",
              "pattern": "^[a-z0-9][a-z0-9-]*$"
            }
          },
          "name": {
            "type": "string",
            "minLength": 1
          },
          "vendor": {
            "type": "string"
          },
          "summary": {
            "type": "string"
          },
          "metrics": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "label": {
                  "type": "string",
                  "minLength": 1
                },
                "value": {
                  "type": "number"
                },
                "unit": {
                  "type": "string"
                },
                "stages": {
                  "type": "object",
                  "properties": {
                    "boundaries": {
                      "type": "array",
                      "prefixItems": [
                        {
                          "type": "number"
                        },
                        {
                          "type": "number"
                        }
                      ],
                      "items": false,
                      "minItems": 2,
                      "maxItems": 2
                    },
                    "betterWhen": {
                      "type": "string",
                      "enum": [
                        "high",
                        "low"
                      ]
                    }
                  },
                  "required": [
                    "boundaries"
                  ],
                  "additionalProperties": {}
                },
                "sourceIds": {
                  "minItems": 1,
                  "type": "array",
                  "items": {
                    "type": "string",
                    "pattern": "^[a-z0-9][a-z0-9-]*$"
                  }
                }
              },
              "required": [
                "label",
                "value",
                "sourceIds"
              ],
              "additionalProperties": {}
            }
          }
        },
        "required": [
          "id",
          "createdBy",
          "name"
        ],
        "additionalProperties": {}
      }
    }
  },
  "required": [
    "products"
  ],
  "additionalProperties": {}
}
```

## schema/show.json

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "chapters": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string",
            "pattern": "^[a-z0-9][a-z0-9-]*$"
          },
          "createdBy": {
            "type": "string",
            "enum": [
              "ai",
              "human",
              "sample"
            ]
          },
          "classification": {
            "type": "string",
            "enum": [
              "internal",
              "shareable"
            ]
          },
          "sourceIds": {
            "type": "array",
            "items": {
              "type": "string",
              "pattern": "^[a-z0-9][a-z0-9-]*$"
            }
          },
          "title": {
            "type": "string",
            "minLength": 1
          },
          "topics": {
            "default": [],
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "id": {
                  "type": "string",
                  "pattern": "^[a-z0-9][a-z0-9-]*$"
                },
                "createdBy": {
                  "type": "string",
                  "enum": [
                    "ai",
                    "human",
                    "sample"
                  ]
                },
                "classification": {
                  "type": "string",
                  "enum": [
                    "internal",
                    "shareable"
                  ]
                },
                "sourceIds": {
                  "type": "array",
                  "items": {
                    "type": "string",
                    "pattern": "^[a-z0-9][a-z0-9-]*$"
                  }
                },
                "title": {
                  "type": "string",
                  "minLength": 1
                },
                "entityIds": {
                  "type": "array",
                  "items": {
                    "type": "string",
                    "pattern": "^[a-z0-9][a-z0-9-]*$"
                  }
                },
                "type": {
                  "type": "string",
                  "minLength": 1
                },
                "telop": {
                  "type": "object",
                  "properties": {
                    "text": {
                      "type": "string",
                      "minLength": 1
                    },
                    "sourceIds": {
                      "type": "array",
                      "items": {
                        "type": "string",
                        "pattern": "^[a-z0-9][a-z0-9-]*$"
                      }
                    }
                  },
                  "required": [
                    "text"
                  ],
                  "additionalProperties": {}
                },
                "beforeAfter": {
                  "type": "object",
                  "properties": {
                    "before": {
                      "type": "object",
                      "properties": {
                        "label": {
                          "type": "string"
                        },
                        "text": {
                          "type": "string",
                          "minLength": 1
                        }
                      },
                      "required": [
                        "text"
                      ],
                      "additionalProperties": {}
                    },
                    "after": {
                      "type": "object",
                      "properties": {
                        "label": {
                          "type": "string"
                        },
                        "text": {
                          "type": "string",
                          "minLength": 1
                        }
                      },
                      "required": [
                        "text"
                      ],
                      "additionalProperties": {}
                    }
                  },
                  "required": [
                    "before",
                    "after"
                  ],
                  "additionalProperties": {}
                },
                "narration": {
                  "type": "string",
                  "minLength": 1
                },
                "quiz": {
                  "type": "object",
                  "properties": {
                    "title": {
                      "type": "string"
                    },
                    "questions": {
                      "minItems": 1,
                      "type": "array",
                      "items": {
                        "type": "object",
                        "properties": {
                          "id": {
                            "type": "string",
                            "minLength": 1
                          },
                          "text": {
                            "type": "string",
                            "minLength": 1
                          },
                          "options": {
                            "minItems": 1,
                            "type": "array",
                            "items": {
                              "type": "object",
                              "properties": {
                                "label": {
                                  "type": "string",
                                  "minLength": 1
                                },
                                "score": {
                                  "type": "number"
                                }
                              },
                              "required": [
                                "label",
                                "score"
                              ],
                              "additionalProperties": {}
                            }
                          }
                        },
                        "required": [
                          "text",
                          "options"
                        ],
                        "additionalProperties": {}
                      }
                    },
                    "levels": {
                      "type": "array",
                      "items": {
                        "type": "object",
                        "properties": {
                          "minScore": {
                            "type": "number"
                          },
                          "label": {
                            "type": "string",
                            "minLength": 1
                          },
                          "description": {
                            "type": "string"
                          }
                        },
                        "required": [
                          "minScore",
                          "label"
                        ],
                        "additionalProperties": {}
                      }
                    }
                  },
                  "required": [
                    "questions"
                  ],
                  "additionalProperties": {}
                },
                "roi": {
                  "type": "object",
                  "properties": {
                    "label": {
                      "type": "string"
                    },
                    "value": {
                      "type": "number"
                    },
                    "unit": {
                      "type": "string"
                    },
                    "caption": {
                      "type": "string"
                    },
                    "sourceIds": {
                      "minItems": 1,
                      "type": "array",
                      "items": {
                        "type": "string",
                        "pattern": "^[a-z0-9][a-z0-9-]*$"
                      }
                    }
                  },
                  "required": [
                    "value",
                    "sourceIds"
                  ],
                  "additionalProperties": {}
                }
              },
              "required": [
                "id",
                "createdBy",
                "title"
              ],
              "additionalProperties": {}
            }
          }
        },
        "required": [
          "id",
          "createdBy",
          "title"
        ],
        "additionalProperties": {}
      }
    }
  },
  "required": [
    "chapters"
  ],
  "additionalProperties": {}
}
```

## schema/sources.json

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "sources": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string",
            "pattern": "^[a-z0-9][a-z0-9-]*$"
          },
          "createdBy": {
            "type": "string",
            "enum": [
              "ai",
              "human",
              "sample"
            ]
          },
          "kind": {
            "type": "string",
            "enum": [
              "web",
              "workiq",
              "document",
              "interview",
              "sample"
            ]
          },
          "title": {
            "type": "string",
            "minLength": 1
          },
          "url": {
            "type": "string"
          },
          "retrievedAt": {
            "type": "string",
            "pattern": "^\\d{4}-\\d{2}-\\d{2}$"
          },
          "confidence": {
            "type": "string",
            "enum": [
              "高",
              "中",
              "低",
              "推定"
            ]
          },
          "classification": {
            "type": "string",
            "enum": [
              "internal",
              "shareable"
            ]
          }
        },
        "required": [
          "id",
          "createdBy",
          "kind",
          "title",
          "retrievedAt",
          "confidence"
        ],
        "additionalProperties": {}
      }
    }
  },
  "required": [
    "sources"
  ],
  "additionalProperties": {}
}
```

## examples/mono/public/data/architecture.json

```json
{
  "nodes": [
    { "id": "arch-mono-edge", "createdBy": "sample", "label": "設備のゲートウェイ", "layer": "現場" },
    { "id": "arch-mono-app", "createdBy": "sample", "label": "現場入力アプリ", "layer": "アプリ", "productId": "prod-mono-002" },
    { "id": "arch-mono-analytics", "createdBy": "sample", "label": "予兆検知", "layer": "分析", "productId": "prod-mono-001" }
  ],
  "edges": [
    { "id": "edge-mono-001", "createdBy": "sample", "from": "arch-mono-edge", "to": "arch-mono-analytics", "label": "稼働データ" },
    { "id": "edge-mono-002", "createdBy": "sample", "from": "arch-mono-app", "to": "arch-mono-analytics", "label": "停止原因" }
  ],
  "asis": {
    "elements": [
      { "id": "cap-mono-maintenance", "createdBy": "sample", "name": "設備保全", "kind": "capability", "layer": "Capability Map" },
      { "id": "cap-mono-production", "createdBy": "sample", "name": "生産管理", "kind": "capability", "layer": "Capability Map" },
      { "id": "cap-mono-quality", "createdBy": "sample", "name": "品質検査", "kind": "capability", "layer": "Capability Map" },
      { "id": "vs-mono-plan", "createdBy": "sample", "name": "計画", "kind": "stream", "layer": "バリューストリーム" },
      { "id": "vs-mono-run", "createdBy": "sample", "name": "稼働", "kind": "stream", "layer": "バリューストリーム" },
      { "id": "vs-mono-stop", "createdBy": "sample", "name": "停止対応", "kind": "stream", "layer": "バリューストリーム" },
      { "id": "sys-mono-paper", "createdBy": "sample", "name": "紙の停止記録", "kind": "app", "layer": "アプリ" },
      { "id": "sys-mono-edge", "createdBy": "sample", "name": "設備のゲートウェイ", "kind": "system", "layer": "現場" },
      { "id": "sys-mono-mes", "createdBy": "sample", "name": "生産管理システム", "kind": "system", "layer": "基幹" }
    ],
    "links": [
      { "from": "sys-mono-edge", "to": "sys-mono-mes", "label": "稼働実績" },
      { "from": "sys-mono-paper", "to": "sys-mono-mes", "label": "停止原因（翌日入力）" }
    ]
  },
  "tobe": {
    "elements": [
      { "id": "cap-mono-maintenance", "createdBy": "sample", "name": "設備保全（予兆ベース）", "kind": "capability", "layer": "Capability Map" },
      { "id": "cap-mono-production", "createdBy": "sample", "name": "生産管理", "kind": "capability", "layer": "Capability Map" },
      { "id": "cap-mono-predict", "createdBy": "sample", "name": "予兆検知", "kind": "capability", "layer": "Capability Map", "solutionIds": ["sol-mono-001"] },
      { "id": "vs-mono-plan", "createdBy": "sample", "name": "計画", "kind": "stream", "layer": "バリューストリーム" },
      { "id": "vs-mono-run", "createdBy": "sample", "name": "稼働", "kind": "stream", "layer": "バリューストリーム" },
      { "id": "vs-mono-stop", "createdBy": "sample", "name": "停止対応", "kind": "stream", "layer": "バリューストリーム" },
      { "id": "sys-mono-tablet", "createdBy": "sample", "name": "現場入力アプリ", "kind": "app", "layer": "アプリ", "productId": "prod-mono-002", "solutionIds": ["sol-mono-002"] },
      { "id": "sys-mono-edge", "createdBy": "sample", "name": "設備のゲートウェイ", "kind": "system", "layer": "現場" },
      { "id": "sys-mono-analytics", "createdBy": "sample", "name": "予兆検知サービス", "kind": "system", "layer": "分析", "productId": "prod-mono-001", "solutionIds": ["sol-mono-001"] },
      { "id": "sys-mono-mes", "createdBy": "sample", "name": "生産管理システム", "kind": "system", "layer": "基幹" },
      { "id": "sys-mono-board", "createdBy": "sample", "name": "停止原因ダッシュボード", "kind": "app", "layer": "アプリ", "solutionIds": ["sol-mono-002"] }
    ],
    "links": [
      { "from": "sys-mono-edge", "to": "sys-mono-analytics", "label": "稼働データ" },
      { "from": "sys-mono-tablet", "to": "sys-mono-analytics", "label": "停止原因（即時入力）" },
      { "from": "sys-mono-analytics", "to": "sys-mono-mes", "label": "保全の計画" },
      { "from": "sys-mono-analytics", "to": "sys-mono-board", "label": "停止原因の集計" }
    ]
  }
}
```

## examples/mono/public/data/customer.json

```json
{
  "name": "架空の製造会社 ミズホ精機株式会社",
  "projectName": "ミズホ 現場データ活用プロジェクト",
  "templateVersion": "0.1.0",
  "locale": "ja",
  "industryPreset": "manufacturing",
  "createdBy": "sample",
  "coreObject": {
    "candidates": [
      {
        "id": "core-work-order",
        "label": "製造指図",
        "name": "製造指図",
        "summary": "何を・いつ・どれだけ作るかを現場へ伝える指示",
        "scores": {
          "crit-flow": "高: 計画から実績までの流れが 1 つにつながる",
          "crit-data": "高: 稼働・停止の記録を紐づけられる",
          "crit-reuse": "中: 工程の違いに合わせた調整が要る"
        }
      },
      {
        "id": "core-equipment",
        "label": "設備",
        "name": "設備",
        "summary": "生産に使う機械・ライン",
        "scores": {
          "crit-flow": "中: 計画との対応は間接的",
          "crit-data": "高: 稼働データの発生源",
          "crit-reuse": "高: 他の拠点にも置き換えやすい"
        }
      }
    ],
    "selectedId": "core-work-order",
    "criteria": [
      {
        "id": "crit-flow",
        "label": "業務の流れの中心か"
      },
      {
        "id": "crit-data",
        "label": "データを紐づけられるか"
      },
      {
        "id": "crit-reuse",
        "label": "他の拠点へ広げやすいか"
      }
    ],
    "reason": "製造指図は計画・実績・停止の記録を 1 本につなげられるため、議論の中心に置く（合成データ）。"
  },
  "glossary": [
    {
      "term": "計画外停止",
      "definition": "予定していない設備の停止。生産計画の遅れや保全の手戻りにつながる。"
    },
    {
      "term": "予兆検知",
      "definition": "故障や停止の前触れを稼働データから見つけること。"
    },
    {
      "term": "ゲートウェイ",
      "definition": "現場の設備とクラウドなどの外部システムをつなぐ中継装置。"
    }
  ],
  "okr": {
    "updatedAt": "2026-10-01T09:00:00+09:00",
    "objectives": [
      {
        "objective": "計画外停止を減らし、現場データで生産を安定させる（合成データ）",
        "keyResults": [
          {
            "id": "kr-mono-001",
            "name": "計画外停止の時間を減らす",
            "solutionIds": [
              "sol-mono-001"
            ],
            "kpi": {
              "name": "計画外停止時間",
              "unit": "時間/月",
              "baseline": 40,
              "current": 30,
              "target": 20,
              "due": "2027-03-31"
            }
          },
          {
            "id": "kr-mono-002",
            "name": "予兆検知で防げた停止を増やす",
            "solutionIds": [
              "sol-mono-001"
            ],
            "kpi": {
              "name": "予兆検知の的中率",
              "unit": "%",
              "baseline": 0,
              "current": 0,
              "target": 70,
              "due": "2027-03-31"
            }
          },
          {
            "id": "kr-mono-003",
            "name": "停止原因の集計を早める",
            "solutionIds": [
              "sol-mono-002"
            ],
            "kpi": {
              "name": "停止原因の集計に要する時間",
              "unit": "日",
              "baseline": 3,
              "current": 2,
              "target": 0.5,
              "due": "2027-03-31"
            }
          }
        ]
      },
      {
        "objective": "判断・検査・在庫の情報を早く共有し、現場と事業部門の待ち時間を減らす（合成データ）",
        "keyResults": [
          {
            "id": "kr-mono-004",
            "name": "熟練者の判断基準を共有する",
            "solutionIds": [
              "sol-mono-003"
            ],
            "kpi": {
              "name": "判断基準の文書化率",
              "unit": "%",
              "baseline": 0,
              "current": 20,
              "target": 80,
              "due": "2027-03-31"
            }
          },
          {
            "id": "kr-mono-005",
            "name": "検査結果の共有を早める",
            "solutionIds": [
              "sol-mono-004"
            ],
            "kpi": {
              "name": "検査結果の共有に要する時間",
              "unit": "時間",
              "baseline": 24,
              "current": 20,
              "target": 2,
              "due": "2027-03-31"
            }
          }
        ]
      }
    ]
  },
  "fictionalNote": "このデモのユースケース・企業名・数値はすべて架空（合成データ）です。実在の企業・個人・Project とは関係ありません。",
  "useCases": [
    {
      "id": "uc-mono-001",
      "name": "経営会議で計画外停止の予兆と投資対効果を確認する",
      "persona": "経営層",
      "solutionId": "sol-mono-001",
      "summary": "予兆検知の結果と ROI を 1 画面で見て、投資の可否を判断する。",
      "steps": [
        {
          "title": "停止の傾向を見る",
          "description": "月ごとの計画外停止時間の推移を確認する"
        },
        {
          "title": "予兆の的中率を見る",
          "description": "予兆検知で防げた停止の割合を確認する"
        },
        {
          "title": "投資を判断する",
          "description": "ROI とコストを比べて拡大の可否を決める"
        }
      ],
      "effect": "投資判断までの会議の回数が減り、計画外停止の削減に早く着手できる。",
      "kpiNames": [
        "計画外停止時間",
        "予兆検知の的中率"
      ]
    },
    {
      "id": "uc-mono-002",
      "name": "熟練者の判断基準を全拠点の方針にそろえる",
      "persona": "経営層",
      "solutionId": "sol-mono-003",
      "summary": "属人化している判断を共有し、拠点間の品質のばらつきを抑える方針を決める。",
      "steps": [
        {
          "title": "文書化の進み具合を見る",
          "description": "判断基準の文書化率を拠点ごとに確認する"
        },
        {
          "title": "方針を決める",
          "description": "共有する判断基準の範囲と期限を決める"
        }
      ],
      "effect": "熟練者の退職があっても判断の質を保てる。",
      "kpiNames": [
        "判断基準の文書化率"
      ]
    },
    {
      "id": "uc-mono-003",
      "name": "計画外停止の予兆に応じて保全計画を組み直す",
      "persona": "事業部門",
      "solutionId": "sol-mono-001",
      "summary": "予兆が出た設備の保全を、生産計画に影響の少ない時間へ前倒しする。",
      "steps": [
        {
          "title": "予兆を受け取る",
          "description": "予兆が出た設備と時期を確認する"
        },
        {
          "title": "生産計画を確認する",
          "description": "停止できる時間帯を探す"
        },
        {
          "title": "保全を前倒しする",
          "description": "保全の作業を計画に組み込む"
        }
      ],
      "effect": "計画外停止が計画停止に置き換わり、納期遅れが減る。",
      "kpiNames": [
        "計画外停止時間",
        "予兆検知の的中率"
      ]
    },
    {
      "id": "uc-mono-004",
      "name": "検査結果をその日のうちに生産計画へ反映する",
      "persona": "事業部門",
      "solutionId": "sol-mono-004",
      "summary": "検査結果が即時に共有され、不良の傾向に応じて当日の生産計画を調整する。",
      "steps": [
        {
          "title": "検査結果を受け取る",
          "description": "検査機器の出力が自動で届く"
        },
        {
          "title": "不良の傾向を見る",
          "description": "品目・ラインごとの傾向を確認する"
        },
        {
          "title": "計画を調整する",
          "description": "当日の生産の順序を見直す"
        }
      ],
      "effect": "不良品の流出と手戻りが減る。",
      "kpiNames": [
        "検査結果の共有に要する時間"
      ]
    },
    {
      "id": "uc-mono-005",
      "name": "稼働データの収集と予兆検知の仕組みを既存システムにつなぐ",
      "persona": "IT",
      "solutionId": "sol-mono-001",
      "summary": "既存の稼働データをゲートウェイ経由で集め、予兆検知サービスへ連携する。",
      "steps": [
        {
          "title": "データの出所を確認する",
          "description": "既存の設備から取得できる項目を洗い出す"
        },
        {
          "title": "ゲートウェイを設置する",
          "description": "設備と外部サービスをつなぐ"
        },
        {
          "title": "予兆検知に連携する",
          "description": "送信するデータと頻度を設定する"
        }
      ],
      "effect": "既存環境を大きく変えずに、予兆検知を始められる。",
      "kpiNames": [
        "予兆検知の的中率"
      ]
    },
    {
      "id": "uc-mono-006",
      "name": "停止原因の入力データを集計の仕組みへ自動で渡す",
      "persona": "IT",
      "solutionId": "sol-mono-002",
      "summary": "タブレットの入力を、既存の集計の仕組みへ日次で渡す。",
      "steps": [
        {
          "title": "連携の方式を決める",
          "description": "既存の集計の仕組みが受け取れる形式を確認する"
        },
        {
          "title": "自動で渡す",
          "description": "渡す時刻と失敗時の再実行を決める"
        }
      ],
      "effect": "手作業の転記が不要になり、集計が即日で終わる。",
      "kpiNames": [
        "停止原因の集計に要する時間"
      ]
    },
    {
      "id": "uc-mono-007",
      "name": "停止の直後にタブレットで原因を入力する",
      "persona": "現場",
      "solutionId": "sol-mono-002",
      "summary": "設備が止まったらその場でタブレットに停止原因を選んで入力する。",
      "steps": [
        {
          "title": "停止を確認する",
          "description": "止まった設備を選ぶ"
        },
        {
          "title": "原因を選ぶ",
          "description": "一覧から原因を選び、必要なら一言を足す"
        },
        {
          "title": "送信する",
          "description": "入力が即時に集計へ反映される"
        }
      ],
      "effect": "終業後の入力が不要になり、集計が即日で終わる。",
      "kpiNames": [
        "停止原因の集計に要する時間"
      ]
    },
    {
      "id": "uc-mono-008",
      "name": "熟練者の判断を作業中に確認する",
      "persona": "現場",
      "solutionId": "sol-mono-003",
      "summary": "判断に迷ったとき、作業の手元で熟練者の判断基準を調べる。",
      "steps": [
        {
          "title": "状況を入力する",
          "description": "迷っている状況を言葉で入力する"
        },
        {
          "title": "基準を確認する",
          "description": "該当する判断基準と根拠を読む"
        }
      ],
      "effect": "新任者でも判断に迷う時間が減る。",
      "kpiNames": [
        "判断基準の文書化率"
      ]
    }
  ],
  "screenGuides": {
    "issue-solution": "課題と解決策を行で並べ、どの課題にどの打ち手が対応するかを表で確かめる画面です。",
    "priority": "課題と解決策を、影響と実現のしやすさなどで点数づけして優先順位を比べる表です。",
    "summary": "結論・根拠・次の行動を短く整理したサマリーです。画面ごとの要点を一覧で読めます。",
    "matrix": "課題と解決策を 2×2 の軸に点で配置し、先に取り組むものを視覚的に見分ける図です。",
    "ranking": "優先度の高い順に課題や解決策を並べたランキング表です。順位と点数が見えます。",
    "knowledge-graph": "用語・課題・製品などの関係をノードと線でつないだ知識の地図です。",
    "business-graph": "事業の関係者・製品・課題のつながりを、ノードと線で表した関係図です。",
    "architecture": "現在（AsIs）と将来（ToBe）のシステム構成を図形で並べ、追加・変更される要素を比べます。",
    "discussion-tree": "議論テーマを論点に分解した系統ツリーです。選択肢・提言・次の行動がノードで見えます。",
    "table": "顧客パックの項目を一覧表で表示し、並べ替えや編集ができる画面です。",
    "gantt": "機能とタスクの工程を横棒で並べ、いつ何を進めるかの計画が見えるガントチャートです。",
    "map": "拠点や顧客の場所を地図上のピンで示し、地理的な広がりが見える画面です。",
    "kpi-okr": "目標（OKR）と指標（KPI）の現在値・目標値・達成の進み具合が行で見える画面です。",
    "twin-view": "現場の設備や場所をデジタルツインのノードで表し、状態と関係を確かめるビューです。",
    "sources": "分析の根拠となった出典を一覧で示し、どの数値や主張が何に基づくか確かめられます。",
    "mock-app": "提案する業務アプリの画面案を部品で描いた試作です。使い心地のイメージが見えます。",
    "usecase": "想定される活用場面を、目的・関係者・期待効果つきで並べたユースケースの一覧です。",
    "data-catalog": "扱うデータの種類（エンティティ）と持ち主・関係を行で並べたデータの目録です。",
    "spatial-view": "拠点・フロア・部屋・設備の階層を、拡大しながら辿れる空間の図です。",
    "whiteboard": "付箋で意見やアイデアを自由に書き出して並べ、議論を整理するホワイトボードです。",
    "themes": "議論するテーマと、その選択肢・決定事項・次の行動を行で整理した画面です。",
    "settings": "表示や AI 接続などの設定を入力欄で変える画面です。各欄に既定値と説明が見えます。",
    "genai-scenario": "生成 AI を業務に活かすシナリオを、効果と実現手順つきで比べる分析の画面です。",
    "chat": "AI と対話して質問や整理を進める画面です。やり取りがメッセージとして並びます。"
  },
  "discussionTheme": {
    "id": "theme-mono-001",
    "title": "計画外停止を減らす進め方",
    "issueId": "issue-mono-001",
    "options": "案A: 予兆検知サービスを先に入れる。案B: 現場入力アプリで停止原因の記録を先に整える。",
    "recommendation": "まず現場入力アプリで停止原因を集め、その実績をもとに予兆検知を段階導入する。",
    "decisions": "第 1 工場の 2 ラインで先行導入し、効果を 3 か月で確かめる（架空の決定）。",
    "actions": [
      "停止原因の入力項目を現場と確定する",
      "先行ラインの稼働データを収集する",
      "3 か月後の効果を確認する会議を設定する",
      "効果の測り方を現場リーダーと合意する"
    ]
  }
}
```

## examples/mono/public/data/entities.json

```json
{
  "levels": [
    { "depth": 0, "name": "拠点", "lodThreshold": 100, "description": "工場全体。常に表示する最上位の階層", "color": "#2563eb", "kpi": "月間の生産量", "sourceIds": ["src-mono-001"] },
    { "depth": 1, "name": "ライン", "lodThreshold": 1.65, "description": "組立ラインの単位。全体を見渡す視点より少し引いた距離まで表示する", "color": "#0891b2", "kpi": "月間の計画外停止", "sourceIds": ["src-mono-001"] },
    { "depth": 2, "name": "設備", "lodThreshold": 1.15, "description": "ラインの設備。全体を見渡す視点では表示する", "color": "#7c3aed", "kpi": "設備の稼働率", "sourceIds": ["src-mono-001"] },
    { "depth": 3, "name": "部品", "lodThreshold": 0.8, "description": "設備の部品。カメラが近づくと現れる", "color": "#d97706", "kpi": "部品の交換頻度", "sourceIds": ["src-mono-001"] }
  ],
  "entities": [
    {
      "id": "ent-mono-line-a", "createdBy": "sample", "type": "site", "name": "第 1 組立ライン", "parentId": "ent-mono-plant", "location": {"lat": 35.083, "lng": 137.156}, "sourceIds": ["src-mono-001"], "world": "real", "kind": "operation",
      "metrics": [
        { "label": "月間の計画外停止", "value": 14, "unit": "回", "sourceIds": ["src-mono-001"] }
      ]
    },
    { "id": "ent-mono-dt-plant-model", "createdBy": "sample", "type": "model", "name": "本社工場の 3D モデル", "world": "digital", "kind": "model", "sourceIds": ["src-mono-001"] },
    { "id": "ent-mono-org-mfg", "createdBy": "sample", "type": "organization", "name": "製造部", "world": "real", "kind": "organization", "sourceIds": ["src-mono-002"] },
    { "id": "ent-mono-robot", "createdBy": "sample", "type": "part", "name": "組立ロボット", "parentId": "ent-mono-line-a", "sourceIds": ["src-mono-001"], "world": "real", "kind": "equipment" },
    { "id": "ent-mono-press", "createdBy": "sample", "type": "part", "name": "プレス機", "parentId": "ent-mono-line-a", "sourceIds": ["src-mono-001"], "world": "real", "kind": "equipment" },
    { "id": "ent-mono-motor", "createdBy": "sample", "type": "part", "name": "サーボモーター", "parentId": "ent-mono-robot", "relatedIds": ["ent-mono-leader"], "sourceIds": ["src-mono-001"], "world": "real", "kind": "thing" },
    { "id": "ent-mono-gripper", "createdBy": "sample", "type": "part", "name": "グリッパー", "parentId": "ent-mono-robot", "sourceIds": ["src-mono-001"], "world": "real", "kind": "thing" },
    { "id": "ent-mono-sensor", "createdBy": "sample", "type": "part", "name": "圧力センサー", "parentId": "ent-mono-press", "sourceIds": ["src-mono-001"], "world": "real", "kind": "thing" },
    { "id": "ent-mono-die", "createdBy": "sample", "type": "part", "name": "金型", "parentId": "ent-mono-press", "sourceIds": ["src-mono-001"], "world": "real", "kind": "thing" },
    { "id": "ent-mono-plant", "createdBy": "sample", "type": "site", "name": "ミズホ精機 本社工場", "location": {"lat": 35.1815, "lng": 136.9066}, "sourceIds": ["src-mono-001"], "world": "real", "kind": "site" },
    { "id": "ent-mono-line-b", "createdBy": "sample", "type": "site", "name": "第 2 組立ライン", "parentId": "ent-mono-plant", "location": {"lat": 34.7108, "lng": 137.7261}, "sourceIds": ["src-mono-001"], "world": "real", "kind": "operation" },
    { "id": "ent-mono-conveyor", "createdBy": "sample", "type": "part", "name": "搬送コンベア", "parentId": "ent-mono-line-b", "sourceIds": ["src-mono-001"], "world": "real", "kind": "equipment" },
    { "id": "ent-mono-dt-robot-metric", "createdBy": "sample", "type": "metric", "name": "組立ロボットの稼働率", "parentId": "ent-mono-dt-plant-model", "world": "digital", "kind": "metric", "sourceIds": ["src-mono-001"],
      "metrics": [ { "label": "設備の稼働率", "value": 87, "unit": "%", "sourceIds": ["src-mono-001"] } ] },
    { "id": "ent-mono-dt-maintenance-log", "createdBy": "sample", "type": "data", "name": "保守点検の記録", "parentId": "ent-mono-dt-plant-model", "world": "digital", "kind": "data", "sourceIds": ["src-mono-002"] },
    { "id": "ent-mono-dt-mes", "createdBy": "sample", "type": "system", "name": "生産管理システム", "parentId": "ent-mono-dt-plant-model", "world": "digital", "kind": "system", "sourceIds": ["src-mono-001"] },
    { "id": "ent-mono-dt-line-dashboard", "createdBy": "sample", "type": "ui-component", "name": "ライン稼働ダッシュボード", "parentId": "ent-mono-dt-plant-model", "world": "digital", "kind": "ui-component", "sourceIds": ["src-mono-001"] },
    { "id": "ent-mono-leader", "createdBy": "sample", "type": "role", "name": "現場リーダー", "parentId": "ent-mono-org-mfg", "sourceIds": ["src-mono-002"], "world": "real", "kind": "person" }
  ],
  "twins": [
    { "realId": "ent-mono-plant", "digitalId": "ent-mono-dt-robot-metric", "relation": "measures", "sourceIds": ["src-mono-001"] },
    { "realId": "ent-mono-line-a", "digitalId": "ent-mono-dt-robot-metric", "relation": "measures", "sourceIds": ["src-mono-001"] },
    { "realId": "ent-mono-line-b", "digitalId": "ent-mono-dt-robot-metric", "relation": "measures", "sourceIds": ["src-mono-001"] },
    { "realId": "ent-mono-press", "digitalId": "ent-mono-dt-robot-metric", "relation": "measures", "sourceIds": ["src-mono-001"] },
    { "realId": "ent-mono-conveyor", "digitalId": "ent-mono-dt-robot-metric", "relation": "measures", "sourceIds": ["src-mono-001"] },
    { "realId": "ent-mono-plant", "digitalId": "ent-mono-dt-plant-model", "relation": "represents", "sourceIds": ["src-mono-001"] },
    { "realId": "ent-mono-robot", "digitalId": "ent-mono-dt-plant-model", "relation": "represents", "sourceIds": ["src-mono-001"] },
    { "realId": "ent-mono-robot", "digitalId": "ent-mono-dt-robot-metric", "relation": "measures", "sourceIds": ["src-mono-001"] },
    { "realId": "ent-mono-robot", "digitalId": "ent-mono-dt-maintenance-log", "relation": "records", "sourceIds": ["src-mono-002"] },
    { "realId": "ent-mono-press", "digitalId": "ent-mono-dt-maintenance-log", "relation": "records", "sourceIds": ["src-mono-002"] },
    { "realId": "ent-mono-motor", "digitalId": "ent-mono-dt-plant-model", "relation": "represents", "sourceIds": ["src-mono-001"] },
    { "realId": "ent-mono-plant", "digitalId": "ent-mono-dt-mes", "relation": "records", "sourceIds": ["src-mono-001"] },
    { "realId": "ent-mono-line-a", "digitalId": "ent-mono-dt-line-dashboard", "relation": "displays", "sourceIds": ["src-mono-001"] },
    { "realId": "ent-mono-line-b", "digitalId": "ent-mono-dt-line-dashboard", "relation": "displays", "sourceIds": ["src-mono-001"] }
  ]
}
```

## examples/mono/public/data/issues.json

```json
{
  "issues": [
    {
      "id": "issue-mono-001", "createdBy": "sample", "parentId": null, "title": "設備の計画外停止が多い", "hypothesis": "予兆を捉えられていない", "origin": "interview",       "classification": "shareable", "sourceIds": ["src-mono-001"], "entityIds": ["ent-mono-line-a", "ent-mono-press", "ent-mono-robot"],
      "audience": "external", "personas": ["経営層", "現場"],
      "causes": [{ "id": "cause-mono-001", "title": "設備の稼働データが保全に使われていない" }, { "id": "cause-mono-002", "title": "異常の兆候を見つける基準がない" }],
      "evaluation": {
        "priority": { "value": 1, "unit": "位", "sourceIds": ["src-mono-001"] },
        "cost": { "value": 1200, "unit": "万円", "sourceIds": ["src-mono-003"] },
        "roi": { "value": 180, "unit": "%", "sourceIds": ["src-mono-003"] },
        "feasibility": { "value": "高（既存の稼働データを活用できる）", "sourceIds": ["src-mono-002"] },
        "risk": { "value": "中（センサーの追加が必要な設備がある）", "sourceIds": ["src-mono-002"] }
      }
    },
    {
      "id": "issue-mono-002", "createdBy": "sample", "parentId": "issue-mono-001", "title": "停止原因の記録が紙で集計できない", "hypothesis": "記録の入力が遅れる", "origin": "interview", "classification": "shareable", "sourceIds": ["src-mono-002"], "entityIds": ["ent-mono-leader", "ent-mono-line-a"],
      "audience": "internal", "personas": ["現場", "IT"],
      "causes": [{ "id": "cause-mono-003", "title": "記録の入力が紙で、現場の終業後になる" }],
      "evaluation": {
        "priority": { "value": 2, "unit": "位", "sourceIds": ["src-mono-002"] },
        "cost": { "value": 300, "unit": "万円", "sourceIds": ["src-mono-003"] },
        "roi": { "value": 120, "unit": "%", "sourceIds": ["src-mono-003"] },
        "feasibility": { "value": "高（タブレットを既に配備済み）", "sourceIds": ["src-mono-002"] },
        "risk": { "value": "低", "sourceIds": ["src-mono-002"] }
      }
    },
    {
      "id": "issue-mono-003", "createdBy": "sample", "parentId": null, "title": "熟練者の判断が属人化している", "hypothesis": "判断基準が共有されていない", "origin": "interview", "classification": "shareable", "sourceIds": ["src-mono-002"],
      "audience": "internal", "personas": ["事業部門"],
      "evaluation": {
        "priority": { "value": 3, "unit": "位", "sourceIds": ["src-mono-002"] },
        "cost": { "value": 500, "unit": "万円", "sourceIds": ["src-mono-003"] },
        "roi": { "value": 90, "unit": "%", "sourceIds": ["src-mono-003"] },
        "feasibility": { "value": "中（判断基準の聞き取りが先に必要）", "sourceIds": ["src-mono-002"] },
        "risk": { "value": "中（熟練者の協力が前提）", "sourceIds": ["src-mono-002"] },
        "scores": { "impact": { "ai": 1, "decided": 2, "sourceIds": ["src-mono-002"] } }
      }
    },
    {
      "id": "issue-mono-004", "createdBy": "sample", "parentId": null, "title": "品質検査の結果が共有されるまで時間がかかる", "hypothesis": "検査結果が紙で回覧されている", "origin": "interview", "classification": "shareable", "sourceIds": ["src-mono-002"], "entityIds": ["ent-mono-conveyor"],
      "audience": "internal", "personas": ["現場", "事業部門"],
      "evaluation": {
        "priority": { "value": 4, "unit": "位", "sourceIds": ["src-mono-002"] },
        "cost": { "value": 400, "unit": "万円", "sourceIds": ["src-mono-003"] },
        "roi": { "value": 100, "unit": "%", "sourceIds": ["src-mono-003"] },
        "feasibility": { "value": "高（検査機器の出力を使える）", "sourceIds": ["src-mono-002"] },
        "risk": { "value": "低", "sourceIds": ["src-mono-002"] }
      }
    },
    {
      "id": "issue-mono-005", "createdBy": "sample", "parentId": null, "title": "部品の在庫が拠点ごとに把握されていない", "hypothesis": "在庫の更新が月次である", "origin": "document", "classification": "shareable", "sourceIds": ["src-mono-001"], "entityIds": ["ent-mono-plant", "ent-mono-line-b"],
      "audience": "internal", "personas": ["事業部門", "IT"],
      "evaluation": {
        "priority": { "value": 5, "unit": "位", "sourceIds": ["src-mono-001"] },
        "cost": { "value": 800, "unit": "万円", "sourceIds": ["src-mono-003"] },
        "roi": { "value": 70, "unit": "%", "sourceIds": ["src-mono-003"] },
        "feasibility": { "value": "中（基幹システムとの連携が必要）", "sourceIds": ["src-mono-002"] },
        "risk": { "value": "中（連携先の改修が前提）", "sourceIds": ["src-mono-002"] }
      }
    }
  ],
  "solutions": [
    {
      "id": "sol-mono-001", "createdBy": "sample", "issueId": "issue-mono-001", "issueIds": ["issue-mono-001"], "entityIds": ["ent-mono-sensor", "ent-mono-motor"], "title": "設備の稼働データを集めて予兆を検知する",
      "genAiValues": ["fusion", "workflow"],
      "effects": [{ "id": "effect-mono-001", "title": "計画外停止の件数が減る" }, { "id": "effect-mono-002", "title": "保全の作業を計画的に組める" }],
      "productIds": ["prod-mono-001"], "sourceIds": ["src-mono-003"],
      "productFits": [{ "productId": "prod-mono-001", "reason": "稼働データを集めて異常の予兆を検知する機能を備えているため" }]
    },
    {
      "id": "sol-mono-002", "createdBy": "sample", "issueId": "issue-mono-002", "issueIds": ["issue-mono-002"], "entityIds": ["ent-mono-leader"], "title": "タブレットで停止原因を入力する",
      "effects": [{ "id": "effect-mono-003", "title": "停止原因の集計が即日で終わる" }],
      "productIds": ["prod-mono-002"], "sourceIds": ["src-mono-002"],
      "productFits": [{ "productId": "prod-mono-002", "reason": "現場のタブレットで記録を入力でき、紙の集計を不要にできるため" }]
    },
    {
      "id": "sol-mono-003", "createdBy": "sample", "issueId": "issue-mono-003", "issueIds": ["issue-mono-003"], "title": "熟練者の判断基準をナレッジとして共有する",
      "genAiValues": ["chatRag"],
      "effects": [{ "id": "effect-mono-004", "title": "判断の根拠を誰でも確かめられる" }],
      "productIds": ["prod-mono-003"], "sourceIds": ["src-mono-002"],
      "productFits": [{ "productId": "prod-mono-003", "reason": "熟練者の判断基準を蓄積し、質問に答える形で引き出せるため" }]
    },
    {
      "id": "sol-mono-004", "createdBy": "sample", "issueId": "issue-mono-004", "issueIds": ["issue-mono-004"], "title": "検査結果を即時に共有する",
      "effects": [{ "id": "effect-mono-005", "title": "検査結果が共有されるまでの時間が短くなる" }],
      "productIds": ["prod-mono-004"], "sourceIds": ["src-mono-002"],
      "productFits": [{ "productId": "prod-mono-004", "reason": "検査機器の出力を取り込み、関係者へ即時に配信できるため" }]
    }
  ]
}
```

## examples/mono/public/data/mocks.json

```json
{
  "mocks": [
    {
      "id": "mock-mono-001",
      "createdBy": "sample",
      "title": "停止原因の入力画面",
      "featureId": "feat-mono-001",
      "solutionId": "sol-mono-002",
      "screens": [
        {
          "title": "停止原因の入力",
          "description": "停止した設備を選び、原因を選んで記録します。",
          "fields": [
            { "label": "設備", "kind": "select", "options": ["プレス 1 号機", "プレス 2 号機", "搬送ライン A"], "value": "プレス 1 号機" },
            { "label": "停止した時刻", "kind": "text", "value": "09:40" },
            { "label": "停止原因", "kind": "select", "options": ["金型の不具合", "材料の詰まり", "センサーの異常", "その他"], "value": "材料の詰まり" },
            { "label": "メモ", "kind": "textarea", "value": "" }
          ]
        },
        {
          "title": "入力内容の確認",
          "description": "入力した内容を確かめてから送信します。",
          "items": ["設備: プレス 1 号機", "停止した時刻: 09:40", "停止原因: 材料の詰まり"]
        },
        {
          "title": "送信の完了",
          "description": "停止原因を記録しました。集計は自動で更新されます。",
          "items": ["今月の停止原因の件数が 1 件増えました"]
        }
      ]
    }
  ]
}
```

## examples/mono/public/data/plan.json

```json
{
  "features": [
    { "id": "feat-mono-001", "createdBy": "sample", "title": "停止原因の入力", "issueIds": ["issue-mono-002"], "sourceIds": ["src-mono-002"] },
    { "id": "feat-mono-002", "createdBy": "sample", "title": "予兆の検知と通知", "issueIds": ["issue-mono-001"], "sourceIds": ["src-mono-003"] }
  ],
  "tasks": [
    { "id": "task-mono-001", "createdBy": "sample", "owner": "現場リーダー", "work": "現場の記録項目を洗い出して整理する", "title": "現場の記録項目の整理", "featureId": "feat-mono-001", "start": "2026-11-02", "end": "2026-11-13" },
    { "id": "task-mono-002", "createdBy": "sample", "owner": "IT 担当", "work": "タブレット用の入力アプリを試作して現場で試す", "title": "入力アプリの試作", "featureId": "feat-mono-001", "start": "2026-11-16", "end": "2026-12-11", "dependsOn": ["task-mono-001"] },
    { "id": "task-mono-004", "createdBy": "sample", "owner": "現場リーダー", "work": "試作アプリを 1 ラインで試して使い勝手を確かめる", "title": "入力アプリの現場試用", "featureId": "feat-mono-001", "parentId": "task-mono-002", "start": "2026-12-01", "end": "2026-12-11" },
    { "id": "task-mono-003", "createdBy": "sample", "owner": "IT 担当", "work": "設備の稼働データを収集する仕組みをつくる", "title": "稼働データの収集", "featureId": "feat-mono-002", "start": "2026-11-16", "end": "2026-12-25" }
  ]
}
```

## examples/mono/public/data/products.json

```json
{
  "products": [
    { "id": "prod-mono-001", "createdBy": "sample", "name": "サンプル予兆検知サービス", "vendor": "架空のベンダー A", "summary": "稼働データから異常の予兆を検知する（合成データ）", "sourceIds": ["src-mono-003"] },
    { "id": "prod-mono-002", "createdBy": "sample", "name": "サンプル現場入力アプリ", "vendor": "架空のベンダー B", "summary": "タブレットで現場の記録を入力する（合成データ）",     "sourceIds": ["src-mono-003"] },
        { "id": "prod-mono-003", "createdBy": "sample", "name": "サンプルナレッジ共有サービス", "vendor": "架空のベンダー D", "summary": "熟練者の判断基準を蓄積して共有する（合成データ）", "sourceIds": ["src-mono-003"] },
        { "id": "prod-mono-004", "createdBy": "sample", "name": "サンプル検査結果配信サービス", "vendor": "架空のベンダー E", "summary": "検査機器の出力を関係者へ即時に配信する（合成データ）",         "sourceIds": ["src-mono-003"] }
      ]
}
```

## examples/mono/public/data/show.json

```json
{
  "chapters": [
    {
      "id": "chap-mono-001", "createdBy": "sample", "title": "現状の課題",
      "topics": [
        {
          "id": "topic-mono-001", "createdBy": "sample", "title": "計画外停止", "entityIds": ["issue-mono-001", "ent-mono-line-a"],
          "telop": { "text": "設備の計画外停止が、生産計画の大きな乱れにつながっています", "sourceIds": ["src-mono-001"] }
        },
        { "id": "topic-mono-002", "createdBy": "sample", "title": "記録の遅れ", "entityIds": ["issue-mono-002"],
          "narration": "停止の原因は、終業後にまとめて入力されるため、記録が遅れがちです。記録が遅れると、停止の傾向を早く見つけにくくなります。" }
      ]
    },
    {
      "id": "chap-mono-002", "createdBy": "sample", "title": "解決の方向",
      "topics": [
        { "id": "topic-mono-003", "createdBy": "sample", "title": "予兆検知と現場入力", "entityIds": ["sol-mono-001", "sol-mono-002"],
          "narration": "稼働データから停止の予兆を見つけ、現場のタブレットで停止の直後に入力できるようにします。" }
      ]
    },
    {
      "id": "chap-mono-003", "createdBy": "sample", "title": "効果と優先順位",
      "topics": [
        {
          "id": "topic-mono-004", "createdBy": "sample", "title": "停止原因の集計の変化", "type": "before-after",
          "beforeAfter": {
            "before": { "label": "Before", "text": "停止原因は紙に記録し、終業後にまとめて入力するため、集計に数日かかる" },
            "after": { "label": "After", "text": "現場のタブレットで停止の直後に入力し、集計は即日で終わる" }
          }
        },
        { "id": "topic-mono-005", "createdBy": "sample", "title": "優先順位 TOP5", "type": "ranking" },
        {
          "id": "topic-mono-006", "createdBy": "sample", "title": "ROI の発表", "type": "roi",
          "roi": { "label": "予兆検知の ROI", "value": 180, "unit": "%", "caption": "稼働データの予兆検知による、計画外停止の削減効果の見込み", "sourceIds": ["src-mono-003"] }
        },
        {
          "id": "topic-mono-007", "createdBy": "sample", "title": "AI 成熟度クイズ", "type": "quiz",
          "quiz": {
            "title": "AI 成熟度クイズ",
            "questions": [
              {
                "id": "q1", "text": "設備の稼働データは、どのように集めていますか。",
                "options": [
                  { "label": "紙や手入力が中心", "score": 0 },
                  { "label": "一部の設備で自動収集している", "score": 1 },
                  { "label": "ほとんどの設備で自動収集している", "score": 2 }
                ]
              },
              {
                "id": "q2", "text": "停止の予兆の検知に、データ分析や AI を使っていますか。",
                "options": [
                  { "label": "使っていない", "score": 0 },
                  { "label": "試験的に使っている", "score": 1 },
                  { "label": "日常の業務で使っている", "score": 2 }
                ]
              },
              {
                "id": "q3", "text": "AI の活用を進める体制はありますか。",
                "options": [
                  { "label": "まだない", "score": 0 },
                  { "label": "担当者がいる", "score": 1 },
                  { "label": "部門をまたぐ推進体制がある", "score": 2 }
                ]
              }
            ],
            "levels": [
              { "minScore": 0, "label": "レベル 1: 検討前", "description": "まずは稼働データの収集から始めましょう。" },
              { "minScore": 2, "label": "レベル 2: 試行中", "description": "一部の設備で試しています。効果の測り方を決めましょう。" },
              { "minScore": 4, "label": "レベル 3: 展開中", "description": "複数の設備で活用しています。標準化で広げましょう。" },
              { "minScore": 6, "label": "レベル 4: 定着", "description": "業務の基盤として定着しています。" }
            ]
          }
        }
      ]
    }
  ]
}
```

## examples/mono/public/data/sources.json

```json
{
  "sources": [
    { "id": "src-mono-001", "createdBy": "sample", "kind": "document", "title": "架空の工場の月次生産報告（合成データ）", "retrievedAt": "2026-10-01", "confidence": "高" },
    { "id": "src-mono-002", "createdBy": "sample", "kind": "interview", "title": "架空の現場リーダーへのヒアリング（合成データ）", "retrievedAt": "2026-10-02", "confidence": "中" },
    { "id": "src-mono-003", "createdBy": "sample", "kind": "web", "title": "架空の業界調査の公開資料（合成データ）", "url": "https://example.invalid/mono-report", "retrievedAt": "2026-10-03", "confidence": "推定" }
  ]
}
```

## examples/mono/public/brand/brand-profile.json

```json
{
  "name": "ミズホ精機",
  "colors": {
    "primary": "#5B2A86",
    "source": "合成データ（お手本。実在の企業とは無関係）",
    "retrievedAt": "2026-10-09",
    "confidence": "高"
  },
  "logo": {
    "status": "unknown",
    "path": "/assets/brand/logo.svg",
    "source": "合成データ（架空のロゴ。利用条件は未確認として扱う）",
    "retrievedAt": "2026-10-09",
    "confidence": "低"
  },
  "fonts": {
    "primary": "Zen Kaku Gothic New",
    "source": "合成データ（オープンライセンス SIL OFL の書体名）",
    "retrievedAt": "2026-10-09",
    "confidence": "中"
  },
  "tone": {
    "value": "誠実・精密・落ち着いた",
    "source": "合成データ（お手本）",
    "retrievedAt": "2026-10-09",
    "confidence": "高"
  }
}
```

## examples/mono/data/customer-research.md

```markdown
# 顧客調査メモ（架空・合成データ）

ミズホ精機株式会社は実在しない架空の製造会社です。このファイルは、お手本パックの構成（`data/customer-research.md`）を示すための合成データです。

- 事業: 産業機器部品の組立
- 課題の仮説: 設備の計画外停止、記録の遅れ、判断の属人化
```

## examples/mono/brand/BRAND-RESEARCH.md

```markdown
# ブランド調査メモ（架空・合成データ）

ミズホ精機の Primary 色は、お手本として選んだ値です（実在の企業とは無関係）。
```
