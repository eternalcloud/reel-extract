export const validWorkResult = {
  schema_version: 1,
  job_id: "11111111-1111-4111-8111-111111111111",
  attempt: 1,
  candidates: [
    {
      kind: "place",
      name: "Synthetic Cafe",
      confidence: 0.91,
      verification_status: "verified",
      place: {
        address: "1 Test Street",
        locality: "Singapore",
        region: "Singapore",
        country: "Singapore",
        latitude: 1.3,
        longitude: 103.8
      },
      evidence: [
        {
          source: "caption",
          timestamp_ms: null,
          text: "Meet at Synthetic Cafe",
          artifact_id: null
        }
      ],
      verification_sources: [],
      notes: null
    },
    {
      kind: "website",
      name: "Synthetic Site",
      confidence: 0.9,
      verification_status: "observed",
      website: {
        observed_url: "https://example.com/",
        official_url: null
      },
      evidence: [
        {
          source: "frame",
          timestamp_ms: 12000,
          text: "example.com",
          artifact_id: null
        }
      ],
      verification_sources: [],
      notes: null
    }
  ],
  warnings: []
} as const;
