/* Generated from the extractor schemas 3.0.0 and 3.1.0. Do not edit; pnpm contracts:generate. */

export type ExtractRequest = ExtractionRequestWithoutExternalResearch300 | ContextualExtractionRequest310;

export interface ExtractionRequestWithoutExternalResearch300 {
  schema_version: "3.0.0";
  request_id: string;
  url: string;
  instructions?: string;
  output_language?: string;
  processing_profile?: "local_baseline_v1";
  visual_processing?: "auto" | "disabled";
  task?: "extract";
}
export interface ContextualExtractionRequest310 {
  schema_version: "3.1.0";
  request_id: string;
  url: string;
  instructions?: string;
  output_language?: string;
  processing_profile?: "contextual_local_v2";
  visual_processing?: "auto" | "disabled";
  task?: "extract";
  external_inference?: "disabled" | "openai";
}

/* Generated from the extractor schemas 3.0.0 and 3.1.0. Do not edit; pnpm contracts:generate. */

export type ExtractResult = ContentExtractedFromAPublication300 | ContextualExtractionResult310;
export type ContentExtractedFromAPublication300 = Legacy;
export type Asset = {
  id: string;
  index: number;
  kind: "video" | "image";
  duration_ms: number | null;
  available: boolean;
  processed: boolean;
};
export type Fact = {
  value: string | null;
  certainty: "known" | "uncertain" | "unknown";
  evidence_ids: string[];
  reason: string | null;
};
export type ContextualExtractionResult310 = Contextual;
export type Asset1 = {
  id: string;
  index: number;
  kind: "video" | "image";
  duration_ms: number | null;
  available: boolean;
  processed: boolean;
};
export type Fact1 = {
  value: string | null;
  certainty: "known" | "uncertain" | "unknown";
  evidence_ids: string[];
  reason: string | null;
};

export interface Legacy {
  schema_version: "3.0.0";
  request_id: string;
  status: "success" | "partial" | "error";
  generated_at: string;
  source: {
    input_url: string;
    canonical_url: string | null;
    platform: "instagram" | "youtube" | "unknown";
    post_id: string | null;
    publisher_author: string | null;
    media_kind: "video" | "carousel" | "image" | "mixed" | "unknown";
    asset_count: number | null;
    inventory_complete: boolean;
    assets: Asset[];
  };
  request_context: {
    instructions: string;
    output_language: string;
    visual_processing: "auto" | "disabled";
  };
  topic: {
    category: "dining" | "travel" | "career" | "software_tools" | "shopping" | "other" | "unknown";
    label: string;
    basis: "extracted" | "inferred" | "unknown";
    certainty: "known" | "uncertain" | "unknown";
    evidence_ids: string[];
    reason: string;
  };
  routing: {
    initial_choice: "description_only" | "text_first" | "visual_first" | "uncertain";
    signals: {
      kind:
        "media_type" | "description" | "username" | "voice_detection" | "user_instruction" | "inventory" | "count_gap";
      strength: "strong" | "weak";
      detail: string;
      evidence_ids: string[];
    }[];
    steps: {
      stage: "description" | "triage" | "transcription" | "ocr" | "visual_understanding" | "extraction" | "review";
      outcome: "completed" | "skipped" | "failed" | "proposed";
      reason: string;
      input_evidence_ids: string[];
      remaining_gaps: string[];
    }[];
  };
  coverage: {
    scope: "reviewed_sources_only";
    sufficiency: "sufficient" | "insufficient" | "uncertain" | "not_assessed";
    examined_asset_ids: string[];
    unexamined_asset_ids: string[];
    transcript_ranges: {
      asset_id: string;
      time: Range | null;
    }[];
    visual_positions: {
      asset_id: string;
      time: Range | null;
    }[];
    missing_information: string[];
    limitations: string[];
  };
  items: (
    | {
        id: string;
        type: "place";
        title: string;
        summary: string;
        attribution: {
          publisher_author: string | null;
          speaker: string | null;
          basis: "publisher_only" | "self_identified" | "unknown";
          evidence_ids: string[];
        };
        /**
         * @minItems 1
         */
        evidence_ids: [string, ...string[]];
        uncertainties: {
          field: string;
          reason: string;
          evidence_ids: string[];
        }[];
        data: {
          name: Fact;
          location_mentioned: Fact;
          address_mentioned: Fact;
          coordinates_mentioned: Fact;
          maps_url_mentioned: Fact;
        };
      }
    | {
        id: string;
        type: "tool";
        title: string;
        summary: string;
        attribution: {
          publisher_author: string | null;
          speaker: string | null;
          basis: "publisher_only" | "self_identified" | "unknown";
          evidence_ids: string[];
        };
        /**
         * @minItems 1
         */
        evidence_ids: [string, ...string[]];
        uncertainties: {
          field: string;
          reason: string;
          evidence_ids: string[];
        }[];
        data: {
          name: Fact;
          purpose: Fact;
          url_mentioned: Fact;
        };
      }
    | {
        id: string;
        type: "recommendation";
        title: string;
        summary: string;
        attribution: {
          publisher_author: string | null;
          speaker: string | null;
          basis: "publisher_only" | "self_identified" | "unknown";
          evidence_ids: string[];
        };
        /**
         * @minItems 1
         */
        evidence_ids: [string, ...string[]];
        uncertainties: {
          field: string;
          reason: string;
          evidence_ids: string[];
        }[];
        data: {
          action: Fact;
          audience: Fact;
          rationale: Fact;
        };
      }
    | {
        id: string;
        type: "step";
        title: string;
        summary: string;
        attribution: {
          publisher_author: string | null;
          speaker: string | null;
          basis: "publisher_only" | "self_identified" | "unknown";
          evidence_ids: string[];
        };
        /**
         * @minItems 1
         */
        evidence_ids: [string, ...string[]];
        uncertainties: {
          field: string;
          reason: string;
          evidence_ids: string[];
        }[];
        data: {
          action: Fact;
          prerequisites: Fact;
        };
      }
    | {
        id: string;
        type: "travel_option";
        title: string;
        summary: string;
        attribution: {
          publisher_author: string | null;
          speaker: string | null;
          basis: "publisher_only" | "self_identified" | "unknown";
          evidence_ids: string[];
        };
        /**
         * @minItems 1
         */
        evidence_ids: [string, ...string[]];
        uncertainties: {
          field: string;
          reason: string;
          evidence_ids: string[];
        }[];
        data: {
          label: Fact;
          description: Fact;
          location_mentioned: Fact;
          exact_place_identified: false;
        };
      }
    | {
        id: string;
        type: "product";
        title: string;
        summary: string;
        attribution: {
          publisher_author: string | null;
          speaker: string | null;
          basis: "publisher_only" | "self_identified" | "unknown";
          evidence_ids: string[];
        };
        /**
         * @minItems 1
         */
        evidence_ids: [string, ...string[]];
        uncertainties: {
          field: string;
          reason: string;
          evidence_ids: string[];
        }[];
        data: {
          name_or_description: Fact;
          brand_mentioned: Fact;
          price_mentioned: Fact;
        };
      }
    | {
        id: string;
        type: "custom";
        title: string;
        summary: string;
        attribution: {
          publisher_author: string | null;
          speaker: string | null;
          basis: "publisher_only" | "self_identified" | "unknown";
          evidence_ids: string[];
        };
        /**
         * @minItems 1
         */
        evidence_ids: [string, ...string[]];
        uncertainties: {
          field: string;
          reason: string;
          evidence_ids: string[];
        }[];
        data: {
          label: string;
          content: Fact;
        };
      }
  )[];
  collections: Collection[];
  evidence: (
    | {
        id: string;
        source_type: "author_description";
        method: "adapter";
        excerpt: string;
        language: string | null;
        locator: {
          kind: "post";
          asset_id: null;
          time: null;
        };
        region: {
          x: number;
          y: number;
          width: number;
          height: number;
        } | null;
        asset_sha256: string | null;
        operation_id: string;
      }
    | {
        id: string;
        source_type: "platform_metadata";
        method: "adapter";
        excerpt: string;
        language: string | null;
        locator: {
          kind: "post";
          asset_id: null;
          time: null;
        };
        region: {
          x: number;
          y: number;
          width: number;
          height: number;
        } | null;
        asset_sha256: string | null;
        operation_id: string;
      }
    | {
        id: string;
        source_type: "transcript";
        method: "platform_captions" | "local_asr";
        excerpt: string;
        language: string | null;
        locator: {
          kind: "video_time";
          asset_id: string;
          time: Range;
        };
        region: {
          x: number;
          y: number;
          width: number;
          height: number;
        } | null;
        asset_sha256: string | null;
        operation_id: string;
      }
    | {
        id: string;
        source_type: "image_text";
        method: "local_ocr";
        excerpt: string;
        language: string | null;
        locator:
          | {
              kind: "image_asset";
              asset_id: string;
              time: null;
            }
          | {
              kind: "video_time";
              asset_id: string;
              time: Range;
            };
        region: {
          x: number;
          y: number;
          width: number;
          height: number;
        } | null;
        asset_sha256: string | null;
        operation_id: string;
      }
    | {
        id: string;
        source_type: "visual_observation";
        method: "local_vlm";
        excerpt: string;
        language: string | null;
        locator:
          | {
              kind: "image_asset";
              asset_id: string;
              time: null;
            }
          | {
              kind: "video_time";
              asset_id: string;
              time: Range;
            };
        region: {
          x: number;
          y: number;
          width: number;
          height: number;
        } | null;
        asset_sha256: string | null;
        operation_id: string;
      }
  )[];
  processing: {
    profile: "local_baseline_v1";
    operations: Operation[];
    privacy: {
      external_inference_used: false;
      external_web_lookup_used: false;
      raw_media_retention: "delete_after_request";
      result_retention: "caller_managed";
    };
  };
  issues: Issue[];
  extensions: {};
  task: "extract";
  follow_up: {
    extraction_gaps: ExtractionGap[];
    research_opportunities: ResearchOpportunity[];
  };
}
export interface Range {
  start_ms: number;
  end_ms: number;
}
export interface Collection {
  id: string;
  label: string;
  kind: "recommendations" | "ordered_steps" | "choices" | "places" | "products" | "other";
  item_ids: string[];
  expected_count: number | null;
  expected_count_evidence_ids: string[];
  order_semantics: "presentation" | "procedure" | "none";
  missing_count: number | null;
}
export interface Operation {
  id: string;
  purpose: "acquisition" | "routing" | "asr" | "extraction" | "vision" | "review" | "validation";
  deployment: "local";
  compute_target: "cpu" | "gpu" | "not_applicable";
  implementation: string;
  model: string | null;
  version: string | null;
  recipient: null;
  input_data: ("url" | "metadata" | "description" | "audio" | "images" | "transcript" | "extracted_items")[];
}
export interface Issue {
  code:
    | "INVALID_REQUEST"
    | "UNSUPPORTED_MEDIA"
    | "ACCESS_UNAVAILABLE"
    | "LOGIN_REQUIRED"
    | "RESOURCE_LIMIT"
    | "TRANSCRIPTION_FAILED"
    | "VISION_UNAVAILABLE"
    | "INCOMPLETE_COLLECTION"
    | "AMBIGUOUS_TOPIC"
    | "UNCERTAIN_IDENTITY"
    | "EXTRACTION_FAILED"
    | "VALIDATION_FAILED";
  stage: "input" | "access" | "routing" | "transcription" | "vision" | "extraction" | "validation";
  severity: "warning" | "error";
  message: string;
  affected_asset_ids: string[];
  affected_item_ids: string[];
  retryable: boolean;
}
export interface ExtractionGap {
  id: string;
  item_id: string | null;
  field: string | null;
  kind:
    | "ambiguous_identity"
    | "missing_announced_item"
    | "unread_content"
    | "conflicting_sources"
    | "uncertain_topic"
    | "transcription_uncertain";
  reason: string;
  required_for_request: boolean;
  evidence_ids: string[];
  asset_ids: string[];
}
export interface ResearchOpportunity {
  id: string;
  item_id: string;
  kind:
    | "official_website"
    | "place_disambiguation"
    | "address_lookup"
    | "geolocation"
    | "maps_link"
    | "background_research";
  reason: string;
  /**
   * @minItems 1
   */
  evidence_ids: [string, ...string[]];
}
export interface Contextual {
  schema_version: "3.1.0";
  request_id: string;
  status: "success" | "partial" | "error";
  generated_at: string;
  source: {
    input_url: string;
    canonical_url: string | null;
    platform: "instagram" | "youtube" | "unknown";
    post_id: string | null;
    publisher_author: string | null;
    media_kind: "video" | "carousel" | "image" | "mixed" | "unknown";
    asset_count: number | null;
    inventory_complete: boolean;
    assets: Asset1[];
  };
  request_context: {
    instructions: string;
    output_language: string;
    visual_processing: "auto" | "disabled";
  };
  topic: {
    category: "dining" | "travel" | "career" | "software_tools" | "shopping" | "other" | "unknown";
    label: string;
    basis: "extracted" | "inferred" | "unknown";
    certainty: "known" | "uncertain" | "unknown";
    evidence_ids: string[];
    reason: string;
  };
  routing: {
    initial_choice: "description_only" | "text_first" | "visual_first" | "uncertain";
    signals: {
      kind:
        "media_type" | "description" | "username" | "voice_detection" | "user_instruction" | "inventory" | "count_gap";
      strength: "strong" | "weak";
      detail: string;
      evidence_ids: string[];
    }[];
    steps: {
      stage: "description" | "triage" | "transcription" | "ocr" | "visual_understanding" | "extraction" | "review";
      outcome: "completed" | "skipped" | "failed" | "proposed";
      reason: string;
      input_evidence_ids: string[];
      remaining_gaps: string[];
    }[];
  };
  coverage: {
    scope: "reviewed_sources_only";
    sufficiency: "sufficient" | "insufficient" | "uncertain" | "not_assessed";
    examined_asset_ids: string[];
    unexamined_asset_ids: string[];
    transcript_ranges: {
      asset_id: string;
      time: Range1 | null;
    }[];
    visual_positions: {
      asset_id: string;
      time: Range1 | null;
    }[];
    missing_information: string[];
    limitations: string[];
  };
  items: (
    | {
        id: string;
        type: "place";
        title: string;
        summary: string;
        attribution: {
          publisher_author: string | null;
          speaker: string | null;
          basis: "publisher_only" | "self_identified" | "unknown";
          evidence_ids: string[];
        };
        /**
         * @minItems 1
         */
        evidence_ids: [string, ...string[]];
        uncertainties: {
          field: string;
          reason: string;
          evidence_ids: string[];
        }[];
        data: {
          name: Fact1;
          location_mentioned: Fact1;
          address_mentioned: Fact1;
          coordinates_mentioned: Fact1;
          maps_url_mentioned: Fact1;
        };
      }
    | {
        id: string;
        type: "tool";
        title: string;
        summary: string;
        attribution: {
          publisher_author: string | null;
          speaker: string | null;
          basis: "publisher_only" | "self_identified" | "unknown";
          evidence_ids: string[];
        };
        /**
         * @minItems 1
         */
        evidence_ids: [string, ...string[]];
        uncertainties: {
          field: string;
          reason: string;
          evidence_ids: string[];
        }[];
        data: {
          name: Fact1;
          purpose: Fact1;
          url_mentioned: Fact1;
        };
      }
    | {
        id: string;
        type: "recommendation";
        title: string;
        summary: string;
        attribution: {
          publisher_author: string | null;
          speaker: string | null;
          basis: "publisher_only" | "self_identified" | "unknown";
          evidence_ids: string[];
        };
        /**
         * @minItems 1
         */
        evidence_ids: [string, ...string[]];
        uncertainties: {
          field: string;
          reason: string;
          evidence_ids: string[];
        }[];
        data: {
          action: Fact1;
          audience: Fact1;
          rationale: Fact1;
        };
      }
    | {
        id: string;
        type: "step";
        title: string;
        summary: string;
        attribution: {
          publisher_author: string | null;
          speaker: string | null;
          basis: "publisher_only" | "self_identified" | "unknown";
          evidence_ids: string[];
        };
        /**
         * @minItems 1
         */
        evidence_ids: [string, ...string[]];
        uncertainties: {
          field: string;
          reason: string;
          evidence_ids: string[];
        }[];
        data: {
          action: Fact1;
          prerequisites: Fact1;
        };
      }
    | {
        id: string;
        type: "travel_option";
        title: string;
        summary: string;
        attribution: {
          publisher_author: string | null;
          speaker: string | null;
          basis: "publisher_only" | "self_identified" | "unknown";
          evidence_ids: string[];
        };
        /**
         * @minItems 1
         */
        evidence_ids: [string, ...string[]];
        uncertainties: {
          field: string;
          reason: string;
          evidence_ids: string[];
        }[];
        data: {
          label: Fact1;
          description: Fact1;
          location_mentioned: Fact1;
          exact_place_identified: false;
        };
      }
    | {
        id: string;
        type: "product";
        title: string;
        summary: string;
        attribution: {
          publisher_author: string | null;
          speaker: string | null;
          basis: "publisher_only" | "self_identified" | "unknown";
          evidence_ids: string[];
        };
        /**
         * @minItems 1
         */
        evidence_ids: [string, ...string[]];
        uncertainties: {
          field: string;
          reason: string;
          evidence_ids: string[];
        }[];
        data: {
          name_or_description: Fact1;
          brand_mentioned: Fact1;
          price_mentioned: Fact1;
        };
      }
    | {
        id: string;
        type: "custom";
        title: string;
        summary: string;
        attribution: {
          publisher_author: string | null;
          speaker: string | null;
          basis: "publisher_only" | "self_identified" | "unknown";
          evidence_ids: string[];
        };
        /**
         * @minItems 1
         */
        evidence_ids: [string, ...string[]];
        uncertainties: {
          field: string;
          reason: string;
          evidence_ids: string[];
        }[];
        data: {
          label: string;
          content: Fact1;
        };
      }
  )[];
  collections: Collection1[];
  evidence: (
    | {
        id: string;
        source_type: "author_description";
        method: "adapter";
        excerpt: string;
        language: string | null;
        locator: {
          kind: "post";
          asset_id: null;
          time: null;
        };
        region: {
          x: number;
          y: number;
          width: number;
          height: number;
        } | null;
        asset_sha256: string | null;
        operation_id: string;
      }
    | {
        id: string;
        source_type: "platform_metadata";
        method: "adapter";
        excerpt: string;
        language: string | null;
        locator: {
          kind: "post";
          asset_id: null;
          time: null;
        };
        region: {
          x: number;
          y: number;
          width: number;
          height: number;
        } | null;
        asset_sha256: string | null;
        operation_id: string;
      }
    | {
        id: string;
        source_type: "transcript";
        method: "platform_captions" | "local_asr";
        excerpt: string;
        language: string | null;
        locator: {
          kind: "video_time";
          asset_id: string;
          time: Range1;
        };
        region: {
          x: number;
          y: number;
          width: number;
          height: number;
        } | null;
        asset_sha256: string | null;
        operation_id: string;
      }
    | {
        id: string;
        source_type: "image_text";
        method: "local_ocr";
        excerpt: string;
        language: string | null;
        locator:
          | {
              kind: "image_asset";
              asset_id: string;
              time: null;
            }
          | {
              kind: "video_time";
              asset_id: string;
              time: Range1;
            };
        region: {
          x: number;
          y: number;
          width: number;
          height: number;
        } | null;
        asset_sha256: string | null;
        operation_id: string;
      }
    | {
        id: string;
        source_type: "visual_observation";
        method: "local_vlm" | "openai_vision";
        excerpt: string;
        language: string | null;
        locator:
          | {
              kind: "image_asset";
              asset_id: string;
              time: null;
            }
          | {
              kind: "video_time";
              asset_id: string;
              time: Range1;
            };
        region: {
          x: number;
          y: number;
          width: number;
          height: number;
        } | null;
        asset_sha256: string | null;
        operation_id: string;
      }
  )[];
  processing: {
    profile: "contextual_local_v2";
    operations: Operation1[];
    privacy: {
      external_inference_used: boolean;
      external_web_lookup_used: false;
      raw_media_retention: "delete_after_request";
      result_retention: "caller_managed";
    };
  };
  issues: Issue1[];
  extensions: {};
  task: "extract";
  follow_up: {
    extraction_gaps: ExtractionGap1[];
    research_opportunities: ResearchOpportunity1[];
  };
}
export interface Range1 {
  start_ms: number;
  end_ms: number;
}
export interface Collection1 {
  id: string;
  label: string;
  kind: "recommendations" | "ordered_steps" | "choices" | "places" | "products" | "other";
  item_ids: string[];
  expected_count: number | null;
  expected_count_evidence_ids: string[];
  order_semantics: "presentation" | "procedure" | "none";
  missing_count: number | null;
}
export interface Operation1 {
  id: string;
  purpose: "acquisition" | "routing" | "asr" | "extraction" | "vision" | "review" | "validation";
  deployment: "local" | "external";
  compute_target: "cpu" | "gpu" | "not_applicable";
  implementation: string;
  model: string | null;
  version: string | null;
  recipient: null | "OpenAI";
  input_data: ("url" | "metadata" | "description" | "audio" | "images" | "transcript" | "extracted_items")[];
}
export interface Issue1 {
  code:
    | "INVALID_REQUEST"
    | "UNSUPPORTED_MEDIA"
    | "ACCESS_UNAVAILABLE"
    | "LOGIN_REQUIRED"
    | "RESOURCE_LIMIT"
    | "TRANSCRIPTION_FAILED"
    | "VISION_UNAVAILABLE"
    | "INCOMPLETE_COLLECTION"
    | "AMBIGUOUS_TOPIC"
    | "UNCERTAIN_IDENTITY"
    | "EXTRACTION_FAILED"
    | "VALIDATION_FAILED";
  stage: "input" | "access" | "routing" | "transcription" | "vision" | "extraction" | "validation";
  severity: "warning" | "error";
  message: string;
  affected_asset_ids: string[];
  affected_item_ids: string[];
  retryable: boolean;
}
export interface ExtractionGap1 {
  id: string;
  item_id: string | null;
  field: string | null;
  kind:
    | "ambiguous_identity"
    | "missing_announced_item"
    | "unread_content"
    | "conflicting_sources"
    | "uncertain_topic"
    | "transcription_uncertain";
  reason: string;
  required_for_request: boolean;
  evidence_ids: string[];
  asset_ids: string[];
}
export interface ResearchOpportunity1 {
  id: string;
  item_id: string;
  kind:
    | "official_website"
    | "place_disambiguation"
    | "address_lookup"
    | "geolocation"
    | "maps_link"
    | "background_research";
  reason: string;
  /**
   * @minItems 1
   */
  evidence_ids: [string, ...string[]];
}
