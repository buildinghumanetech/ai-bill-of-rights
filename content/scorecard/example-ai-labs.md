---
company: Example AI Labs
slug: example-ai-labs
fictional: true
oneLiner: A made-up company that exists only to demonstrate the scorecard file format.
homepageUrl: https://example.com
lastReviewed: 2026-07-24
reviewedBy: AI Bill of Rights editorial council
disputeEmail: hello@ai-for-people.org
assessments:
  - principle: article-1
    status: meets
    assessment: |
      Example AI Labs does not train on customer conversations unless the
      customer opts in, and the opt-in is a separate, revocable setting rather
      than a term buried in the terms of service. (Fictional. This paragraph
      exists to show the shape of an assessment, not to describe anything real.)
    citations:
      - url: https://example.com/fictional-privacy-policy
        title: Example AI Labs — Privacy Policy (fictional)
        checkedOn: 2026-07-24
        quote: |
          We do not use your conversations to train our models unless you turn
          on "Improve the model" in Settings. You can turn it off at any time.
      - url: https://example.com/fictional-training-data-faq
        title: Example AI Labs — Training Data FAQ (fictional)
        checkedOn: 2026-07-24

  - principle: article-3
    status: partial
    assessment: |
      The assistant identifies itself as an AI when asked directly, but the
      voice product introduces itself with a human first name and no disclosure
      until the caller asks. (Fictional.)
    citations:
      - url: https://example.com/fictional-voice-product-docs
        title: Example AI Labs — Voice Assistant Documentation (fictional)
        checkedOn: 2026-07-20

  - principle: article-8
    status: unclear
    assessment: |
      No third-party assessment of user-wellbeing impact could be found in the
      public record as of the date checked. Absence of a public document is not
      evidence that no assessment exists — this row records what is publicly
      verifiable, and nothing more. (Fictional.)
    citations:
      - url: https://example.com/fictional-research-index
        title: Example AI Labs — Research Publications Index (fictional)
        checkedOn: 2026-07-22

  # Every commitment not listed here defaults to "not-assessed" and renders as
  # "Not yet assessed". You may also state it explicitly, as below.
  - principle: article-2
    status: not-assessed
---

This entry is **fictional**. "Example AI Labs" is not a real company, and every
URL above points at `example.com`. It is committed to the repository as the
reference for the file format and as a fixture the test suite renders against.

Delete it — or leave it, since the page labels fictional entries as such —
before publishing real assessments.
